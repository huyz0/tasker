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

type fakeSchedules struct {
	v1connect.UnimplementedScheduleServiceHandler
	created *healthv1.CreateScheduleRequest
	updated *healthv1.UpdateScheduleRequest
	listed  *healthv1.ListSchedulesRequest
	calls   int
}

func strp(s string) *string { return &s }

var sampleSchedule = &healthv1.Schedule{
	Id: "sch1", ProjectId: "p1", Name: "Triage", Cadence: "weekly", Weekdays: []int32{1, 4}, HourUtc: 9,
	TaskTitle: strp("Triage the inbox"), TaskPriority: 2, SkipIfOpen: true, Active: true, NextRunAt: "2026-10-05T09:00:00.000Z",
	LastOutcome: strp("skipped"), LastRunAt: strp("2026-10-01T09:00:00.000Z"),
}

func (f *fakeSchedules) CreateSchedule(_ context.Context, r *connect.Request[healthv1.CreateScheduleRequest]) (*connect.Response[healthv1.CreateScheduleResponse], error) {
	f.calls++
	f.created = r.Msg
	s := &healthv1.Schedule{Id: "sch2", Name: r.Msg.Name, Cadence: r.Msg.Cadence, Weekdays: r.Msg.Weekdays, DayOfMonth: r.Msg.GetDayOfMonth(), HourUtc: r.Msg.HourUtc,
		TaskTitle: r.Msg.TaskTitle, TemplateId: r.Msg.TemplateId, Active: true, NextRunAt: "2026-10-15T06:00:00.000Z"}
	return connect.NewResponse(&healthv1.CreateScheduleResponse{Schedule: s}), nil
}
func (f *fakeSchedules) UpdateSchedule(_ context.Context, r *connect.Request[healthv1.UpdateScheduleRequest]) (*connect.Response[healthv1.UpdateScheduleResponse], error) {
	f.calls++
	f.updated = r.Msg
	s := &healthv1.Schedule{Id: r.Msg.Id, Name: r.Msg.Name, Cadence: r.Msg.Cadence, Weekdays: r.Msg.Weekdays, HourUtc: r.Msg.HourUtc,
		TaskTitle: r.Msg.TaskTitle, TemplateId: r.Msg.TemplateId, Active: r.Msg.Active == nil || r.Msg.GetActive(), NextRunAt: "x"}
	return connect.NewResponse(&healthv1.UpdateScheduleResponse{Schedule: s}), nil
}
func (f *fakeSchedules) GetSchedule(context.Context, *connect.Request[healthv1.GetScheduleRequest]) (*connect.Response[healthv1.GetScheduleResponse], error) {
	f.calls++
	return connect.NewResponse(&healthv1.GetScheduleResponse{Schedule: sampleSchedule}), nil
}
func (f *fakeSchedules) ListSchedules(_ context.Context, r *connect.Request[healthv1.ListSchedulesRequest]) (*connect.Response[healthv1.ListSchedulesResponse], error) {
	f.calls++
	f.listed = r.Msg
	return connect.NewResponse(&healthv1.ListSchedulesResponse{Schedules: []*healthv1.Schedule{sampleSchedule}, Page: &healthv1.PageResponse{}}), nil
}
func (f *fakeSchedules) DeleteSchedule(context.Context, *connect.Request[healthv1.DeleteScheduleRequest]) (*connect.Response[healthv1.DeleteScheduleResponse], error) {
	f.calls++
	return connect.NewResponse(&healthv1.DeleteScheduleResponse{Success: true}), nil
}
func (f *fakeSchedules) RunSchedule(context.Context, *connect.Request[healthv1.RunScheduleRequest]) (*connect.Response[healthv1.RunScheduleResponse], error) {
	f.calls++
	return connect.NewResponse(&healthv1.RunScheduleResponse{Run: &healthv1.ScheduleRun{RanAt: "2026-10-02T10:00:00Z", Outcome: "created", Trigger: "manual", TaskId: strp("t9")}}), nil
}
func (f *fakeSchedules) ListScheduleRuns(context.Context, *connect.Request[healthv1.ListScheduleRunsRequest]) (*connect.Response[healthv1.ListScheduleRunsResponse], error) {
	f.calls++
	return connect.NewResponse(&healthv1.ListScheduleRunsResponse{Runs: []*healthv1.ScheduleRun{
		{RanAt: "2026-10-01T09:00:00Z", Outcome: "skipped", Trigger: "schedule", Detail: strp("the previous run's task P-3 is still open")},
	}, Page: &healthv1.PageResponse{}}), nil
}

func serveSchedules(t *testing.T) *fakeSchedules {
	t.Helper()
	resetAllFlags(t)
	f := &fakeSchedules{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewScheduleServiceHandler(f))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Setenv("TASKER_ORG_ID", "o-env")
	t.Setenv("TASKER_PROJECT_ID", "p-env")
	return f
}

func TestParseWeekdays(t *testing.T) {
	got, err := parseWeekdays("Mon, thursday,0")
	if err != nil || len(got) != 3 || got[0] != 1 || got[1] != 4 || got[2] != 0 {
		t.Errorf("got %v %v", got, err)
	}
	if _, err := parseWeekdays("funday"); err == nil {
		t.Error("an unknown day must fail")
	}
}

