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

type fakeUsage struct {
	v1connect.UnimplementedTaskServiceHandler
	v1connect.UnimplementedReportServiceHandler
	report *healthv1.ReportUsageRequest
	usage  *healthv1.GetUsageReportRequest
	calls  int
}

var sampleTotals = &healthv1.UsageTotals{InputTokens: 1200, OutputTokens: 300, CostMicros: 1_515_000, Reports: 2}

func (f *fakeUsage) ReportUsage(_ context.Context, r *connect.Request[healthv1.ReportUsageRequest]) (*connect.Response[healthv1.ReportUsageResponse], error) {
	f.calls++
	f.report = r.Msg
	rec := &healthv1.UsageRecord{Id: "use1", TaskId: r.Msg.TaskId, ReportedByName: "Coder", ModelName: r.Msg.GetModelName(), InputTokens: r.Msg.InputTokens, OutputTokens: r.Msg.OutputTokens, CostMicros: r.Msg.CostMicros, CreatedAt: "2026-10-02T10:00:00Z"}
	return connect.NewResponse(&healthv1.ReportUsageResponse{Record: rec, Totals: sampleTotals, Replayed: r.Msg.GetIdempotencyKey() == "seen"}), nil
}
func (f *fakeUsage) ListUsageRecords(context.Context, *connect.Request[healthv1.ListUsageRecordsRequest]) (*connect.Response[healthv1.ListUsageRecordsResponse], error) {
	f.calls++
	return connect.NewResponse(&healthv1.ListUsageRecordsResponse{
		Records: []*healthv1.UsageRecord{{Id: "use1", ReportedByName: "Coder", ModelName: "m-1", InputTokens: 1000, OutputTokens: 200, CostMicros: 15000, CreatedAt: "2026-10-02T10:00:00Z"}},
		Totals:  sampleTotals, Page: &healthv1.PageResponse{},
	}), nil
}
func (f *fakeUsage) GetTask(_ context.Context, r *connect.Request[healthv1.GetTaskRequest]) (*connect.Response[healthv1.GetTaskResponse], error) {
	return connect.NewResponse(&healthv1.GetTaskResponse{Task: &healthv1.Task{Id: r.Msg.TaskId, DisplayId: "T-1", Title: "Build", Status: "todo", Usage: sampleTotals}}), nil
}
func (f *fakeUsage) GetUsageReport(_ context.Context, r *connect.Request[healthv1.GetUsageReportRequest]) (*connect.Response[healthv1.GetUsageReportResponse], error) {
	f.calls++
	f.usage = r.Msg
	return connect.NewResponse(&healthv1.GetUsageReportResponse{
		Totals:    sampleTotals,
		ByAgent:   []*healthv1.UsageBucket{{Key: "a1", Label: "Coder", CostMicros: 1_500_000, Reports: 1}, {Key: "", Label: "People", CostMicros: 15000, Reports: 1}},
		ByProject: []*healthv1.UsageBucket{{Key: "p1", Label: "Alpha", CostMicros: 1_515_000, Reports: 2}},
		ByDay:     []*healthv1.UsageBucket{{Key: "2026-10-01", Label: "2026-10-01"}, {Key: "2026-10-02", Label: "2026-10-02", CostMicros: 1_515_000, Reports: 2}},
		Since:     "2026-10-01T00:00:00.000Z",
	}), nil
}

func serveUsage(t *testing.T) *fakeUsage {
	t.Helper()
	resetAllFlags(t)
	f := &fakeUsage{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(f))
	mux.Handle(v1connect.NewReportServiceHandler(f))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Setenv("TASKER_ORG_ID", "")
	rootCmd.AddCommand(tasksCmd)
	return f
}

func TestParseAndFormatUSDAreExact(t *testing.T) {
	for in, want := range map[string]int64{"0.015": 15000, "$1.50": 1_500_000, "12": 12_000_000, ".000001": 1, "1000": 1_000_000_000} {
		if got, err := parseUSD(in); err != nil || got != want {
			t.Errorf("parseUSD(%q) = %d, %v; want %d", in, got, err, want)
		}
	}
	for _, bad := range []string{"-1", "0.0000001", "abc", "1.2.3", "1000.01"} {
		if _, err := parseUSD(bad); err == nil {
			t.Errorf("parseUSD(%q) must fail", bad)
		}
	}
	for micros, want := range map[int64]string{0: "$0.00", 15000: "$0.015", 1_500_000: "$1.50", 1: "$0.000001", 12_340_000: "$12.34"} {
		if got := formatUSD(micros); got != want {
			t.Errorf("formatUSD(%d) = %q; want %q", micros, got, want)
		}
	}
}

