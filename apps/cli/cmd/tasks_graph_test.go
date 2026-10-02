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

// fakeGraph serves the M35 work-graph RPCs and records what it was sent.
type fakeGraph struct {
	v1connect.UnimplementedTaskServiceHandler
	create    *healthv1.CreateTaskRequest
	update    *healthv1.UpdateTaskRequest
	list      *healthv1.ListTasksRequest
	addLink   *healthv1.AddTaskLinkRequest
	rmLink    *healthv1.RemoveTaskLinkRequest
	claimNext *healthv1.ClaimNextTaskRequest
	calls     int
}

func (f *fakeGraph) CreateTask(_ context.Context, req *connect.Request[healthv1.CreateTaskRequest]) (*connect.Response[healthv1.CreateTaskResponse], error) {
	f.calls++
	f.create = req.Msg
	return connect.NewResponse(&healthv1.CreateTaskResponse{Task: &healthv1.Task{Id: "t9", DisplayId: "T-9", Title: req.Msg.Title}}), nil
}

func (f *fakeGraph) UpdateTask(_ context.Context, req *connect.Request[healthv1.UpdateTaskRequest]) (*connect.Response[healthv1.UpdateTaskResponse], error) {
	f.calls++
	f.update = req.Msg
	return connect.NewResponse(&healthv1.UpdateTaskResponse{Task: &healthv1.Task{Id: req.Msg.TaskId}}), nil
}

func (f *fakeGraph) ListTasks(_ context.Context, req *connect.Request[healthv1.ListTasksRequest]) (*connect.Response[healthv1.ListTasksResponse], error) {
	f.calls++
	f.list = req.Msg
	return connect.NewResponse(&healthv1.ListTasksResponse{
		Tasks: []*healthv1.Task{
			{Id: "t1", DisplayId: "T-1", Title: "Urgent and stuck", Status: "todo", Priority: 1, BlockedByOpenCount: 2},
			{Id: "t2", DisplayId: "T-2", Title: "Plain", Status: "todo"},
		},
		Page: &healthv1.PageResponse{},
	}), nil
}

func (f *fakeGraph) AddTaskLink(_ context.Context, req *connect.Request[healthv1.AddTaskLinkRequest]) (*connect.Response[healthv1.AddTaskLinkResponse], error) {
	f.calls++
	f.addLink = req.Msg
	return connect.NewResponse(&healthv1.AddTaskLinkResponse{Success: true}), nil
}

func (f *fakeGraph) RemoveTaskLink(_ context.Context, req *connect.Request[healthv1.RemoveTaskLinkRequest]) (*connect.Response[healthv1.RemoveTaskLinkResponse], error) {
	f.calls++
	f.rmLink = req.Msg
	return connect.NewResponse(&healthv1.RemoveTaskLinkResponse{Success: true}), nil
}

func (f *fakeGraph) ListTaskLinks(_ context.Context, req *connect.Request[healthv1.ListTaskLinksRequest]) (*connect.Response[healthv1.ListTaskLinksResponse], error) {
	f.calls++
	if req.Msg.TaskId == "lonely" {
		return connect.NewResponse(&healthv1.ListTaskLinksResponse{}), nil
	}
	return connect.NewResponse(&healthv1.ListTaskLinksResponse{
		Parent:    &healthv1.TaskRef{Id: "p", DisplayId: "T-0", Title: "Epic", Status: "todo"},
		BlockedBy: []*healthv1.TaskRef{{Id: "b", DisplayId: "T-3", Title: "Schema", Status: "done", Terminal: true}},
		Children:  []*healthv1.TaskRef{{Id: "c", DisplayId: "T-4", Title: "Sub", Status: "todo"}},
	}), nil
}

func (f *fakeGraph) ClaimNextTask(_ context.Context, req *connect.Request[healthv1.ClaimNextTaskRequest]) (*connect.Response[healthv1.ClaimNextTaskResponse], error) {
	f.calls++
	f.claimNext = req.Msg
	return connect.NewResponse(&healthv1.ClaimNextTaskResponse{}), nil
}

func serveGraph(t *testing.T) *fakeGraph {
	t.Helper()
	resetAllFlags(t)
	f := &fakeGraph{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(f))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	rootCmd.AddCommand(tasksCmd)
	return f
}

func run(t *testing.T, args ...string) (string, string, int) {
	t.Helper()
	var out, errw bytes.Buffer
	code := runCLI(args, &out, &errw)
	return out.String(), errw.String(), code
}

func TestParsePriorityAcceptsNamesAndNumbers(t *testing.T) {
	for in, want := range map[string]int32{"urgent": 1, "HIGH": 2, "medium": 3, "low": 4, "none": 0, "0": 0, "3": 3} {
		if got, err := parsePriority(in); err != nil || got != want {
			t.Errorf("parsePriority(%q) = %d, %v; want %d", in, got, err, want)
		}
	}
	for _, bad := range []string{"5", "-1", "critical", ""} {
		if _, err := parsePriority(bad); err == nil {
			t.Errorf("parsePriority(%q) should fail", bad)
		}
	}
}

