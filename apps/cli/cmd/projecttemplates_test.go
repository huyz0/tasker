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

type fakeProjectTemplateHandler struct {
	v1connect.UnimplementedProjectTemplateServiceHandler
	gotListPage  *healthv1.PageRequest
	gotUpdateReq *healthv1.UpdateProjectTemplateRequest
}

func (f *fakeProjectTemplateHandler) CreateTemplate(
	_ context.Context,
	req *connect.Request[healthv1.CreateProjectTemplateRequest],
) (*connect.Response[healthv1.CreateProjectTemplateResponse], error) {
	return connect.NewResponse(&healthv1.CreateProjectTemplateResponse{
		Template: &healthv1.ProjectTemplate{
			Id:             "pt_1",
			OrgId:          req.Msg.OrgId,
			Name:           req.Msg.Name,
			Description:    req.Msg.Description,
			RootTaskTypeId: req.Msg.RootTaskTypeId,
		},
	}), nil
}

func (f *fakeProjectTemplateHandler) GetTemplate(
	_ context.Context,
	req *connect.Request[healthv1.GetProjectTemplateRequest],
) (*connect.Response[healthv1.GetProjectTemplateResponse], error) {
	rootTaskTypeID := "tt_root"
	return connect.NewResponse(&healthv1.GetProjectTemplateResponse{
		Template: &healthv1.ProjectTemplate{Id: req.Msg.Id, Name: "Template A", RootTaskTypeId: &rootTaskTypeID},
	}), nil
}

func (f *fakeProjectTemplateHandler) UpdateTemplate(
	_ context.Context,
	req *connect.Request[healthv1.UpdateProjectTemplateRequest],
) (*connect.Response[healthv1.UpdateProjectTemplateResponse], error) {
	f.gotUpdateReq = req.Msg
	template := &healthv1.ProjectTemplate{Id: req.Msg.Id, Name: "Original", Description: "orig desc"}
	if req.Msg.Name != nil {
		template.Name = *req.Msg.Name
	}
	if req.Msg.Description != nil {
		template.Description = *req.Msg.Description
	}
	if req.Msg.RootTaskTypeId != nil {
		template.RootTaskTypeId = req.Msg.RootTaskTypeId
	}
	return connect.NewResponse(&healthv1.UpdateProjectTemplateResponse{Template: template}), nil
}

func (f *fakeProjectTemplateHandler) ListTemplates(
	_ context.Context,
	req *connect.Request[healthv1.ListProjectTemplatesRequest],
) (*connect.Response[healthv1.ListProjectTemplatesResponse], error) {
	f.gotListPage = req.Msg.Page
	return connect.NewResponse(&healthv1.ListProjectTemplatesResponse{
		Templates: []*healthv1.ProjectTemplate{{Id: "pt_1", Name: "Template A", OrgId: req.Msg.OrgId}},
	}), nil
}

func withProjectTemplateServer(t *testing.T) *fakeProjectTemplateHandler {
	t.Helper()
	fake := &fakeProjectTemplateHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectTemplateServiceHandler(fake))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	return fake
}

func TestProjectTemplatesCreateCmd(t *testing.T) {
	withProjectTemplateServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"project-templates", "create", "--org", "org-1", "--name", "Template A", "--root-task-type", "tt_root"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Template A") || !strings.Contains(out, "pt_1") {
		t.Fatalf("expected output to contain the created template, got %s", out)
	}
}

func TestProjectTemplatesGetCmd(t *testing.T) {
	withProjectTemplateServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"project-templates", "get", "pt_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Template A") || !strings.Contains(out, "tt_root") {
		t.Fatalf("expected output to contain the template and its root task type, got %s", out)
	}
}

// M20-T08: UpdateTemplate existed fully on the wire and at the backend since
// before this milestone with no CLI command reaching it - this is that
// command.
func TestProjectTemplatesUpdateCmd(t *testing.T) {
	fake := withProjectTemplateServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"project-templates", "update", "pt_1", "--name", "Renamed"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if fake.gotUpdateReq == nil {
		t.Fatal("expected the backend to receive an UpdateTemplate request")
	}
	if fake.gotUpdateReq.Name == nil || *fake.gotUpdateReq.Name != "Renamed" {
		t.Errorf("expected name Renamed to be sent, got %v", fake.gotUpdateReq.Name)
	}
	// All three fields are real proto3 `optional` (M20-T03) - a flag that
	// wasn't passed must leave its pointer nil, not send a value that would
	// blank out the existing description/root task type.
	if fake.gotUpdateReq.Description != nil {
		t.Errorf("expected description to be left unset when --description was not passed, got %v", fake.gotUpdateReq.Description)
	}
	if fake.gotUpdateReq.RootTaskTypeId != nil {
		t.Errorf("expected rootTaskTypeId to be left unset when --root-task-type was not passed, got %v", fake.gotUpdateReq.RootTaskTypeId)
	}
	out := b.String()
	if !strings.Contains(out, "pt_1") {
		t.Fatalf("expected output to contain the updated template's id, got %s", out)
	}
}

func TestProjectTemplatesUpdateCmdCanClearDescriptionAndRootTaskType(t *testing.T) {
	fake := withProjectTemplateServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"project-templates", "update", "pt_1", "--description", "", "--root-task-type", ""})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if fake.gotUpdateReq == nil || fake.gotUpdateReq.Description == nil || *fake.gotUpdateReq.Description != "" {
		t.Fatalf("expected an explicit empty description to be sent, got %v", fake.gotUpdateReq.Description)
	}
	if fake.gotUpdateReq.RootTaskTypeId == nil || *fake.gotUpdateReq.RootTaskTypeId != "" {
		t.Fatalf("expected an explicit empty rootTaskTypeId to be sent, got %v", fake.gotUpdateReq.RootTaskTypeId)
	}
}

func TestProjectTemplatesListCmd(t *testing.T) {
	fake := withProjectTemplateServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"project-templates", "list", "--org", "org-1", "--cursor", "cursor-2", "--limit", "10"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Template A") {
		t.Fatalf("expected output to contain the listed template, got %s", out)
	}
	if fake.gotListPage == nil || fake.gotListPage.Cursor != "cursor-2" || fake.gotListPage.Limit != 10 {
		t.Fatalf("expected cursor/limit to be forwarded, got %+v", fake.gotListPage)
	}
}
