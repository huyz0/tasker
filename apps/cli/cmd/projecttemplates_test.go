package cmd

import (
	"bytes"
	"context"
	"errors"
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
	// M20-T10: every RPC below checks this first - a single fake server can
	// drive both the success-path tests and the Failed-to-* error-branch
	// ones, rather than a second handler type per RPC.
	err error
}

func (f *fakeProjectTemplateHandler) CreateTemplate(
	_ context.Context,
	req *connect.Request[healthv1.CreateProjectTemplateRequest],
) (*connect.Response[healthv1.CreateProjectTemplateResponse], error) {
	if f.err != nil {
		return nil, f.err
	}
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
	if f.err != nil {
		return nil, f.err
	}
	rootTaskTypeID := "tt_root"
	return connect.NewResponse(&healthv1.GetProjectTemplateResponse{
		Template: &healthv1.ProjectTemplate{Id: req.Msg.Id, Name: "Template A", RootTaskTypeId: &rootTaskTypeID},
	}), nil
}

func (f *fakeProjectTemplateHandler) UpdateTemplate(
	_ context.Context,
	req *connect.Request[healthv1.UpdateProjectTemplateRequest],
) (*connect.Response[healthv1.UpdateProjectTemplateResponse], error) {
	if f.err != nil {
		return nil, f.err
	}
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
	if f.err != nil {
		return nil, f.err
	}
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
	resetAllFlags(t)
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
	resetAllFlags(t)
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
// M20-T10: same fix as TestProjectsUpdateCommand - cmd.Flags().Changed(name)
// never resets itself once a flag has been set, and this same package-level
// projectTemplatesUpdateCmd is shared with
// TestProjectTemplatesUpdateCmdCanClearDescriptionAndRootTaskType, which
// sets both --description and --root-task-type. Without resetting Changed
// directly, this test's "still unset" assertions only passed by accident of
// declaration order.
func TestProjectTemplatesUpdateCmd(t *testing.T) {
	resetAllFlags(t)
	for _, name := range []string{"description", "root-task-type"} {
		if f := projectTemplatesUpdateCmd.Flags().Lookup(name); f != nil {
			f.Changed = false
		}
	}

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
	resetAllFlags(t)
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
	resetAllFlags(t)
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

// M20-T09: `projects list` already forwards --filter/--sort to the backend
// (which supports both on templates too, via the same executePaginatedQuery
// helper) - `project-templates list` never did.
func TestProjectTemplatesListCmdForwardsFilterAndSort(t *testing.T) {
	resetAllFlags(t)
	fake := withProjectTemplateServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"project-templates", "list", "--org", "org-1", "--filter", "Soft", "--sort", "name:desc"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if fake.gotListPage == nil || fake.gotListPage.Filter != "Soft" || fake.gotListPage.Sort != "name:desc" {
		t.Fatalf("expected filter/sort to be forwarded, got %+v", fake.gotListPage)
	}
}

// M20-T10: coverage backfill for the JSON-output, required-flag and
// backend-error branches below - --org/--name are checked locally the same
// way `projects create` checks --org/--template/--title.
func TestProjectTemplatesCreateCmdRequiresOrgAndName(t *testing.T) {
	resetAllFlags(t)
	withProjectTemplateServer(t)
	_ = projectTemplatesCreateCmd.Flags().Set("org", "")
	_ = projectTemplatesCreateCmd.Flags().Set("name", "")
	t.Cleanup(func() {
		_ = projectTemplatesCreateCmd.Flags().Set("org", "")
		_ = projectTemplatesCreateCmd.Flags().Set("name", "")
	})
	t.Setenv("TASKER_ORG_ID", "")

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"project-templates", "create"})
	err := rootCmd.Execute()

	if err == nil {
		t.Error("expected an error when --org and --name are omitted")
	}
	if !strings.Contains(b.String(), "--org and --name are required") {
		t.Errorf("expected the required-flag message, got: %s", b.String())
	}
}

func TestProjectTemplatesCreateCmdJSON(t *testing.T) {
	resetAllFlags(t)
	withProjectTemplateServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"project-templates", "create", "--org", "org-1", "--name", "Template A", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), `"id":"pt_1"`) {
		t.Fatalf("expected JSON template output, got %s", b.String())
	}
}

