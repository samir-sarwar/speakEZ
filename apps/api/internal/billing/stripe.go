package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	secretKey     string
	priceID       string
	webhookSecret string
	frontendURL   string
	httpClient    *http.Client
}

type CheckoutInput struct {
	UserID     string
	Email      string
	CustomerID string
}

type SubscriptionEvent struct {
	CustomerID     string
	SubscriptionID string
	IsPremium      bool
}

func NewClient(secretKey, priceID, webhookSecret, frontendURL string) *Client {
	if secretKey == "" || priceID == "" {
		return nil
	}
	return &Client{
		secretKey: secretKey, priceID: priceID, webhookSecret: webhookSecret,
		frontendURL: strings.TrimRight(frontendURL, "/"), httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) CreateCustomer(email, userID string) (string, error) {
	values := url.Values{}
	values.Set("email", email)
	values.Set("metadata[user_id]", userID)
	var res struct {
		ID string `json:"id"`
	}
	if err := c.postForm("/v1/customers", values, &res); err != nil {
		return "", err
	}
	if res.ID == "" {
		return "", errors.New("stripe did not return a customer id")
	}
	return res.ID, nil
}

func (c *Client) Checkout(input CheckoutInput) (string, string, error) {
	if c == nil {
		return "", "", errors.New("stripe is not configured")
	}
	customerID := input.CustomerID
	var err error
	if customerID == "" {
		customerID, err = c.CreateCustomer(input.Email, input.UserID)
		if err != nil {
			return "", "", err
		}
	}
	values := url.Values{}
	values.Set("mode", "subscription")
	values.Set("customer", customerID)
	values.Set("client_reference_id", input.UserID)
	values.Set("line_items[0][price]", c.priceID)
	values.Set("line_items[0][quantity]", "1")
	values.Set("success_url", c.frontendURL+"?billing=success")
	values.Set("cancel_url", c.frontendURL+"?billing=cancelled")
	values.Set("allow_promotion_codes", "true")
	var res struct {
		URL string `json:"url"`
	}
	if err := c.postForm("/v1/checkout/sessions", values, &res); err != nil {
		return "", "", err
	}
	if res.URL == "" {
		return "", "", errors.New("stripe did not return a checkout url")
	}
	return res.URL, customerID, nil
}

func (c *Client) Portal(customerID string) (string, error) {
	if c == nil {
		return "", errors.New("stripe is not configured")
	}
	if customerID == "" {
		return "", errors.New("billing customer is not configured")
	}
	values := url.Values{}
	values.Set("customer", customerID)
	values.Set("return_url", c.frontendURL)
	var res struct {
		URL string `json:"url"`
	}
	if err := c.postForm("/v1/billing_portal/sessions", values, &res); err != nil {
		return "", err
	}
	if res.URL == "" {
		return "", errors.New("stripe did not return a portal url")
	}
	return res.URL, nil
}

func (c *Client) ParseWebhook(payload []byte, signature string) (*SubscriptionEvent, error) {
	if c == nil {
		return nil, errors.New("stripe is not configured")
	}
	if c.webhookSecret != "" && !validSignature(c.webhookSecret, payload, signature) {
		return nil, errors.New("invalid stripe webhook signature")
	}
	var event struct {
		Type string `json:"type"`
		Data struct {
			Object json.RawMessage `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(payload, &event); err != nil {
		return nil, err
	}
	switch event.Type {
	case "checkout.session.completed":
		var obj struct {
			Customer     string `json:"customer"`
			Subscription string `json:"subscription"`
			Mode         string `json:"mode"`
		}
		if err := json.Unmarshal(event.Data.Object, &obj); err != nil {
			return nil, err
		}
		if obj.Mode == "subscription" && obj.Customer != "" {
			return &SubscriptionEvent{CustomerID: obj.Customer, SubscriptionID: obj.Subscription, IsPremium: true}, nil
		}
	case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted":
		var obj struct {
			ID       string `json:"id"`
			Customer string `json:"customer"`
			Status   string `json:"status"`
		}
		if err := json.Unmarshal(event.Data.Object, &obj); err != nil {
			return nil, err
		}
		if obj.Customer != "" {
			active := obj.Status == "active" || obj.Status == "trialing"
			return &SubscriptionEvent{CustomerID: obj.Customer, SubscriptionID: obj.ID, IsPremium: active}, nil
		}
	}
	return nil, nil
}

func (c *Client) postForm(path string, values url.Values, out any) error {
	req, err := http.NewRequest(http.MethodPost, "https://api.stripe.com"+path, strings.NewReader(values.Encode()))
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.secretKey, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Stripe-Version", "2026-02-25.clover")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("stripe request failed: %s: %s", resp.Status, strings.TrimSpace(string(msg)))
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func validSignature(secret string, payload []byte, header string) bool {
	parts := strings.Split(header, ",")
	var timestamp, signature string
	for _, part := range parts {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		if key == "t" {
			timestamp = value
		}
		if key == "v1" {
			signature = value
		}
	}
	if timestamp == "" || signature == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		return false
	}
	signedAt, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	return time.Since(time.Unix(signedAt, 0)) < 5*time.Minute
}
