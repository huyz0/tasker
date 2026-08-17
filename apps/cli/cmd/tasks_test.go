package cmd

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"connectrpc.com/connect"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
)

type fakeTaskCreateHandler struct {
	v1connect.UnimplementedTaskServiceHandler
	gotReq *healthv1.CreateTaskRequest
}

func (f *fakeTaskCreateHandler) CreateTask(
	_ context.Context,
	req *connect.Request[healthv1.CreateTaskRequest],
) (*connect.Response[healthv1.CreateTaskResponse], error) {
	f.gotReq = req.Msg
	return connect.NewResponse(&healthv1.CreateTaskResponse{
		Task: &healthv1.Task{
			Id:          "task_1",
			DisplayId:   "T-1",
			ProjectId:   req.Msg.ProjectId,
			Title:       req.Msg.Title,
			Status:      req.Msg.Status,
			Description: req.Msg.Description,
			TaskTypeId:  req.Msg.TaskTypeId,
		},
	}), nil
}

func TestTasksCreateCommand(t *testing.T) {
	handler := &fakeTaskCreateHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(handler))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{
		"tasks", "create",
		"--project", "proj-1",
		"--title", "UnitTest",
		"--status", "todo",
		"--description", "a task created by a unit test",
		"--task-type", "tt-1",
		"--idempotency-key", "idem-1",
		"--json",
	})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("expected task creation to succeed, got error: %v", err)
	}

	if handler.gotReq == nil {
		t.Fatal("expected the backend to receive a CreateTask request")
	}
	if handler.gotReq.ProjectId != "proj-1" {
		t.Errorf("expected project id proj-1 to be sent, got %q", handler.gotReq.ProjectId)
	}
	if handler.gotReq.Title != "UnitTest" {
		t.Errorf("expected title UnitTest to be sent, got %q", handler.gotReq.Title)
	}
	if handler.gotReq.Status != "todo" {
		t.Errorf("expected status todo to be sent, got %q", handler.gotReq.Status)
	}
	if handler.gotReq.TaskTypeId != "tt-1" {
		t.Errorf("expected task type tt-1 to be sent, got %q", handler.gotReq.TaskTypeId)
	}
	// M19-T06: --idempotency-key had no CLI flag at all, despite the field
	// existing on the wire since M14-T07 - a retried `tasks create` from a
	// script or an agent could only double the project's task counter.
	if handler.gotReq.IdempotencyKey != "idem-1" {
		t.Errorf("expected idempotency key idem-1 to be sent, got %q", handler.gotReq.IdempotencyKey)
	}

	output := b.String()
	if !strings.Contains(output, "task_1") {
		t.Errorf("expected output to contain the created task's id, got %s", output)
	}
	if !strings.Contains(output, "T-1") {
		t.Errorf("expected output to contain the created task's display id, got %s", output)
	}
}

type fakeTaskClaimHandler struct {
	v1connect.UnimplementedTaskServiceHandler
	gotReq *healthv1.ClaimTaskRequest
}

func (f *fakeTaskClaimHandler) ClaimTask(
	_ context.Context,
	req *connect.Request[healthv1.ClaimTaskRequest],
) (*connect.Response[healthv1.ClaimTaskResponse], error) {
	f.gotReq = req.Msg
	return connect.NewResponse(&healthv1.ClaimTaskResponse{
		Task: &healthv1.Task{
			Id:        req.Msg.TaskId,
			DisplayId: "T-9",
			Status:    "in-progress",
		},
	}), nil
}

// M19-T06: `tasks claim` - the M14-T06 headline agent-self-service feature
// (atomically claim an unassigned task) - had no CLI surface at all despite
// the RPC existing since M14. An agent could only reach it with a
// hand-rolled ConnectRPC call.
func TestTasksClaimCommand(t *testing.T) {
	handler := &fakeTaskClaimHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(handler))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{
		"tasks", "claim", "task-1",
		"--idempotency-key", "idem-claim-1",
		"--json",
	})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("expected task claim to succeed, got error: %v", err)
	}

	if handler.gotReq == nil {
		t.Fatal("expected the backend to receive a ClaimTask request")
	}
	if handler.gotReq.TaskId != "task-1" {
		t.Errorf("expected task id task-1 to be sent, got %q", handler.gotReq.TaskId)
	}
	if handler.gotReq.IdempotencyKey != "idem-claim-1" {
		t.Errorf("expected idempotency key idem-claim-1 to be sent, got %q", handler.gotReq.IdempotencyKey)
	}

	output := b.String()
	if !strings.Contains(output, "task-1") {
		t.Errorf("expected output to contain the claimed task's id, got %s", output)
	}
}

