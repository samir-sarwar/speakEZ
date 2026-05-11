package app

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"speakez/api/internal/auth"
	"speakez/api/internal/billing"
	"speakez/api/internal/config"
	"speakez/api/internal/storage"
)

type Server struct {
	cfg          config.Config
	authVerifier *auth.Verifier
	store        Store
	storage      RecordingStorage
	billing      *billing.Client
	analyzer     Analyzer
	mu           sync.Mutex
	sessions     map[string]PracticeSession
	analyses     map[string]AIAnalysis
	freeUsed     map[string]int
}

type RecordingStorage interface {
	CreateSignedUpload(path string) (*storage.SignedUpload, error)
	CreateSignedDownload(path string, expiresIn int) (string, error)
	Download(path string) ([]byte, error)
	Delete(path string) error
}

type Store interface {
	Me(userID, email string) (MeResponse, error)
	PatchProfile(userID, email string, patch ProfilePatch) (MeResponse, error)
	RandomPrompt(contentType ContentType) (Prompt, error)
	CreateSession(userID string, req CreateSessionRequest, id string, storagePath *string) (PracticeSession, error)
	CompleteSession(userID, sessionID string, patch SessionPatch) (PracticeSession, error)
	Sessions(userID string) ([]PracticeSession, error)
	Session(userID, sessionID string) (PracticeSession, error)
	DeleteSession(userID, sessionID string) error
	CanAnalyze(userID string) (canAnalyze bool, isPremium bool, err error)
	IncrementFreeAnalysis(userID string) error
	UpsertAnalysis(input AnalysisInput) (AIAnalysis, error)
	Analysis(userID, sessionID string) (AIAnalysis, error)
	BillingProfile(userID, email string) (Profile, *string, error)
	SetCustomer(userID, customerID string) error
	UpdateSubscriptionState(customerID, subscriptionID string, isPremium bool) error
}

type Analyzer interface {
	Analyze(req AnalysisJob) (AIAnalysis, error)
}

type AnalysisJob struct {
	SessionID       string
	Prompt          string
	DurationSeconds int
	Media           []byte
	MimeType        string
}

func NewServer(cfg config.Config) *Server {
	return &Server{
		cfg:          cfg,
		authVerifier: auth.NewVerifier(cfg.SupabaseJWTSecret, cfg.SupabaseURL),
		storage:      storage.NewClient(cfg.SupabaseURL, cfg.SupabaseServiceKey),
		billing:      billing.NewClient(cfg.StripeSecretKey, cfg.StripePriceID, cfg.StripeWebhookSecret, cfg.FrontendURL),
		sessions:     map[string]PracticeSession{},
		analyses:     map[string]AIAnalysis{},
		freeUsed:     map[string]int{},
	}
}

func (s *Server) UseStore(store Store) {
	s.store = store
}

func (s *Server) UseAnalyzer(analyzer Analyzer) {
	s.analyzer = analyzer
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /me", s.withUser(s.me))
	mux.HandleFunc("PATCH /me", s.withUser(s.patchMe))
	mux.HandleFunc("GET /prompts/random", s.withUser(s.randomPrompt))
	mux.HandleFunc("POST /sessions", s.withUser(s.createSession))
	mux.HandleFunc("GET /sessions", s.withUser(s.listSessions))
	mux.HandleFunc("PATCH /sessions/{id}/complete", s.withUser(s.completeSession))
	mux.HandleFunc("GET /sessions/{id}", s.withUser(s.getSession))
	mux.HandleFunc("DELETE /sessions/{id}", s.withUser(s.deleteSession))
	mux.HandleFunc("POST /sessions/{id}/analyze", s.withUser(s.analyzeSession))
	mux.HandleFunc("GET /sessions/{id}/analysis", s.withUser(s.getAnalysis))
	mux.HandleFunc("POST /billing/checkout", s.withUser(s.checkout))
	mux.HandleFunc("POST /billing/portal", s.withUser(s.portal))
	mux.HandleFunc("POST /webhooks/stripe", s.stripeWebhook)
	return s.cors(mux)
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" || origin == s.cfg.FrontendURL || isLocalDevOrigin(origin) {
			if origin == "" {
				origin = s.cfg.FrontendURL
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type user struct {
	ID    string
	Email string
}

func (s *Server) withUser(handler func(http.ResponseWriter, *http.Request, user)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := user{}
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") && s.authVerifier != nil {
			verified, err := s.authVerifier.Verify(strings.TrimPrefix(authHeader, "Bearer "))
			if err != nil {
				writeError(w, http.StatusUnauthorized, err)
				return
			}
			u = user{ID: verified.ID, Email: verified.Email}
		} else if s.authVerifier == nil {
			u = user{ID: "demo-user", Email: "demo@speakez.local"}
		} else {
			writeError(w, http.StatusUnauthorized, errors.New("missing bearer token"))
			return
		}
		handler(w, r, u)
	}
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) me(w http.ResponseWriter, _ *http.Request, u user) {
	if s.store != nil {
		me, err := s.store.Me(u.ID, u.Email)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if s.isTestPremiumEmail(me.Profile.Email) {
			me.Profile.IsPremium = true
			me.Usage.CanUseAI = true
		}
		writeJSON(w, http.StatusOK, me)
		return
	}
	used := s.freeUsed[u.ID]
	isPremium := s.isTestPremiumEmail(u.Email)
	writeJSON(w, http.StatusOK, MeResponse{
		Profile: Profile{
			ID: u.ID, Email: u.Email, DisplayName: "Speaker", Timezone: "America/Toronto",
			DailyGoalMinutes: 5, IsPremium: isPremium, XP: 780, Level: 4,
		},
		Usage:  UsageLimits{LifetimeFreeAnalysesUsed: used, LifetimeFreeAnalysesAllowed: 1, CanUseAI: isPremium || used < 1},
		Streak: StreakSummary{CurrentStreak: 1, LongestStreak: 1, PracticedToday: true, WeeklyMinutes: []int{0, 0, 0, 0, 0, 0, 5}},
		Badges: []Badge{{ID: "first-flight", Label: "First Flight", Description: "Completed your first recording.", UnlockedAt: time.Now()}},
	})
}

