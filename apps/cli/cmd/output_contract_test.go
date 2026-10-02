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

// fakeTaskLister answers ListTasks with a fixed page, or with err when set.
type fakeTaskLister struct {
	v1connect.UnimplementedTaskServiceHandler
	err error
}

func (f *fakeTaskLister) ListTasks(
	_ context.Context,
	_ *connect.Request[healthv1.ListTasksRequest],
) (*connect.Response[healthv1.ListTasksResponse], error) {
	if f.err != nil {
		return nil, f.err
	}
	return connect.NewResponse(&healthv1.ListTasksResponse{
		Tasks: []*healthv1.Task{{Id: "t1", DisplayId: "T-1", Title: "One", Status: "todo"}},
	}), nil
}

func serveTasks(t *testing.T, h *fakeTaskLister) {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(h))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	rootCmd.AddCommand(tasksCmd)
}

// M31-T01: the CLI is driven by scripts, so where output lands is the
// contract. Until M31 every result went to stderr - cobra's cmd.Print*
// writes to OutOrStderr() and the root never set an out writer - and tests
// hid it by setting one themselves. These go through runCLI, the same path
// Execute takes, with separate stdout and stderr.
func TestResultsGoToStdoutAndNothingElse(t *testing.T) {
	resetAllFlags(t)
	serveTasks(t, &fakeTaskLister{})

	var stdout, stderr bytes.Buffer
	code := runCLI([]string{"tasks", "list", "--project", "p1", "--json"}, &stdout, &stderr)

	if code != exitOK {
		t.Fatalf("expected exit 0, got %d (stderr: %s)", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), `"t1"`) {
		t.Errorf("expected the task on stdout, got %q", stdout.String())
	}
	if stderr.Len() != 0 {
		t.Errorf("expected nothing on stderr, got %q", stderr.String())
	}
}

func TestAFailurePrintsOneLineToStderrAndClassifiesTheExit(t *testing.T) {
	cases := []struct {
		code connect.Code
		want int
	}{
		{connect.CodeNotFound, exitNotFound},
		{connect.CodePermissionDenied, exitAuth},
		{connect.CodeUnauthenticated, exitAuth},
		{connect.CodeFailedPrecondition, exitConflict},
		{connect.CodeInvalidArgument, exitInvalid},
		{connect.CodeUnavailable, exitUnavailable},
		{connect.CodeInternal, exitFailure},
	}
	for _, c := range cases {
		t.Run(c.code.String(), func(t *testing.T) {
			resetAllFlags(t)
			serveTasks(t, &fakeTaskLister{err: connect.NewError(c.code, errString("nope"))})

			var stdout, stderr bytes.Buffer
			code := runCLI([]string{"tasks", "list", "--project", "p1"}, &stdout, &stderr)

			if code != c.want {
				t.Errorf("expected exit %d, got %d", c.want, code)
			}
			if stdout.Len() != 0 {
				t.Errorf("expected nothing on stdout, got %q", stdout.String())
			}
			lines := strings.Split(strings.TrimSpace(stderr.String()), "\n")
			if len(lines) != 1 || !strings.HasPrefix(lines[0], "Error: ") || strings.Contains(lines[0], "Error: Error") {
				t.Errorf("expected exactly one 'Error: …' line, got %q", stderr.String())
			}
		})
	}
}

func TestAMissingFlagIsReportedOnceAndExitsNonZero(t *testing.T) {
	resetAllFlags(t)
	rootCmd.AddCommand(tasksCmd)
	t.Setenv("TASKER_PROJECT_ID", "")

	var stdout, stderr bytes.Buffer
	code := runCLI([]string{"tasks", "list"}, &stdout, &stderr)

	if code != exitFailure {
		t.Errorf("expected exit %d, got %d", exitFailure, code)
	}
	if got := strings.Count(stderr.String(), "--project is required"); got != 1 {
		t.Errorf("expected the message once on stderr, got %d times: %q", got, stderr.String())
	}
	if stdout.Len() != 0 {
		t.Errorf("expected nothing on stdout, got %q", stdout.String())
	}
}

type errString string

func (e errString) Error() string { return string(e) }
