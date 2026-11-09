package cmd

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
)

func TestUnaryCommandCancellationReachesAcceptedRequest(t *testing.T) {
	resetAllFlags(t)
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("TASKER_TOKEN", "")
	accepted := make(chan struct{}, 1)
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		accepted <- struct{}{}
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	t.Cleanup(func() { close(release); server.Close() })
	t.Setenv("TASKER_BACKEND_URL", server.URL)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	pingCmd.SetContext(ctx)
	t.Cleanup(func() { pingCmd.SetContext(nil); rootCmd.SetContext(nil) })
	var stdout, stderr bytes.Buffer
	rootCmd.SetOut(&stdout)
	rootCmd.SetErr(&stderr)
	rootCmd.SetArgs([]string{"ping"})
	finished := make(chan error, 1)
	go func() { finished <- rootCmd.ExecuteContext(ctx) }()
	select {
	case <-accepted:
	case <-time.After(time.Second):
		t.Fatal("request never reached the server")
	}
	cancel()
	select {
	case err := <-finished:
		if connect.CodeOf(err) != connect.CodeCanceled {
			t.Fatalf("cancelled request returned %v", err)
		}
	case <-time.After(300 * time.Millisecond):
		t.Error("command cancellation did not interrupt an accepted request")
		server.CloseClientConnections()
		select {
		case <-finished:
		case <-time.After(time.Second):
			t.Error("request did not stop after test connection cleanup")
		}
	}
	if stdout.Len() != 0 {
		t.Errorf("cancelled command wrote a result: %q", stdout.String())
	}
}

func TestConfiguredRequestTimeoutBoundsRPCAndPasswordHTTP(t *testing.T) {
	for _, args := range [][]string{{"ping"}, {"auth", "login", "--username", "fixture", "--password", "fixture-password"}} {
		t.Run(strings.Join(args[:1], ""), func(t *testing.T) {
			resetAllFlags(t)
			t.Setenv("XDG_CONFIG_HOME", t.TempDir())
			t.Setenv("TASKER_TOKEN", "")
			accepted := make(chan struct{}, 1)
			release := make(chan struct{})
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				accepted <- struct{}{}
				select {
				case <-r.Context().Done():
				case <-release:
				}
			}))
			t.Cleanup(func() { close(release); server.Close() })
			t.Setenv("TASKER_BACKEND_URL", server.URL)
			var stdout, stderr bytes.Buffer
			finished := make(chan int, 1)
			go func() { finished <- runCLI(append(args, "--timeout", "100ms"), &stdout, &stderr) }()
			var code int
			select {
			case code = <-finished:
			case <-time.After(time.Second):
				t.Error("configured timeout did not stop the request")
				server.CloseClientConnections()
				code = <-finished
			}
			if code != exitUnavailable {
				t.Errorf("timeout exit = %d, stderr = %q", code, stderr.String())
			}
			select {
			case <-accepted:
			default:
				t.Error("request never reached the server")
			}
			if stdout.Len() != 0 || strings.Count(stderr.String(), "\n") != 1 {
				t.Errorf("timeout output: stdout=%q stderr=%q", stdout.String(), stderr.String())
			}
		})
	}
}

func TestRepeatedCommandsDoNotInheritCancelledContexts(t *testing.T) {
	resetAllFlags(t)
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewHealthServiceHandler(&fakePingHandler{message: "fresh context"}))
	server := httptest.NewServer(mux)
	defer server.Close()
	t.Setenv("TASKER_BACKEND_URL", server.URL)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	var stdout, stderr bytes.Buffer
	if code := runCLIContext(ctx, []string{"ping"}, &stdout, &stderr); code != exitCanceled {
		t.Fatalf("cancel exit = %d: %s", code, stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := runCLI([]string{"ping"}, &stdout, &stderr); code != exitOK || !strings.Contains(stdout.String(), "fresh context") {
		t.Fatalf("next command inherited cancellation: code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
}

type pagedRequestBudget struct {
	v1connect.UnimplementedTaskServiceHandler
	calls atomic.Int64
}

func (h *pagedRequestBudget) ListTasks(ctx context.Context, _ *connect.Request[healthv1.ListTasksRequest]) (*connect.Response[healthv1.ListTasksResponse], error) {
	select {
	case <-time.After(600 * time.Millisecond):
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	call := h.calls.Add(1)
	page := &healthv1.PageResponse{}
	if call == 1 {
		page.NextCursor = "next"
	}
	return connect.NewResponse(&healthv1.ListTasksResponse{Tasks: []*healthv1.Task{{Id: "task"}}, Page: page}), nil
}

func TestEachPageGetsANewRequestBudget(t *testing.T) {
	resetAllFlags(t)
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	handler := &pagedRequestBudget{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(handler))
	server := httptest.NewServer(mux)
	defer server.Close()
	t.Setenv("TASKER_BACKEND_URL", server.URL)
	var stdout, stderr bytes.Buffer
	code := runCLI([]string{"tasks", "list", "--project", "project", "--page-all", "--json", "--timeout", "1s"}, &stdout, &stderr)
	if code != exitOK || handler.calls.Load() != 2 {
		t.Fatalf("pagination budget: exit=%d calls=%d stderr=%q", code, handler.calls.Load(), stderr.String())
	}
}

func TestDebugSessionRequestUsesConfiguredTimeout(t *testing.T) {
	resetAllFlags(t)
	if err := backend.SetRequestTimeout(50 * time.Millisecond); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer server.Close()
	parent, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	started := time.Now()
	_, err := checkSessionWithServer(parent, server.Client(), server.URL, "fixture-token")
	if exitCodeFor(err) != exitUnavailable || time.Since(started) >= 500*time.Millisecond {
		t.Fatalf("debug timeout returned %v", err)
	}
}

func TestRequestTimeoutMustBePositive(t *testing.T) {
	for _, value := range []string{"0s", "-1s"} {
		t.Run(value, func(t *testing.T) {
			resetAllFlags(t)
			var stdout, stderr bytes.Buffer
			if code := runCLI([]string{"ping", "--timeout", value}, &stdout, &stderr); code != exitInvalid {
				t.Errorf("invalid timeout exit = %d: %s", code, stderr.String())
			}
		})
	}
}