// The failed-claim path (task already assigned, or a caller who has never
// claimed anything) is a plain RPC error - no fake handler override needed,
// the base fake just needs to actually return one instead of the zero value.
type fakeTaskClaimFailureHandler struct {
	v1connect.UnimplementedTaskServiceHandler
}

func (f *fakeTaskClaimFailureHandler) ClaimTask(
	_ context.Context,
	_ *connect.Request[healthv1.ClaimTaskRequest],
) (*connect.Response[healthv1.ClaimTaskResponse], error) {
	return nil, connect.NewError(connect.CodeFailedPrecondition, errors.New("task already claimed"))
}

func TestTasksClaimCommandReportsFailure(t *testing.T) {
	handler := &fakeTaskClaimFailureHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(handler))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "claim", "task-1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected task claim to fail when the task is already assigned")
	}

	if !strings.Contains(b.String(), "Failed to claim task") {
		t.Errorf("expected the failure to be reported, got %s", b.String())
	}
}

type fakeCommentHandler struct {
	v1connect.UnimplementedCommentServiceHandler
}

func (f *fakeCommentHandler) CreateComment(
	_ context.Context,
	req *connect.Request[healthv1.CreateCommentRequest],
) (*connect.Response[healthv1.CreateCommentResponse], error) {
	return connect.NewResponse(&healthv1.CreateCommentResponse{
		Comment: &healthv1.Comment{
			Id:         "cmt_1",
			EntityId:   req.Msg.EntityId,
			EntityType: req.Msg.EntityType,
			Content:    req.Msg.Content,
		},
	}), nil
}

func TestTasksCommentAddCommand(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewCommentServiceHandler(&fakeCommentHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "comment-add", "task-123", "--content", "looks good"})
	_ = rootCmd.Execute()

	output := b.String()
	if !strings.Contains(output, "cmt_1") {
		t.Errorf("Expected comment output to contain the new comment id, got %s", output)
	}
}

type fakeTaskReviewerHandler struct {
	v1connect.UnimplementedTaskServiceHandler
	reviewers []string
}

func (f *fakeTaskReviewerHandler) AddTaskReviewer(
	_ context.Context,
	req *connect.Request[healthv1.AddTaskReviewerRequest],
) (*connect.Response[healthv1.AddTaskReviewerResponse], error) {
	f.reviewers = append(f.reviewers, req.Msg.UserId)
	return connect.NewResponse(&healthv1.AddTaskReviewerResponse{Success: true}), nil
}

func (f *fakeTaskReviewerHandler) RemoveTaskReviewer(
	_ context.Context,
	req *connect.Request[healthv1.RemoveTaskReviewerRequest],
) (*connect.Response[healthv1.RemoveTaskReviewerResponse], error) {
	filtered := f.reviewers[:0]
	for _, r := range f.reviewers {
		if r != req.Msg.UserId {
			filtered = append(filtered, r)
		}
	}
	f.reviewers = filtered
	return connect.NewResponse(&healthv1.RemoveTaskReviewerResponse{Success: true}), nil
}

func (f *fakeTaskReviewerHandler) ListTaskReviewers(
	_ context.Context,
	_ *connect.Request[healthv1.ListTaskReviewersRequest],
) (*connect.Response[healthv1.ListTaskReviewersResponse], error) {
	reviewers := make([]*healthv1.TaskReviewer, 0, len(f.reviewers))
	for _, r := range f.reviewers {
		reviewers = append(reviewers, &healthv1.TaskReviewer{UserId: r})
	}
	return connect.NewResponse(&healthv1.ListTaskReviewersResponse{Reviewers: reviewers}), nil
}

