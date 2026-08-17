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

// M19-T09: tasks_notes.go had zero test coverage before this - not one of
// note-add/notes/note-update/note-delete had ever been run under `go test`.
type fakeTaskNoteHandler struct {
	v1connect.UnimplementedTaskNoteServiceHandler
	notes []*healthv1.TaskNote

	gotCreateReq *healthv1.CreateTaskNoteRequest
	gotListReq   *healthv1.ListTaskNotesRequest
	gotUpdateReq *healthv1.UpdateTaskNoteRequest
	gotDeleteReq *healthv1.DeleteTaskNoteRequest
}

func (f *fakeTaskNoteHandler) CreateTaskNote(
	_ context.Context,
	req *connect.Request[healthv1.CreateTaskNoteRequest],
) (*connect.Response[healthv1.CreateTaskNoteResponse], error) {
	f.gotCreateReq = req.Msg
	note := &healthv1.TaskNote{Id: "tnt_1", TaskId: req.Msg.TaskId, AgentId: "agent-1", Content: req.Msg.Content}
	return connect.NewResponse(&healthv1.CreateTaskNoteResponse{TaskNote: note}), nil
}

func (f *fakeTaskNoteHandler) ListTaskNotes(
	_ context.Context,
	req *connect.Request[healthv1.ListTaskNotesRequest],
) (*connect.Response[healthv1.ListTaskNotesResponse], error) {
	f.gotListReq = req.Msg
	return connect.NewResponse(&healthv1.ListTaskNotesResponse{TaskNotes: f.notes}), nil
}

func (f *fakeTaskNoteHandler) UpdateTaskNote(
	_ context.Context,
	req *connect.Request[healthv1.UpdateTaskNoteRequest],
) (*connect.Response[healthv1.UpdateTaskNoteResponse], error) {
	f.gotUpdateReq = req.Msg
	return connect.NewResponse(&healthv1.UpdateTaskNoteResponse{
		TaskNote: &healthv1.TaskNote{Id: req.Msg.TaskNoteId, Content: req.Msg.Content},
	}), nil
}

func (f *fakeTaskNoteHandler) DeleteTaskNote(
	_ context.Context,
	req *connect.Request[healthv1.DeleteTaskNoteRequest],
) (*connect.Response[healthv1.DeleteTaskNoteResponse], error) {
	f.gotDeleteReq = req.Msg
	return connect.NewResponse(&healthv1.DeleteTaskNoteResponse{Success: true}), nil
}

func withTaskNoteServer(t *testing.T, fake *fakeTaskNoteHandler) *fakeTaskNoteHandler {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskNoteServiceHandler(fake))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	return fake
}

func TestTasksNoteAddCommand(t *testing.T) {
	fake := withTaskNoteServer(t, &fakeTaskNoteHandler{})

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "note-add", "task-1", "--content", "Ran the tests, all green.", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("expected note-add to succeed, got error: %v", err)
	}

	if fake.gotCreateReq == nil || fake.gotCreateReq.TaskId != "task-1" || fake.gotCreateReq.Content != "Ran the tests, all green." {
		t.Fatalf("expected the backend to receive a CreateTaskNote request for task-1, got %+v", fake.gotCreateReq)
	}
	if !strings.Contains(b.String(), "tnt_1") {
		t.Errorf("expected output to contain the created note's id, got %s", b.String())
	}
}

func TestTasksNoteAddCommandRequiresContent(t *testing.T) {
	// tasksNoteAddCmd is a package-level singleton, so a --content value set
	// by an earlier test survives into this one unless cleared first.
	_ = tasksNoteAddCmd.Flags().Set("content", "")
	t.Cleanup(func() { _ = tasksNoteAddCmd.Flags().Set("content", "") })

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "note-add", "task-1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected note-add to fail without --content")
	}
	if !strings.Contains(b.String(), "--content is required") {
		t.Errorf("expected the required-flag error to be reported, got %s", b.String())
	}
}

func TestTasksNotesListCommand(t *testing.T) {
	fake := withTaskNoteServer(t, &fakeTaskNoteHandler{
		notes: []*healthv1.TaskNote{
			{Id: "tnt_1", TaskId: "task-1", AgentId: "agent-1", Content: "First note"},
			{Id: "tnt_2", TaskId: "task-1", AgentId: "agent-2", Content: "Second note"},
		},
	})

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "notes", "task-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("expected notes list to succeed, got error: %v", err)
	}

	if fake.gotListReq == nil || fake.gotListReq.TaskId != "task-1" {
		t.Fatalf("expected the backend to receive a ListTaskNotes request for task-1, got %+v", fake.gotListReq)
	}
	out := b.String()
	if !strings.Contains(out, "First note") || !strings.Contains(out, "Second note") {
		t.Errorf("expected output to contain both notes, got %s", out)
	}
	if !strings.Contains(out, "agent-1") {
		t.Errorf("expected output to attribute a note to its authoring agent, got %s", out)
	}
}

func TestTasksNoteUpdateCommand(t *testing.T) {
	fake := withTaskNoteServer(t, &fakeTaskNoteHandler{})

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "note-update", "tnt_1", "--content", "Revised note", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("expected note-update to succeed, got error: %v", err)
	}

	if fake.gotUpdateReq == nil || fake.gotUpdateReq.TaskNoteId != "tnt_1" || fake.gotUpdateReq.Content != "Revised note" {
		t.Fatalf("expected the backend to receive an UpdateTaskNote request, got %+v", fake.gotUpdateReq)
	}
	if !strings.Contains(b.String(), "tnt_1") {
		t.Errorf("expected output to contain the updated note's id, got %s", b.String())
	}
}

func TestTasksNoteUpdateCommandRequiresContent(t *testing.T) {
	_ = tasksNoteUpdateCmd.Flags().Set("content", "")
	t.Cleanup(func() { _ = tasksNoteUpdateCmd.Flags().Set("content", "") })

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "note-update", "tnt_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected note-update to fail without --content")
	}
	if !strings.Contains(b.String(), "--content is required") {
		t.Errorf("expected the required-flag error to be reported, got %s", b.String())
	}
}

func TestTasksNoteDeleteCommand(t *testing.T) {
	fake := withTaskNoteServer(t, &fakeTaskNoteHandler{})

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "note-delete", "tnt_1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("expected note-delete to succeed, got error: %v", err)
	}

	if fake.gotDeleteReq == nil || fake.gotDeleteReq.TaskNoteId != "tnt_1" {
		t.Fatalf("expected the backend to receive a DeleteTaskNote request for tnt_1, got %+v", fake.gotDeleteReq)
	}
	if !strings.Contains(b.String(), "\"success\":true") {
		t.Errorf("expected output to report success, got %s", b.String())
	}
}

// The author-only rejection (M19-T01) is a plain RPC error from the CLI's
// point of view - this exercises that the failure is reported, not that
// authorization itself works (already covered at the handler level).
func TestTasksNoteUpdateCommandReportsFailure(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskNoteServiceHandler(&v1connect.UnimplementedTaskNoteServiceHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "note-update", "tnt_1", "--content", "x"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected note-update to fail on an RPC error")
	}
	if !strings.Contains(b.String(), "Failed to update note") {
		t.Errorf("expected the failure to be reported, got %s", b.String())
	}
}

func TestTasksNoteDeleteCommandReportsFailure(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskNoteServiceHandler(&v1connect.UnimplementedTaskNoteServiceHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "note-delete", "tnt_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected note-delete to fail on an RPC error")
	}
	if !strings.Contains(b.String(), "Failed to delete note") {
		t.Errorf("expected the failure to be reported, got %s", b.String())
	}
}
