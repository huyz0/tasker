package cmd

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"connectrpc.com/connect"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
)



func TestPingCommandMetadata(t *testing.T) {
	if pingCmd.Use != "ping" {
		t.Errorf("expected pingCmd.Use 'ping', got %q", pingCmd.Use)
	}
	if pingCmd.Short == "" {
		t.Error("expected pingCmd to have a short description")
	}
	if pingCmd.Run == nil {
		t.Error("expected pingCmd.Run to be defined")
	}
}

func TestPingRegisteredUnderRoot(t *testing.T) {
	found := false
	for _, sub := range rootCmd.Commands() {
		if sub.Use == "ping" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected 'ping' to be registered under root command")
	}
}

// TestRunPingSuccess verifies that runPing writes the expected output when the
// backend responds successfully. We serve a real Connect handler over httptest
// so the test exercises the full HTTP round-trip without a live server.
func TestRunPingSuccess(t *testing.T) {
	// Build a minimal in-process Connect handler that returns canned data.
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewHealthServiceHandler(&fakePingHandler{
		message:  "pong",
		dbStatus: "online",
	}))
	srv := httptest.NewServer(mux)
	defer srv.Close()

	factory := func(hc *http.Client, _ string) v1connect.HealthServiceClient {
		return v1connect.NewHealthServiceClient(hc, srv.URL)
	}

	var buf bytes.Buffer
	if err := runPing(&buf, factory, srv.Client(), srv.URL); err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "pong") {
		t.Errorf("expected output to contain 'pong', got: %q", out)
	}
	if !strings.Contains(out, "online") {
		t.Errorf("expected output to contain 'online', got: %q", out)
	}
}

// TestRunPingError verifies that runPing returns an error when the backend
// returns a non-2xx response. We use a real httptest server that always
// responds 500 to avoid goroutine-leak panics from TCP connect timeouts.
func TestRunPingError(t *testing.T) {
	errSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "internal error", http.StatusInternalServerError)
	}))
	defer errSrv.Close()

	factory := func(hc *http.Client, serverURL string) v1connect.HealthServiceClient {
		return v1connect.NewHealthServiceClient(hc, serverURL)
	}

	var buf bytes.Buffer
	err := runPing(&buf, factory, errSrv.Client(), errSrv.URL)
	if err == nil {
		t.Error("expected an error from a 500 server, got nil")
	}
	if !strings.Contains(err.Error(), "ping failed") {
		t.Errorf("expected error to contain 'ping failed', got: %q", err.Error())
	}
}


// -------------------------------------------------------------------
// Fake Connect handler
// -------------------------------------------------------------------

type fakePingHandler struct {
	v1connect.UnimplementedHealthServiceHandler
	message  string
	dbStatus string
}

func (f *fakePingHandler) Ping(
	_ context.Context,
	_ *connect.Request[healthv1.PingRequest],
) (*connect.Response[healthv1.PingResponse], error) {
	return connect.NewResponse(&healthv1.PingResponse{
		Message:  f.message,
		DbStatus: f.dbStatus,
	}), nil
}
