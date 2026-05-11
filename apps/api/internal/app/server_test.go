package app

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"speakez/api/internal/config"
	"speakez/api/internal/storage"
)

type fakeRecordingStorage struct {
	signedURL     string
	signedErr     error
	requestedPath string
	expiresIn     int
}

func (f *fakeRecordingStorage) CreateSignedUpload(path string) (*storage.SignedUpload, error) {
	return &storage.SignedUpload{Path: path, Token: "upload-token", SignedURL: "https://storage.example/upload"}, nil
}

func (f *fakeRecordingStorage) CreateSignedDownload(path string, expiresIn int) (string, error) {
	f.requestedPath = path
	f.expiresIn = expiresIn
	return f.signedURL, f.signedErr
}

func (f *fakeRecordingStorage) Download(_ string) ([]byte, error) {
	return []byte("video"), nil
}

func (f *fakeRecordingStorage) Delete(_ string) error {
	return nil
}

func TestGetSessionAttachesPlaybackURL(t *testing.T) {
	server := NewServer(config.Config{})
	storagePath := "demo-user/session-1.webm"
	fakeStorage := &fakeRecordingStorage{signedURL: "https://storage.example/storage/v1/object/sign/recordings/demo-user/session-1.webm?token=download-token"}
	server.storage = fakeStorage
	server.sessions["session-1"] = PracticeSession{
		ID:              "session-1",
		ContentType:     "prompt",
		SessionStyle:    "quick_fire",
		PromptText:      "Tell us about momentum.",
		DurationSeconds: 42,
		StoragePath:     &storagePath,
		Status:          "uploaded",
		CreatedAt:       time.Now(),
	}

	req := httptest.NewRequest(http.MethodGet, "/sessions/session-1", nil)
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var session PracticeSession
	if err := json.NewDecoder(rec.Body).Decode(&session); err != nil {
		t.Fatalf("decode session: %v", err)
	}
	if session.PlaybackURL == nil || *session.PlaybackURL != fakeStorage.signedURL {
		t.Fatalf("expected playback URL %q, got %#v", fakeStorage.signedURL, session.PlaybackURL)
	}
	if !strings.Contains(*session.PlaybackURL, "/storage/v1/object/sign/") {
		t.Fatalf("expected browser-playable Supabase storage URL, got %q", *session.PlaybackURL)
	}
	if fakeStorage.requestedPath != storagePath {
		t.Fatalf("expected signed path %q, got %q", storagePath, fakeStorage.requestedPath)
	}
	if fakeStorage.expiresIn != 10*60 {
		t.Fatalf("expected 10 minute signed URL, got %d seconds", fakeStorage.expiresIn)
	}
}

func TestGetSessionReturnsErrorWhenPlaybackSigningFails(t *testing.T) {
	server := NewServer(config.Config{})
	storagePath := "demo-user/session-2.webm"
	server.storage = &fakeRecordingStorage{signedErr: errors.New("storage unavailable")}
	server.sessions["session-2"] = PracticeSession{
		ID:              "session-2",
		ContentType:     "prompt",
		SessionStyle:    "quick_fire",
		PromptText:      "Tell us about focus.",
		DurationSeconds: 36,
		StoragePath:     &storagePath,
		Status:          "uploaded",
		CreatedAt:       time.Now(),
	}

	req := httptest.NewRequest(http.MethodGet, "/sessions/session-2", nil)
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d: %s", http.StatusInternalServerError, rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "could not create playback URL") {
		t.Fatalf("expected playback URL error, got %s", rec.Body.String())
	}
}
