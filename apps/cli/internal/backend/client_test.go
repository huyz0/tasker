package backend

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"connectrpc.com/connect"
)

func TestURLDefaultsToLocalhost(t *testing.T) {
	os.Unsetenv("TASKER_BACKEND_URL")
	if got := URL(); got != "http://localhost:8080" {
		t.Errorf("expected default URL, got %q", got)
	}
}

func TestURLHonorsEnvOverride(t *testing.T) {
	t.Setenv("TASKER_BACKEND_URL", "https://staging.example.com")
	if got := URL(); got != "https://staging.example.com" {
		t.Errorf("expected env override, got %q", got)
	}
}

func TestRequestIDInterceptorStampsHeaderAndLogsFailures(t *testing.T) {
	interceptor := RequestIDInterceptor()

	called := false
	next := connect.UnaryFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		called = true
		if req.Header().Get("X-Request-Id") == "" {
			t.Error("expected X-Request-Id header to be set on outgoing request")
		}
		return nil, errors.New("boom")
	})

	wrapped := interceptor.WrapUnary(next)
	_, err := wrapped(context.Background(), connect.NewRequest(&struct{}{}))
	if err == nil {
		t.Error("expected error to propagate")
	}
	if !called {
		t.Error("expected next to be called")
	}
}

func TestAuthInterceptorAttachesSavedTokenAsBearerHeader(t *testing.T) {
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "credentials.json"))
	if err := SaveCredentials("my-session-token"); err != nil {
		t.Fatalf("expected SaveCredentials to succeed, got: %v", err)
	}

	interceptor := AuthInterceptor()
	var gotHeader string
	next := connect.UnaryFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		gotHeader = req.Header().Get("Authorization")
		return nil, nil
	})

	wrapped := interceptor.WrapUnary(next)
	_, _ = wrapped(context.Background(), connect.NewRequest(&struct{}{}))

	if gotHeader != "Bearer my-session-token" {
		t.Errorf("expected Authorization header 'Bearer my-session-token', got %q", gotHeader)
	}
}

func TestAuthInterceptorSendsNoHeaderWhenLoggedOut(t *testing.T) {
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "does-not-exist.json"))

	interceptor := AuthInterceptor()
	var gotHeader string
	headerWasSet := false
	next := connect.UnaryFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		gotHeader, headerWasSet = req.Header().Get("Authorization"), req.Header().Get("Authorization") != ""
		return nil, nil
	})

	wrapped := interceptor.WrapUnary(next)
	_, _ = wrapped(context.Background(), connect.NewRequest(&struct{}{}))

	if headerWasSet {
		t.Errorf("expected no Authorization header when logged out, got %q", gotHeader)
	}
}
