package cmd

import (
	"bytes"
	"context"
	"encoding/json"
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

// fakePagedTaskLister answers with one task and a next cursor.
type fakePagedTaskLister struct {
	v1connect.UnimplementedTaskServiceHandler
}

func (fakePagedTaskLister) ListTasks(
	_ context.Context,
	_ *connect.Request[healthv1.ListTasksRequest],
) (*connect.Response[healthv1.ListTasksResponse], error) {
	return connect.NewResponse(&healthv1.ListTasksResponse{
		Tasks: []*healthv1.Task{{Id: "t1", ProjectId: "p1", Title: "One", Status: "todo"}},
		Page:  &healthv1.PageResponse{NextCursor: "c2", TotalCount: 3},
	}), nil
}

// M31-T02: a list's JSON is the whole response, so the cursor survives, in
// protojson's names (camelCase, zero values present - not encoding/json's
// struct-tag names with omitempty).
func TestListJSONIsTheWholeResponseInProtoJSONShape(t *testing.T) {
	resetAllFlags(t)
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(fakePagedTaskLister{}))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	rootCmd.AddCommand(tasksCmd)

	var stdout, stderr bytes.Buffer
	if code := runCLI([]string{"tasks", "list", "--project", "p1", "--json"}, &stdout, &stderr); code != exitOK {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}

	var got map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &got); err != nil {
		t.Fatalf("stdout is not one JSON document: %v\n%s", err, stdout.String())
	}
	page, _ := got["page"].(map[string]any)
	if page["nextCursor"] != "c2" {
		t.Errorf("expected page.nextCursor c2, got %v", got["page"])
	}
	task := got["tasks"].([]any)[0].(map[string]any)
	if task["projectId"] != "p1" {
		t.Errorf("expected camelCase projectId, got keys %v", task)
	}
	if _, present := task["description"]; !present {
		t.Errorf("expected an empty field to be present, not omitted: %v", task)
	}
	if strings.Count(strings.TrimSpace(stdout.String()), "\n") != 0 {
		t.Errorf("expected one compact line, got %q", stdout.String())
	}
}

type fakeOrgLister struct {
	v1connect.UnimplementedOrgServiceHandler
}

func (fakeOrgLister) ListOrgs(
	_ context.Context,
	_ *connect.Request[healthv1.ListOrgsRequest],
) (*connect.Response[healthv1.ListOrgsResponse], error) {
	return connect.NewResponse(&healthv1.ListOrgsResponse{
		Organizations: []*healthv1.Organization{{Id: "org-1", Name: "Acme", Slug: "acme"}},
	}), nil
}

// `orgs list` was one of ~25 commands that ignored --json - and its text
// never printed the id either, so there was no way to script against it.
func TestOrgsListHonoursJSONAndShowsIDs(t *testing.T) {
	resetAllFlags(t)
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewOrgServiceHandler(fakeOrgLister{}))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	rootCmd.AddCommand(orgsCmd)

	var stdout, stderr bytes.Buffer
	runCLI([]string{"orgs", "list", "--json"}, &stdout, &stderr)
	if !strings.Contains(stdout.String(), `"id":"org-1"`) {
		t.Errorf("expected JSON with the org id, got %q (stderr %q)", stdout.String(), stderr.String())
	}

	resetAllFlags(t)
	stdout.Reset()
	runCLI([]string{"orgs", "list"}, &stdout, &stderr)
	if !strings.Contains(stdout.String(), "org-1") {
		t.Errorf("expected the text listing to show the id, got %q", stdout.String())
	}
}