func TestCreateSendsTheGraphFields(t *testing.T) {
	f := serveGraph(t)
	_, errw, code := run(t, "tasks", "create", "--project", "p1", "--title", "Follow-up",
		"--priority", "high", "--parent", "epic", "--blocked-by", "a,b", "--blocked-by", "c", "--discovered-from", "origin")
	if code != exitOK {
		t.Fatalf("exit %d: %s", code, errw)
	}
	if f.create.GetPriority() != 2 || f.create.GetParentTaskId() != "epic" || f.create.GetDiscoveredFromTaskId() != "origin" ||
		strings.Join(f.create.BlockedBy, ",") != "a,b,c" {
		t.Errorf("unexpected request %+v", f.create)
	}
}

func TestCreateWithoutGraphFlagsSendsNoneOfThem(t *testing.T) {
	f := serveGraph(t)
	run(t, "tasks", "create", "--project", "p1", "--title", "Plain")
	if f.create.Priority != nil || f.create.ParentTaskId != nil || f.create.DiscoveredFromTaskId != nil || len(f.create.BlockedBy) != 0 {
		t.Errorf("expected no graph fields, got %+v", f.create)
	}
}

func TestABadPriorityExitsAsInvalidWithoutCallingTheServer(t *testing.T) {
	f := serveGraph(t)
	_, errw, code := run(t, "tasks", "create", "--project", "p1", "--title", "X", "--priority", "critical")
	if code != exitInvalid || f.calls != 0 || !strings.Contains(errw, "invalid priority") {
		t.Errorf("exit %d, calls %d, stderr %q", code, f.calls, errw)
	}
}

func TestUpdateClearsTheParentOnlyWhenAsked(t *testing.T) {
	f := serveGraph(t)
	run(t, "tasks", "update", "t1", "--priority", "none", "--parent", "")
	if f.update.GetPriority() != 0 || f.update.Priority == nil || f.update.ParentTaskId == nil || f.update.GetParentTaskId() != "" {
		t.Errorf("expected priority 0 and parent cleared, got %+v", f.update)
	}
	f = serveGraph(t)
	run(t, "tasks", "update", "t1", "--title", "New")
	if f.update.Priority != nil || f.update.ParentTaskId != nil {
		t.Errorf("unset flags must not be sent, got %+v", f.update)
	}
}

func TestListFiltersAndShowsPriorityAndBlockers(t *testing.T) {
	f := serveGraph(t)
	out, _, _ := run(t, "tasks", "list", "--project", "p1", "--ready", "--priority", "urgent", "--label", "l1", "--parent", "epic")
	if !f.list.GetReady() || f.list.GetPriority() != 1 || f.list.GetLabelId() != "l1" || f.list.GetParentTaskId() != "epic" {
		t.Errorf("unexpected request %+v", f.list)
	}
	if !strings.Contains(out, "T-1 [todo]: Urgent and stuck {urgent, blocked by 2}") || !strings.Contains(out, "T-2 [todo]: Plain (id: t2)") {
		t.Errorf("unexpected output %q", out)
	}
	f = serveGraph(t)
	run(t, "tasks", "list", "--project", "p1")
	if f.list.Ready != nil || f.list.Priority != nil || f.list.LabelId != nil {
		t.Errorf("unset filters must not be sent, got %+v", f.list)
	}
}

func TestLinkAddDefaultsToBlockedByAndValidatesTheKind(t *testing.T) {
	f := serveGraph(t)
	out, _, code := run(t, "tasks", "link", "add", "t1", "t2")
	if code != exitOK || f.addLink.Kind != "blocked_by" || f.addLink.TaskId != "t1" || f.addLink.LinkedTaskId != "t2" {
		t.Errorf("exit %d, request %+v", code, f.addLink)
	}
	if !strings.Contains(out, "t1 blocked by t2") {
		t.Errorf("unexpected output %q", out)
	}
	f = serveGraph(t)
	run(t, "tasks", "link", "remove", "t1", "t0", "--kind", "discovered-from")
	if f.rmLink.Kind != "discovered_from" {
		t.Errorf("unexpected request %+v", f.rmLink)
	}
	f = serveGraph(t)
	if _, _, code := run(t, "tasks", "link", "add", "t1", "t2", "--kind", "relates"); code != exitInvalid || f.calls != 0 {
		t.Errorf("expected exit %d with no call, got %d / %d calls", exitInvalid, code, f.calls)
	}
}

func TestLinkListPrintsEachRelation(t *testing.T) {
	serveGraph(t)
	out, _, _ := run(t, "tasks", "link", "list", "t1")
	for _, want := range []string{"Parent:\n  - T-0 [todo]: Epic", "Blocked by:\n  - T-3 [done, finished]: Schema", "Subtasks:\n  - T-4 [todo]: Sub"} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in %q", want, out)
		}
	}
	if strings.Contains(out, "Blocks:") {
		t.Errorf("empty sections must be omitted: %q", out)
	}
	out, errw, _ := run(t, "tasks", "link", "list", "lonely")
	if out != "" || !strings.Contains(errw, "No links.") {
		t.Errorf("expected nothing on stdout and a note on stderr, got %q / %q", out, errw)
	}
}

func TestClaimNextPassesTheLabel(t *testing.T) {
	f := serveGraph(t)
	run(t, "tasks", "claim-next", "--project", "p1", "--label", "backend")
	if f.claimNext.GetLabelId() != "backend" {
		t.Errorf("unexpected request %+v", f.claimNext)
	}
}
