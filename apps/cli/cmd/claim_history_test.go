package cmd

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
	"google.golang.org/protobuf/proto"
)

type claimHistoryReader struct {
	v1connect.UnimplementedTaskServiceHandler
	history *healthv1.ListTaskAttemptsRequest
	usage   *healthv1.ListUsageRecordsRequest
}

func (f *claimHistoryReader) ListTaskAttempts(_ context.Context, req *connect.Request[healthv1.ListTaskAttemptsRequest]) (*connect.Response[healthv1.ListTaskAttemptsResponse], error) {
	f.history = req.Msg
	return connect.NewResponse(&healthv1.ListTaskAttemptsResponse{Attempts: []*healthv1.TaskAttempt{{Id: "ta-1", TaskId: req.Msg.TaskId,
		Owner:     &healthv1.EvidenceActor{Kind: "agent", Id: "agent-1", Name: "Worker\x1b[31m"},
		ClaimedAt: "2026-11-08T12:00:00Z", ExternalRunId: proto.String("pipeline\nsecond-line")}}, Page: &healthv1.PageResponse{TotalCount: 1}}), nil
}
func (f *claimHistoryReader) ListUsageRecords(_ context.Context, req *connect.Request[healthv1.ListUsageRecordsRequest]) (*connect.Response[healthv1.ListUsageRecordsResponse], error) {
	f.usage = req.Msg
	return connect.NewResponse(&healthv1.ListUsageRecordsResponse{Records: []*healthv1.UsageRecord{{Id: "usage-1", TaskId: req.Msg.TaskId}},
		Totals: &healthv1.UsageTotals{Reports: 3}, Page: &healthv1.PageResponse{TotalCount: 1}}), nil
}

type claimNotesReader struct {
	v1connect.UnimplementedTaskNoteServiceHandler
	request *healthv1.ListTaskNotesRequest
}

func (f *claimNotesReader) ListTaskNotes(_ context.Context, req *connect.Request[healthv1.ListTaskNotesRequest]) (*connect.Response[healthv1.ListTaskNotesResponse], error) {
	f.request = req.Msg
	return connect.NewResponse(&healthv1.ListTaskNotesResponse{Page: &healthv1.PageResponse{}}), nil
}

type claimArtifactsReader struct {
	v1connect.UnimplementedArtifactServiceHandler
	request *healthv1.ListTaskArtifactLinksRequest
}

func (f *claimArtifactsReader) ListTaskArtifactLinks(_ context.Context, req *connect.Request[healthv1.ListTaskArtifactLinksRequest]) (*connect.Response[healthv1.ListTaskArtifactLinksResponse], error) {
	f.request = req.Msg
	return connect.NewResponse(&healthv1.ListTaskArtifactLinksResponse{Page: &healthv1.PageResponse{}}), nil
}

func TestClaimHistoryReadsBoundedHistoryAndSafeOwnershipOutput(t *testing.T) {
	fake := &claimHistoryReader{}
	serveClaimCorrelation(t, func(mux *http.ServeMux) { mux.Handle(v1connect.NewTaskServiceHandler(fake)) })
	output := correlationCommand(t, "tasks", "attempts", "task-1", "--limit", "7", "--cursor", "next")
	if fake.history.GetPage().GetLimit() != 7 || fake.history.GetPage().GetCursor() != "next" {
		t.Fatal("history pagination did not reach the generated RPC")
	}
	if !strings.Contains(output, "ta-1") || !strings.Contains(output, "Ownership not recorded as ended") {
		t.Fatal("ownership facts are missing")
	}
	if strings.Contains(output, "\x1b") || strings.Contains(strings.ToLower(output), "running") {
		t.Fatal("untrusted terminal control or inferred runtime state in output")
	}
}
func TestClaimHistoryReadsNoteFilters(t *testing.T) {
	fake := &claimNotesReader{}
	serveClaimCorrelation(t, func(mux *http.ServeMux) { mux.Handle(v1connect.NewTaskNoteServiceHandler(fake)) })
	correlationCommand(t, "tasks", "notes", "task-1", "--attempt-id", "ta-1", "--limit", "7", "--cursor", "next", "--json")
	if fake.request.GetAttemptId() != "ta-1" || fake.request.GetPage().GetLimit() != 7 || fake.request.GetPage().GetCursor() != "next" {
		t.Fatal("note read filter/page missing")
	}
	resetAllFlags(t)
	correlationCommand(t, "tasks", "notes", "task-1", "--uncorrelated-only", "--json")
	if !fake.request.GetUncorrelatedOnly() || fake.request.AttemptId != nil {
		t.Fatal("ungrouped note filter missing")
	}
	resetAllFlags(t)
	correlationCommand(t, "tasks", "notes", "task-1", "--json")
	if fake.request.AttemptId != nil || fake.request.UncorrelatedOnly != nil {
		t.Fatal("legacy note correlation was invented")
	}
}
func TestClaimHistoryReadsUsageFiltersKeepTaskWideTotals(t *testing.T) {
	fake := &claimHistoryReader{}
	serveClaimCorrelation(t, func(mux *http.ServeMux) { mux.Handle(v1connect.NewTaskServiceHandler(fake)) })
	output := correlationCommand(t, "tasks", "usage", "show", "task-1", "--attempt-id", "ta-1")
	if fake.usage.GetAttemptId() != "ta-1" || !strings.Contains(output, "Task-wide total:") {
		t.Fatal("usage filter or truthful total label missing")
	}
	resetAllFlags(t)
	correlationCommand(t, "tasks", "usage", "show", "task-1", "--uncorrelated-only", "--json")
	if !fake.usage.GetUncorrelatedOnly() || fake.usage.AttemptId != nil {
		t.Fatal("ungrouped usage filter missing")
	}
	resetAllFlags(t)
	correlationCommand(t, "tasks", "usage", "show", "task-1", "--json")
	if fake.usage.AttemptId != nil || fake.usage.UncorrelatedOnly != nil {
		t.Fatal("legacy usage correlation was invented")
	}
}
func TestClaimHistoryReadsArtifactFiltersPreserveLegacyOmission(t *testing.T) {
	fake := &claimArtifactsReader{}
	serveClaimCorrelation(t, func(mux *http.ServeMux) { mux.Handle(v1connect.NewArtifactServiceHandler(fake)) })
	correlationCommand(t, "artifacts", "list-task-links", "--task", "task-1", "--attempt-id", "ta-1", "--limit", "7", "--cursor", "next", "--json")
	if fake.request.GetAttemptId() != "ta-1" || fake.request.GetPage().GetLimit() != 7 || fake.request.GetPage().GetCursor() != "next" {
		t.Fatal("artifact filter/page missing")
	}
	resetAllFlags(t)
	correlationCommand(t, "artifacts", "list-task-links", "--task", "task-1", "--uncorrelated-only", "--json")
	if !fake.request.GetUncorrelatedOnly() {
		t.Fatal("ungrouped artifact filter missing")
	}
	resetAllFlags(t)
	correlationCommand(t, "artifacts", "list-task-links", "--task", "task-1", "--json")
	if fake.request.AttemptId != nil || fake.request.UncorrelatedOnly != nil || fake.request.Page != nil {
		t.Fatal("legacy artifact request changed")
	}
}
