package storage

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	serviceKey string
	bucket     string
	httpClient *http.Client
}

type SignedUpload struct {
	Path      string `json:"path"`
	Token     string `json:"token"`
	SignedURL string `json:"signedUrl"`
}

func NewClient(baseURL, serviceKey string) *Client {
	if baseURL == "" || serviceKey == "" {
		return nil
	}
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		serviceKey: serviceKey,
		bucket:     "recordings",
		httpClient: &http.Client{Timeout: 60 * time.Second},
	}
}

func (c *Client) CreateSignedUpload(path string) (*SignedUpload, error) {
	if c == nil {
		return nil, errors.New("storage is not configured")
	}
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(map[string]bool{"upsert": false}); err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s/storage/v1/object/upload/sign/%s/%s", c.baseURL, c.bucket, path)
	req, err := http.NewRequest(http.MethodPost, url, &body)
	if err != nil {
		return nil, err
	}
	c.authHeaders(req)
	req.Header.Set("Content-Type", "application/json")

	var res struct {
		Path         string `json:"path"`
		Token        string `json:"token"`
		SignedURL    string `json:"signedURL"`
		SignedURLAlt string `json:"signedUrl"`
		URL          string `json:"url"`
	}
	if err := c.do(req, &res); err != nil {
		return nil, err
	}
	signedURL := res.SignedURL
	if signedURL == "" {
		signedURL = res.SignedURLAlt
	}
	if signedURL == "" {
		signedURL = res.URL
	}
	signedURL = c.storageURL(signedURL)
	if signedURL == "" && res.Token != "" {
		signedURL = fmt.Sprintf("%s/storage/v1/object/upload/sign/%s/%s?token=%s", c.baseURL, c.bucket, path, res.Token)
	}
	if res.Path == "" {
		res.Path = path
	}
	return &SignedUpload{Path: res.Path, Token: res.Token, SignedURL: signedURL}, nil
}

func (c *Client) CreateSignedDownload(path string, expiresIn int) (string, error) {
	if c == nil {
		return "", errors.New("storage is not configured")
	}
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(map[string]int{"expiresIn": expiresIn}); err != nil {
		return "", err
	}
	url := fmt.Sprintf("%s/storage/v1/object/sign/%s/%s", c.baseURL, c.bucket, path)
	req, err := http.NewRequest(http.MethodPost, url, &body)
	if err != nil {
		return "", err
	}
	c.authHeaders(req)
	req.Header.Set("Content-Type", "application/json")

	var res struct {
		SignedURL    string `json:"signedURL"`
		SignedURLAlt string `json:"signedUrl"`
	}
	if err := c.do(req, &res); err != nil {
		return "", err
	}
	signedURL := res.SignedURL
	if signedURL == "" {
		signedURL = res.SignedURLAlt
	}
	return c.storageURL(signedURL), nil
}

func (c *Client) Download(path string) ([]byte, error) {
	if c == nil {
		return nil, errors.New("storage is not configured")
	}
	url := fmt.Sprintf("%s/storage/v1/object/%s/%s", c.baseURL, c.bucket, path)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	c.authHeaders(req)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("supabase storage download failed: %s: %s", resp.Status, strings.TrimSpace(string(msg)))
	}
	return io.ReadAll(resp.Body)
}

func (c *Client) Delete(path string) error {
	if c == nil || path == "" {
		return nil
	}
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(map[string][]string{"prefixes": []string{path}}); err != nil {
		return err
	}
	url := fmt.Sprintf("%s/storage/v1/object/%s", c.baseURL, c.bucket)
	req, err := http.NewRequest(http.MethodDelete, url, &body)
	if err != nil {
		return err
	}
	c.authHeaders(req)
	req.Header.Set("Content-Type", "application/json")
	return c.do(req, nil)
}

func (c *Client) authHeaders(req *http.Request) {
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
}

func (c *Client) storageURL(path string) string {
	if path == "" || strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	if strings.HasPrefix(path, "/storage/v1/") {
		return c.baseURL + path
	}
	if strings.HasPrefix(path, "/") {
		return c.baseURL + "/storage/v1" + path
	}
	return path
}

func (c *Client) do(req *http.Request, out any) error {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("supabase storage request failed: %s: %s", resp.Status, strings.TrimSpace(string(msg)))
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
