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

type fakeTaskTypeHandler struct {
	v1connect.UnimplementedTaskTypeServiceHandler
	gotListPage *healthv1.PageRequest
	gotGate     *healthv1.SetTransitionApprovalRequest
}

func (f *fakeTaskTypeHandler) SetTransitionApproval(
	_ context.Context,
	req *connect.Request[healthv1.SetTransitionApprovalRequest],
) (*connect.Response[healthv1.SetTransitionApprovalResponse], error) {
	f.gotGate = req.Msg
	return connect.NewResponse(&healthv1.SetTransitionApprovalResponse{
		Transition: &healthv1.TaskStatusTransition{Id: req.Msg.TransitionId, FromStatusId: "st_1", ToStatusId: "st_2", RequiresApproval: req.Msg.RequiresApproval},
	}), nil
}

func (f *fakeTaskTypeHandler) CreateTaskType(
	_ context.Context,
	req *connect.Request[healthv1.CreateTaskTypeRequest],
) (*connect.Response[healthv1.CreateTaskTypeResponse], error) {
	return connect.NewResponse(&healthv1.CreateTaskTypeResponse{
		TaskType: &healthv1.TaskType{Id: "tt_1", OrgId: req.Msg.OrgId, Name: req.Msg.Name, ParentId: req.Msg.ParentId},
	}), nil
}

func (f *fakeTaskTypeHandler) GetTaskType(
	_ context.Context,
	req *connect.Request[healthv1.GetTaskTypeRequest],
) (*connect.Response[healthv1.GetTaskTypeResponse], error) {
	return connect.NewResponse(&healthv1.GetTaskTypeResponse{
		TaskType: &healthv1.TaskType{Id: req.Msg.Id, Name: "Ticket", ParentId: "tt_parent"},
		Statuses: []*healthv1.TaskStatus{{Id: "st_1", Name: "open"}},
		Transitions: []*healthv1.TaskStatusTransition{
			{Id: "tr_1", FromStatusId: "st_1", ToStatusId: "st_2"},
			{Id: "tr_2", FromStatusId: "st_2", ToStatusId: "st_3", RequiresApproval: true},
		},
	}), nil
}

func (f *fakeTaskTypeHandler) ListTaskTypes(
	_ context.Context,
	req *connect.Request[healthv1.ListTaskTypesRequest],
) (*connect.Response[healthv1.ListTaskTypesResponse], error) {
	f.gotListPage = req.Msg.Page
	return connect.NewResponse(&healthv1.ListTaskTypesResponse{
		TaskTypes: []*healthv1.TaskType{
			{Id: "tt_1", OrgId: req.Msg.OrgId, Name: "Epic"},
			{Id: "tt_2", OrgId: req.Msg.OrgId, Name: "Story"},
		},
	}), nil
}

func (f *fakeTaskTypeHandler) CreateTaskStatus(
	_ context.Context,
	req *connect.Request[healthv1.CreateTaskStatusRequest],
) (*connect.Response[healthv1.CreateTaskStatusResponse], error) {
	return connect.NewResponse(&healthv1.CreateTaskStatusResponse{
		Status: &healthv1.TaskStatus{Id: "st_1", TaskTypeId: req.Msg.TaskTypeId, Name: req.Msg.Name},
	}), nil
}

func (f *fakeTaskTypeHandler) CreateTaskStatusTransition(
	_ context.Context,
	req *connect.Request[healthv1.CreateTaskStatusTransitionRequest],
) (*connect.Response[healthv1.CreateTaskStatusTransitionResponse], error) {
	return connect.NewResponse(&healthv1.CreateTaskStatusTransitionResponse{
		Transition: &healthv1.TaskStatusTransition{
			Id:           "tr_1",
			TaskTypeId:   req.Msg.TaskTypeId,
			FromStatusId: req.Msg.FromStatusId,
			ToStatusId:   req.Msg.ToStatusId,
		},
	}), nil
}

