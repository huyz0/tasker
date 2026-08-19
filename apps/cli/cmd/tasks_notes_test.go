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
	notes           []*healthv1.TaskNote
	handoffEntries  []*healthv1.HandoffNoteEntry
	handoffNextPage string

	gotCreateReq   *healthv1.CreateTaskNoteRequest
	gotListReq     *healthv1.ListTaskNotesRequest
	gotUpdateReq   *healthv1.UpdateTaskNoteRequest
	gotDeleteReq   *healthv1.DeleteTaskNoteRequest
	gotHandoffsReq *healthv1.ListHandoffNotesRequest
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

func (f *fakeTaskNoteHandler) ListHandoffNotes(
	_ context.Context,
	req *connect.Request[healthv1.ListHandoffNotesRequest],
) (*connect.Response[healthv1.ListHandoffNotesResponse], error) {
	f.gotHandoffsReq = req.Msg
	return connect.NewResponse(&healthv1.ListHandoffNotesResponse{
		Entries: f.handoffEntries,
		Page:    &healthv1.PageResponse{NextCursor: f.handoffNextPage},
	}), nil
}

func (f *fakeTaskNoteHandler) DeleteTaskNote(
	_ context.Context,
	req *connect.Request[healthv1.DeleteTaskNoteRequest],
) (*connect.Response[healthv1.DeleteTaskNoteResponse], error) {
	f.gotDeleteReq = req.Msg
	return connect.NewResponse(&healthv1.DeleteTaskNoteResponse{Success: true}), nil
}

// --json is a PersistentFlag on rootCmd (root.go), not a per-subcommand one -
// a prior test in this package that passed --json leaves it Changed=true
// permanently (the same cmd.Flags().Changed() class of bug M20-T10 already
// documented for projects_test.go, here on the one flag every command in
// this file shares). Discovered by these tests specifically because they're
// the first in this file to assert on output that actually differs by
// json-vs-plain shape, rather than an early-exit message printed before the
// branch is reached.
func resetJSONFlag(t *testing.T) {
	t.Helper()
	rootCmd.PersistentFlags().Lookup("json").Changed = false
	_ = rootCmd.PersistentFlags().Set("json", "false")
	t.Cleanup(func() {
		rootCmd.PersistentFlags().Lookup("json").Changed = false
		_ = rootCmd.PersistentFlags().Set("json", "false")
	})
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

// M22-T06 (ADR-0017): --type is how an agent records a handoff note instead
// of a plain comment - forwarded as-is, validated server-side.
func TestTasksNoteAddCommandForwardsType(t *testing.T) {
	resetJSONFlag(t)
	fake := withTaskNoteServer(t, &fakeTaskNoteHandler{})
	t.Cleanup(func() { _ = tasksNoteAddCmd.Flags().Set("type", "") })

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "note-add", "task-1", "--content", "Blocked on review, next: rerun tests", "--type", "handoff", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("expected note-add to succeed, got error: %v", err)
	}

	if fake.gotCreateReq == nil || fake.gotCreateReq.NoteType != "handoff" {
		t.Fatalf("expected NoteType=handoff to be sent, got %+v", fake.gotCreateReq)
	}
}

