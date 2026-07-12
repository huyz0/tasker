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
		},
	}), nil
}

func (f *fakeTaskTypeHandler) ListTaskTypes(
	_ context.Context,
	req *connect.Request[healthv1.ListTaskTypesRequest],
) (*connect.Response[healthv1.ListTaskTypesResponse], error) {
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

func withTaskTypeServer(t *testing.T) {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskTypeServiceHandler(&fakeTaskTypeHandler{}))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
}

func TestTaskTypesCreateCmd(t *testing.T) {
	withTaskTypeServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"task-types", "create", "--org", "org-1", "--name", "Ticket"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Ticket") || !strings.Contains(out, "tt_1") {
		t.Fatalf("expected output to contain the created task type, got %s", out)
	}
}

func TestTaskTypesCreateCmdWithParent(t *testing.T) {
	withTaskTypeServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"task-types", "create", "--org", "org-1", "--name", "Story", "--parent", "tt_parent"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "tt_1") {
		t.Fatalf("expected output to contain the created task type, got %s", out)
	}
}

func TestTaskTypesListCmd(t *testing.T) {
	withTaskTypeServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"task-types", "list", "--org", "org-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Epic") || !strings.Contains(out, "Story") {
		t.Fatalf("expected output to list both task types, got %s", out)
	}
}

func TestTaskTypesGetCmd(t *testing.T) {
	withTaskTypeServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"task-types", "get", "tt_1"})
	if err := rootCmd.Execute(); err != nil {
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
	withTaskTypeServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"task-types", "create-status", "tt_1", "--name", "closed"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "closed") {
		t.Fatalf("expected output to contain the created status, got %s", out)
	}
}

func TestTaskTypesCreateTransitionCmd(t *testing.T) {
	withTaskTypeServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"task-types", "create-transition", "tt_1", "--from", "st_1", "--to", "st_2"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "st_1 -> st_2") {
		t.Fatalf("expected output to contain the transition, got %s", out)
	}
}