func withTaskTypeServer(t *testing.T) *fakeTaskTypeHandler {
	t.Helper()
	fake := &fakeTaskTypeHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskTypeServiceHandler(fake))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	return fake
}

func TestTaskTypesCreateCmd(t *testing.T) {
	resetAllFlags(t)
	withTaskTypeServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"task-types", "create", "--org", "org-1", "--name", "Ticket"})
	if err := executeForTest(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Ticket") || !strings.Contains(out, "tt_1") {
		t.Fatalf("expected output to contain the created task type, got %s", out)
	}
}

func TestTaskTypesCreateCmdWithParent(t *testing.T) {
	resetAllFlags(t)
	withTaskTypeServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"task-types", "create", "--org", "org-1", "--name", "Story", "--parent", "tt_parent"})
	if err := executeForTest(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "tt_1") {
		t.Fatalf("expected output to contain the created task type, got %s", out)
	}
}

func TestTaskTypesListCmd(t *testing.T) {
	resetAllFlags(t)
	fake := withTaskTypeServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"task-types", "list", "--org", "org-1", "--cursor", "cursor-2", "--limit", "10"})
	if err := executeForTest(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Epic") || !strings.Contains(out, "Story") {
		t.Fatalf("expected output to list both task types, got %s", out)
	}
	if fake.gotListPage == nil || fake.gotListPage.Cursor != "cursor-2" || fake.gotListPage.Limit != 10 {
		t.Fatalf("expected cursor/limit to be forwarded, got %+v", fake.gotListPage)
	}
}

func TestTaskTypesGetCmd(t *testing.T) {
	resetAllFlags(t)
	withTaskTypeServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"task-types", "get", "tt_1"})
	if err := executeForTest(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "open") || !strings.Contains(out, "st_1 -> st_2") {
		t.Fatalf("expected output to contain statuses and transitions, got %s", out)
	}
	if !strings.Contains(out, "tt_parent") {
		t.Fatalf("expected output to contain the parent task type id, got %s", out)
	}
}

func TestTaskTypesCreateStatusCmd(t *testing.T) {
	resetAllFlags(t)
	withTaskTypeServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"task-types", "create-status", "tt_1", "--name", "closed"})
	if err := executeForTest(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "closed") {
		t.Fatalf("expected output to contain the created status, got %s", out)
	}
}

func TestTaskTypesCreateTransitionCmd(t *testing.T) {
	resetAllFlags(t)
	withTaskTypeServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"task-types", "create-transition", "tt_1", "--from", "st_1", "--to", "st_2"})
	if err := executeForTest(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "st_1 -> st_2") {
		t.Fatalf("expected output to contain the transition, got %s", out)
	}
}

func TestTaskTypesGetShowsGatedTransitionsAndGateTransitionSetsAndLiftsIt(t *testing.T) {
	resetAllFlags(t)
	fake := withTaskTypeServer(t)
	out, errw, code := run(t, "task-types", "get", "tt_1")
	if code != exitOK || !strings.Contains(out, "st_2 -> st_3 (id: tr_2) (agents need approval)") || strings.Contains(out, "st_1 -> st_2 (id: tr_1) (agents") {
		t.Fatalf("get: exit %d %q %q", code, out, errw)
	}
	out, _, _ = run(t, "task-types", "gate-transition", "tt_1", "tr_1")
	if fake.gotGate.GetTaskTypeId() != "tt_1" || fake.gotGate.GetTransitionId() != "tr_1" || !fake.gotGate.RequiresApproval || !strings.Contains(out, "now needs a person's approval") {
		t.Errorf("gate: %+v %q", fake.gotGate, out)
	}
	resetAllFlags(t)
	out, _, _ = run(t, "task-types", "gate-transition", "tt_1", "tr_1", "--off")
	if fake.gotGate.RequiresApproval || !strings.Contains(out, "no longer needs approval") {
		t.Errorf("lift: %+v %q", fake.gotGate, out)
	}
}
