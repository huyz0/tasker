package cmd

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"connectrpc.com/connect"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
)

type fakePlan struct {
	v1connect.UnimplementedTaskServiceHandler
	plan   *healthv1.SetTaskPlanRequest
	ask    *healthv1.RequestInputRequest
	answer *healthv1.AnswerInputRequestRequest
	list   *healthv1.ListInputRequestsRequest
	calls  int
}

var sampleQuestion = &healthv1.InputRequest{Id: "ir1", TaskId: "t1", TaskDisplayId: "T-1", Question: "Flag or main?", Options: []string{"flag", "main"}, Status: "open", AskedByName: "Planner"}

func (f *fakePlan) SetTaskPlan(_ context.Context, r *connect.Request[healthv1.SetTaskPlanRequest]) (*connect.Response[healthv1.SetTaskPlanResponse], error) {
	f.calls++
	f.plan = r.Msg
	return connect.NewResponse(&healthv1.SetTaskPlanResponse{Plan: r.Msg.Steps}), nil
}
func (f *fakePlan) GetTask(_ context.Context, r *connect.Request[healthv1.GetTaskRequest]) (*connect.Response[healthv1.GetTaskResponse], error) {
	f.calls++
	task := &healthv1.Task{Id: r.Msg.TaskId, DisplayId: "T-1", Title: "Migrate", Status: "todo", OpenInputRequestCount: 1,
		Plan: []*healthv1.PlanStep{{Title: "Read", Status: "done"}, {Title: "Write", Status: "in_progress"}, {Title: "Ship", Status: "pending"}}}
	if r.Msg.TaskId == "bare" {
		task = &healthv1.Task{Id: "bare", DisplayId: "T-2", Title: "Bare"}
	}
	return connect.NewResponse(&healthv1.GetTaskResponse{Task: task}), nil
}
func (f *fakePlan) RequestInput(_ context.Context, r *connect.Request[healthv1.RequestInputRequest]) (*connect.Response[healthv1.RequestInputResponse], error) {
	f.calls++
	f.ask = r.Msg
	return connect.NewResponse(&healthv1.RequestInputResponse{InputRequest: sampleQuestion}), nil
}
func (f *fakePlan) AnswerInputRequest(_ context.Context, r *connect.Request[healthv1.AnswerInputRequestRequest]) (*connect.Response[healthv1.AnswerInputRequestResponse], error) {
	f.calls++
	f.answer = r.Msg
	answered := &healthv1.InputRequest{Id: "ir1", TaskDisplayId: "T-1", Question: "Flag or main?", Status: "answered", AskedByName: "Planner", Answer: strPtr(r.Msg.Answer), AnsweredByName: strPtr("Ada")}
	return connect.NewResponse(&healthv1.AnswerInputRequestResponse{InputRequest: answered}), nil
}
func (f *fakePlan) GetInputRequest(context.Context, *connect.Request[healthv1.GetInputRequestRequest]) (*connect.Response[healthv1.GetInputRequestResponse], error) {
	f.calls++
	return connect.NewResponse(&healthv1.GetInputRequestResponse{InputRequest: sampleQuestion}), nil
}
func (f *fakePlan) CancelInputRequest(context.Context, *connect.Request[healthv1.CancelInputRequestRequest]) (*connect.Response[healthv1.CancelInputRequestResponse], error) {
	f.calls++
	return connect.NewResponse(&healthv1.CancelInputRequestResponse{InputRequest: &healthv1.InputRequest{Id: "ir1", Status: "cancelled", AskedByName: "Planner", TaskDisplayId: "T-1", Question: "Flag or main?"}}), nil
}
func (f *fakePlan) ListInputRequests(_ context.Context, r *connect.Request[healthv1.ListInputRequestsRequest]) (*connect.Response[healthv1.ListInputRequestsResponse], error) {
	f.calls++
	f.list = r.Msg
	return connect.NewResponse(&healthv1.ListInputRequestsResponse{InputRequests: []*healthv1.InputRequest{sampleQuestion}, Page: &healthv1.PageResponse{}}), nil
}

func servePlan(t *testing.T) *fakePlan {
	t.Helper()
	resetAllFlags(t)
	f := &fakePlan{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(f))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Setenv("TASKER_ORG_ID", "")
	rootCmd.AddCommand(tasksCmd)
	return f
}

