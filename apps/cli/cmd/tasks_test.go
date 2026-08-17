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

// M19-T09: tasksCommentAddCmd had a test; tasksCommentsCmd (list) never did.
func TestTasksCommentAddCommandRequiresContent(t *testing.T) {
	_ = tasksCommentAddCmd.Flags().Set("content", "")
	t.Cleanup(func() { _ = tasksCommentAddCmd.Flags().Set("content", "") })

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "comment-add", "task-123"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected comment-add to fail without --content")
	}
	if !strings.Contains(b.String(), "--content is required") {
		t.Errorf("expected the required-flag error to be reported, got %s", b.String())
	}
}

func (f *fakeCommentHandler) ListComments(
	_ context.Context,
	req *connect.Request[healthv1.ListCommentsRequest],
) (*connect.Response[healthv1.ListCommentsResponse], error) {
	return connect.NewResponse(&healthv1.ListCommentsResponse{
		Comments: []*healthv1.Comment{
			{Id: "cmt_1", EntityId: req.Msg.EntityId, EntityType: req.Msg.EntityType, Content: "Looks good", CreatedAt: "2026-01-01T00:00:00Z"},
		},
	}), nil
}

func TestTasksCommentsListCommand(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewCommentServiceHandler(&fakeCommentHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "comments", "task-123"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks comments failed: %v", err)
	}

	output := b.String()
	if !strings.Contains(output, "Looks good") {
		t.Errorf("expected output to contain the listed comment, got %s", output)
	}
}

func TestTasksCommentsListCommandReportsFailure(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewCommentServiceHandler(&v1connect.UnimplementedCommentServiceHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "comments", "task-123"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected tasks comments to fail on an RPC error")
	}
	if !strings.Contains(b.String(), "Failed to list comments") {
		t.Errorf("expected the failure to be reported, got %s", b.String())
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

// M19-T09: tasksAssignCmd, tasksUpdateStatusCmd, and delete/restore/purge had
// no test coverage at all before this - including their --json branches,
// which had never actually been exercised despite looking correct on
// inspection.
type fakeTaskLifecycleHandler struct {
	v1connect.UnimplementedTaskServiceHandler
	gotAssignReq       *healthv1.AssignTaskRequest
	gotUpdateStatusReq *healthv1.UpdateTaskStatusRequest
	gotDeleteReq       *healthv1.DeleteTaskRequest
	gotRestoreReq      *healthv1.RestoreTaskRequest
	gotPurgeReq        *healthv1.PurgeTaskRequest
}

func (f *fakeTaskLifecycleHandler) AssignTask(
	_ context.Context,
	req *connect.Request[healthv1.AssignTaskRequest],
) (*connect.Response[healthv1.AssignTaskResponse], error) {
	f.gotAssignReq = req.Msg
	return connect.NewResponse(&healthv1.AssignTaskResponse{Success: true}), nil
}

func (f *fakeTaskLifecycleHandler) UpdateTaskStatus(
	_ context.Context,
	req *connect.Request[healthv1.UpdateTaskStatusRequest],
) (*connect.Response[healthv1.UpdateTaskStatusResponse], error) {
	f.gotUpdateStatusReq = req.Msg
	return connect.NewResponse(&healthv1.UpdateTaskStatusResponse{
		Task: &healthv1.Task{Id: req.Msg.TaskId, Status: req.Msg.Status},
	}), nil
}

func (f *fakeTaskLifecycleHandler) DeleteTask(
	_ context.Context,
	req *connect.Request[healthv1.DeleteTaskRequest],
) (*connect.Response[healthv1.DeleteTaskResponse], error) {
	f.gotDeleteReq = req.Msg
	return connect.NewResponse(&healthv1.DeleteTaskResponse{Success: true}), nil
}

func (f *fakeTaskLifecycleHandler) RestoreTask(
	_ context.Context,
	req *connect.Request[healthv1.RestoreTaskRequest],
) (*connect.Response[healthv1.RestoreTaskResponse], error) {
	f.gotRestoreReq = req.Msg
	return connect.NewResponse(&healthv1.RestoreTaskResponse{Success: true}), nil
}

func (f *fakeTaskLifecycleHandler) PurgeTask(
	_ context.Context,
	req *connect.Request[healthv1.PurgeTaskRequest],
) (*connect.Response[healthv1.PurgeTaskResponse], error) {
	f.gotPurgeReq = req.Msg
	return connect.NewResponse(&healthv1.PurgeTaskResponse{Success: true}), nil
}

func withTaskLifecycleServer(t *testing.T) *fakeTaskLifecycleHandler {
	t.Helper()
	fake := &fakeTaskLifecycleHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(fake))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	return fake
}

func TestTasksAssignCommand(t *testing.T) {
	t.Cleanup(func() {
		_ = tasksAssignCmd.Flags().Set("agent", "")
		_ = tasksAssignCmd.Flags().Set("user", "")
	})
	fake := withTaskLifecycleServer(t)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "assign", "task-1", "--user", "user-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks assign failed: %v", err)
	}

	if fake.gotAssignReq == nil || fake.gotAssignReq.UserId == nil || *fake.gotAssignReq.UserId != "user-1" {
		t.Fatalf("expected the backend to receive an AssignTask request naming user-1, got %+v", fake.gotAssignReq)
	}
	if !strings.Contains(b.String(), "\"success\":true") {
		t.Errorf("expected output to report success, got %s", b.String())
	}
}

