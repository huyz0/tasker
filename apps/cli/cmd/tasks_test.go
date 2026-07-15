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

	output := b.String()
	if !strings.Contains(output, "task_1") {
		t.Errorf("expected output to contain the created task's id, got %s", output)
	}
	if !strings.Contains(output, "T-1") {
		t.Errorf("expected output to contain the created task's display id, got %s", output)
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
}

func (f *fakeTaskListHandler) ListTasks(
	_ context.Context,
	req *connect.Request[healthv1.ListTasksRequest],
) (*connect.Response[healthv1.ListTasksResponse], error) {
	f.gotPage = req.Msg.Page
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