func TestSchedulesCreateWeeklyMonthlyAndWorkflow(t *testing.T) {
	f := serveSchedules(t)
	out, errw, code := run(t, "schedules", "create", "--name", "Triage", "--weekdays", "mon,thu", "--hour", "7", "--task", "Triage the inbox", "--priority", "high")
	if code != exitOK {
		t.Fatalf("exit %d: %s", code, errw)
	}
	if f.created.ProjectId != "p-env" || f.created.Cadence != "weekly" || len(f.created.Weekdays) != 2 || f.created.HourUtc != 7 ||
		f.created.GetTaskTitle() != "Triage the inbox" || f.created.GetTaskPriority() != 2 || f.created.SkipIfOpen != nil {
		t.Errorf("request %+v", f.created)
	}
	if !strings.Contains(out, `Triage (id: sch2): task "Triage the inbox", every Mon, Thu at 07:00 UTC - next`) {
		t.Errorf("output %q", out)
	}
	f = serveSchedules(t)
	out, _, _ = run(t, "schedules", "create", "--name", "Report", "--day", "15", "--hour", "6", "--workflow", "wft1", "--allow-overlap")
	if f.created.Cadence != "monthly" || f.created.GetDayOfMonth() != 15 || f.created.GetTemplateId() != "wft1" || f.created.TaskTitle != nil || f.created.GetSkipIfOpen() {
		t.Errorf("monthly %+v", f.created)
	}
	if !strings.Contains(out, "workflow wft1, monthly on day 15 at 06:00 UTC") {
		t.Errorf("monthly output %q", out)
	}
	for _, args := range [][]string{
		{"schedules", "create", "--name", "X"},
		{"schedules", "create", "--task", "T"},
		{"schedules", "create", "--name", "X", "--task", "T", "--cadence", "weekly"},
		{"schedules", "create", "--name", "X", "--task", "T", "--cadence", "monthly"},
		{"schedules", "create", "--name", "X", "--task", "T", "--weekdays", "funday"},
		{"schedules", "create", "--name", "X", "--task", "T", "--priority", "huge"},
	} {
		f = serveSchedules(t)
		if _, _, code := run(t, args...); code != exitInvalid || f.calls != 0 {
			t.Errorf("%v: exit %d, calls %d", args, code, f.calls)
		}
	}
	f = serveSchedules(t)
	t.Setenv("TASKER_PROJECT_ID", "")
	if _, _, code := run(t, "schedules", "create", "--name", "X", "--task", "T"); code != exitInvalid || f.calls != 0 {
		t.Errorf("no project: exit %d", code)
	}
}

func TestSchedulesListGetUpdateRunRunsDelete(t *testing.T) {
	f := serveSchedules(t)
	out, _, _ := run(t, "schedules", "list")
	if f.listed.GetOrgId() != "o-env" || !strings.Contains(out, "- Triage (id: sch1)") || !strings.Contains(out, "last run skipped at 2026-10-01") {
		t.Errorf("list %+v %q", f.listed, out)
	}
	if out, _, _ := run(t, "schedules", "get", "sch1"); !strings.Contains(out, "every Mon, Thu at 09:00 UTC") {
		t.Errorf("get %q", out)
	}
	f = serveSchedules(t)
	out, _, _ = run(t, "schedules", "update", "sch1", "--pause", "--hour", "10")
	if f.updated.GetActive() || f.updated.Active == nil || f.updated.HourUtc != 10 || f.updated.Cadence != "weekly" || len(f.updated.Weekdays) != 2 ||
		f.updated.GetTaskTitle() != "Triage the inbox" || f.updated.GetTaskPriority() != 2 || !f.updated.GetSkipIfOpen() {
		t.Errorf("update keeps what it was not given: %+v", f.updated)
	}
	if !strings.Contains(out, "paused") {
		t.Errorf("update output %q", out)
	}
	f = serveSchedules(t)
	run(t, "schedules", "update", "sch1", "--workflow", "wft9", "--cadence", "daily")
	if f.updated.GetTemplateId() != "wft9" || f.updated.TaskTitle != nil || f.updated.Active != nil || f.updated.Cadence != "daily" {
		t.Errorf("switch target %+v", f.updated)
	}
	f = serveSchedules(t)
	if _, _, code := run(t, "schedules", "update", "sch1", "--pause", "--resume"); code != exitInvalid || f.updated != nil {
		t.Errorf("pause and resume: exit %d", code)
	}
	if out, _, _ := run(t, "schedules", "run", "sch1"); !strings.Contains(out, "created (manual) task t9") {
		t.Errorf("run %q", out)
	}
	if out, _, _ := run(t, "schedules", "runs", "sch1"); !strings.Contains(out, "skipped (schedule): the previous run's task P-3 is still open") {
		t.Errorf("runs %q", out)
	}
	if out, _, _ := run(t, "schedules", "delete", "sch1"); !strings.Contains(out, "Schedule sch1 deleted") {
		t.Errorf("delete %q", out)
	}
}
