package store

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"speakez/api/internal/app"
)

type Client struct {
	baseURL    string
	serviceKey string
	httpClient *http.Client
}

func NewClient(baseURL, serviceKey string) *Client {
	if baseURL == "" || serviceKey == "" {
		return nil
	}
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		serviceKey: serviceKey,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

type profileRow struct {
	ID                   string    `json:"id"`
	Email                string    `json:"email"`
	DisplayName          string    `json:"display_name"`
	Timezone             string    `json:"timezone"`
	DailyGoalMinutes     int       `json:"daily_goal_minutes"`
	IsPremium            bool      `json:"is_premium"`
	StripeCustomerID     *string   `json:"stripe_customer_id"`
	StripeSubscriptionID *string   `json:"stripe_subscription_id"`
	XP                   int       `json:"xp"`
	Level                int       `json:"level"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

type usageRow struct {
	UserID                      string `json:"user_id"`
	LifetimeFreeAnalysesUsed    int    `json:"lifetime_free_analyses_used"`
	LifetimeFreeAnalysesAllowed int    `json:"lifetime_free_analyses_allowed"`
	MonthlyPremiumAnalysesUsed  int    `json:"monthly_premium_analyses_used"`
	MonthKey                    string `json:"month_key"`
}

type promptRow struct {
	ID   string          `json:"id"`
	Type app.ContentType `json:"type"`
	Text string          `json:"text"`
}

type sessionRow struct {
	ID              string           `json:"id"`
	UserID          string           `json:"user_id"`
	ContentType     app.ContentType  `json:"content_type"`
	SessionStyle    app.SessionStyle `json:"session_style"`
	PromptID        *string          `json:"prompt_id"`
	PromptText      string           `json:"prompt_text"`
	PrepSeconds     int              `json:"prep_seconds"`
	ResponseSeconds *int             `json:"response_seconds"`
	DurationSeconds int              `json:"duration_seconds"`
	StoragePath     *string          `json:"storage_path"`
	Status          string           `json:"status"`
	CreatedAt       time.Time        `json:"created_at"`
}

type analysisRow struct {
	ID             string                     `json:"id"`
	SessionID      string                     `json:"session_id"`
	UserID         string                     `json:"user_id"`
	Status         string                     `json:"status"`
	Transcript     *string                    `json:"transcript"`
	OverallScore   *int                       `json:"overall_score"`
	CategoryScores app.AnalysisCategoryScores `json:"category_scores"`
	FillerWords    []string                   `json:"filler_words"`
	PacingWPM      *int                       `json:"pacing_wpm"`
	Strengths      []string                   `json:"strengths"`
	Improvements   []string                   `json:"improvements"`
	Encouragement  *string                    `json:"encouragement"`
	ErrorMessage   *string                    `json:"error_message"`
	CreatedAt      time.Time                  `json:"created_at"`
	UpdatedAt      time.Time                  `json:"updated_at"`
}

type badgeRow struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	BadgeKey    string    `json:"badge_key"`
	Label       string    `json:"label"`
	Description string    `json:"description"`
	UnlockedAt  time.Time `json:"unlocked_at"`
}

type streakRow struct {
	UserID       string `json:"user_id"`
	PracticeDate string `json:"practice_date"`
	Minutes      int    `json:"minutes"`
}

func (c *Client) Configured() bool {
	return c != nil
}

func (c *Client) Me(userID, email string) (app.MeResponse, error) {
	profile, err := c.ensureProfile(userID, email)
	if err != nil {
		return app.MeResponse{}, err
	}
	usage, err := c.ensureUsage(userID)
	if err != nil {
		return app.MeResponse{}, err
	}
	streak, err := c.Streak(userID)
	if err != nil {
		return app.MeResponse{}, err
	}
	badges, err := c.Badges(userID)
	if err != nil {
		return app.MeResponse{}, err
	}
	canUseAI := profile.IsPremium || usage.LifetimeFreeAnalysesUsed < usage.LifetimeFreeAnalysesAllowed
	return app.MeResponse{
		Profile: toProfile(profile),
		Usage: app.UsageLimits{
			LifetimeFreeAnalysesUsed:    usage.LifetimeFreeAnalysesUsed,
			LifetimeFreeAnalysesAllowed: usage.LifetimeFreeAnalysesAllowed,
			CanUseAI:                    canUseAI,
		},
		Streak: streak,
		Badges: badges,
	}, nil
}

func (c *Client) PatchProfile(userID, email string, patch app.ProfilePatch) (app.MeResponse, error) {
	body := map[string]any{}
	if patch.DisplayName != nil {
		body["display_name"] = *patch.DisplayName
	}
	if patch.Timezone != nil {
		body["timezone"] = *patch.Timezone
	}
	if patch.DailyGoalMinutes != nil {
		body["daily_goal_minutes"] = *patch.DailyGoalMinutes
	}
	var rows []profileRow
	if err := c.request(http.MethodPatch, "/profiles?id=eq."+escape(userID), body, &rows, "return=representation"); err != nil {
		return app.MeResponse{}, err
	}
	return c.Me(userID, email)
}

func (c *Client) RandomPrompt(contentType app.ContentType) (app.Prompt, error) {
	if contentType == "" {
		contentType = "prompt"
	}
	path := "/prompts?type=eq." + escape(string(contentType)) + "&active=eq.true&select=id,type,text&limit=100"
	var rows []promptRow
	if err := c.request(http.MethodGet, path, nil, &rows); err != nil {
		return app.Prompt{}, err
	}
	if len(rows) == 0 {
		return app.Prompt{}, errors.New("no active prompt found")
	}
	row := rows[rand.Intn(len(rows))]
	return app.Prompt{ID: row.ID, Type: row.Type, Text: row.Text}, nil
}

func (c *Client) CreateSession(userID string, req app.CreateSessionRequest, id string, storagePath *string) (app.PracticeSession, error) {
	var promptID *string
	if req.PromptID != "" {
		promptID = &req.PromptID
	}
	row := map[string]any{
		"id":               id,
		"user_id":          userID,
		"content_type":     req.ContentType,
		"session_style":    req.SessionStyle,
		"prompt_id":        promptID,
		"prompt_text":      req.PromptText,
		"prep_seconds":     req.PrepSeconds,
		"response_seconds": req.ResponseSeconds,
		"duration_seconds": 0,
		"storage_path":     storagePath,
		"status":           "draft",
	}
	var rows []sessionRow
	if err := c.request(http.MethodPost, "/practice_sessions", row, &rows, "return=representation"); err != nil {
		return app.PracticeSession{}, err
	}
	if len(rows) == 0 {
		return app.PracticeSession{}, errors.New("session was not created")
	}
	return toSession(rows[0]), nil
}

func (c *Client) CompleteSession(userID, sessionID string, patch app.SessionPatch) (app.PracticeSession, error) {
	var rows []sessionRow
	path := "/practice_sessions?id=eq." + escape(sessionID) + "&user_id=eq." + escape(userID)
	body := map[string]any{
		"duration_seconds": patch.DurationSeconds,
		"storage_path":     patch.StoragePath,
		"status":           patch.Status,
	}
	if err := c.request(http.MethodPatch, path, body, &rows, "return=representation"); err != nil {
		return app.PracticeSession{}, err
	}
	if len(rows) == 0 {
		return app.PracticeSession{}, errors.New("session not found")
	}
	session := toSession(rows[0])
	if session.Status == "uploaded" || session.Status == "complete" {
		_ = c.recordPractice(userID, session.DurationSeconds)
	}
	return session, nil
}

func (c *Client) Sessions(userID string) ([]app.PracticeSession, error) {
	path := "/practice_sessions?user_id=eq." + escape(userID) + "&select=*&order=created_at.desc&limit=50"
	var rows []sessionRow
	if err := c.request(http.MethodGet, path, nil, &rows); err != nil {
		return nil, err
	}
	sessions := make([]app.PracticeSession, 0, len(rows))
	for _, row := range rows {
		sessions = append(sessions, toSession(row))
	}
	return sessions, nil
}

func (c *Client) Session(userID, sessionID string) (app.PracticeSession, error) {
	path := "/practice_sessions?id=eq." + escape(sessionID) + "&user_id=eq." + escape(userID) + "&select=*&limit=1"
	var rows []sessionRow
	if err := c.request(http.MethodGet, path, nil, &rows); err != nil {
		return app.PracticeSession{}, err
	}
	if len(rows) == 0 {
		return app.PracticeSession{}, errors.New("session not found")
	}
	return toSession(rows[0]), nil
}

func (c *Client) DeleteSession(userID, sessionID string) error {
	path := "/practice_sessions?id=eq." + escape(sessionID) + "&user_id=eq." + escape(userID)
	return c.request(http.MethodDelete, path, nil, nil)
}

func (c *Client) CanAnalyze(userID string) (bool, bool, error) {
	profile, err := c.ensureProfile(userID, "")
	if err != nil {
		return false, false, err
	}
	usage, err := c.ensureUsage(userID)
	if err != nil {
		return false, false, err
	}
	return profile.IsPremium || usage.LifetimeFreeAnalysesUsed < usage.LifetimeFreeAnalysesAllowed, profile.IsPremium, nil
}

func (c *Client) IncrementFreeAnalysis(userID string) error {
	usage, err := c.ensureUsage(userID)
	if err != nil {
		return err
	}
	next := map[string]int{"lifetime_free_analyses_used": usage.LifetimeFreeAnalysesUsed + 1}
	return c.request(http.MethodPatch, "/usage_limits?user_id=eq."+escape(userID), next, nil)
}

func (c *Client) UpsertAnalysis(input app.AnalysisInput) (app.AIAnalysis, error) {
	categoryJSON, err := json.Marshal(input.CategoryScores)
	if err != nil {
		return app.AIAnalysis{}, err
	}
	row := map[string]any{
		"session_id":      input.SessionID,
		"user_id":         input.UserID,
		"status":          input.Status,
		"transcript":      nullableString(input.Transcript),
		"overall_score":   nullableInt(input.OverallScore),
		"category_scores": json.RawMessage(categoryJSON),
		"filler_words":    stringsOrEmpty(input.FillerWords),
		"pacing_wpm":      nullableInt(input.PacingWPM),
		"strengths":       stringsOrEmpty(input.Strengths),
		"improvements":    stringsOrEmpty(input.Improvements),
		"encouragement":   nullableString(input.Encouragement),
		"error_message":   nullableString(input.ErrorMessage),
		"updated_at":      time.Now().UTC().Format(time.RFC3339),
	}
	var rows []analysisRow
	path := "/ai_analyses?on_conflict=session_id"
	if err := c.request(http.MethodPost, path, row, &rows, "resolution=merge-duplicates,return=representation"); err != nil {
		return app.AIAnalysis{}, err
	}
	if len(rows) == 0 {
		return app.AIAnalysis{}, errors.New("analysis was not saved")
	}
	return toAnalysis(rows[0]), nil
}

func (c *Client) Analysis(userID, sessionID string) (app.AIAnalysis, error) {
	path := "/ai_analyses?session_id=eq." + escape(sessionID) + "&user_id=eq." + escape(userID) + "&select=*&limit=1"
	var rows []analysisRow
	if err := c.request(http.MethodGet, path, nil, &rows); err != nil {
		return app.AIAnalysis{}, err
	}
	if len(rows) == 0 {
		return app.AIAnalysis{}, errors.New("analysis not found")
	}
	return toAnalysis(rows[0]), nil
}

func (c *Client) SetCustomer(userID, customerID string) error {
	patch := map[string]string{"stripe_customer_id": customerID}
	return c.request(http.MethodPatch, "/profiles?id=eq."+escape(userID), patch, nil)
}

func (c *Client) ProfileByCustomer(customerID string) (app.Profile, error) {
	var rows []profileRow
	if err := c.request(http.MethodGet, "/profiles?stripe_customer_id=eq."+escape(customerID)+"&select=*&limit=1", nil, &rows); err != nil {
		return app.Profile{}, err
	}
	if len(rows) == 0 {
		return app.Profile{}, errors.New("profile not found for stripe customer")
	}
	return toProfile(rows[0]), nil
}

func (c *Client) BillingProfile(userID, email string) (app.Profile, *string, error) {
	row, err := c.ensureProfile(userID, email)
	if err != nil {
		return app.Profile{}, nil, err
	}
	return toProfile(row), row.StripeCustomerID, nil
}

func (c *Client) UpdateSubscriptionState(customerID, subscriptionID string, isPremium bool) error {
	patch := map[string]any{
		"is_premium":             isPremium,
		"stripe_subscription_id": nullableString(subscriptionID),
		"updated_at":             time.Now().UTC().Format(time.RFC3339),
	}
	return c.request(http.MethodPatch, "/profiles?stripe_customer_id=eq."+escape(customerID), patch, nil)
}

func (c *Client) ensureProfile(userID, email string) (profileRow, error) {
	var rows []profileRow
	if err := c.request(http.MethodGet, "/profiles?id=eq."+escape(userID)+"&select=*&limit=1", nil, &rows); err != nil {
		return profileRow{}, err
	}
	if len(rows) > 0 {
		return rows[0], nil
	}
	if email == "" {
		return profileRow{}, errors.New("profile not found")
	}
	insert := map[string]string{"id": userID, "email": email, "display_name": "Speaker"}
	if err := c.request(http.MethodPost, "/profiles", insert, &rows, "resolution=merge-duplicates,return=representation"); err != nil {
		return profileRow{}, err
	}
	if len(rows) == 0 {
		return profileRow{}, errors.New("profile was not created")
	}
	return rows[0], nil
}

func (c *Client) ensureUsage(userID string) (usageRow, error) {
	var rows []usageRow
	if err := c.request(http.MethodGet, "/usage_limits?user_id=eq."+escape(userID)+"&select=*&limit=1", nil, &rows); err != nil {
		return usageRow{}, err
	}
	if len(rows) > 0 {
		return rows[0], nil
	}
	insert := map[string]string{"user_id": userID}
	if err := c.request(http.MethodPost, "/usage_limits", insert, &rows, "resolution=merge-duplicates,return=representation"); err != nil {
		return usageRow{}, err
	}
	if len(rows) == 0 {
		return usageRow{}, errors.New("usage row was not created")
	}
	return rows[0], nil
}

func (c *Client) Streak(userID string) (app.StreakSummary, error) {
	start := time.Now().AddDate(0, 0, -60).Format("2006-01-02")
	path := "/streak_events?user_id=eq." + escape(userID) + "&practice_date=gte." + start + "&select=*&order=practice_date.asc"
	var rows []streakRow
	if err := c.request(http.MethodGet, path, nil, &rows); err != nil {
		return app.StreakSummary{}, err
	}
	byDate := map[string]int{}
	for _, row := range rows {
		byDate[row.PracticeDate] = row.Minutes
	}
	today := dateOnly(time.Now())
	current := 0
	for day := today; ; day = day.AddDate(0, 0, -1) {
		key := day.Format("2006-01-02")
		if byDate[key] <= 0 {
			break
		}
		current++
	}
	longest, run := 0, 0
	var dates []string
	for date := range byDate {
		dates = append(dates, date)
	}
	sort.Strings(dates)
	var previous time.Time
	for _, key := range dates {
		day, _ := time.Parse("2006-01-02", key)
		if byDate[key] <= 0 {
			continue
		}
		if run > 0 && day.Sub(previous) == 24*time.Hour {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
		previous = day
	}
	week := make([]int, 7)
	monday := dateOnly(time.Now()).AddDate(0, 0, -weekdayOffset(time.Now()))
	for index := 0; index < 7; index++ {
		week[index] = byDate[monday.AddDate(0, 0, index).Format("2006-01-02")]
	}
	return app.StreakSummary{
		CurrentStreak:  current,
		LongestStreak:  longest,
		PracticedToday: byDate[today.Format("2006-01-02")] > 0,
		WeeklyMinutes:  week,
	}, nil
}

func (c *Client) Badges(userID string) ([]app.Badge, error) {
	var rows []badgeRow
	if err := c.request(http.MethodGet, "/badges?user_id=eq."+escape(userID)+"&select=*&order=unlocked_at.desc", nil, &rows); err != nil {
		return nil, err
	}
	badges := make([]app.Badge, 0, len(rows))
	for _, row := range rows {
		badges = append(badges, app.Badge{ID: row.BadgeKey, Label: row.Label, Description: row.Description, UnlockedAt: row.UnlockedAt})
	}
	return badges, nil
}

func (c *Client) recordPractice(userID string, durationSeconds int) error {
	minutes := int(math.Max(1, math.Ceil(float64(durationSeconds)/60)))
	today := time.Now().Format("2006-01-02")
	var existing []streakRow
	_ = c.request(http.MethodGet, "/streak_events?user_id=eq."+escape(userID)+"&practice_date=eq."+today+"&select=*", nil, &existing)
	total := minutes
	if len(existing) > 0 {
		total += existing[0].Minutes
	}
	row := map[string]any{"user_id": userID, "practice_date": today, "minutes": total}
	if err := c.request(http.MethodPost, "/streak_events?on_conflict=user_id,practice_date", row, nil, "resolution=merge-duplicates"); err != nil {
		return err
	}
	profile, err := c.ensureProfile(userID, "")
	if err == nil {
		xp := profile.XP + (minutes * 10)
		level := 1 + xp/250
		_ = c.request(http.MethodPatch, "/profiles?id=eq."+escape(userID), map[string]int{"xp": xp, "level": level}, nil)
	}
	badge := map[string]any{
		"user_id":     userID,
		"badge_key":   "first-flight",
		"label":       "First Flight",
		"description": "Completed your first recording.",
	}
	return c.request(http.MethodPost, "/badges?on_conflict=user_id,badge_key", badge, nil, "resolution=ignore-duplicates")
}

func (c *Client) request(method, path string, body any, out any, prefer ...string) error {
	var reader io.Reader
	if body != nil {
		var buf bytes.Buffer
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			return err
		}
		reader = &buf
	}
	req, err := http.NewRequest(method, c.baseURL+"/rest/v1"+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if len(prefer) > 0 {
		req.Header.Set("Prefer", strings.Join(prefer, ","))
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("supabase request failed: %s: %s", resp.Status, strings.TrimSpace(string(msg)))
	}
	if out == nil || resp.StatusCode == http.StatusNoContent {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func toProfile(row profileRow) app.Profile {
	return app.Profile{
		ID: row.ID, Email: row.Email, DisplayName: row.DisplayName, Timezone: row.Timezone,
		DailyGoalMinutes: row.DailyGoalMinutes, IsPremium: row.IsPremium, XP: row.XP, Level: row.Level,
	}
}

func toSession(row sessionRow) app.PracticeSession {
	return app.PracticeSession{
		ID: row.ID, ContentType: row.ContentType, SessionStyle: row.SessionStyle, PromptText: row.PromptText,
		PrepSeconds: row.PrepSeconds, ResponseSeconds: row.ResponseSeconds, DurationSeconds: row.DurationSeconds,
		StoragePath: row.StoragePath, Status: row.Status, CreatedAt: row.CreatedAt,
	}
}

func toAnalysis(row analysisRow) app.AIAnalysis {
	transcript := ""
	if row.Transcript != nil {
		transcript = *row.Transcript
	}
	overall := 0
	if row.OverallScore != nil {
		overall = *row.OverallScore
	}
	pacing := 0
	if row.PacingWPM != nil {
		pacing = *row.PacingWPM
	}
	encouragement := ""
	if row.Encouragement != nil {
		encouragement = *row.Encouragement
	}
	return app.AIAnalysis{
		ID: row.ID, SessionID: row.SessionID, Status: row.Status, Transcript: transcript,
		OverallScore: overall, CategoryScores: row.CategoryScores, FillerWords: row.FillerWords,
		PacingWPM: pacing, Strengths: row.Strengths, Improvements: row.Improvements,
		Encouragement: encouragement, CreatedAt: row.CreatedAt,
	}
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func nullableInt(value int) any {
	if value == 0 {
		return nil
	}
	return value
}

func stringsOrEmpty(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func escape(value string) string {
	return url.QueryEscape(value)
}

func dateOnly(value time.Time) time.Time {
	year, month, day := value.Date()
	return time.Date(year, month, day, 0, 0, 0, 0, value.Location())
}

func weekdayOffset(value time.Time) int {
	offset := int(value.Weekday()) - int(time.Monday)
	if offset < 0 {
		offset += 7
	}
	return offset
}
