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
	"github.com/spf13/cobra"
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

// threePageTasks serves tasks t1..t3 one per page, keyed by cursor, and
// records the cursors it was asked for.
type threePageTasks struct {
	v1connect.UnimplementedTaskServiceHandler
	asked []string
	loop  bool
}

func (f *threePageTasks) ListTasks(
	_ context.Context,
	req *connect.Request[healthv1.ListTasksRequest],
) (*connect.Response[healthv1.ListTasksResponse], error) {
	cursor := req.Msg.GetPage().GetCursor()
	f.asked = append(f.asked, cursor)
	next := map[string]string{"": "c2", "c2": "c3", "c3": ""}[cursor]
	if f.loop {
		next = "c2"
	}
	id := map[string]string{"": "t1", "c2": "t2", "c3": "t3"}[cursor]
	return connect.NewResponse(&healthv1.ListTasksResponse{
		Tasks: []*healthv1.Task{{Id: id, Title: "T " + id}},
		Page:  &healthv1.PageResponse{NextCursor: next},
	}), nil
}

func serveThreePages(t *testing.T, h *threePageTasks) {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(h))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	rootCmd.AddCommand(tasksCmd)
}

// M31-T04: --page-all walks every page and streams one item per line.
func TestPageAllStreamsEveryItemAsNDJSON(t *testing.T) {
	resetAllFlags(t)
	h := &threePageTasks{}
	serveThreePages(t, h)

	var stdout, stderr bytes.Buffer
	if code := runCLI([]string{"tasks", "list", "--project", "p1", "--page-all"}, &stdout, &stderr); code != exitOK {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}
	lines := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	if len(lines) != 3 {
		t.Fatalf("expected 3 NDJSON lines, got %d: %q", len(lines), stdout.String())
	}
	for i, line := range lines {
		var item map[string]any
		if err := json.Unmarshal([]byte(line), &item); err != nil {
			t.Fatalf("line %d is not JSON: %q", i, line)
		}
		if want := []string{"t1", "t2", "t3"}[i]; item["id"] != want {
			t.Errorf("line %d: expected id %s, got %v", i, want, item["id"])
		}
	}
	if strings.Join(h.asked, ",") != ",c2,c3" {
		t.Errorf("expected cursors '', c2, c3 in order, got %q", h.asked)
	}
}

func TestPageAllStartsFromTheGivenCursor(t *testing.T) {
	resetAllFlags(t)
	h := &threePageTasks{}
	serveThreePages(t, h)

	var stdout, stderr bytes.Buffer
	runCLI([]string{"tasks", "list", "--project", "p1", "--page-all", "--cursor", "c2"}, &stdout, &stderr)
	if got := strings.Count(strings.TrimSpace(stdout.String()), "\n") + 1; got != 2 {
		t.Errorf("expected the last two items, got %q", stdout.String())
	}
}

func TestPageAllStopsOnARepeatedCursor(t *testing.T) {
	resetAllFlags(t)
	serveThreePages(t, &threePageTasks{loop: true})

	var stdout, stderr bytes.Buffer
	code := runCLI([]string{"tasks", "list", "--project", "p1", "--page-all"}, &stdout, &stderr)
	if code == exitOK || !strings.Contains(stderr.String(), "twice") {
		t.Errorf("expected a non-zero exit naming the repeated cursor, got %d / %q", code, stderr.String())
	}
}

// M31-T03: a text listing that stopped at its page size used to read as the
// whole list.
func TestTextListingNamesTheNextPageOnlyWhenThereIsOne(t *testing.T) {
	resetAllFlags(t)
	serveThreePages(t, &threePageTasks{})

	var stdout, stderr bytes.Buffer
	runCLI([]string{"tasks", "list", "--project", "p1"}, &stdout, &stderr)
	if !strings.Contains(stdout.String(), "--cursor c2") {
		t.Errorf("expected the first page to name --cursor c2, got %q", stdout.String())
	}

	resetAllFlags(t)
	stdout.Reset()
	runCLI([]string{"tasks", "list", "--project", "p1", "--cursor", "c3"}, &stdout, &stderr)
	if strings.Contains(stdout.String(), "More results") {
		t.Errorf("expected no hint on the last page, got %q", stdout.String())
	}

	resetAllFlags(t)
	stdout.Reset()
	runCLI([]string{"tasks", "list", "--project", "p1", "--json"}, &stdout, &stderr)
	var doc map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &doc); err != nil {
		t.Errorf("--json output must stay one JSON document, got %q", stdout.String())
	}
}

// Every list command takes --page-all, and every one of them has --cursor:
// a list command added later without it fails here.
func TestEveryCursorCommandOffersPageAll(t *testing.T) {
	resetAllFlags(t)
	var missing []string
	var walk func(c *cobra.Command)
	walk = func(c *cobra.Command) {
		if c.Flags().Lookup("cursor") != nil && c.Flags().Lookup("page-all") == nil {
			missing = append(missing, c.CommandPath())
		}
		for _, sub := range c.Commands() {
			walk(sub)
		}
	}
	walk(rootCmd)
	if len(missing) > 0 {
		t.Errorf("commands with --cursor but no --page-all: %v", missing)
	}
}