func TestParseStepReadsAnOptionalStatusPrefix(t *testing.T) {
	cases := map[string][2]string{
		"done: Read the schema": {"done", "Read the schema"},
		"Plain step":            {"pending", "Plain step"},
		"in_progress:Write":     {"in_progress", "Write"},
		"Note: not a status":    {"pending", "Note: not a status"},
	}
	for in, want := range cases {
		s, err := parseStep(in)
		if err != nil || s.Status != want[0] || s.Title != want[1] {
			t.Errorf("parseStep(%q) = %+v, %v; want %v", in, s, err, want)
		}
	}
	if _, err := parseStep("done:  "); err == nil {
		t.Error("an empty title must fail")
	}
}

func TestPlanSetSendsEveryStepInOrderAndShowsProgress(t *testing.T) {
	f := servePlan(t)
	out, errw, code := run(t, "tasks", "plan", "set", "t1", "--step", "done:Read", "--step", "in_progress:Write", "--step", "Ship")
	if code != exitOK {
		t.Fatalf("exit %d: %s", code, errw)
	}
	if len(f.plan.Steps) != 3 || f.plan.Steps[2].Status != "pending" || f.plan.Steps[1].Title != "Write" {
		t.Errorf("unexpected request %+v", f.plan.Steps)
	}
	if !strings.Contains(out, "Plan (1/3 done):\n  [x] Read\n  [>] Write\n  [ ] Ship") {
		t.Errorf("unexpected output %q", out)
	}
	f = servePlan(t)
	if out, _, _ := run(t, "tasks", "plan", "set", "t1"); !strings.Contains(out, "Plan cleared") || len(f.plan.Steps) != 0 {
		t.Errorf("clearing: %q %+v", out, f.plan)
	}
	f = servePlan(t)
	if _, _, code := run(t, "tasks", "plan", "set", "t1", "--step", "done:"); code != exitInvalid || f.calls != 0 {
		t.Errorf("a bad step must exit %d without a request, got %d/%d", exitInvalid, code, f.calls)
	}
}

func TestPlanShowAndTaskGetShowThePlanAndOpenQuestions(t *testing.T) {
	servePlan(t)
	out, _, _ := run(t, "tasks", "plan", "show", "t1")
	if !strings.Contains(out, "[>] Write") {
		t.Errorf("plan show: %q", out)
	}
	out, _, _ = run(t, "tasks", "get", "t1")
	if !strings.Contains(out, "Waiting on a person: 1 open question(s)") || !strings.Contains(out, "Plan (1/3 done)") {
		t.Errorf("tasks get: %q", out)
	}
	out, errw, _ := run(t, "tasks", "plan", "show", "bare")
	if out != "" || !strings.Contains(errw, "No plan.") {
		t.Errorf("no plan: %q / %q", out, errw)
	}
}

func TestAskAnswerAndListQuestions(t *testing.T) {
	f := servePlan(t)
	out, _, code := run(t, "tasks", "ask", "t1", "--question", "Flag or main?", "--option", "flag", "--option", "main")
	if code != exitOK || f.ask.Question != "Flag or main?" || strings.Join(f.ask.Options, ",") != "flag,main" {
		t.Errorf("ask: exit %d, %+v", code, f.ask)
	}
	if !strings.Contains(out, "ir1 [open] Planner asks on T-1: Flag or main? (options: flag / main)") {
		t.Errorf("ask output %q", out)
	}
	out, _, _ = run(t, "tasks", "answer", "ir1", "--answer", "flag")
	if f.answer.Answer != "flag" || !strings.Contains(out, `-> "flag" by Ada`) {
		t.Errorf("answer: %+v %q", f.answer, out)
	}
	if out, _, _ := run(t, "tasks", "question", "ir1"); !strings.Contains(out, "[open]") {
		t.Errorf("question: %q", out)
	}
	if out, _, _ := run(t, "tasks", "cancel-question", "ir1"); !strings.Contains(out, "[cancelled]") {
		t.Errorf("cancel: %q", out)
	}
	run(t, "tasks", "questions", "--org", "o1", "--status", "all")
	if f.list.GetOrgId() != "o1" || f.list.GetStatus() != "all" || f.list.TaskId != nil {
		t.Errorf("questions: %+v", f.list)
	}
	f = servePlan(t)
	t.Setenv("TASKER_ORG_ID", "o-env")
	run(t, "tasks", "questions", "--task", "t1")
	if f.list.OrgId != nil || f.list.GetTaskId() != "t1" {
		t.Errorf("a task filter must not add the default org: %+v", f.list)
	}
	f = servePlan(t)
	if _, _, code := run(t, "tasks", "ask", "t1"); code != exitInvalid || f.calls != 0 {
		t.Errorf("ask without --question: exit %d, calls %d", code, f.calls)
	}
	if _, _, code := run(t, "tasks", "answer", "ir1"); code != exitInvalid || f.calls != 0 {
		t.Errorf("answer without --answer: exit %d, calls %d", code, f.calls)
	}
}
