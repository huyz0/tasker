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

type fakeApprovals struct {
	v1connect.UnimplementedTaskServiceHandler
	decide *healthv1.DecideTransitionApprovalRequest
	list   *healthv1.ListTransitionApprovalsRequest
	held   bool
}

var sampleApproval = &healthv1.TransitionApproval{Id: "apr1", TaskId: "t1", TaskDisplayId: "T-1", FromStatus: "review", ToStatus: "done", Status: "pending", RequestedByName: "Shipper"}

func (f *fakeApprovals) UpdateTaskStatus(_ context.Context, r *connect.Request[healthv1.UpdateTaskStatusRequest]) (*connect.Response[healthv1.UpdateTaskStatusResponse], error) {
	res := &healthv1.UpdateTaskStatusResponse{Task: &healthv1.Task{Id: r.Msg.TaskId, Status: r.Msg.Status}}
	if f.held {
		res.Task.Status = "review"
		res.PendingApproval = sampleApproval
	}
	return connect.NewResponse(res), nil
}
func (f *fakeApprovals) GetTask(_ context.Context, r *connect.Request[healthv1.GetTaskRequest]) (*connect.Response[healthv1.GetTaskResponse], error) {
	return connect.NewResponse(&healthv1.GetTaskResponse{Task: &healthv1.Task{Id: r.Msg.TaskId, DisplayId: "T-1", Title: "Release", Status: "review", PendingApprovalCount: 1}}), nil
}
func (f *fakeApprovals) DecideTransitionApproval(_ context.Context, r *connect.Request[healthv1.DecideTransitionApprovalRequest]) (*connect.Response[healthv1.DecideTransitionApprovalResponse], error) {
	f.decide = r.Msg
	a := &healthv1.TransitionApproval{Id: r.Msg.Id, TaskDisplayId: "T-1", FromStatus: "review", ToStatus: "done", RequestedByName: "Shipper", Status: "approved", DecidedByName: strPtr("Ada"), Reason: r.Msg.Reason}
	if !r.Msg.Approve {
		a.Status = "rejected"
	}
	return connect.NewResponse(&healthv1.DecideTransitionApprovalResponse{Approval: a}), nil
}
func (f *fakeApprovals) GetTransitionApproval(context.Context, *connect.Request[healthv1.GetTransitionApprovalRequest]) (*connect.Response[healthv1.GetTransitionApprovalResponse], error) {
	return connect.NewResponse(&healthv1.GetTransitionApprovalResponse{Approval: sampleApproval}), nil
}
func (f *fakeApprovals) ListTransitionApprovals(_ context.Context, r *connect.Request[healthv1.ListTransitionApprovalsRequest]) (*connect.Response[healthv1.ListTransitionApprovalsResponse], error) {
	f.list = r.Msg
	return connect.NewResponse(&healthv1.ListTransitionApprovalsResponse{Approvals: []*healthv1.TransitionApproval{sampleApproval}, Page: &healthv1.PageResponse{}}), nil
}

func serveApprovals(t *testing.T) *fakeApprovals {
	t.Helper()
	resetAllFlags(t)
	f := &fakeApprovals{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTaskServiceHandler(f))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Setenv("TASKER_ORG_ID", "")
	rootCmd.AddCommand(tasksCmd)
	return f
}

func TestUpdateStatusSaysWhenTheMoveIsHeldForApproval(t *testing.T) {
	f := serveApprovals(t)
	out, _, code := run(t, "tasks", "update-status", "t1", "--status", "done")
	if code != exitOK || !strings.Contains(out, "status updated to done") {
		t.Errorf("direct move: exit %d %q", code, out)
	}
	f.held = true
	resetAllFlags(t)
	out, _, code = run(t, "tasks", "update-status", "t1", "--status", "done")
	if code != exitOK || !strings.Contains(out, "Task t1 stays review - moving it to done needs a person's approval (request apr1") {
		t.Errorf("held move: exit %d %q", code, out)
	}
	out, _, _ = run(t, "tasks", "get", "t1")
	if !strings.Contains(out, "1 status change(s) to approve - `tasker tasks approvals --task t1`") {
		t.Errorf("tasks get: %q", out)
	}
}

func TestApproveRejectShowAndListApprovals(t *testing.T) {
	f := serveApprovals(t)
	out, _, code := run(t, "tasks", "approve", "apr1")
	if code != exitOK || !f.decide.Approve || f.decide.Reason != nil || !strings.Contains(out, `apr1 [approved] Shipper asks to move T-1 from "review" to "done" - decided by Ada`) {
		t.Errorf("approve: exit %d %+v %q", code, f.decide, out)
	}
	resetAllFlags(t)
	out, _, _ = run(t, "tasks", "reject", "apr1", "--reason", "needs QA")
	if f.decide.Approve || f.decide.GetReason() != "needs QA" || !strings.Contains(out, `[rejected]`) || !strings.Contains(out, `: "needs QA"`) {
		t.Errorf("reject: %+v %q", f.decide, out)
	}
	if out, _, _ := run(t, "tasks", "approval", "apr1"); !strings.Contains(out, "apr1 [pending]") {
		t.Errorf("approval: %q", out)
	}
	t.Setenv("TASKER_ORG_ID", "o-env")
	out, _, _ = run(t, "tasks", "approvals")
	if f.list.GetOrgId() != "o-env" || f.list.TaskId != nil || !strings.HasPrefix(out, "- apr1 [pending]") {
		t.Errorf("approvals: %+v %q", f.list, out)
	}
	resetAllFlags(t)
	run(t, "tasks", "approvals", "--task", "t1", "--status", "all")
	if f.list.OrgId != nil || f.list.GetTaskId() != "t1" || f.list.GetStatus() != "all" {
		t.Errorf("a task filter must not add the default org: %+v", f.list)
	}
}
