package ai

import (
	"net/http"
	"strings"
	"testing"
)

func TestOpenAITranscriptionErrorInsufficientQuota(t *testing.T) {
	body := []byte(`{
		"error": {
			"message": "You exceeded your current quota, please check your plan and billing details.",
			"type": "insufficient_quota",
			"param": null,
			"code": "insufficient_quota"
		}
	}`)

	err := openAITranscriptionError(http.StatusTooManyRequests, body)
	if err == nil {
		t.Fatal("expected error")
	}
	if err.Error() != openAIQuotaMessage {
		t.Fatalf("expected quota message %q, got %q", openAIQuotaMessage, err.Error())
	}
}

func TestOpenAITranscriptionErrorUsesCleanAPIMessage(t *testing.T) {
	body := []byte(`{
		"error": {
			"message": "Incorrect API key provided.",
			"type": "invalid_request_error",
			"code": "invalid_api_key"
		}
	}`)

	err := openAITranscriptionError(http.StatusUnauthorized, body)
	if err == nil {
		t.Fatal("expected error")
	}
	const want = "openai transcription failed: Incorrect API key provided."
	if err.Error() != want {
		t.Fatalf("expected %q, got %q", want, err.Error())
	}
}

func TestFeedbackSystemPromptRequestsCoachingSentences(t *testing.T) {
	required := []string{
		"strengths array of 3 coaching sentences",
		"improvements array of 3 coaching sentences",
		"Strengths must be encouraging complete sentences that explain what the speaker did well and why it helped the answer.",
		"Improvements must be supportive \"try next\" complete sentences that name one action to try and explain why it will improve the next take.",
		"never return a raw quote, phrase, claim, or transcript fragment as the entire item",
		"Avoid slight rewrites of the transcript; turn transcript evidence into coaching.",
	}
	for _, text := range required {
		if !strings.Contains(feedbackSystemPrompt, text) {
			t.Fatalf("feedback prompt is missing contract text: %q", text)
		}
	}
}
