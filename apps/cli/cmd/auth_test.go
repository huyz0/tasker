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
	resetAllFlags(t)
	if authCmd.Use != "auth" {
		t.Errorf("expected authCmd.Use 'auth', got %q", authCmd.Use)
	}
	if authCmd.Short == "" {
		t.Error("expected authCmd to have a short description")
	}
}

func TestGenerateNonceReturnsDistinctValues(t *testing.T) {
	resetAllFlags(t)
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
	resetAllFlags(t)
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
	resetAllFlags(t)
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
	resetAllFlags(t)
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
	resetAllFlags(t)
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
	resetAllFlags(t)
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
	resetAllFlags(t)
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
	resetAllFlags(t)
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
	resetAllFlags(t)
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
	resetAllFlags(t)
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
	resetAllFlags(t)
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
	resetAllFlags(t)
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
	resetAllFlags(t)
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
	resetAllFlags(t)
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

// M13-T13. loginWithPassword is the pure HTTP logic behind
// `auth login --username`, tested directly against httptest servers -
// same shape as debug_test.go's checkSessionWithServer tests, since this
// is also a plain HTTP route, not a Connect procedure.

func TestLoginWithPasswordExtractsTokenFromSetCookie(t *testing.T) {
	resetAllFlags(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/password/login" {
			t.Errorf("expected request to /api/auth/password/login, got %s", r.URL.Path)
		}
		var body map[string]string
		json.NewDecoder(r.Body).Decode(&body)
		if body["username"] != "alice" || body["password"] != "a-strong-password-123" {
			t.Errorf("expected the posted username/password, got %+v", body)
		}
		http.SetCookie(w, &http.Cookie{Name: "session", Value: "the-session-token"})
		json.NewEncoder(w).Encode(passwordLoginResponse{UserID: "user-1", MustChangePassword: false})
	}))
	defer srv.Close()

	token, mustChange, err := loginWithPassword(srv.Client(), srv.URL, "alice", "a-strong-password-123")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if token != "the-session-token" {
		t.Errorf("expected the session cookie's value, got %q", token)
	}
	if mustChange {
		t.Error("expected mustChangePassword false")
	}
}

func TestLoginWithPasswordSurfacesMustChangePassword(t *testing.T) {
	resetAllFlags(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{Name: "session", Value: "tok"})
		json.NewEncoder(w).Encode(passwordLoginResponse{UserID: "user-1", MustChangePassword: true})
	}))
	defer srv.Close()

	_, mustChange, err := loginWithPassword(srv.Client(), srv.URL, "alice", "pw")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if !mustChange {
		t.Error("expected mustChangePassword true")
	}
}

func TestLoginWithPasswordReportsInvalidCredentials(t *testing.T) {
	resetAllFlags(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/problem+json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(problemDetailsBody{
			Title: "Invalid credentials", Status: 401, Detail: "The username or password is incorrect.",
		})
	}))
	defer srv.Close()

	_, _, err := loginWithPassword(srv.Client(), srv.URL, "alice", "wrong")
	if err == nil {
		t.Fatal("expected an error")
	}
	if err.Error() != "The username or password is incorrect." {
		t.Errorf("expected the server's own detail message, got: %v", err)
	}
}

func TestLoginWithPasswordReportsLockout(t *testing.T) {
	resetAllFlags(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "30")
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(problemDetailsBody{
			Title: "Account temporarily locked", Status: 429, Detail: "Too many failed attempts. Try again in 30 seconds.",
		})
	}))
	defer srv.Close()

	_, _, err := loginWithPassword(srv.Client(), srv.URL, "alice", "wrong")
	if err == nil || !strings.Contains(err.Error(), "Try again in 30 seconds") {
		t.Errorf("expected the lockout detail message, got: %v", err)
	}
}

func TestLoginWithPasswordErrorsWhenNoCookieIsReturned(t *testing.T) {
	resetAllFlags(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// A malformed/misconfigured backend that answers 200 with no
		// Set-Cookie at all - must not report success with an empty token.
		json.NewEncoder(w).Encode(passwordLoginResponse{UserID: "user-1"})
	}))
	defer srv.Close()

	_, _, err := loginWithPassword(srv.Client(), srv.URL, "alice", "pw")
	if err == nil {
		t.Fatal("expected an error when no session cookie is returned")
	}
}

func TestLoginWithPasswordFallsBackToRawBodyOnAnUnrecognizedErrorShape(t *testing.T) {
	resetAllFlags(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprint(w, "upstream error")
	}))
	defer srv.Close()

	_, _, err := loginWithPassword(srv.Client(), srv.URL, "alice", "pw")
	if err == nil || !strings.Contains(err.Error(), "upstream error") {
		t.Errorf("expected the raw body in the error, got: %v", err)
	}
}

// runPasswordLogin / the `auth login --username` command end to end.

func TestAuthLoginWithUsernameSavesCredentialsFromTheSessionCookie(t *testing.T) {
	resetAllFlags(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{Name: "session", Value: "session-from-password-login"})
		json.NewEncoder(w).Encode(passwordLoginResponse{UserID: "user-1"})
	}))
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	credPath := filepath.Join(t.TempDir(), "credentials.json")
	t.Setenv("TASKER_CREDENTIALS_PATH", credPath)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"auth", "login", "--username", "alice", "--password", "a-strong-password-123"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	loaded, err := backend.LoadCredentials()
	if err != nil {
		t.Fatalf("expected LoadCredentials to succeed, got: %v", err)
	}
	if loaded != "session-from-password-login" {
		t.Errorf("expected the session cookie's value to be saved, got %q", loaded)
	}
	if !strings.Contains(b.String(), "Success!") {
		t.Errorf("expected a success message, got: %s", b.String())
	}
}

