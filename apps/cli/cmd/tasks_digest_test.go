package cmd

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"connectrpc.com/connect"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
)

type fakeDigest struct {
	v1connect.UnimplementedTaskServiceHandler
	summary    *healthv1.SetTaskSummaryRequest
	candidates *healthv1.ListCompactionCandidatesRequest
	calls      int
	truncated  bool
}

func (f *fakeDigest) SetTaskSummary(_ context.Context, r *connect.Request[healthv1.SetTaskSummaryRequest]) (*connect.Response[healthv1.SetTaskSummaryResponse], error) {
	f.calls++
	f.summary = r.Msg
	if r.Msg.Text == "" {
		return connect.NewResponse(&healthv1.SetTaskSummaryResponse{}), nil
	}
	return connect.NewResponse(&healthv1.SetTaskSummaryResponse{Summary: &healthv1.TaskSummary{Text: strings.TrimSpace(r.Msg.Text), AuthorName: "Closer", UpdatedAt: "2026-10-02T10:00:00Z"}}), nil
}
func (f *fakeDigest) GetTaskDigest(_ context.Context, r *connect.Request[healthv1.GetTaskDigestRequest]) (*connect.Response[healthv1.GetTaskDigestResponse], error) {
	f.calls++
	finished := "2026-09-01T00:00:00Z"
	answer := "flag"
	return connect.NewResponse(&healthv1.GetTaskDigestResponse{Digest: &healthv1.TaskDigest{
		Task: &healthv1.Task{Id: r.Msg.TaskId, DisplayId: "T-1", Title: "Ship", Status: "done", OpenInputRequestCount: 1,
			Summary: &healthv1.TaskSummary{Text: "Shipped.\nGotcha: the index.", AuthorName: "Closer", UpdatedAt: "2026-09-02T00:00:00Z"},
			Usage:   &healthv1.UsageTotals{CostMicros: 15000, Reports: 1, InputTokens: 10},
			Plan:    []*healthv1.PlanStep{{Title: "Do it", Status: "done"}}},
		LatestHandoffNote: &healthv1.TaskNote{Content: "Left off at the migration", CreatedAt: "2026-08-30T00:00:00Z"},
		AnsweredQuestions: []*healthv1.InputRequest{{Question: "Flag?", Answer: &answer}},
		Relations:         &healthv1.ListTaskLinksResponse{BlockedBy: []*healthv1.TaskRef{{Id: "t0", DisplayId: "T-0", Title: "Schema", Status: "done", Terminal: true}}},
		FinishedAt:        &finished,
		Truncated:         f.truncated,
	}}), nil
}
func (f *fakeDigest) ListCompactionCandidates(_ context.Context, r *connect.Request[healthv1.ListCompactionCandidatesRequest]) (*connect.Response[healthv1.ListCompactionCandidatesResponse], error) {
	f.calls++
	f.candidates = r.Msg
	return connect.NewResponse(&healthv1.ListCompactionCandidatesResponse{
		Candidates: []*healthv1.CompactionCandidate{{TaskId: "t9", DisplayId: "T-9", Title: "Old work", Status: "done", FinishedAt: "2026-06-01T00:00:00Z"}},
		TotalCount: 4,
	}), nil
}

func serveDigest(t *testing.T) *fakeDigest {
	t.Helper()
	resetAllFlags(t)
	f := &fakeDigest{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(f))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Setenv("TASKER_PROJECT_ID", "")
	rootCmd.AddCommand(tasksCmd)
	return f
}

func TestSummarySetFromTextOrFileAndClear(t *testing.T) {
	f := serveDigest(t)
	out, errw, code := run(t, "tasks", "summary", "set", "t1", "--text", "Shipped behind a flag.")
	if code != exitOK || f.summary.Text != "Shipped behind a flag." || !strings.Contains(out, "Summary (by Closer, 2026-10-02T10:00:00Z):\n  Shipped behind a flag.") {
		t.Fatalf("set: exit %d %q %q %+v", code, out, errw, f.summary)
	}
	path := filepath.Join(t.TempDir(), "s.md")
	if err := os.WriteFile(path, []byte("From a file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	f = serveDigest(t)
	run(t, "tasks", "summary", "set", "t1", "--file", path)
	if f.summary.Text != "From a file\n" {
		t.Errorf("file: %+v", f.summary)
	}
	f = serveDigest(t)
	if out, _, _ := run(t, "tasks", "summary", "clear", "t1"); f.summary.Text != "" || !strings.Contains(out, "Summary cleared for t1") {
		t.Errorf("clear: %q %+v", out, f.summary)
	}
	for _, args := range [][]string{
		{"tasks", "summary", "set", "t1"},
		{"tasks", "summary", "set", "t1", "--text", "   "},
		{"tasks", "summary", "set", "t1", "--text", "a", "--file", path},
		{"tasks", "summary", "set", "t1", "--file", filepath.Join(t.TempDir(), "missing")},
	} {
		f = serveDigest(t)
		if _, _, code := run(t, args...); code != exitInvalid || f.calls != 0 {
			t.Errorf("%v: exit %d, calls %d", args, code, f.calls)
		}
	}
}

func TestDigestPrintsEveryPart(t *testing.T) {
	serveDigest(t)
	out, errw, code := run(t, "tasks", "digest", "t1")
	if code != exitOK {
		t.Fatalf("exit %d: %s", code, errw)
	}
	for _, want := range []string{
		"T-1 [done]: Ship (id: t1)", "Finished: 2026-09-01T00:00:00Z", "Summary (by Closer, 2026-09-02T00:00:00Z):\n  Shipped.\n  Gotcha: the index.",
		"Usage: $0.015 over 1 report(s)", "Plan (1/1 done):", "Latest handoff (2026-08-30T00:00:00Z):\n  Left off at the migration",
		"Answered questions:\n  - Flag? -> flag", "Open questions: 1", "Blocked by:\n  - T-0 [done, finished]: Schema (id: t0)",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
	if strings.Contains(errw, "cut at their cap") {
		t.Errorf("not truncated: %q", errw)
	}
	f := serveDigest(t)
	f.truncated = true
	if _, errw, _ := run(t, "tasks", "digest", "t1"); !strings.Contains(errw, "cut at their cap") {
		t.Errorf("truncated: %q", errw)
	}
}

func TestCompactionCandidates(t *testing.T) {
	f := serveDigest(t)
	t.Setenv("TASKER_PROJECT_ID", "p-env")
	out, errw, code := run(t, "tasks", "compaction-candidates", "--older-than-days", "60", "--limit", "1")
	if code != exitOK || f.candidates.ProjectId != "p-env" || f.candidates.GetOlderThanDays() != 60 || f.candidates.GetLimit() != 1 {
		t.Fatalf("exit %d %+v", code, f.candidates)
	}
	if !strings.Contains(out, "- T-9 [done]: Old work - finished 2026-06-01T00:00:00Z (id: t9)") || !strings.Contains(errw, "1 of 4 shown") {
		t.Errorf("output %q / %q", out, errw)
	}
	f = serveDigest(t)
	if _, _, code := run(t, "tasks", "compaction-candidates"); code != exitInvalid || f.calls != 0 {
		t.Errorf("no project: exit %d calls %d", code, f.calls)
	}
}
