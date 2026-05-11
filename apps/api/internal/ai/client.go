package ai

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"regexp"
	"strings"
	"time"

	"speakez/api/internal/app"
)

type Client struct {
	openAIKey          string
	transcriptionModel string
	openRouterKey      string
	openRouterModel    string
	httpClient         *http.Client
}

func NewClient(openAIKey, transcriptionModel, openRouterKey, openRouterModel string) *Client {
	if openAIKey == "" || openRouterKey == "" {
		return nil
	}
	return &Client{
		openAIKey: openAIKey, transcriptionModel: transcriptionModel,
		openRouterKey: openRouterKey, openRouterModel: openRouterModel,
		httpClient: &http.Client{Timeout: 2 * time.Minute},
	}
}

func (c *Client) Analyze(req app.AnalysisJob) (app.AIAnalysis, error) {
	if c == nil {
		return app.AIAnalysis{}, errors.New("ai is not configured")
	}
	transcript, err := c.transcribe(req.Media)
	if err != nil {
		return app.AIAnalysis{}, err
	}
	feedback, err := c.feedback(req.Prompt, transcript, req.DurationSeconds)
	if err != nil {
		return app.AIAnalysis{}, err
	}
	feedback.ID = req.SessionID + "-analysis"
	feedback.SessionID = req.SessionID
	feedback.Status = "complete"
	feedback.Transcript = transcript
	feedback.CreatedAt = time.Now()
	if feedback.PacingWPM == 0 {
		feedback.PacingWPM = estimateWPM(transcript, req.DurationSeconds)
	}
	return feedback, nil
}

func (c *Client) transcribe(media []byte) (string, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	model := c.transcriptionModel
	if model == "" {
		model = "gpt-4o-mini-transcribe"
	}
	_ = writer.WriteField("model", model)
	_ = writer.WriteField("response_format", "json")
	part, err := writer.CreateFormFile("file", "speakez.webm")
	if err != nil {
		return "", err
	}
	if _, err := part.Write(media); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}
	req, err := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/audio/transcriptions", &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.openAIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", openAITranscriptionError(resp.StatusCode, msg)
	}
	var out struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if strings.TrimSpace(out.Text) == "" {
		return "", errors.New("openai returned an empty transcript")
	}
	return strings.TrimSpace(out.Text), nil
}

const openAIQuotaMessage = "OpenAI transcription quota is exhausted. Add credits or raise your monthly limit, then try again."

