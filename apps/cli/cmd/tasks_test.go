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

func TestTasksCreateCommand(t *testing.T) {
	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "create", "--title", "UnitTest", "--json"})
	_ = rootCmd.Execute()

	output := b.String()
	if len(output) == 0 {
		t.Errorf("Expected JSON output, got empty")
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
