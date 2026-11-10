package cmd

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
)

func serveClaimCorrelation(t *testing.T, register func(*http.ServeMux)) {
	t.Helper()
	resetAllFlags(t)
	mux := http.NewServeMux()
	register(mux)
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	t.Setenv("TASKER_BACKEND_URL", server.URL)
	t.Setenv("TASKER_TOKEN", "fixture-token")
	rootCmd.AddCommand(tasksCmd, artifactsCmd)
}

func correlationCommand(t *testing.T, args ...string) string {
	t.Helper()
	var output, errors bytes.Buffer
	if code := runCLI(args, &output, &errors); code != exitOK {
		t.Fatalf("command exit %d: %s", code, errors.String())
	}
	return output.String()
}

func TestClaimCorrelationNamedReceiptIsReachableWithoutJSON(t *testing.T) {
	fake := &fakeTaskClaimHandler{attempt: &healthv1.TaskAttempt{Id: "ta-1"}}
	serveClaimCorrelation(t, func(mux *http.ServeMux) { mux.Handle(v1connect.NewTaskServiceHandler(fake)) })
	if output := correlationCommand(t, "tasks", "claim", "task-1"); !strings.Contains(output, "Claim receipt: ta-1") {
		t.Fatal("claim receipt is missing from the human-readable result")
	}
}

func TestClaimCorrelationNextReceiptIsReachableWithoutJSON(t *testing.T) {
	fake := &fakeQueue{attempt: &healthv1.TaskAttempt{Id: "ta-1"}}
	serveClaimCorrelation(t, func(mux *http.ServeMux) { mux.Handle(v1connect.NewTaskServiceHandler(fake)) })
	if output := correlationCommand(t, "tasks", "claim-next", "--project", "p1"); !strings.Contains(output, "Claim receipt: ta-1") {
		t.Fatal("next-claim receipt is missing from the human-readable result")
	}
}

func TestClaimCorrelationNamedClaim(t *testing.T) {
	fake := &fakeTaskClaimHandler{}
	serveClaimCorrelation(t, func(mux *http.ServeMux) { mux.Handle(v1connect.NewTaskServiceHandler(fake)) })
	correlationCommand(t, "tasks", "claim", "task-1", "--external-run-id", "run-42")
	if fake.gotReq.GetExternalRunId() != "run-42" {
		t.Fatal("external correlation did not reach the RPC")
	}
	resetAllFlags(t)
	correlationCommand(t, "tasks", "claim", "task-1")
	if fake.gotReq.ExternalRunId != nil {
		t.Fatal("legacy claim unexpectedly sends correlation")
	}
}

func TestClaimCorrelationNextClaim(t *testing.T) {
	fake := &fakeQueue{}
	serveClaimCorrelation(t, func(mux *http.ServeMux) { mux.Handle(v1connect.NewTaskServiceHandler(fake)) })
	correlationCommand(t, "tasks", "claim-next", "--project", "p1", "--external-run-id", "run-42")
	if fake.claimNext.GetExternalRunId() != "run-42" {
		t.Fatal("external correlation did not reach the next-claim RPC")
	}
	resetAllFlags(t)
	correlationCommand(t, "tasks", "claim-next", "--project", "p1")
	if fake.claimNext.ExternalRunId != nil {
		t.Fatal("legacy next-claim unexpectedly sends correlation")
	}
}

func TestClaimCorrelationRelease(t *testing.T) {
	fake := &fakeQueue{}
	serveClaimCorrelation(t, func(mux *http.ServeMux) { mux.Handle(v1connect.NewTaskServiceHandler(fake)) })
	correlationCommand(t, "tasks", "release", "task-1", "--expected-attempt-id", "ta-1")
	if fake.release.GetExpectedAttemptId() != "ta-1" {
		t.Fatal("generation fence did not reach the release RPC")
	}
	resetAllFlags(t)
	correlationCommand(t, "tasks", "release", "task-1")
	if fake.release.ExpectedAttemptId != nil {
		t.Fatal("legacy release unexpectedly sends a generation fence")
	}
}

func TestClaimCorrelationNote(t *testing.T) {
	fake := &fakeTaskNoteHandler{}
	serveClaimCorrelation(t, func(mux *http.ServeMux) { mux.Handle(v1connect.NewTaskNoteServiceHandler(fake)) })
	correlationCommand(t, "tasks", "note-add", "task-1", "--content", "Result", "--attempt-id", "ta-1")
	if fake.gotCreateReq.GetAttemptId() != "ta-1" {
		t.Fatal("receipt did not reach the note RPC")
	}
	resetAllFlags(t)
	correlationCommand(t, "tasks", "note-add", "task-1", "--content", "Legacy result")
	if fake.gotCreateReq.AttemptId != nil {
		t.Fatal("legacy note unexpectedly sends a receipt")
	}
}

func TestClaimCorrelationUsage(t *testing.T) {
	fake := &fakeUsage{}
	serveClaimCorrelation(t, func(mux *http.ServeMux) { mux.Handle(v1connect.NewTaskServiceHandler(fake)) })
	correlationCommand(t, "tasks", "usage", "report", "task-1", "--input-tokens", "1", "--attempt-id", "ta-1")
	if fake.report.GetAttemptId() != "ta-1" {
		t.Fatal("receipt did not reach the usage RPC")
	}
	resetAllFlags(t)
	correlationCommand(t, "tasks", "usage", "report", "task-1", "--input-tokens", "1")
	if fake.report.AttemptId != nil {
		t.Fatal("legacy usage unexpectedly sends a receipt")
	}
}

func TestClaimCorrelationArtifact(t *testing.T) {
	fake := &fakeArtifactHandler{}
	serveClaimCorrelation(t, func(mux *http.ServeMux) { mux.Handle(v1connect.NewArtifactServiceHandler(fake)) })
	correlationCommand(t, "artifacts", "link-task", "--task", "task-1", "--artifact", "artifact-1", "--attempt-id", "ta-1")
	if fake.gotLinkRequest.GetAttemptId() != "ta-1" {
		t.Fatal("receipt did not reach the artifact-link RPC")
	}
	resetAllFlags(t)
	correlationCommand(t, "artifacts", "link-task", "--task", "task-1", "--artifact", "artifact-1")
	if fake.gotLinkRequest.AttemptId != nil {
		t.Fatal("legacy artifact link unexpectedly sends a receipt")
	}
}