func TestTasksReviewerCommands(t *testing.T) {
	fake := &fakeTaskReviewerHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "reviewer-add", "task-1", "--user", "user-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("reviewer-add failed: %v", err)
	}
	if !strings.Contains(b.String(), "user-1") {
		t.Errorf("Expected reviewer-add output to mention user-1, got %s", b.String())
	}

	b.Reset()
	rootCmd.SetArgs([]string{"tasks", "reviewers", "task-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("reviewers list failed: %v", err)
	}
	if !strings.Contains(b.String(), "user-1") {
		t.Errorf("Expected reviewers list output to contain user-1, got %s", b.String())
	}

	b.Reset()
	rootCmd.SetArgs([]string{"tasks", "reviewer-remove", "task-1", "--user", "user-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("reviewer-remove failed: %v", err)
	}
	if !strings.Contains(b.String(), "user-1") {
		t.Errorf("Expected reviewer-remove output to mention user-1, got %s", b.String())
	}

	b.Reset()
	rootCmd.SetArgs([]string{"tasks", "reviewers", "task-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("reviewers list after removal failed: %v", err)
	}
	if strings.Contains(b.String(), "user-1") {
		t.Errorf("Expected reviewer to be removed from list, got %s", b.String())
	}
}

type fakeTaskListHandler struct {
	v1connect.UnimplementedTaskServiceHandler
	gotPage *healthv1.PageRequest
	gotReq  *healthv1.ListTasksRequest
}

func (f *fakeTaskListHandler) ListTasks(
	_ context.Context,
	req *connect.Request[healthv1.ListTasksRequest],
) (*connect.Response[healthv1.ListTasksResponse], error) {
	f.gotPage = req.Msg.Page
	f.gotReq = req.Msg
	return connect.NewResponse(&healthv1.ListTasksResponse{}), nil
}

// Without --cursor and --limit wired through, "tasks list" could never page
// past the server's default page size - the --sort flag's help text claimed
// "works with --cursor for paging" but no such flag was ever registered.
func TestTasksListCmdForwardsCursorAndLimit(t *testing.T) {
	fake := &fakeTaskListHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "list", "--project", "proj-1", "--cursor", "cursor-2", "--limit", "10", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks list failed: %v", err)
	}

	if fake.gotPage == nil {
		t.Fatal("expected a Page to be sent")
	}
	if fake.gotPage.Cursor != "cursor-2" {
		t.Errorf("expected cursor to be forwarded, got %q", fake.gotPage.Cursor)
	}
	if fake.gotPage.Limit != 10 {
		t.Errorf("expected limit to be forwarded, got %d", fake.gotPage.Limit)
	}
}

// M19-T07: --only-deleted, --status, and --assignee-filter were never wired
// through to ListTasksRequest, despite the backend supporting all three
// (M14-T05, and the bin's own onlyDeleted) - there was no way from the CLI
// to page the bin, filter to one board column, or find claimable/own work.
func TestTasksListCmdForwardsFacetFlags(t *testing.T) {
	fake := &fakeTaskListHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{
		"tasks", "list", "--project", "proj-1",
		"--only-deleted",
		"--status", "in-progress",
		"--assignee-filter", "unassigned",
		"--json",
	})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks list failed: %v", err)
	}

	if fake.gotReq == nil {
		t.Fatal("expected the backend to receive a ListTasks request")
	}
	if !fake.gotReq.OnlyDeleted {
		t.Error("expected --only-deleted to be forwarded as true")
	}
	if fake.gotReq.Status != "in-progress" {
		t.Errorf("expected status in-progress to be forwarded, got %q", fake.gotReq.Status)
	}
	if fake.gotReq.AssigneeFilter != "unassigned" {
		t.Errorf("expected assigneeFilter unassigned to be forwarded, got %q", fake.gotReq.AssigneeFilter)
	}
}

type fakeTaskGetHandler struct {
	v1connect.UnimplementedTaskServiceHandler
	gotReq *healthv1.GetTaskRequest
}

func (f *fakeTaskGetHandler) GetTask(
	_ context.Context,
	req *connect.Request[healthv1.GetTaskRequest],
) (*connect.Response[healthv1.GetTaskResponse], error) {
	f.gotReq = req.Msg
	return connect.NewResponse(&healthv1.GetTaskResponse{
		Task: &healthv1.Task{
			Id:          req.Msg.TaskId,
			DisplayId:   "T-1",
			Title:       "Fix the bug",
			Status:      "todo",
			Description: "A longer body only get returns",
		},
	}), nil
}

// M19-T07: `tasks get` - reading a single task with its full description
// (listTasks deliberately projects description away) - had no CLI command
// at all.
func TestTasksGetCommand(t *testing.T) {
	handler := &fakeTaskGetHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(handler))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "get", "task-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks get failed: %v", err)
	}

	if handler.gotReq == nil || handler.gotReq.TaskId != "task-1" {
		t.Fatal("expected the backend to receive a GetTask request for task-1")
	}

	output := b.String()
	if !strings.Contains(output, "Fix the bug") {
		t.Errorf("expected output to contain the task's title, got %s", output)
	}
	if !strings.Contains(output, "A longer body only get returns") {
		t.Errorf("expected output to contain the task's description, got %s", output)
	}
}

type fakeTaskUpdateHandler struct {
	v1connect.UnimplementedTaskServiceHandler
	gotReq *healthv1.UpdateTaskRequest
}

