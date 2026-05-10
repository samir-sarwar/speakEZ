package storage

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCreateSignedDownloadExpandsRelativeStorageURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/storage/v1/object/sign/recordings/user/session.webm" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]string{
			"signedURL": "/object/sign/recordings/user/session.webm?token=download-token",
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "service-key")
	url, err := client.CreateSignedDownload("user/session.webm", 600)
	if err != nil {
		t.Fatalf("CreateSignedDownload returned error: %v", err)
	}

	expected := server.URL + "/storage/v1/object/sign/recordings/user/session.webm?token=download-token"
	if url != expected {
		t.Fatalf("expected %q, got %q", expected, url)
	}
}

func TestCreateSignedUploadExpandsRelativeUploadURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/storage/v1/object/upload/sign/recordings/user/session.webm" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]string{
			"path":  "user/session.webm",
			"token": "upload-token",
			"url":   "/object/upload/sign/recordings/user/session.webm?token=upload-token",
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "service-key")
	upload, err := client.CreateSignedUpload("user/session.webm")
	if err != nil {
		t.Fatalf("CreateSignedUpload returned error: %v", err)
	}

	expectedPrefix := server.URL + "/storage/v1/object/upload/sign/recordings/user/session.webm"
	if !strings.HasPrefix(upload.SignedURL, expectedPrefix) {
		t.Fatalf("expected signed upload URL to start with %q, got %q", expectedPrefix, upload.SignedURL)
	}
}