func (s *Server) patchMe(w http.ResponseWriter, r *http.Request, u user) {
	if s.store != nil {
		var req ProfilePatch
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		me, err := s.store.PatchProfile(u.ID, u.Email, req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, me)
		return
	}
	s.me(w, nil, u)
}

func (s *Server) randomPrompt(w http.ResponseWriter, r *http.Request, _ user) {
	contentType := ContentType(r.URL.Query().Get("type"))
	if s.store != nil {
		prompt, err := s.store.RandomPrompt(contentType)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, prompt)
		return
	}
	prompt := fallbackPrompt(contentType)
	writeJSON(w, http.StatusOK, prompt)
}

func (s *Server) createSession(w http.ResponseWriter, r *http.Request, u user) {
	var req CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	id := randomUUID()
	var storagePath *string
	var upload *UploadTarget
	if !req.LocalOnly {
		if s.storage == nil {
			writeError(w, http.StatusServiceUnavailable, errors.New("recording storage is not configured"))
			return
		}
		path := u.ID + "/" + id + ".webm"
		signed, err := s.storage.CreateSignedUpload(path)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if signed.Path != "" {
			path = signed.Path
		}
		storagePath = &path
		upload = &UploadTarget{Path: path, Token: signed.Token, SignedURL: signed.SignedURL}
	}
	if s.store != nil {
		session, err := s.store.CreateSession(u.ID, req, id, storagePath)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusCreated, CreateSessionResponse{Session: session, Upload: upload})
		return
	}
	session := PracticeSession{
		ID: id, ContentType: req.ContentType, SessionStyle: req.SessionStyle, PromptText: req.PromptText,
		PrepSeconds: req.PrepSeconds, ResponseSeconds: req.ResponseSeconds, DurationSeconds: 0,
		StoragePath: storagePath, Status: "draft", CreatedAt: time.Now(),
	}
	s.mu.Lock()
	s.sessions[id] = session
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, CreateSessionResponse{Session: session, Upload: upload})
}

func (s *Server) completeSession(w http.ResponseWriter, r *http.Request, u user) {
	id := r.PathValue("id")
	var req CompleteSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	status := "uploaded"
	if req.LocalOnly {
		status = "local_only"
	}
	if !req.LocalOnly && req.StoragePath == nil {
		writeError(w, http.StatusBadRequest, errors.New("completed remote sessions require a storage path"))
		return
	}
	if s.store != nil {
		session, err := s.store.CompleteSession(u.ID, id, SessionPatch{
			DurationSeconds: req.DurationSeconds,
			StoragePath:     req.StoragePath,
			Status:          status,
		})
		if err != nil {
			writeError(w, http.StatusNotFound, err)
			return
		}
		writeJSON(w, http.StatusOK, session)
		return
	}
	s.mu.Lock()
	session, ok := s.sessions[id]
	if ok {
		session.DurationSeconds = req.DurationSeconds
		session.StoragePath = req.StoragePath
		session.Status = status
		s.sessions[id] = session
	}
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("session not found"))
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *Server) listSessions(w http.ResponseWriter, _ *http.Request, u user) {
	if s.store != nil {
		sessions, err := s.store.Sessions(u.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string][]PracticeSession{"sessions": sessions})
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	sessions := make([]PracticeSession, 0, len(s.sessions))
	for _, session := range s.sessions {
		sessions = append(sessions, session)
	}
	writeJSON(w, http.StatusOK, map[string][]PracticeSession{"sessions": sessions})
}

