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

type fakeWorkflows struct {
	v1connect.UnimplementedWorkflowServiceHandler
	created *healthv1.CreateWorkflowTemplateRequest
	updated *healthv1.UpdateWorkflowTemplateRequest
	started *healthv1.InstantiateWorkflowRequest
	listed  *healthv1.ListWorkflowTemplatesRequest
	calls   int
}

var sampleTemplate = &healthv1.WorkflowTemplate{Id: "wft1", OrgId: "o1", Name: "Release", Description: "Cut a release", Steps: []*healthv1.WorkflowStep{
	{Key: "build", Title: "Build", Priority: 2},
	{Key: "ship", Title: "Ship", DependsOn: []string{"build"}},
}}

func (f *fakeWorkflows) CreateWorkflowTemplate(_ context.Context, r *connect.Request[healthv1.CreateWorkflowTemplateRequest]) (*connect.Response[healthv1.CreateWorkflowTemplateResponse], error) {
	f.calls++
	f.created = r.Msg
	return connect.NewResponse(&healthv1.CreateWorkflowTemplateResponse{Template: &healthv1.WorkflowTemplate{Id: "wft2", OrgId: r.Msg.OrgId, Name: r.Msg.Name, Description: r.Msg.GetDescription(), Steps: r.Msg.Steps}}), nil
}
func (f *fakeWorkflows) UpdateWorkflowTemplate(_ context.Context, r *connect.Request[healthv1.UpdateWorkflowTemplateRequest]) (*connect.Response[healthv1.UpdateWorkflowTemplateResponse], error) {
	f.calls++
	f.updated = r.Msg
	return connect.NewResponse(&healthv1.UpdateWorkflowTemplateResponse{Template: &healthv1.WorkflowTemplate{Id: r.Msg.Id, Name: r.Msg.Name, Steps: r.Msg.Steps}}), nil
}
func (f *fakeWorkflows) GetWorkflowTemplate(context.Context, *connect.Request[healthv1.GetWorkflowTemplateRequest]) (*connect.Response[healthv1.GetWorkflowTemplateResponse], error) {
	f.calls++
	return connect.NewResponse(&healthv1.GetWorkflowTemplateResponse{Template: sampleTemplate}), nil
}
func (f *fakeWorkflows) ListWorkflowTemplates(_ context.Context, r *connect.Request[healthv1.ListWorkflowTemplatesRequest]) (*connect.Response[healthv1.ListWorkflowTemplatesResponse], error) {
	f.calls++
	f.listed = r.Msg
	return connect.NewResponse(&healthv1.ListWorkflowTemplatesResponse{Templates: []*healthv1.WorkflowTemplate{sampleTemplate}, Page: &healthv1.PageResponse{}}), nil
}
func (f *fakeWorkflows) DeleteWorkflowTemplate(context.Context, *connect.Request[healthv1.DeleteWorkflowTemplateRequest]) (*connect.Response[healthv1.DeleteWorkflowTemplateResponse], error) {
	f.calls++
	return connect.NewResponse(&healthv1.DeleteWorkflowTemplateResponse{Success: true}), nil
}
func (f *fakeWorkflows) InstantiateWorkflow(_ context.Context, r *connect.Request[healthv1.InstantiateWorkflowRequest]) (*connect.Response[healthv1.InstantiateWorkflowResponse], error) {
	f.calls++
	f.started = r.Msg
	return connect.NewResponse(&healthv1.InstantiateWorkflowResponse{
		Parent: &healthv1.Task{Id: "t0", DisplayId: "P-1", Title: r.Msg.GetTitle(), Status: "todo"},
		Steps: []*healthv1.Task{
			{Id: "t1", DisplayId: "P-2", Title: "Build", Status: "todo", Priority: 2},
			{Id: "t2", DisplayId: "P-3", Title: "Ship", Status: "todo", BlockedByOpenCount: 1},
		},
	}), nil
}

func serveWorkflows(t *testing.T) *fakeWorkflows {
	t.Helper()
	resetAllFlags(t)
	f := &fakeWorkflows{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewWorkflowServiceHandler(f))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Setenv("TASKER_ORG_ID", "o-env")
	t.Setenv("TASKER_PROJECT_ID", "")
	return f
}

func TestParseStepFlag(t *testing.T) {
	s, err := parseStepFlag("ship: Ship it :test, notes")
	if err != nil || s.Key != "ship" || s.Title != "Ship it" || strings.Join(s.DependsOn, ",") != "test,notes" {
		t.Errorf("got %+v %v", s, err)
	}
	if s, _ := parseStepFlag("build:Build: the thing"); s.Title != "Build" || strings.Join(s.DependsOn, ",") != "the thing" {
		t.Errorf("a third part is dependencies: %+v", s)
	}
	for _, bad := range []string{"nocolon", ":title", "key:"} {
		if _, err := parseStepFlag(bad); err == nil {
			t.Errorf("%q must fail", bad)
		}
	}
}

