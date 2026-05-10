package app

import "time"

type ContentType string
type SessionStyle string

type Profile struct {
	ID               string `json:"id"`
	Email            string `json:"email"`
	DisplayName      string `json:"displayName"`
	Timezone         string `json:"timezone"`
	DailyGoalMinutes int    `json:"dailyGoalMinutes"`
	IsPremium        bool   `json:"isPremium"`
	XP               int    `json:"xp"`
	Level            int    `json:"level"`
}

type UsageLimits struct {
	LifetimeFreeAnalysesUsed    int  `json:"lifetimeFreeAnalysesUsed"`
	LifetimeFreeAnalysesAllowed int  `json:"lifetimeFreeAnalysesAllowed"`
	CanUseAI                    bool `json:"canUseAi"`
}

type StreakSummary struct {
	CurrentStreak  int   `json:"currentStreak"`
	LongestStreak  int   `json:"longestStreak"`
	PracticedToday bool  `json:"practicedToday"`
	WeeklyMinutes  []int `json:"weeklyMinutes"`
}

type Badge struct {
	ID          string    `json:"id"`
	Label       string    `json:"label"`
	Description string    `json:"description"`
	UnlockedAt  time.Time `json:"unlockedAt"`
}

type MeResponse struct {
	Profile Profile       `json:"profile"`
	Usage   UsageLimits   `json:"usage"`
	Streak  StreakSummary `json:"streak"`
	Badges  []Badge       `json:"badges"`
}

type Prompt struct {
	ID   string      `json:"id"`
	Type ContentType `json:"type"`
	Text string      `json:"text"`
}

type PracticeSession struct {
	ID              string       `json:"id"`
	ContentType     ContentType  `json:"contentType"`
	SessionStyle    SessionStyle `json:"sessionStyle"`
	PromptText      string       `json:"promptText"`
	PrepSeconds     int          `json:"prepSeconds"`
	ResponseSeconds *int         `json:"responseSeconds"`
	DurationSeconds int          `json:"durationSeconds"`
	StoragePath     *string      `json:"storagePath"`
	PlaybackURL     *string      `json:"playbackUrl,omitempty"`
	Status          string       `json:"status"`
	CreatedAt       time.Time    `json:"createdAt"`
}

type CreateSessionRequest struct {
	ContentType      ContentType  `json:"contentType"`
	SessionStyle     SessionStyle `json:"sessionStyle"`
	PromptID         string       `json:"promptId"`
	PromptText       string       `json:"promptText"`
	PrepSeconds      int          `json:"prepSeconds"`
	ResponseSeconds  *int         `json:"responseSeconds"`
	ExpectedMimeType string       `json:"expectedMimeType"`
	LocalOnly        bool         `json:"localOnly"`
}

type CreateSessionResponse struct {
	Session PracticeSession `json:"session"`
	Upload  *UploadTarget   `json:"upload,omitempty"`
}

type UploadTarget struct {
	Path      string `json:"path"`
	Token     string `json:"token"`
	SignedURL string `json:"signedUrl"`
}

type CompleteSessionRequest struct {
	DurationSeconds int     `json:"durationSeconds"`
	StoragePath     *string `json:"storagePath"`
	Analyze         bool    `json:"analyze"`
	LocalOnly       bool    `json:"localOnly"`
}

type ProfilePatch struct {
	DisplayName      *string `json:"displayName,omitempty"`
	Timezone         *string `json:"timezone,omitempty"`
	DailyGoalMinutes *int    `json:"dailyGoalMinutes,omitempty"`
}

type SessionPatch struct {
	DurationSeconds int     `json:"durationSeconds"`
	StoragePath     *string `json:"storagePath"`
	Status          string  `json:"status"`
}

type AnalysisCategoryScores struct {
	Clarity    int `json:"clarity"`
	Structure  int `json:"structure"`
	Pacing     int `json:"pacing"`
	Confidence int `json:"confidence"`
	Concision  int `json:"concision"`
}

type AIAnalysis struct {
	ID             string                 `json:"id"`
	SessionID      string                 `json:"sessionId"`
	Status         string                 `json:"status"`
	Transcript     string                 `json:"transcript"`
	OverallScore   int                    `json:"overallScore"`
	CategoryScores AnalysisCategoryScores `json:"categoryScores"`
	FillerWords    []string               `json:"fillerWords"`
	PacingWPM      int                    `json:"pacingWpm"`
	Strengths      []string               `json:"strengths"`
	Improvements   []string               `json:"improvements"`
	Encouragement  string                 `json:"encouragement"`
	CreatedAt      time.Time              `json:"createdAt"`
}

type AnalysisInput struct {
	SessionID      string
	UserID         string
	Status         string
	Transcript     string
	OverallScore   int
	CategoryScores AnalysisCategoryScores
	FillerWords    []string
	PacingWPM      int
	Strengths      []string
	Improvements   []string
	Encouragement  string
	ErrorMessage   string
}