func (s *Server) getSession(w http.ResponseWriter, r *http.Request, u user) {
	id := r.PathValue("id")
	if s.store != nil {
		session, err := s.store.Session(u.ID, id)
		if err != nil {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if err := s.attachPlaybackURL(&session); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, session)
		return
	}
	s.mu.Lock()
	session, ok := s.sessions[id]
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("session not found"))
		return
	}
	if err := s.attachPlaybackURL(&session); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *Server) deleteSession(w http.ResponseWriter, r *http.Request, u user) {
	id := r.PathValue("id")
	if s.store != nil {
		session, err := s.store.Session(u.ID, id)
		if err != nil {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if session.StoragePath != nil && s.storage != nil {
			_ = s.storage.Delete(*session.StoragePath)
		}
		if err := s.store.DeleteSession(u.ID, id); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	s.mu.Lock()
	delete(s.sessions, id)
	delete(s.analyses, id)
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) analyzeSession(w http.ResponseWriter, r *http.Request, u user) {
	id := r.PathValue("id")
	if s.store != nil {
		session, err := s.store.Session(u.ID, id)
		if err != nil {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if session.Status == "local_only" || session.StoragePath == nil {
			writeError(w, http.StatusBadRequest, errors.New("local-only sessions cannot be analyzed"))
			return
		}
		canAnalyze, isPremium, err := s.store.CanAnalyze(u.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		isPremium = isPremium || s.isTestPremiumEmail(u.Email)
		canAnalyze = canAnalyze || isPremium
		if !canAnalyze {
			writeError(w, http.StatusPaymentRequired, errors.New("upgrade required for more AI analyses"))
			return
		}
		if s.storage == nil || s.analyzer == nil {
			writeError(w, http.StatusServiceUnavailable, errors.New("AI analysis is not configured"))
			return
		}
		_, _ = s.store.UpsertAnalysis(AnalysisInput{SessionID: id, UserID: u.ID, Status: "transcribing"})
		media, err := s.storage.Download(*session.StoragePath)
		if err != nil {
			_, _ = s.store.UpsertAnalysis(AnalysisInput{SessionID: id, UserID: u.ID, Status: "failed", ErrorMessage: err.Error()})
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		_, _ = s.store.UpsertAnalysis(AnalysisInput{SessionID: id, UserID: u.ID, Status: "analyzing"})
		analysis, err := s.analyzer.Analyze(AnalysisJob{
			SessionID: id, Prompt: session.PromptText, DurationSeconds: session.DurationSeconds,
			Media: media, MimeType: "video/webm",
		})
		if err != nil {
			_, _ = s.store.UpsertAnalysis(AnalysisInput{SessionID: id, UserID: u.ID, Status: "failed", ErrorMessage: err.Error()})
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		saved, err := s.store.UpsertAnalysis(AnalysisInput{
			SessionID: id, UserID: u.ID, Status: "complete", Transcript: analysis.Transcript,
			OverallScore: analysis.OverallScore, CategoryScores: analysis.CategoryScores,
			FillerWords: analysis.FillerWords, PacingWPM: analysis.PacingWPM,
			Strengths: analysis.Strengths, Improvements: analysis.Improvements,
			Encouragement: analysis.Encouragement,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if !isPremium {
			_ = s.store.IncrementFreeAnalysis(u.ID)
		}
		writeJSON(w, http.StatusOK, saved)
		return
	}
	s.mu.Lock()
	session, ok := s.sessions[id]
	used := s.freeUsed[u.ID]
	s.mu.Unlock()
	isPremium := s.isTestPremiumEmail(u.Email)
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("session not found"))
		return
	}
	if session.Status == "local_only" || session.StoragePath == nil {
		writeError(w, http.StatusBadRequest, errors.New("local-only sessions cannot be analyzed"))
		return
	}
	if !isPremium && used >= 1 {
		writeError(w, http.StatusPaymentRequired, errors.New("upgrade required for more AI analyses"))
		return
	}
	if s.storage == nil || s.analyzer == nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("AI analysis is not configured"))
		return
	}
	media, err := s.storage.Download(*session.StoragePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	analysis, err := s.analyzer.Analyze(AnalysisJob{
		SessionID: id, Prompt: session.PromptText, DurationSeconds: session.DurationSeconds,
		Media: media, MimeType: "video/webm",
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.mu.Lock()
	if !isPremium {
		s.freeUsed[u.ID]++
	}
	s.analyses[id] = analysis
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, analysis)
}

func (s *Server) isTestPremiumEmail(email string) bool {
	normalized := strings.ToLower(strings.TrimSpace(email))
	if normalized == "" {
		return false
	}
	for _, allowed := range s.cfg.TestPremiumEmails {
		if normalized == allowed {
			return true
		}
	}
	return false
}

func (s *Server) getAnalysis(w http.ResponseWriter, r *http.Request, u user) {
	id := r.PathValue("id")
	if s.store != nil {
		analysis, err := s.store.Analysis(u.ID, id)
		if err != nil {
			writeError(w, http.StatusNotFound, err)
			return
		}
		writeJSON(w, http.StatusOK, analysis)
		return
	}
	s.mu.Lock()
	analysis, ok := s.analyses[id]
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("analysis not found"))
		return
	}
	writeJSON(w, http.StatusOK, analysis)
}

func (s *Server) checkout(w http.ResponseWriter, _ *http.Request, u user) {
	if s.billing != nil && s.store != nil {
		_, customerID, err := s.store.BillingProfile(u.ID, u.Email)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		url, nextCustomerID, err := s.billing.Checkout(billing.CheckoutInput{UserID: u.ID, Email: u.Email, CustomerID: deref(customerID)})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if customerID == nil || *customerID == "" {
			_ = s.store.SetCustomer(u.ID, nextCustomerID)
		}
		writeJSON(w, http.StatusOK, map[string]string{"url": url})
		return
	}
	writeError(w, http.StatusServiceUnavailable, errors.New("stripe billing is not configured"))
}

func (s *Server) portal(w http.ResponseWriter, _ *http.Request, u user) {
	if s.billing != nil && s.store != nil {
		_, customerID, err := s.store.BillingProfile(u.ID, u.Email)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		url, err := s.billing.Portal(deref(customerID))
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"url": url})
		return
	}
	writeError(w, http.StatusServiceUnavailable, errors.New("stripe billing is not configured"))
}

func (s *Server) stripeWebhook(w http.ResponseWriter, r *http.Request) {
	if s.billing != nil && s.store != nil {
		payload, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		event, err := s.billing.ParseWebhook(payload, r.Header.Get("Stripe-Signature"))
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		if event != nil {
			if err := s.store.UpdateSubscriptionState(event.CustomerID, event.SubscriptionID, event.IsPremium); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
		}
		writeJSON(w, http.StatusOK, map[string]bool{"received": true})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"received": true})
}

func fallbackPrompt(contentType ContentType) Prompt {
	if contentType == "" {
		contentType = "prompt"
	}
	texts := map[ContentType]string{
		"prompt":          "Describe a small habit that changed your week.",
		"word":            "Momentum",
		"interview":       "Tell me about yourself in a way that feels memorable.",
		"storytelling":    "Tell a story that begins with a missed train.",
		"debate":          "Should every student learn public speaking?",
		"sales_pitch":     "Pitch a smart water bottle for busy students.",
		"elevator_pitch":  "Pitch SpeakEZ to someone nervous about speaking.",
		"timed_response":  "What does confidence mean when you are still learning?",
		"daily_challenge": "Give a short talk about one thing you are grateful for today.",
	}
	return Prompt{ID: randomID(), Type: contentType, Text: texts[contentType]}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func randomID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return hex.EncodeToString([]byte(time.Now().String()))
	}
	return hex.EncodeToString(bytes)
}

func randomUUID() string {
	id := randomID()
	if len(id) != 32 {
		return id
	}
	return id[0:8] + "-" + id[8:12] + "-" + id[12:16] + "-" + id[16:20] + "-" + id[20:32]
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func (s *Server) attachPlaybackURL(session *PracticeSession) error {
	if session == nil || session.StoragePath == nil {
		return nil
	}
	if s.storage == nil {
		return errors.New("recording storage is not configured")
	}
	url, err := s.storage.CreateSignedDownload(*session.StoragePath, 10*60)
	if err != nil {
		return errors.New("could not create playback URL")
	}
	if url == "" {
		return errors.New("could not create playback URL")
	}
	session.PlaybackURL = &url
	return nil
}

func isLocalDevOrigin(origin string) bool {
	return strings.HasPrefix(origin, "http://localhost:") || strings.HasPrefix(origin, "http://127.0.0.1:")
}