// An omitted --type sends an empty string, which the backend's Zod default
// treats as absent (M22-T04) - not this CLI's job to default it locally.
func TestTasksNoteAddCommandOmitsTypeByDefault(t *testing.T) {
	resetJSONFlag(t)
	fake := withTaskNoteServer(t, &fakeTaskNoteHandler{})
	t.Cleanup(func() { _ = tasksNoteAddCmd.Flags().Set("type", "") })

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "note-add", "task-1", "--content", "Just a comment", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("expected note-add to succeed, got error: %v", err)
	}

	if fake.gotCreateReq == nil || fake.gotCreateReq.NoteType != "" {
		t.Fatalf("expected an empty NoteType to be sent when --type is omitted, got %+v", fake.gotCreateReq)
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

// M22-T06 (ADR-0017): a handoff note stands out in a chronological list
// dominated by plain comments.
func TestTasksNotesListCommandTagsHandoffNotes(t *testing.T) {
	resetJSONFlag(t)
	fake := withTaskNoteServer(t, &fakeTaskNoteHandler{
		notes: []*healthv1.TaskNote{
			{Id: "tnt_1", TaskId: "task-1", AgentId: "agent-1", Content: "Just a comment", NoteType: "comment"},
			{Id: "tnt_2", TaskId: "task-1", AgentId: "agent-2", Content: "Blocked on review", NoteType: "handoff"},
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
	if !strings.Contains(out, "[handoff] Blocked on review") {
		t.Errorf("expected the handoff note to be tagged, got %s", out)
	}
	if strings.Contains(out, "[handoff] Just a comment") {
		t.Errorf("expected the plain comment to not be tagged as a handoff, got %s", out)
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

// --- tasks handoffs (M22-T06, ADR-0017) ---

func resetHandoffsProjectFlag(t *testing.T) {
	t.Helper()
	// M20-T10's own lesson: cmd.Flags().Changed() never resets itself once
	// set, even after Set(name, "") - a prior test's --project value would
	// otherwise silently satisfy a later test that means to exercise the
	// "no project given" path.
	tasksHandoffsCmd.Flags().Lookup("project").Changed = false
	_ = tasksHandoffsCmd.Flags().Set("project", "")
	t.Setenv("TASKER_PROJECT_ID", "")
	t.Cleanup(func() {
		tasksHandoffsCmd.Flags().Lookup("project").Changed = false
		_ = tasksHandoffsCmd.Flags().Set("project", "")
	})
}

func TestTasksHandoffsCommand(t *testing.T) {
	resetHandoffsProjectFlag(t)
	resetJSONFlag(t)
	fake := withTaskNoteServer(t, &fakeTaskNoteHandler{
		handoffEntries: []*healthv1.HandoffNoteEntry{
			{
				Note:       &healthv1.TaskNote{Id: "tnt_1", TaskId: "task-1", AgentId: "agent-1", Content: "Blocked on review, next: rerun tests", NoteType: "handoff"},
				TaskTitle:  "Fix flaky test",
				TaskStatus: "in_progress",
			},
		},
	})

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "handoffs", "--project", "proj-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("expected handoffs to succeed, got error: %v", err)
	}

	if fake.gotHandoffsReq == nil || fake.gotHandoffsReq.ProjectId != "proj-1" {
		t.Fatalf("expected the backend to receive a ListHandoffNotes request for proj-1, got %+v", fake.gotHandoffsReq)
	}
	out := b.String()
	if !strings.Contains(out, "Fix flaky test") || !strings.Contains(out, "in_progress") || !strings.Contains(out, "Blocked on review, next: rerun tests") {
		t.Errorf("expected output to contain the task title, status, and note content, got %s", out)
	}
}

func TestTasksHandoffsCommandJSON(t *testing.T) {
	resetHandoffsProjectFlag(t)
	resetJSONFlag(t)
	withTaskNoteServer(t, &fakeTaskNoteHandler{
		handoffEntries: []*healthv1.HandoffNoteEntry{
			{Note: &healthv1.TaskNote{Id: "tnt_1", TaskId: "task-1", Content: "Blocked", NoteType: "handoff"}, TaskTitle: "Fix flaky test", TaskStatus: "todo"},
		},
	})

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "handoffs", "--project", "proj-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("expected handoffs to succeed, got error: %v", err)
	}

	if !strings.Contains(b.String(), "\"taskTitle\":\"Fix flaky test\"") {
		t.Errorf("expected JSON output to contain the raw HandoffNoteEntry shape, got %s", b.String())
	}
}

func TestTasksHandoffsCommandEmptyState(t *testing.T) {
	resetHandoffsProjectFlag(t)
	resetJSONFlag(t)
	withTaskNoteServer(t, &fakeTaskNoteHandler{handoffEntries: nil})

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "handoffs", "--project", "proj-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("expected handoffs to succeed, got error: %v", err)
	}

	if !strings.Contains(b.String(), "No tasks currently have a pending handoff note.") {
		t.Errorf("expected the empty state to be reported, got %s", b.String())
	}
}

func TestTasksHandoffsCommandShowsNextCursorHint(t *testing.T) {
	resetHandoffsProjectFlag(t)
	resetJSONFlag(t)
	withTaskNoteServer(t, &fakeTaskNoteHandler{
		handoffEntries:  []*healthv1.HandoffNoteEntry{{Note: &healthv1.TaskNote{Id: "tnt_1", TaskId: "task-1", Content: "x", NoteType: "handoff"}, TaskTitle: "T", TaskStatus: "todo"}},
		handoffNextPage: "cursor-2",
	})

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "handoffs", "--project", "proj-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("expected handoffs to succeed, got error: %v", err)
	}

	if !strings.Contains(b.String(), "--cursor cursor-2") {
		t.Errorf("expected a hint naming the next cursor, got %s", b.String())
	}
}

func TestTasksHandoffsCommandRequiresProject(t *testing.T) {
	resetHandoffsProjectFlag(t)
	resetJSONFlag(t)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "handoffs"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected handoffs to fail without --project or TASKER_PROJECT_ID")
	}
	if !strings.Contains(b.String(), "--project is required") {
		t.Errorf("expected the required-flag error to be reported, got %s", b.String())
	}
}

func TestTasksHandoffsCommandFallsBackToProjectEnvVar(t *testing.T) {
	resetHandoffsProjectFlag(t)
	resetJSONFlag(t)
	t.Setenv("TASKER_PROJECT_ID", "proj-from-env")
	fake := withTaskNoteServer(t, &fakeTaskNoteHandler{})

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "handoffs"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("expected handoffs to succeed, got error: %v", err)
	}

	if fake.gotHandoffsReq == nil || fake.gotHandoffsReq.ProjectId != "proj-from-env" {
		t.Fatalf("expected TASKER_PROJECT_ID to be used as a fallback, got %+v", fake.gotHandoffsReq)
	}
}

func TestTasksHandoffsCommandReportsFailure(t *testing.T) {
	resetHandoffsProjectFlag(t)
	resetJSONFlag(t)
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskNoteServiceHandler(&v1connect.UnimplementedTaskNoteServiceHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"tasks", "handoffs", "--project", "proj-1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected handoffs to fail on an RPC error")
	}
	if !strings.Contains(b.String(), "Failed to list handoffs") {
		t.Errorf("expected the failure to be reported, got %s", b.String())
	}
}