func TestUsageReportSendsMicrosAndShowsTheTotal(t *testing.T) {
	f := serveUsage(t)
	out, errw, code := run(t, "tasks", "usage", "report", "t1", "--model", "m-1", "--input-tokens", "1000", "--output-tokens", "200", "--cost-usd", "0.015", "--idempotency-key", "k1")
	if code != exitOK {
		t.Fatalf("exit %d: %s", code, errw)
	}
	if f.report.CostMicros != 15000 || f.report.InputTokens != 1000 || f.report.GetModelName() != "m-1" || f.report.GetIdempotencyKey() != "k1" {
		t.Errorf("request %+v", f.report)
	}
	if !strings.Contains(out, "Reported: 2026-10-02T10:00:00Z Coder m-1: $0.015, 1000 in / 200 out (use1)") || !strings.Contains(out, "Task total: $1.515 over 2 report(s) - 1200 input / 300 output tokens") {
		t.Errorf("output %q", out)
	}
	f = serveUsage(t)
	if out, _, _ := run(t, "tasks", "usage", "report", "t1", "--cost-micros", "5", "--idempotency-key", "seen"); !strings.Contains(out, "Already reported (same key)") || f.report.CostMicros != 5 {
		t.Errorf("replay: %q %+v", out, f.report)
	}
	for _, args := range [][]string{
		{"tasks", "usage", "report", "t1"},
		{"tasks", "usage", "report", "t1", "--cost-usd", "1", "--cost-micros", "5"},
		{"tasks", "usage", "report", "t1", "--cost-usd", "-1"},
		{"tasks", "usage", "report", "t1", "--input-tokens", "-5"},
	} {
		f = serveUsage(t)
		if _, _, code := run(t, args...); code != exitInvalid || f.calls != 0 {
			t.Errorf("%v: exit %d, calls %d; want exit %d with no request", args, code, f.calls, exitInvalid)
		}
	}
}

func TestUsageShowAndTaskGetShowTotals(t *testing.T) {
	serveUsage(t)
	out, _, _ := run(t, "tasks", "usage", "show", "t1")
	if !strings.Contains(out, "Total: $1.515 over 2 report(s)") || !strings.Contains(out, "- 2026-10-02T10:00:00Z Coder m-1: $0.015, 1000 in / 200 out (use1)") {
		t.Errorf("show: %q", out)
	}
	out, _, _ = run(t, "tasks", "get", "t1")
	if !strings.Contains(out, "Usage: $1.515 over 2 report(s)") {
		t.Errorf("get: %q", out)
	}
}

func TestReportsUsageBreaksSpendDown(t *testing.T) {
	f := serveUsage(t)
	t.Setenv("TASKER_ORG_ID", "o-env")
	out, errw, code := run(t, "reports", "usage", "--days", "2")
	if code != exitOK {
		t.Fatalf("exit %d: %s", code, errw)
	}
	if f.usage.GetOrgId() != "o-env" || f.usage.GetDays() != 2 || f.usage.ProjectId != nil {
		t.Errorf("request %+v", f.usage)
	}
	for _, want := range []string{"Since 2026-10-01T00:00:00.000Z: $1.515", "By agent:", "Coder", "$1.50", "People", "By project:", "Alpha", "2026-10-02       $1.515  2 report(s)"} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in %q", want, out)
		}
	}
	if strings.Contains(out, "2026-10-01 ") {
		t.Errorf("empty days are left out of the text view: %q", out)
	}
	resetAllFlags(t)
	run(t, "reports", "usage", "--project", "p1")
	if f.usage.OrgId != nil || f.usage.GetProjectId() != "p1" || f.usage.GetDays() != 30 {
		t.Errorf("a project needs no org: %+v", f.usage)
	}
	f = serveUsage(t)
	if _, _, code := run(t, "reports", "usage", "--days", "0"); code != exitInvalid || f.calls != 0 {
		t.Errorf("--days 0: exit %d calls %d", code, f.calls)
	}
}