func TestTasksAssignCommandRequiresAgentOrUser(t *testing.T) {
	_ = tasksAssignCmd.Flags().Set("agent", "")
	_ = tasksAssignCmd.Flags().Set("user", "")
	t.Cleanup(func() {
		_ = tasksAssignCmd.Flags().Set("agent", "")
		_ = tasksAssignCmd.Flags().Set("user", "")
	})

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "assign", "task-1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected tasks assign to fail without --agent or --user")
	}
	if !strings.Contains(b.String(), "one of --agent or --user is required") {
		t.Errorf("expected the required-flag error to be reported, got %s", b.String())
	}
}

func TestTasksUpdateStatusCommand(t *testing.T) {
	fake := withTaskLifecycleServer(t)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "update-status", "task-1", "--status", "in-progress", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks update-status failed: %v", err)
	}

	if fake.gotUpdateStatusReq == nil || fake.gotUpdateStatusReq.Status != "in-progress" {
		t.Fatalf("expected the backend to receive an UpdateTaskStatus request for in-progress, got %+v", fake.gotUpdateStatusReq)
	}
	if !strings.Contains(b.String(), "in-progress") {
		t.Errorf("expected output to contain the new status, got %s", b.String())
	}
}

func TestTasksDeleteRestorePurgeCommands(t *testing.T) {
	fake := withTaskLifecycleServer(t)

	rootCmd.AddCommand(tasksCmd)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "delete", "task-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks delete failed: %v", err)
	}
	if fake.gotDeleteReq == nil || fake.gotDeleteReq.TaskId != "task-1" {
		t.Fatalf("expected the backend to receive a DeleteTask request for task-1, got %+v", fake.gotDeleteReq)
	}
	if !strings.Contains(b.String(), "\"success\":true") {
		t.Errorf("expected delete --json output to report success, got %s", b.String())
	}

	b.Reset()
	rootCmd.SetArgs([]string{"tasks", "restore", "task-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks restore failed: %v", err)
	}
	if fake.gotRestoreReq == nil || fake.gotRestoreReq.TaskId != "task-1" {
		t.Fatalf("expected the backend to receive a RestoreTask request for task-1, got %+v", fake.gotRestoreReq)
	}
	if !strings.Contains(b.String(), "\"success\":true") {
		t.Errorf("expected restore --json output to report success, got %s", b.String())
	}

	b.Reset()
	rootCmd.SetArgs([]string{"tasks", "purge", "task-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks purge failed: %v", err)
	}
	if fake.gotPurgeReq == nil || fake.gotPurgeReq.TaskId != "task-1" {
		t.Fatalf("expected the backend to receive a PurgeTask request for task-1, got %+v", fake.gotPurgeReq)
	}
	if !strings.Contains(b.String(), "\"success\":true") {
		t.Errorf("expected purge --json output to report success, got %s", b.String())
	}
}

func TestTasksDeleteRestorePurgeCommandsPlainOutput(t *testing.T) {
	withTaskLifecycleServer(t)

	// --json is a persistent flag on rootCmd, so the previous test's value
	// survives unless cleared first.
	_ = rootCmd.Flags().Set("json", "false")
	t.Cleanup(func() { _ = rootCmd.Flags().Set("json", "false") })

	rootCmd.AddCommand(tasksCmd)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "delete", "task-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks delete failed: %v", err)
	}
	if !strings.Contains(b.String(), "moved to bin") {
		t.Errorf("expected plain delete output, got %s", b.String())
	}

	b.Reset()
	rootCmd.SetArgs([]string{"tasks", "restore", "task-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks restore failed: %v", err)
	}
	if !strings.Contains(b.String(), "restored") {
		t.Errorf("expected plain restore output, got %s", b.String())
	}

	b.Reset()
	rootCmd.SetArgs([]string{"tasks", "purge", "task-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("tasks purge failed: %v", err)
	}
	if !strings.Contains(b.String(), "permanently deleted") {
		t.Errorf("expected plain purge output, got %s", b.String())
	}
}

// M19-T09: no required-flag validation error-message test existed anywhere
// in this file before this round.
func TestTasksCreateCommandRequiresTitleAndProject(t *testing.T) {
	_ = tasksCreateCmd.Flags().Set("title", "")
	_ = tasksCreateCmd.Flags().Set("project", "")
	t.Cleanup(func() {
		_ = tasksCreateCmd.Flags().Set("title", "")
		_ = tasksCreateCmd.Flags().Set("project", "")
	})
	t.Setenv("TASKER_PROJECT_ID", "")

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "create"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected tasks create to fail without --title/--project")
	}
	if !strings.Contains(b.String(), "--project and --title flags are required") {
		t.Errorf("expected the required-flag error to be reported, got %s", b.String())
	}
}

func TestTasksReviewerAddCommandRequiresUser(t *testing.T) {
	_ = tasksReviewerAddCmd.Flags().Set("user", "")
	t.Cleanup(func() { _ = tasksReviewerAddCmd.Flags().Set("user", "") })

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "reviewer-add", "task-1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected reviewer-add to fail without --user")
	}
	if !strings.Contains(b.String(), "--user is required") {
		t.Errorf("expected the required-flag error to be reported, got %s", b.String())
	}
}

func TestTasksReviewerRemoveCommandRequiresUser(t *testing.T) {
	_ = tasksReviewerRemoveCmd.Flags().Set("user", "")
	t.Cleanup(func() { _ = tasksReviewerRemoveCmd.Flags().Set("user", "") })

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "reviewer-remove", "task-1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected reviewer-remove to fail without --user")
	}
	if !strings.Contains(b.String(), "--user is required") {
		t.Errorf("expected the required-flag error to be reported, got %s", b.String())
	}
}
