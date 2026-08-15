package backend

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"connectrpc.com/connect"
)

func TestResolveTokenPrefersFlagOverEnvAndFile(t *testing.T) {
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "credentials.json"))
	if err := SaveCredentials("from-file"); err != nil {
		t.Fatalf("save: %v", err)
	}
	t.Setenv("TASKER_TOKEN", "from-env")
	SetTokenOverride("from-flag")
	t.Cleanup(func() { SetTokenOverride("") })

	// An explicit --token is the most deliberate of the three, so it wins.
	got, err := ResolveToken()
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if got != "from-flag" {
		t.Errorf("expected the flag to win, got %q", got)
	}
}

func TestResolveTokenPrefersEnvOverSavedSession(t *testing.T) {
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "credentials.json"))
	if err := SaveCredentials("from-file"); err != nil {
		t.Fatalf("save: %v", err)
	}
	t.Setenv("TASKER_TOKEN", "from-env")
	SetTokenOverride("")

	// A scripted agent exports TASKER_TOKEN in an environment where a human may
	// also have logged in. The explicit credential must not lose to the
	// leftover session, or the script silently runs as that person.
	got, _ := ResolveToken()
	if got != "from-env" {
		t.Errorf("expected the env var to beat the saved session, got %q", got)
	}
}

func TestResolveTokenFallsBackToSavedSession(t *testing.T) {
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "credentials.json"))
	os.Unsetenv("TASKER_TOKEN")
	SetTokenOverride("")
	if err := SaveCredentials("from-file"); err != nil {
		t.Fatalf("save: %v", err)
	}
	got, _ := ResolveToken()
	if got != "from-file" {
		t.Errorf("expected the saved session, got %q", got)
	}
}

func TestResolveTokenIsEmptyWhenNothingIsSet(t *testing.T) {
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "credentials.json"))
	os.Unsetenv("TASKER_TOKEN")
	SetTokenOverride("")
	got, err := ResolveToken()
	if err != nil {
		t.Fatalf("being logged out is a normal state, not an error: %v", err)
	}
	if got != "" {
		t.Errorf("expected no token, got %q", got)
	}
}

func TestAuthInterceptorSendsAnAgentTokenFromTheEnvironment(t *testing.T) {
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "credentials.json"))
	t.Setenv("TASKER_TOKEN", "tskr_agenttoken")
	SetTokenOverride("")

	var got string
	next := connect.UnaryFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		got = req.Header().Get("Authorization")
		return nil, nil
	})
	_, _ = AuthInterceptor().WrapUnary(next)(context.Background(), connect.NewRequest(&struct{}{}))

	if got != "Bearer tskr_agenttoken" {
		t.Errorf("expected the agent token on the wire, got %q", got)
	}
}

func TestDescribeRPCErrorExplainsAThrottle(t *testing.T) {
	// ADR-0008 puts the rate limiter ahead of the Connect adapter so the 429 can
	// carry RFC 7807 and Retry-After. The cost, named in that ADR, is that a
	// generated client sees a transport-level failure rather than a typed error
	// — so the CLI has to recognise a bare 429 itself or print something
	// unhelpful at exactly the moment a user needs to know to back off.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/problem+json")
		w.Header().Set("Retry-After", "42")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"type":"about:blank","title":"Too Many Requests","status":429,"detail":"Rate limit exceeded. Retry after 42 seconds."}`))
	}))
	defer srv.Close()

	res, err := http.Post(srv.URL, "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer res.Body.Close()

	msg := DescribeHTTPError(res)
	if !strings.Contains(msg, "rate limit") {
		t.Errorf("expected the message to name the rate limit, got %q", msg)
	}
	if !strings.Contains(msg, "42") {
		t.Errorf("expected the message to carry Retry-After, got %q", msg)
	}
}

func TestDescribeRPCErrorLeavesOtherErrorsAlone(t *testing.T) {
	err := connect.NewError(connect.CodePermissionDenied, errors.New("this token lacks the tasks:write scope"))
	got := DescribeRPCError(err)
	if !strings.Contains(got, "tasks:write") {
		t.Errorf("expected the server's message to survive, got %q", got)
	}
}

func TestDescribeRPCErrorNamesAThrottleFromAConnectError(t *testing.T) {
	// connect-go maps a non-Connect 429 to CodeUnavailable, so the CLI can only
	// tell "throttled" from "server down" by the text. Matching on it is
	// fragile; the alternative is telling an agent its backend is unavailable
	// when in fact it just needs to slow down.
	err := connect.NewError(connect.CodeUnavailable, errors.New("Too Many Requests"))
	got := DescribeRPCError(err)
	if !strings.Contains(strings.ToLower(got), "rate limit") {
		t.Errorf("expected a throttle to be named as one, got %q", got)
	}
}