func TestAuthLoginWithUsernameReportsMustChangePassword(t *testing.T) {
	resetAllFlags(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{Name: "session", Value: "tok"})
		json.NewEncoder(w).Encode(passwordLoginResponse{UserID: "user-1", MustChangePassword: true})
	}))
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "credentials.json"))

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"auth", "login", "--username", "alice", "--password", "pw"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(b.String(), "set-password") {
		t.Errorf("expected a prompt to run set-password, got: %s", b.String())
	}
}

func TestAuthLoginWithUsernameFailsCleanlyOnWrongPassword(t *testing.T) {
	resetAllFlags(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(problemDetailsBody{Detail: "The username or password is incorrect."})
	}))
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "does-not-exist.json"))

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"auth", "login", "--username", "alice", "--password", "wrong"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error for a failed login")
	}

	loaded, _ := backend.LoadCredentials()
	if loaded != "" {
		t.Errorf("expected no credentials to be saved on a failed login, got %q", loaded)
	}
}

func TestReadLineFromANormalStream(t *testing.T) {
	resetAllFlags(t)
	line, err := readLine(strings.NewReader("hunter2\n"))
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if line != "hunter2" {
		t.Errorf("expected %q, got %q", "hunter2", line)
	}
}

func TestReadLineWithNoTrailingNewline(t *testing.T) {
	resetAllFlags(t)
	// A stream that closes right after the line, with no trailing \n -
	// still a real line, not a failure to read one.
	line, err := readLine(strings.NewReader("hunter2"))
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if line != "hunter2" {
		t.Errorf("expected %q, got %q", "hunter2", line)
	}
}

func TestReadLineFromAnEmptyStream(t *testing.T) {
	resetAllFlags(t)
	line, err := readLine(strings.NewReader(""))
	if err == nil {
		t.Fatal("expected an error reading a line from an empty stream")
	}
	if line != "" {
		t.Errorf("expected an empty line, got %q", line)
	}
}

func TestAuthLoginRequiresAPasswordWhenThePromptYieldsNone(t *testing.T) {
	resetAllFlags(t)
	// loginCmd's --password flag is a package-level singleton Cobra does
	// not reset between Execute() calls (the same gotcha orgs_test.go
	// documents for --email/--username) - an earlier test's real password
	// would otherwise leak in here, skip the prompt entirely, and this
	// test would actually be exercising a real login attempt instead of
	// the empty-password path it's named for.
	loginCmd.Flags().Set("password", "")

	// Substitutes a real OS pipe, closed on the write end, for os.Stdin -
	// an immediate, deterministic EOF, rather than relying on whatever the
	// test process's real stdin happens to be (which may block indefinitely
	// on a read instead of failing fast, depending on the environment).
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	w.Close()
	originalStdin := os.Stdin
	os.Stdin = r
	defer func() { os.Stdin = originalStdin; r.Close() }()

	// A real, reachable server the test can prove was never called - safer
	// than an address chosen to be unreachable (e.g. 127.0.0.1:1), which in
	// a sandboxed/proxied network environment is not guaranteed to fail
	// fast rather than hang until some outer timeout.
	var called bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"auth", "login", "--username", "alice"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when no password can be obtained")
	}
	if called {
		t.Error("expected the backend to never be called when no password could be obtained")
	}
}

// `auth set-password`

type fakeSetPasswordHandler struct {
	v1connect.UnimplementedAuthServiceHandler
	received *healthv1.SetPasswordRequest
}

func (f *fakeSetPasswordHandler) SetPassword(
	ctx context.Context,
	req *connect.Request[healthv1.SetPasswordRequest],
) (*connect.Response[healthv1.SetPasswordResponse], error) {
	f.received = req.Msg
	return connect.NewResponse(&healthv1.SetPasswordResponse{Success: true}), nil
}

func TestSetPasswordCommandSendsBothFields(t *testing.T) {
	resetAllFlags(t)
	fake := &fakeSetPasswordHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewAuthServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "credentials.json"))
	backend.SaveCredentials("a-token")

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"auth", "set-password", "--current-password", "old-pw", "--new-password", "new-strong-password-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if fake.received.CurrentPassword != "old-pw" || fake.received.NewPassword != "new-strong-password-1" {
		t.Errorf("expected both fields forwarded, got %+v", fake.received)
	}
	if !strings.Contains(b.String(), "Password updated") {
		t.Errorf("expected a success message, got: %s", b.String())
	}
}

func TestSetPasswordCommandSurfacesServerRejection(t *testing.T) {
	resetAllFlags(t)
	setPasswordCmd.Flags().Set("current-password", "") // see the note in the empty-password login test above
	fake := &fakeAuthHandler{}                         // does not implement SetPassword -> falls through to Unimplemented
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewAuthServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "credentials.json"))
	backend.SaveCredentials("a-token")

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"auth", "set-password", "--new-password", "new-strong-password-1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when the server rejects the call")
	}
}
