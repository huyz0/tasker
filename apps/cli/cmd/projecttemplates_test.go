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
	gotListPage *healthv1.PageRequest
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
	return connect.NewResponse(&healthv1.GetProjectTemplateResponse{
		Template: &healthv1.ProjectTemplate{Id: req.Msg.Id, Name: "Template A", RootTaskTypeId: "tt_root"},
	}), nil
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
