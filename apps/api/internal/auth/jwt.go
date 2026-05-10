package auth

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hmac"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

type User struct {
	ID    string
	Email string
}

type Verifier struct {
	secret      []byte
	supabaseURL string
	httpClient  *http.Client
	mu          sync.Mutex
	jwks        []jwk
	jwksUntil   time.Time
}

type jwk struct {
	KeyType   string `json:"kty"`
	KeyID     string `json:"kid"`
	Algorithm string `json:"alg"`
	Curve     string `json:"crv"`
	X         string `json:"x"`
	Y         string `json:"y"`
	Modulus   string `json:"n"`
	Exponent  string `json:"e"`
}

func NewVerifier(secret, supabaseURL string) *Verifier {
	if secret == "" && supabaseURL == "" {
		return nil
	}
	return &Verifier{
		secret:      []byte(secret),
		supabaseURL: strings.TrimRight(supabaseURL, "/"),
		httpClient:  &http.Client{Timeout: 10 * time.Second},
	}
}

func (v *Verifier) Verify(token string) (User, error) {
	if v == nil {
		return User{}, errors.New("auth verifier is not configured")
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return User{}, errors.New("invalid bearer token")
	}
	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return User{}, errors.New("invalid token header")
	}
	var header struct {
		Algorithm string `json:"alg"`
		Type      string `json:"typ"`
		KeyID     string `json:"kid"`
	}
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return User{}, errors.New("invalid token header")
	}
	if err := v.verifySignature(header.Algorithm, header.KeyID, parts); err != nil {
		return User{}, err
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return User{}, errors.New("invalid token payload")
	}
	var claims struct {
		Subject string `json:"sub"`
		Email   string `json:"email"`
		Role    string `json:"role"`
		Expires int64  `json:"exp"`
	}
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return User{}, errors.New("invalid token payload")
	}
	if claims.Subject == "" {
		return User{}, errors.New("token is missing subject")
	}
	if claims.Expires > 0 && time.Now().Unix() >= claims.Expires {
		return User{}, errors.New("token has expired")
	}
	return User{ID: claims.Subject, Email: claims.Email}, nil
}

func (v *Verifier) verifySignature(algorithm, keyID string, parts []string) error {
	switch algorithm {
	case "HS256":
		return v.verifyHS256(parts)
	case "RS256", "ES256":
		return v.verifyJWKS(algorithm, keyID, parts)
	default:
		return fmt.Errorf("unsupported token algorithm: %s", algorithm)
	}
}

func (v *Verifier) verifyHS256(parts []string) error {
	if len(v.secret) == 0 {
		return errors.New("jwt secret is not configured")
	}
	mac := hmac.New(sha256.New, v.secret)
	mac.Write([]byte(parts[0] + "." + parts[1]))
	expected := mac.Sum(nil)
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(signature, expected) {
		return errors.New("invalid token signature")
	}
	return nil
}

func (v *Verifier) verifyJWKS(algorithm, keyID string, parts []string) error {
	if keyID == "" {
		return errors.New("token is missing key id")
	}
	keys, err := v.keys()
	if err != nil {
		return err
	}
	for _, key := range keys {
		if key.KeyID != keyID {
			continue
		}
		if key.Algorithm != "" && key.Algorithm != algorithm {
			continue
		}
		return verifyJWKSignature(key, algorithm, []byte(parts[0]+"."+parts[1]), parts[2])
	}
	return errors.New("token signing key was not found")
}

func (v *Verifier) keys() ([]jwk, error) {
	if v.supabaseURL == "" {
		return nil, errors.New("supabase url is not configured for jwks verification")
	}
	v.mu.Lock()
	if len(v.jwks) > 0 && time.Now().Before(v.jwksUntil) {
		keys := v.jwks
		v.mu.Unlock()
		return keys, nil
	}
	v.mu.Unlock()

	req, err := http.NewRequest(http.MethodGet, v.supabaseURL+"/auth/v1/.well-known/jwks.json", nil)
	if err != nil {
		return nil, err
	}
	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("could not fetch supabase jwks: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("could not fetch supabase jwks: %s", resp.Status)
	}
	var out struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("invalid supabase jwks: %w", err)
	}
	if len(out.Keys) == 0 {
		return nil, errors.New("supabase jwks returned no keys")
	}
	v.mu.Lock()
	v.jwks = out.Keys
	v.jwksUntil = time.Now().Add(10 * time.Minute)
	v.mu.Unlock()
	return out.Keys, nil
}

func verifyJWKSignature(key jwk, algorithm string, signingInput []byte, encodedSignature string) error {
	signature, err := base64.RawURLEncoding.DecodeString(encodedSignature)
	if err != nil {
		return errors.New("invalid token signature")
	}
	digest := sha256.Sum256(signingInput)
	switch algorithm {
	case "RS256":
		publicKey, err := rsaPublicKey(key)
		if err != nil {
			return err
		}
		if err := rsa.VerifyPKCS1v15(publicKey, crypto.SHA256, digest[:], signature); err != nil {
			return errors.New("invalid token signature")
		}
		return nil
	case "ES256":
		publicKey, err := ecdsaPublicKey(key)
		if err != nil {
			return err
		}
		if len(signature) != 64 {
			return errors.New("invalid token signature")
		}
		r := new(big.Int).SetBytes(signature[:32])
		s := new(big.Int).SetBytes(signature[32:])
		if !ecdsa.Verify(publicKey, digest[:], r, s) {
			return errors.New("invalid token signature")
		}
		return nil
	default:
		return fmt.Errorf("unsupported token algorithm: %s", algorithm)
	}
}

func rsaPublicKey(key jwk) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(key.Modulus)
	if err != nil {
		return nil, errors.New("invalid rsa modulus")
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(key.Exponent)
	if err != nil {
		return nil, errors.New("invalid rsa exponent")
	}
	exponent := 0
	for _, value := range eBytes {
		exponent = exponent<<8 + int(value)
	}
	if exponent == 0 {
		return nil, errors.New("invalid rsa exponent")
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: exponent}, nil
}

func ecdsaPublicKey(key jwk) (*ecdsa.PublicKey, error) {
	if key.Curve != "P-256" {
		return nil, errors.New("unsupported ecdsa curve")
	}
	xBytes, err := base64.RawURLEncoding.DecodeString(key.X)
	if err != nil {
		return nil, errors.New("invalid ecdsa x coordinate")
	}
	yBytes, err := base64.RawURLEncoding.DecodeString(key.Y)
	if err != nil {
		return nil, errors.New("invalid ecdsa y coordinate")
	}
	x := new(big.Int).SetBytes(xBytes)
	y := new(big.Int).SetBytes(yBytes)
	if !elliptic.P256().IsOnCurve(x, y) {
		return nil, errors.New("invalid ecdsa public key")
	}
	return &ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y}, nil
}