func (f *fakeTaskUpdateHandler) UpdateTask(
	_ context.Context,
	req *connect.Request[healthv1.UpdateTaskRequest],
) (*connect.Response[healthv1.UpdateTaskResponse], error) {
	f.gotReq = req.Msg
	task := &healthv1.Task{Id: req.Msg.TaskId, DisplayId: "T-1", Title: "Original", Status: "todo"}
	if req.Msg.Title != nil {
		task.Title = *req.Msg.Title
	}
	if req.Msg.Description != nil {
		task.Description = *req.Msg.Description
	}
	if req.Msg.TaskTypeId != nil {
		task.TaskTypeId = *req.Msg.TaskTypeId
	}
	return connect.NewResponse(&healthv1.UpdateTaskResponse{Task: task}), nil
}

// M19-T07: `tasks update` had no CLI command at all. Only flags the caller
// actually passes are set on the wire - proto3 optional (M14-T01's lesson):
// an omitted --description must stay distinct from an explicitly cleared
// one, so a caller who only wants to rename a task doesn't blank its
// description as a side effect.
func TestTasksUpdateCommand(t *testing.T) {
	handler := &fakeTaskUpdateHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(handler))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "update", "task-1", "--title", "Renamed", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks update failed: %v", err)
	}

	if handler.gotReq == nil {
		t.Fatal("expected the backend to receive an UpdateTask request")
	}
	if handler.gotReq.Title == nil || *handler.gotReq.Title != "Renamed" {
		t.Fatalf("expected title Renamed to be sent, got %v", handler.gotReq.Title)
	}
	if handler.gotReq.Description != nil {
		t.Errorf("expected description to be left unset when --description was not passed, got %v", handler.gotReq.Description)
	}
	if handler.gotReq.TaskTypeId != nil {
		t.Errorf("expected taskTypeId to be left unset when --task-type was not passed, got %v", handler.gotReq.TaskTypeId)
	}
	if !strings.Contains(b.String(), "task-1") {
		t.Errorf("expected output to contain the updated task's id, got %s", b.String())
	}
}

func TestTasksUpdateCommandCanClearDescription(t *testing.T) {
	handler := &fakeTaskUpdateHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(handler))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "update", "task-1", "--description", "", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks update failed: %v", err)
	}

	if handler.gotReq == nil || handler.gotReq.Description == nil || *handler.gotReq.Description != "" {
		t.Fatalf("expected an explicit empty description to be sent, got %v", handler.gotReq.Description)
	}
}

type fakeTaskUnassignHandler struct {
	v1connect.UnimplementedTaskServiceHandler
	gotReq *healthv1.UnassignTaskRequest
}

func (f *fakeTaskUnassignHandler) UnassignTask(
	_ context.Context,
	req *connect.Request[healthv1.UnassignTaskRequest],
) (*connect.Response[healthv1.UnassignTaskResponse], error) {
	f.gotReq = req.Msg
	return connect.NewResponse(&healthv1.UnassignTaskResponse{Success: true}), nil
}

// M19-T07: `tasks unassign` had no CLI command at all, though `tasks assign`
// did - a task assigned from the CLI could only be unassigned by hand-rolling
// a raw ConnectRPC call, or from the GUI.
func TestTasksUnassignCommand(t *testing.T) {
	handler := &fakeTaskUnassignHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(handler))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "unassign", "task-1", "--agent", "agent-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks unassign failed: %v", err)
	}

	if handler.gotReq == nil || handler.gotReq.AgentId != "agent-1" {
		t.Fatal("expected the backend to receive an UnassignTask request naming agent-1")
	}
	if !strings.Contains(b.String(), "\"success\":true") {
		t.Errorf("expected output to report success, got %s", b.String())
	}
}

func TestTasksUnassignCommandRequiresAgentOrUser(t *testing.T) {
	// tasksUnassignCmd is a package-level singleton, so a flag value set by
	// an earlier test (TestTasksUnassignCommand's --agent agent-1) survives
	// into this one unless cleared explicitly.
	t.Cleanup(func() {
		_ = tasksUnassignCmd.Flags().Set("agent", "")
		_ = tasksUnassignCmd.Flags().Set("user", "")
	})
	_ = tasksUnassignCmd.Flags().Set("agent", "")
	_ = tasksUnassignCmd.Flags().Set("user", "")

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "unassign", "task-1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected tasks unassign to fail without --agent or --user")
	}
	if !strings.Contains(b.String(), "one of --agent or --user is required") {
		t.Errorf("expected the required-flag error to be reported, got %s", b.String())
	}
}
