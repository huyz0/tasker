package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
)

func TestAuthCommandMetadata(t *testing.T) {
	if authCmd.Use != "auth" {
		t.Errorf("expected authCmd.Use 'auth', got %q", authCmd.Use)
	}
	if authCmd.Short == "" {
		t.Error("expected authCmd to have a short description")
	}
}

func TestGenerateNonceReturnsDistinctValues(t *testing.T) {
	a, err := generateNonce()
	if err != nil {
		t.Fatalf("expected generateNonce to succeed, got: %v", err)
	}
	if len(a) == 0 {
		t.Error("expected a non-empty nonce")
	}
	b, err := generateNonce()
	if err != nil {
		t.Fatalf("expected generateNonce to succeed, got: %v", err)
	}
	if a == b {
		t.Error("expected two calls to generateNonce to produce distinct values")
	}
}

func TestCallbackHandlerAcceptsAMatchingNonce(t *testing.T) {
	ch := make(chan string, 1)
	handler := newCallbackHandler("expected-nonce", ch)

	req := httptest.NewRequest("GET", "/callback?token=real-token&nonce=expected-nonce", nil)
	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 for a matching nonce, got %d", rec.Code)
	}
	select {
	case token := <-ch:
		if token != "real-token" {
			t.Errorf("expected token 'real-token', got %q", token)
		}
	default:
		t.Error("expected the token to be sent on the channel")
	}
}

func TestCallbackHandlerRejectsAMismatchedOrMissingNonce(t *testing.T) {
	ch := make(chan string, 1)
	handler := newCallbackHandler("expected-nonce", ch)

	req := httptest.NewRequest("GET", "/callback?token=attacker-token&nonce=wrong-nonce", nil)
	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for a mismatched nonce, got %d", rec.Code)
	}
	select {
	case token := <-ch:
		t.Errorf("expected no token to be sent on the channel, got %q", token)
	default:
	}

	// Also reject when the nonce is missing entirely.
	req2 := httptest.NewRequest("GET", "/callback?token=attacker-token", nil)
	rec2 := httptest.NewRecorder()
	handler(rec2, req2)
	if rec2.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for a missing nonce, got %d", rec2.Code)
	}
}

func TestLoginCommandMetadata(t *testing.T) {
	if loginCmd.Use != "login" {
		t.Errorf("expected loginCmd.Use 'login', got %q", loginCmd.Use)
	}
	if loginCmd.Short == "" {
		t.Error("expected loginCmd to have a short description")
	}
	if loginCmd.RunE == nil {
		t.Error("expected loginCmd.RunE to be defined")
	}
}

// If the local callback listener's port is already taken (e.g. another
// `tasker auth login` already running), the command must report that
// failure promptly instead of silently sitting through the full 5-minute
// timeout as if it were just waiting on the browser.
func TestLoginCommandReportsCallbackListenerBindFailure(t *testing.T) {
	occupier, err := net.Listen("tcp", fmt.Sprintf(":%d", cliCallbackPort))
	if err != nil {
		t.Skipf("could not occupy port %d for this test: %v", cliCallbackPort, err)
	}
	defer occupier.Close()

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"auth", "login"})

	done := make(chan struct{})
	go func() {
		_ = rootCmd.Execute()
		close(done)
	}()

	select {
	case <-done:
		if !strings.Contains(b.String(), "Failed to start local callback listener") {
			t.Fatalf("expected a bind-failure message, got: %s", b.String())
		}
	case <-time.After(10 * time.Second):
		t.Fatal("login command did not report the bind failure promptly")
	}
}

func TestAuthCommandRegistration(t *testing.T) {
	// loginCmd must be a sub-command of authCmd
	found := false
	for _, sub := range authCmd.Commands() {
		if sub.Use == "login" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected 'login' to be registered under 'auth'")
	}
}

func TestAuthRegisteredUnderRoot(t *testing.T) {
	found := false
	for _, sub := range rootCmd.Commands() {
		if sub.Use == "auth" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected 'auth' to be registered under root command")
	}
}

