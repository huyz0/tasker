package backend

import (
	"context"
	"errors"
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
