package cmd

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDebugSessionCommandMetadata(t *testing.T) {
	if debugSessionCmd.Use != "session [token]" {
		t.Errorf("expected debugSessionCmd.Use 'session [token]', got %q", debugSessionCmd.Use)
	}
	if debugSessionCmd.Short == "" {
		t.Error("expected debugSessionCmd to have a short description")
	}
	if debugSessionCmd.Run == nil {
		t.Error("expected debugSessionCmd.Run to be defined")
	}
}

func TestDebugRegisteredUnderRoot(t *testing.T) {
	found := false
	for _, sub := range rootCmd.Commands() {
		if sub.Use == "debug" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected 'debug' to be registered under root command")
	}
}

// makeFakeToken builds a token in the same <payload>.<signature> shape the
// backend issues, without needing JWT_SECRET - decodeSessionToken never
// checks the signature, so any non-empty string works there.
func makeFakeToken(userID string, expMillis int64, jti string) string {
	payload := decodedSessionPayload{UserID: userID, Exp: expMillis, Jti: jti}
	raw, _ := json.Marshal(payload)
	return base64.RawURLEncoding.EncodeToString(raw) + ".fake-signature"
}

func TestDecodeSessionToken(t *testing.T) {
	token := makeFakeToken("user-42", 1234567890000, "jti-abc")
	payload, err := decodeSessionToken(token)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if payload.UserID != "user-42" {
		t.Errorf("expected userId 'user-42', got %q", payload.UserID)
	}
	if payload.Jti != "jti-abc" {
		t.Errorf("expected jti 'jti-abc', got %q", payload.Jti)
	}
	if payload.Exp != 1234567890000 {
		t.Errorf("expected exp 1234567890000, got %d", payload.Exp)
	}
}

func TestDecodeSessionTokenRejectsMalformedInput(t *testing.T) {
	cases := []string{"", "no-dot-here", "bad-base64!!!.sig", "."}
	for _, c := range cases {
		if _, err := decodeSessionToken(c); err == nil {
			t.Errorf("expected an error decoding %q, got nil", c)
		}
	}
}

func TestRunDebugSessionValidToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/session" {
			t.Errorf("expected request to /api/auth/session, got %s", r.URL.Path)
		}
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			t.Errorf("expected an Authorization: Bearer header, got %q", r.Header.Get("Authorization"))
		}
		userID := "user-42"
		json.NewEncoder(w).Encode(sessionStatusResponse{Authenticated: true, UserID: &userID})
	}))
	defer srv.Close()

	token := makeFakeToken("user-42", 9999999999999, "jti-abc")
	var buf bytes.Buffer
	err := runDebugSession(&buf, srv.Client(), srv.URL, token)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, "user-42") {
		t.Errorf("expected output to contain userId, got: %q", out)
	}
	if !strings.Contains(out, "VALID") {
		t.Errorf("expected output to report VALID, got: %q", out)
	}
}

func TestRunDebugSessionRevokedOrExpiredToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(sessionStatusResponse{Authenticated: false, UserID: nil})
	}))
	defer srv.Close()

	token := makeFakeToken("user-42", 1, "jti-abc") // exp in the past
	var buf bytes.Buffer
	err := runDebugSession(&buf, srv.Client(), srv.URL, token)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, "EXPIRED") {
		t.Errorf("expected local decode to flag EXPIRED, got: %q", out)
	}
	if !strings.Contains(out, "INVALID") {
		t.Errorf("expected server-side check to report INVALID, got: %q", out)
	}
}

func TestRunDebugSessionNoToken(t *testing.T) {
	var buf bytes.Buffer
	err := runDebugSession(&buf, http.DefaultClient, "http://localhost:8080", "")
	if err == nil {
		t.Error("expected an error when no token is provided, got nil")
	}
}

func TestRunDebugSessionUndecodableToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(sessionStatusResponse{Authenticated: false, UserID: nil})
	}))
	defer srv.Close()

	var buf bytes.Buffer
	err := runDebugSession(&buf, srv.Client(), srv.URL, "not-a-real-token")
	if err != nil {
		t.Fatalf("expected no error (decode failure is non-fatal, still checks server), got: %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, "Could not decode token locally") {
		t.Errorf("expected local decode failure to be reported, got: %q", out)
	}
	if !strings.Contains(out, "INVALID") {
		t.Errorf("expected server-side check to still run, got: %q", out)
	}
}

func TestRunDebugSessionServerUnreachable(t *testing.T) {
	token := makeFakeToken("user-42", 9999999999999, "jti-abc")
	// A short client timeout keeps this test fast - the default client can
	// take tens of seconds to give up dialing a port nothing listens on.
	client := &http.Client{Timeout: 200 * time.Millisecond}
	var buf bytes.Buffer
	err := runDebugSession(&buf, client, "http://127.0.0.1:1", token)
	if err == nil {
		t.Error("expected an error when the backend is unreachable, got nil")
	}
}

func TestRunDebugSessionMalformedServerResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Not valid JSON at all - simulates a proxy/gateway error page or a
		// server that crashed before writing a real body.
		w.Write([]byte("<html>502 Bad Gateway</html>"))
	}))
	defer srv.Close()

	token := makeFakeToken("user-42", 9999999999999, "jti-abc")
	var buf bytes.Buffer
	err := runDebugSession(&buf, srv.Client(), srv.URL, token)
	if err == nil {
		t.Fatal("expected an error for a non-JSON server response, got nil")
	}
	if !strings.Contains(err.Error(), "unexpected response from backend") {
		t.Errorf("expected a clear 'unexpected response' error, got: %v", err)
	}
}