func TestSaveCredentialsPersistsTokenToDisk(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("TASKER_CREDENTIALS_PATH", "")

	if err := backend.SaveCredentials("test-token-123"); err != nil {
		t.Fatalf("expected SaveCredentials to succeed, got: %v", err)
	}

	path, err := backend.CredentialsPath()
	if err != nil {
		t.Fatalf("expected CredentialsPath to succeed, got: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("expected credentials file to exist at %s, got: %v", path, err)
	}
	if info.Mode().Perm() != 0600 {
		t.Errorf("expected credentials file to be 0600, got %o", info.Mode().Perm())
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read credentials file: %v", err)
	}
	var saved map[string]string
	if err := json.Unmarshal(raw, &saved); err != nil {
		t.Fatalf("failed to parse credentials file: %v", err)
	}
	if saved["token"] != "test-token-123" {
		t.Errorf("expected saved token 'test-token-123', got %q", saved["token"])
	}

	loaded, err := backend.LoadCredentials()
	if err != nil {
		t.Fatalf("expected LoadCredentials to succeed, got: %v", err)
	}
	if loaded != "test-token-123" {
		t.Errorf("expected loaded token 'test-token-123', got %q", loaded)
	}
}

func TestCredentialsPathIsUnderHomeDotTasker(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)
	t.Setenv("TASKER_CREDENTIALS_PATH", "")

	path, err := backend.CredentialsPath()
	if err != nil {
		t.Fatalf("expected CredentialsPath to succeed, got: %v", err)
	}
	expected := filepath.Join(tmpHome, ".tasker", "credentials.json")
	if path != expected {
		t.Errorf("expected path %q, got %q", expected, path)
	}
}

func TestLoadCredentialsReturnsEmptyWhenLoggedOut(t *testing.T) {
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "does-not-exist.json"))

	token, err := backend.LoadCredentials()
	if err != nil {
		t.Fatalf("expected no error for a missing credentials file, got: %v", err)
	}
	if token != "" {
		t.Errorf("expected empty token when logged out, got %q", token)
	}
}

func TestClearCredentialsRemovesTheFile(t *testing.T) {
	credPath := filepath.Join(t.TempDir(), "credentials.json")
	t.Setenv("TASKER_CREDENTIALS_PATH", credPath)

	if err := backend.SaveCredentials("token-to-clear"); err != nil {
		t.Fatalf("expected SaveCredentials to succeed, got: %v", err)
	}
	if err := backend.ClearCredentials(); err != nil {
		t.Fatalf("expected ClearCredentials to succeed, got: %v", err)
	}
	if _, err := os.Stat(credPath); !os.IsNotExist(err) {
		t.Errorf("expected credentials file to be removed, stat err: %v", err)
	}

	// Logging out twice should be a no-op, not an error.
	if err := backend.ClearCredentials(); err != nil {
		t.Errorf("expected ClearCredentials to be idempotent, got: %v", err)
	}
}

type fakeAuthHandler struct {
	v1connect.UnimplementedAuthServiceHandler
	receivedAuthHeader string
}

func (f *fakeAuthHandler) GetIdentity(
	ctx context.Context,
	req *connect.Request[healthv1.GetIdentityRequest],
) (*connect.Response[healthv1.GetIdentityResponse], error) {
	f.receivedAuthHeader = req.Header().Get("Authorization")
	return connect.NewResponse(&healthv1.GetIdentityResponse{
		User: &healthv1.User{Id: "user-1", Name: "Ada Lovelace", Email: "ada@example.com"},
	}), nil
}

func TestWhoamiSendsTheSavedTokenAsABearerHeader(t *testing.T) {
	fake := &fakeAuthHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewAuthServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "credentials.json"))

	if err := backend.SaveCredentials("saved-session-token"); err != nil {
		t.Fatalf("expected SaveCredentials to succeed, got: %v", err)
	}

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"auth", "whoami"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if fake.receivedAuthHeader != "Bearer saved-session-token" {
		t.Errorf("expected the AuthService to receive the saved token as a bearer header, got %q", fake.receivedAuthHeader)
	}
	out := b.String()
	if !strings.Contains(out, "Ada Lovelace") || !strings.Contains(out, "ada@example.com") {
		t.Errorf("expected output to contain the identity, got %s", out)
	}
}

func TestWhoamiReportsNotLoggedInWithoutSavedCredentials(t *testing.T) {
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "does-not-exist.json"))

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"auth", "whoami"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Not logged in") {
		t.Errorf("expected a not-logged-in message, got %s", out)
	}
}

func TestLogoutCommandClearsSavedCredentials(t *testing.T) {
	credPath := filepath.Join(t.TempDir(), "credentials.json")
	t.Setenv("TASKER_CREDENTIALS_PATH", credPath)
	if err := backend.SaveCredentials("token-to-remove"); err != nil {
		t.Fatalf("expected SaveCredentials to succeed, got: %v", err)
	}

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"auth", "logout"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(credPath); !os.IsNotExist(err) {
		t.Errorf("expected credentials file to be removed after logout, stat err: %v", err)
	}
}
