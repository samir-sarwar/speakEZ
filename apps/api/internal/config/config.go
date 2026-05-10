package config

import (
	"os"
	"strings"
)

type Config struct {
	Addr                     string
	FrontendURL              string
	SupabaseURL              string
	SupabaseServiceKey       string
	SupabaseJWTSecret        string
	StripeSecretKey          string
	StripePriceID            string
	StripeWebhookSecret      string
	OpenAIAPIKey             string
	OpenAITranscriptionModel string
	OpenRouterAPIKey         string
	OpenRouterModel          string
	TestPremiumEmails        []string
}

func Load() Config {
	loadDotEnv(".env")
	loadDotEnv("apps/api/.env")
	return Config{
		Addr:                     env("ADDR", ":8080"),
		FrontendURL:              env("FRONTEND_URL", "http://localhost:5173"),
		SupabaseURL:              os.Getenv("SUPABASE_URL"),
		SupabaseServiceKey:       os.Getenv("SUPABASE_SERVICE_ROLE_KEY"),
		SupabaseJWTSecret:        os.Getenv("SUPABASE_JWT_SECRET"),
		StripeSecretKey:          os.Getenv("STRIPE_SECRET_KEY"),
		StripePriceID:            os.Getenv("STRIPE_PRICE_ID"),
		StripeWebhookSecret:      os.Getenv("STRIPE_WEBHOOK_SECRET"),
		OpenAIAPIKey:             os.Getenv("OPENAI_API_KEY"),
		OpenAITranscriptionModel: env("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe"),
		OpenRouterAPIKey:         os.Getenv("OPENROUTER_API_KEY"),
		OpenRouterModel:          env("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
		TestPremiumEmails:        csvEnv("TEST_PREMIUM_EMAILS", "samirsarwaremail@gmail.com"),
	}
}

func env(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func csvEnv(key string, fallback string) []string {
	raw := env(key, fallback)
	values := []string{}
	for _, value := range strings.Split(raw, ",") {
		value = strings.ToLower(strings.TrimSpace(value))
		if value != "" {
			values = append(values, value)
		}
	}
	return values
}

func loadDotEnv(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for _, rawLine := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
			continue
		}
		key, value, _ := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if key == "" || os.Getenv(key) != "" {
			continue
		}
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		_ = os.Setenv(key, value)
	}
}
