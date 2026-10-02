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

// fakeQueue serves the M33 work-queue RPCs and records what it was sent.
type fakeQueue struct {
	v1connect.UnimplementedTaskServiceHandler
	claimNext  *healthv1.ClaimNextTaskRequest
	release    *healthv1.ReleaseTaskRequest
	mine       *healthv1.ListMyTasksRequest
	empty      bool
	releaseErr error
}

func (f *fakeQueue) ClaimNextTask(_ context.Context, req *connect.Request[healthv1.ClaimNextTaskRequest]) (*connect.Response[healthv1.ClaimNextTaskResponse], error) {
	f.claimNext = req.Msg
	if f.empty {
		return connect.NewResponse(&healthv1.ClaimNextTaskResponse{}), nil
	}
	return connect.NewResponse(&healthv1.ClaimNextTaskResponse{
		Task:              &healthv1.Task{Id: "t1", DisplayId: "T-1", Title: "Fix it"},
		LatestHandoffNote: &healthv1.TaskNote{AgentId: "a0", AgentName: "Scout", Content: "tried X"},
	}), nil
}

func (f *fakeQueue) ReleaseTask(_ context.Context, req *connect.Request[healthv1.ReleaseTaskRequest]) (*connect.Response[healthv1.ReleaseTaskResponse], error) {
	f.release = req.Msg
	if f.releaseErr != nil {
		return nil, f.releaseErr
	}
	return connect.NewResponse(&healthv1.ReleaseTaskResponse{Success: true}), nil
}

func (f *fakeQueue) ListMyTasks(_ context.Context, req *connect.Request[healthv1.ListMyTasksRequest]) (*connect.Response[healthv1.ListMyTasksResponse], error) {
	f.mine = req.Msg
	return connect.NewResponse(&healthv1.ListMyTasksResponse{
		Tasks: []*healthv1.Task{{Id: "t1", DisplayId: "T-1", Title: "Mine", Status: "todo", ProjectId: "p2"}},
		Page:  &healthv1.PageResponse{},
	}), nil
}

func serveQueue(t *testing.T, f *fakeQueue) {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(f))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	rootCmd.AddCommand(tasksCmd)
}

func TestClaimNextSendsTheProjectAndShowsTheHandoff(t *testing.T) {
	resetAllFlags(t)
	f := &fakeQueue{}
	serveQueue(t, f)
	var out, errw bytes.Buffer
	if code := runCLI([]string{"tasks", "claim-next", "--project", "p1", "--type", "tt"}, &out, &errw); code != exitOK {
		t.Fatalf("exit %d: %s", code, errw.String())
	}
	if f.claimNext.ProjectId != "p1" || f.claimNext.GetTaskTypeId() != "tt" || f.claimNext.IdempotencyKey != nil {
		t.Errorf("unexpected request %+v", f.claimNext)
	}
	if !strings.Contains(out.String(), "Claimed T-1") || !strings.Contains(out.String(), "Handoff note (Scout): tried X") {
		t.Errorf("unexpected output %q", out.String())
	}
}

func TestClaimNextWithNothingToClaimIsQuietAndSucceeds(t *testing.T) {
	resetAllFlags(t)
	serveQueue(t, &fakeQueue{empty: true})
	var out, errw bytes.Buffer
	if code := runCLI([]string{"tasks", "claim-next", "--project", "p1"}, &out, &errw); code != exitOK {
		t.Fatalf("exit %d", code)
	}
	if out.Len() != 0 || !strings.Contains(errw.String(), "Nothing to claim") {
		t.Errorf("expected nothing on stdout and a note on stderr, got %q / %q", out.String(), errw.String())
	}
}

func TestReleaseSendsTheHandoffOnlyWhenGiven(t *testing.T) {
	resetAllFlags(t)
	f := &fakeQueue{}
	serveQueue(t, f)
	var out, errw bytes.Buffer
	runCLI([]string{"tasks", "release", "t1"}, &out, &errw)
	if f.release.HandoffNote != nil {
		t.Errorf("expected no handoff note, got %q", *f.release.HandoffNote)
	}
	resetAllFlags(t)
	runCLI([]string{"tasks", "release", "t1", "--handoff", "next: Z"}, &out, &errw)
	if f.release.GetHandoffNote() != "next: Z" {
		t.Errorf("expected the handoff note, got %+v", f.release)
	}
}

func TestReleasingAPersonsAssignmentExitsAsAnAuthFailure(t *testing.T) {
	resetAllFlags(t)
	serveQueue(t, &fakeQueue{releaseErr: connect.NewError(connect.CodePermissionDenied, errString("assigned by a person"))})
	var out, errw bytes.Buffer
	if code := runCLI([]string{"tasks", "release", "t1"}, &out, &errw); code != exitAuth {
		t.Errorf("expected exit %d, got %d", exitAuth, code)
	}
}

func TestMineListsAcrossProjectsAndPassesTheOrgOnlyWhenKnown(t *testing.T) {
	resetAllFlags(t)
	t.Setenv("TASKER_ORG_ID", "")
	f := &fakeQueue{}
	serveQueue(t, f)
	var out, errw bytes.Buffer
	runCLI([]string{"tasks", "mine"}, &out, &errw)
	if f.mine.OrgId != nil || f.mine.IncludeTerminal != nil {
		t.Errorf("an agent's request names no org and no flag: %+v", f.mine)
	}
	if !strings.Contains(out.String(), "T-1") || !strings.Contains(out.String(), "project: p2") {
		t.Errorf("unexpected output %q", out.String())
	}
	resetAllFlags(t)
	runCLI([]string{"tasks", "mine", "--org", "o1", "--include-done"}, &out, &errw)
	if f.mine.GetOrgId() != "o1" || !f.mine.GetIncludeTerminal() {
		t.Errorf("expected org and include-done, got %+v", f.mine)
	}
}

type fakeAgentAuth struct {
	v1connect.UnimplementedAuthServiceHandler
}

func (fakeAgentAuth) GetIdentity(_ context.Context, _ *connect.Request[healthv1.GetIdentityRequest]) (*connect.Response[healthv1.GetIdentityResponse], error) {
	return connect.NewResponse(&healthv1.GetIdentityResponse{
		Agent: &healthv1.AgentIdentity{Id: "a1", Name: "Scout", OrgId: "o1", Scopes: []string{"tasks:read", "tasks:write"}},
	}), nil
}

func TestWhoamiDescribesAnAgentToken(t *testing.T) {
	resetAllFlags(t)
	t.Setenv("TASKER_TOKEN", "tskr_agent")
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewAuthServiceHandler(fakeAgentAuth{}))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	var out, errw bytes.Buffer
	if code := runCLI([]string{"auth", "whoami"}, &out, &errw); code != exitOK {
		t.Fatalf("exit %d: %s", code, errw.String())
	}
	if !strings.Contains(out.String(), "Agent Scout (a1) in organization o1") || !strings.Contains(out.String(), "tasks:write") {
		t.Errorf("unexpected output %q", out.String())
	}
}