func TestProjectTemplatesCreateCmdReportsBackendError(t *testing.T) {
	resetAllFlags(t)
	fake := withProjectTemplateServer(t)
	fake.err = connect.NewError(connect.CodeAlreadyExists, errors.New("a template with this name already exists"))

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"project-templates", "create", "--org", "org-1", "--name", "Dup"})
	err := rootCmd.Execute()

	if err == nil {
		t.Fatal("expected the backend error to propagate")
	}
	if !strings.Contains(b.String(), "Failed to create project template") {
		t.Errorf("expected a failure message, got %s", b.String())
	}
}

func TestProjectTemplatesGetCmdJSON(t *testing.T) {
	resetAllFlags(t)
	withProjectTemplateServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"project-templates", "get", "pt_1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), `"id":"pt_1"`) {
		t.Fatalf("expected JSON template output, got %s", b.String())
	}
}

func TestProjectTemplatesGetCmdReportsBackendError(t *testing.T) {
	resetAllFlags(t)
	fake := withProjectTemplateServer(t)
	fake.err = connect.NewError(connect.CodeNotFound, errors.New("template not found"))

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"project-templates", "get", "pt_missing"})
	err := rootCmd.Execute()

	if err == nil {
		t.Fatal("expected the backend error to propagate")
	}
	if !strings.Contains(b.String(), "Failed to get project template") {
		t.Errorf("expected a failure message, got %s", b.String())
	}
}

func TestProjectTemplatesUpdateCmdJSON(t *testing.T) {
	resetAllFlags(t)
	withProjectTemplateServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"project-templates", "update", "pt_1", "--name", "Renamed", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), `"id":"pt_1"`) {
		t.Fatalf("expected JSON template output, got %s", b.String())
	}
}

func TestProjectTemplatesUpdateCmdReportsBackendError(t *testing.T) {
	resetAllFlags(t)
	fake := withProjectTemplateServer(t)
	fake.err = connect.NewError(connect.CodeNotFound, errors.New("template not found"))

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"project-templates", "update", "pt_missing", "--name", "X"})
	err := rootCmd.Execute()

	if err == nil {
		t.Fatal("expected the backend error to propagate")
	}
	if !strings.Contains(b.String(), "Failed to update project template") {
		t.Errorf("expected a failure message, got %s", b.String())
	}
}

// project-templates list has never required --org locally; it falls back to
// TASKER_ORG_ID and only then errors, same as `projects list`.
func TestProjectTemplatesListCmdRequiresOrg(t *testing.T) {
	resetAllFlags(t)
	withProjectTemplateServer(t)
	_ = projectTemplatesListCmd.Flags().Set("org", "")
	t.Cleanup(func() { _ = projectTemplatesListCmd.Flags().Set("org", "") })
	t.Setenv("TASKER_ORG_ID", "")

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"project-templates", "list"})
	err := rootCmd.Execute()

	if err == nil {
		t.Error("expected an error when --org is omitted and TASKER_ORG_ID is unset")
	}
	if !strings.Contains(b.String(), "--org is required") {
		t.Errorf("expected an --org-is-required message, got: %s", b.String())
	}
}

func TestProjectTemplatesListCmdJSON(t *testing.T) {
	resetAllFlags(t)
	withProjectTemplateServer(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"project-templates", "list", "--org", "org-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), `"id":"pt_1"`) {
		t.Fatalf("expected a JSON template listing, got %s", b.String())
	}
}

func TestProjectTemplatesListCmdReportsBackendError(t *testing.T) {
	resetAllFlags(t)
	fake := withProjectTemplateServer(t)
	fake.err = connect.NewError(connect.CodeInternal, errors.New("boom"))

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"project-templates", "list", "--org", "org-1"})
	err := rootCmd.Execute()

	if err == nil {
		t.Fatal("expected the backend error to propagate")
	}
	if !strings.Contains(b.String(), "Failed to list project templates") {
		t.Errorf("expected a failure message, got %s", b.String())
	}
}