func openAITranscriptionError(statusCode int, body []byte) error {
	raw := strings.TrimSpace(string(body))
	var parsed struct {
		Error struct {
			Message string `json:"message"`
			Type    string `json:"type"`
			Code    string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &parsed); err == nil {
		message := strings.TrimSpace(parsed.Error.Message)
		code := strings.TrimSpace(parsed.Error.Code)
		errorType := strings.TrimSpace(parsed.Error.Type)
		if statusCode == http.StatusTooManyRequests && (code == "insufficient_quota" || errorType == "insufficient_quota" || strings.Contains(strings.ToLower(message), "exceeded your current quota")) {
			return errors.New(openAIQuotaMessage)
		}
		if message != "" {
			return fmt.Errorf("openai transcription failed: %s", message)
		}
	}
	if raw == "" {
		return fmt.Errorf("openai transcription failed: %s", statusLabel(statusCode))
	}
	return fmt.Errorf("openai transcription failed: %s: %s", statusLabel(statusCode), raw)
}

func statusLabel(statusCode int) string {
	if text := http.StatusText(statusCode); text != "" {
		return fmt.Sprintf("%d %s", statusCode, text)
	}
	return fmt.Sprintf("%d", statusCode)
}

func (c *Client) feedback(prompt, transcript string, durationSeconds int) (app.AIAnalysis, error) {
	userContent := fmt.Sprintf("Prompt: %s\nDuration seconds: %d\nTranscript:\n%s", prompt, durationSeconds, transcript)
	payload := map[string]any{
		"model": c.openRouterModel,
		"messages": []map[string]string{
			{"role": "system", "content": feedbackSystemPrompt},
			{"role": "user", "content": userContent},
		},
		"response_format": map[string]string{"type": "json_object"},
		"temperature":     0.65,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return app.AIAnalysis{}, err
	}
	req, err := http.NewRequest(http.MethodPost, "https://openrouter.ai/api/v1/chat/completions", bytes.NewReader(data))
	if err != nil {
		return app.AIAnalysis{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.openRouterKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", "https://speakez.app")
	req.Header.Set("X-Title", "SpeakEZ")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return app.AIAnalysis{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return app.AIAnalysis{}, fmt.Errorf("openrouter analysis failed: %s: %s", resp.Status, strings.TrimSpace(string(msg)))
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return app.AIAnalysis{}, err
	}
	if len(out.Choices) == 0 {
		return app.AIAnalysis{}, errors.New("openrouter returned no choices")
	}
	content := strings.TrimSpace(out.Choices[0].Message.Content)
	content = extractJSONObject(content)
	var parsed struct {
		OverallScore   int                        `json:"overallScore"`
		CategoryScores app.AnalysisCategoryScores `json:"categoryScores"`
		FillerWords    []string                   `json:"fillerWords"`
		PacingWPM      int                        `json:"pacingWpm"`
		Strengths      []string                   `json:"strengths"`
		Improvements   []string                   `json:"improvements"`
		Encouragement  string                     `json:"encouragement"`
	}
	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		return app.AIAnalysis{}, fmt.Errorf("openrouter returned invalid analysis json: %w", err)
	}
	return app.AIAnalysis{
		OverallScore: clamp(parsed.OverallScore),
		CategoryScores: app.AnalysisCategoryScores{
			Clarity: clamp(parsed.CategoryScores.Clarity), Structure: clamp(parsed.CategoryScores.Structure),
			Pacing: clamp(parsed.CategoryScores.Pacing), Confidence: clamp(parsed.CategoryScores.Confidence),
			Concision: clamp(parsed.CategoryScores.Concision),
		},
		FillerWords:   parsed.FillerWords,
		PacingWPM:     parsed.PacingWPM,
		Strengths:     limitStrings(parsed.Strengths, 3),
		Improvements:  limitStrings(parsed.Improvements, 3),
		Encouragement: strings.TrimSpace(parsed.Encouragement),
	}, nil
}

const feedbackSystemPrompt = `You are the SpeakEZ speaking coach. Analyze the transcript gently, practically, and with a little wit.
Return only compact JSON with keys:
overallScore number 0-100,
categoryScores object with clarity, structure, pacing, confidence, concision numbers 0-100,
fillerWords array of strings,
pacingWpm number,
strengths array of 3 coaching sentences,
improvements array of 3 coaching sentences,
encouragement one short paragraph.
Strengths must be encouraging complete sentences that explain what the speaker did well and why it helped the answer.
Improvements must be supportive "try next" complete sentences that name one action to try and explain why it will improve the next take.
You may include a short transcript phrase as evidence, but never return a raw quote, phrase, claim, or transcript fragment as the entire item.
Avoid slight rewrites of the transcript; turn transcript evidence into coaching.
Make the critique sound unique to this take: call out the best line, the muddiest line, and one funny-but-kind observation when appropriate.
Score based only on the transcript and duration; do not claim to assess body language, facial expression, or video. If the transcript is too thin, say that plainly.`

func extractJSONObject(content string) string {
	content = strings.TrimPrefix(strings.TrimSuffix(content, "```"), "```json")
	content = strings.TrimSpace(content)
	if strings.HasPrefix(content, "{") {
		return content
	}
	re := regexp.MustCompile(`(?s)\{.*\}`)
	match := re.FindString(content)
	if match != "" {
		return match
	}
	return content
}

func estimateWPM(transcript string, durationSeconds int) int {
	if durationSeconds <= 0 {
		return 0
	}
	words := len(strings.Fields(transcript))
	return int(float64(words) / (float64(durationSeconds) / 60))
}

func clamp(value int) int {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

func limitStrings(values []string, max int) []string {
	if len(values) > max {
		return values[:max]
	}
	if values == nil {
		return []string{}
	}
	return values
}