func TestWorkflowsCreateFromFlagsAndFile(t *testing.T) {
	f := serveWorkflows(t)
	out, errw, code := run(t, "workflows", "create", "--name", "Release", "--step", "build:Build", "--step", "ship:Ship:build")
	if code != exitOK {
		t.Fatalf("exit %d: %s", code, errw)
	}
	if f.created.OrgId != "o-env" || len(f.created.Steps) != 2 || f.created.Steps[1].DependsOn[0] != "build" {
		t.Errorf("request %+v", f.created)
	}
	if !strings.Contains(out, "Release (id: wft2, organization, 2 steps)") || !strings.Contains(out, "- ship: Ship after build") {
		t.Errorf("output %q", out)
	}
	path := filepath.Join(t.TempDir(), "wf.json")
	body := `{"name":"Onboard","description":"New customer","steps":[{"key":"a","title":"Account","priority":1},{"key":"b","title":"Kickoff","dependsOn":["a"],"taskTypeId":"tt1","status":"queued"}]}`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	f = serveWorkflows(t)
	run(t, "workflows", "create", "--file", path, "--project", "p1")
	if f.created.Name != "Onboard" || f.created.GetDescription() != "New customer" || f.created.GetProjectId() != "p1" ||
		f.created.Steps[0].Priority != 1 || f.created.Steps[1].GetTaskTypeId() != "tt1" || f.created.Steps[1].GetStatus() != "queued" {
		t.Errorf("file request %+v", f.created)
	}
	arr := filepath.Join(t.TempDir(), "steps.json")
	_ = os.WriteFile(arr, []byte(`[{"key":"x","title":"X"}]`), 0o600)
	f = serveWorkflows(t)
	run(t, "workflows", "create", "--name", "Arr", "--file", arr)
	if len(f.created.Steps) != 1 || f.created.Steps[0].Key != "x" {
		t.Errorf("array file %+v", f.created)
	}
	bad := filepath.Join(t.TempDir(), "bad.json")
	_ = os.WriteFile(bad, []byte(`{nope`), 0o600)
	for _, args := range [][]string{
		{"workflows", "create", "--step", "a:A"},
		{"workflows", "create", "--name", "N"},
		{"workflows", "create", "--name", "N", "--step", "bad"},
		{"workflows", "create", "--name", "N", "--file", bad},
		{"workflows", "create", "--name", "N", "--file", arr, "--step", "a:A"},
	} {
		f = serveWorkflows(t)
		if _, _, code := run(t, args...); code != exitInvalid || f.calls != 0 {
			t.Errorf("%v: exit %d, calls %d", args, code, f.calls)
		}
	}
}

func TestWorkflowsListGetUpdateDeleteStart(t *testing.T) {
	f := serveWorkflows(t)
	out, _, _ := run(t, "workflows", "list", "--project", "p1")
	if f.listed.GetProjectId() != "p1" || f.listed.OrgId != nil || !strings.Contains(out, "- Release (id: wft1, 2 steps)") {
		t.Errorf("list %+v %q", f.listed, out)
	}
	out, _, _ = run(t, "workflows", "get", "wft1")
	if !strings.Contains(out, "  Cut a release") || !strings.Contains(out, "- build: Build {high}") {
		t.Errorf("get %q", out)
	}
	f = serveWorkflows(t)
	run(t, "workflows", "update", "wft1", "--name", "Release v2")
	if f.updated.Name != "Release v2" || f.updated.GetDescription() != "Cut a release" || len(f.updated.Steps) != 2 {
		t.Errorf("update keeps what it was not given: %+v", f.updated)
	}
	if out, _, _ := run(t, "workflows", "delete", "wft1"); !strings.Contains(out, "Workflow template wft1 deleted") {
		t.Errorf("delete %q", out)
	}
	f = serveWorkflows(t)
	t.Setenv("TASKER_PROJECT_ID", "p-env")
	out, _, code := run(t, "workflows", "start", "wft1", "--title", "Release 4.2", "--idempotency-key", "k")
	if code != exitOK || f.started.ProjectId != "p-env" || f.started.GetTitle() != "Release 4.2" || f.started.GetIdempotencyKey() != "k" {
		t.Errorf("start exit %d %+v", code, f.started)
	}
	if !strings.Contains(out, "Started P-1 [todo]: Release 4.2") || !strings.Contains(out, "  - P-3 [todo]: Ship {blocked by 1}") {
		t.Errorf("start output %q", out)
	}
	f = serveWorkflows(t)
	if _, _, code := run(t, "workflows", "start", "wft1"); code != exitInvalid || f.calls != 0 {
		t.Errorf("start without a project: exit %d calls %d", code, f.calls)
	}
}
