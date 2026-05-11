package main

import (
	"log"
	"net/http"

	"speakez/api/internal/ai"
	"speakez/api/internal/app"
	"speakez/api/internal/config"
	"speakez/api/internal/store"
)

func main() {
	cfg := config.Load()
	server := app.NewServer(cfg)
	server.UseStore(store.NewClient(cfg.SupabaseURL, cfg.SupabaseServiceKey))
	server.UseAnalyzer(ai.NewClient(cfg.OpenAIAPIKey, cfg.OpenAITranscriptionModel, cfg.OpenRouterAPIKey, cfg.OpenRouterModel))
	log.Printf("SpeakEZ API listening on %s", cfg.Addr)
	if err := http.ListenAndServe(cfg.Addr, server.Routes()); err != nil {
		log.Fatal(err)
	}
}
