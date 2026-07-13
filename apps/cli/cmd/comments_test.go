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

type fakeCommentListHandler struct {
	v1connect.UnimplementedCommentServiceHandler
}

func (f *fakeCommentListHandler) CreateComment(
	_ context.Context,
	req *connect.Request[healthv1.CreateCommentRequest],
) (*connect.Response[healthv1.CreateCommentResponse], error) {
	return connect.NewResponse(&healthv1.CreateCommentResponse{
		Comment: &healthv1.Comment{Id: "cmt_1", EntityId: req.Msg.EntityId, EntityType: req.Msg.EntityType, Content: req.Msg.Content},
	}), nil
}

func (f *fakeCommentListHandler) ListComments(
	_ context.Context,
	req *connect.Request[healthv1.ListCommentsRequest],
) (*connect.Response[healthv1.ListCommentsResponse], error) {
	return connect.NewResponse(&healthv1.ListCommentsResponse{
		Comments: []*healthv1.Comment{
			{Id: "cmt_1", EntityId: req.Msg.EntityId, EntityType: req.Msg.EntityType, Content: "Looks good to me"},
		},
	}), nil
}

func withCommentServer(t *testing.T) {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewCommentServiceHandler(&fakeCommentListHandler{}))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
}

func TestCommentAddCmd(t *testing.T) {
	withCommentServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"comment", "add", "--entity", "task-123", "--type", "task", "--content", "Looks good to me"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "cmt_1") {
		t.Fatalf("expected output to contain the new comment id, got %s", out)
	}
}

func TestCommentListCmd(t *testing.T) {
	withCommentServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"comment", "list", "--entity", "task-123", "--type", "task"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Looks good to me") {
		t.Fatalf("expected output to contain the listed comment, got %s", out)
	}
}

func TestCommentListCmdWithNoComments(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewCommentServiceHandler(&fakeEmptyCommentHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"comment", "list", "--entity", "task-empty", "--type", "task"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "No comments found.") {
		t.Fatalf("expected the no-comments message, got %s", out)
	}
}

type fakeEmptyCommentHandler struct {
	v1connect.UnimplementedCommentServiceHandler
}

func (f *fakeEmptyCommentHandler) ListComments(
	_ context.Context,
	_ *connect.Request[healthv1.ListCommentsRequest],
) (*connect.Response[healthv1.ListCommentsResponse], error) {
	return connect.NewResponse(&healthv1.ListCommentsResponse{Comments: []*healthv1.Comment{}}), nil
}

// These exercise the RPC-failure branches of `comment add`/`comment list` -
// previously these called os.Exit(1) directly, which would have killed the
// entire test binary instead of returning control to cobra, so this failure
// path had never actually been run under `go test`.
func TestCommentAddCmdReportsErrorWithoutExitingProcess(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewCommentServiceHandler(&v1connect.UnimplementedCommentServiceHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"comment", "add", "--entity", "task-123", "--type", "task", "--content", "x"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), "failed to add comment") {
		t.Fatalf("expected an error message and for the process to still be alive, got %s", b.String())
	}
}

func TestCommentListCmdReportsErrorWithoutExitingProcess(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewCommentServiceHandler(&v1connect.UnimplementedCommentServiceHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"comment", "list", "--entity", "task-123", "--type", "task"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), "failed to list comments") {
		t.Fatalf("expected an error message and for the process to still be alive, got %s", b.String())
	}
}
