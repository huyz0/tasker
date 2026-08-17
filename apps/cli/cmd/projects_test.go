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

// Maps to TC-007 from TEST-PLAN.md: CLI - Agent predictability via strict JSON
func TestProjectsCreateRejectsUnknownFlags(t *testing.T) {
	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)

	// Agent hallucinating an unknown flag `--extra-data`
	rootCmd.SetArgs([]string{"projects", "create", "--json", "--title", "foo", "--extra-data", "bad"})
	err := rootCmd.Execute()

	if err == nil {
		t.Errorf("Expected CLI to hard reject unknown flags for agent determinism, but command succeeded")
	}

	output := b.String()
	if !strings.Contains(output, "unknown flag: --extra-data") {
		t.Errorf("Expected rejection due to unknown flag, got output: %s", output)
	}
}

type fakeProjectListHandler struct {
	v1connect.UnimplementedProjectServiceHandler
	gotPage        *healthv1.PageRequest
	gotOnlyDeleted bool
}

func (f *fakeProjectListHandler) ListProjects(
	_ context.Context,
	req *connect.Request[healthv1.ListProjectsRequest],
) (*connect.Response[healthv1.ListProjectsResponse], error) {
	f.gotPage = req.Msg.Page
	f.gotOnlyDeleted = req.Msg.OnlyDeleted
	return connect.NewResponse(&healthv1.ListProjectsResponse{}), nil
}

func TestProjectsListCmdForwardsCursorAndLimit(t *testing.T) {
	fake := &fakeProjectListHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"projects", "list", "--org", "org-1", "--cursor", "cursor-2", "--limit", "10", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("projects list failed: %v", err)
	}

	if fake.gotPage == nil {
		t.Fatal("expected a Page to be sent")
	}
	if fake.gotPage.Cursor != "cursor-2" {
		t.Errorf("expected cursor to be forwarded, got %q", fake.gotPage.Cursor)
	}
	if fake.gotPage.Limit != 10 {
		t.Errorf("expected limit to be forwarded, got %d", fake.gotPage.Limit)
	}
}

// M20-T09: Projects has a full delete/restore/purge bin lifecycle, same as
// Tasks and Artifacts, but --only-deleted was never wired up here despite
// existing on both the wire and the backend since M20-T01.
func TestProjectsListCmdForwardsOnlyDeleted(t *testing.T) {
	fake := &fakeProjectListHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"projects", "list", "--org", "org-1", "--only-deleted", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("projects list failed: %v", err)
	}

	if !fake.gotOnlyDeleted {
		t.Error("expected onlyDeleted to be forwarded as true")
	}
}

type fakeProjectUpdateHandler struct {
	v1connect.UnimplementedProjectServiceHandler
	gotReq *healthv1.UpdateProjectRequest
}

func (f *fakeProjectUpdateHandler) UpdateProject(
	_ context.Context,
	req *connect.Request[healthv1.UpdateProjectRequest],
) (*connect.Response[healthv1.UpdateProjectResponse], error) {
	f.gotReq = req.Msg
	project := &healthv1.Project{Id: req.Msg.ProjectId, Name: req.Msg.Name}
	if req.Msg.Description != nil {
		project.Description = req.Msg.Description
	}
	return connect.NewResponse(&healthv1.UpdateProjectResponse{Project: project}), nil
}

// M20-T08: UpdateProject/UpdateTemplate existed fully on the wire and at the
// backend since before this milestone with no CLI command reaching either -
// these are that command.
// M20-T10: cmd.Flags().Changed(name) never resets itself once a flag has
// been set - Set()/Cleanup() can put the *value* back to "", but Changed
// stays true forever after, for the lifetime of this package-level command
// singleton. Every other test in this file that sets --description on this
// same projectsUpdateCmd (e.g. TestProjectsUpdateCommandCanClearDescription)
// leaves Changed("description") permanently true, which made this test's
// "still unset" assertion below pass only by accident of declaration order -
// go test -shuffle=on reorders tests and reliably breaks it. Resetting the
// underlying pflag.Flag.Changed field directly (the one thing Set() can't
// touch) is what actually makes this order-independent.
func TestProjectsUpdateCommand(t *testing.T) {
	if f := projectsUpdateCmd.Flags().Lookup("description"); f != nil {
		f.Changed = false
	}

	fake := &fakeProjectUpdateHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"projects", "update", "proj-1", "--title", "Renamed", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("projects update failed: %v", err)
	}

	if fake.gotReq == nil {
		t.Fatal("expected the backend to receive an UpdateProject request")
	}
	if fake.gotReq.Name != "Renamed" {
		t.Errorf("expected title Renamed to be sent, got %q", fake.gotReq.Name)
	}
	// Description is real proto3 `optional` (M20-T03) - an unset
	// --description must leave the request's Description pointer nil, not
	// silently send an empty string that would clear it.
	if fake.gotReq.Description != nil {
		t.Errorf("expected description to be left unset when --description was not passed, got %v", fake.gotReq.Description)
	}
	if !strings.Contains(b.String(), "proj-1") {
		t.Errorf("expected output to contain the updated project's id, got %s", b.String())
	}
}

func TestProjectsUpdateCommandCanClearDescription(t *testing.T) {
	fake := &fakeProjectUpdateHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"projects", "update", "proj-1", "--title", "Renamed", "--description", "", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("projects update failed: %v", err)
	}

	if fake.gotReq == nil || fake.gotReq.Description == nil || *fake.gotReq.Description != "" {
		t.Fatalf("expected an explicit empty description to be sent, got %v", fake.gotReq.Description)
	}
}

// UpdateProjectRequest.Name is a required wire field, unlike Description -
// there is no "leave it untouched" request shape, so the CLI has to refuse
// locally rather than send an empty title through.
func TestProjectsUpdateCommandRequiresTitle(t *testing.T) {
	// projectsUpdateCmd is a package-level singleton shared across every test
	// in this file - an earlier test's --title value persists as the flag's
	// current value until explicitly reset, which would otherwise mask this
	// exact validation path (M20-T10's documented flag-leak gotcha).
	_ = projectsUpdateCmd.Flags().Set("title", "")
	t.Cleanup(func() { _ = projectsUpdateCmd.Flags().Set("title", "") })

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"projects", "update", "proj-1"})
	err := rootCmd.Execute()

	if err == nil {
		t.Error("expected an error when --title is omitted")
	}
	if !strings.Contains(b.String(), "--title is required") {
		t.Errorf("expected a --title-is-required message, got: %s", b.String())
	}
}

type fakeProjectCreateHandler struct {
	v1connect.UnimplementedProjectServiceHandler
	gotReq *healthv1.CreateProjectRequest
}

func (f *fakeProjectCreateHandler) CreateProject(
	_ context.Context,
	req *connect.Request[healthv1.CreateProjectRequest],
) (*connect.Response[healthv1.CreateProjectResponse], error) {
	f.gotReq = req.Msg
	return connect.NewResponse(&healthv1.CreateProjectResponse{
		Project: &healthv1.Project{Id: "proj-new", Key: "PRJ", Name: req.Msg.Name},
	}), nil
}

// M20-T09: ownerId is a required field at the backend (CreateProjectSchema,
// min 1) - an omitted --owner used to reach the server anyway and come back
// as an opaque remote validation error instead of a clear local one.
func TestProjectsCreateCommandRequiresOwner(t *testing.T) {
	// projectsCreateCmd is a package-level singleton shared across every test
	// in this file - reset every flag this test cares about so an earlier
	// test's value can't mask the validation path under test.
	_ = projectsCreateCmd.Flags().Set("owner", "")
	t.Cleanup(func() { _ = projectsCreateCmd.Flags().Set("owner", "") })

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"projects", "create", "--org", "org-1", "--template", "tpl-1", "--title", "New Project"})
	err := rootCmd.Execute()

	if err == nil {
		t.Error("expected an error when --owner is omitted")
	}
	if !strings.Contains(b.String(), "--owner") {
		t.Errorf("expected an --owner-is-required message, got: %s", b.String())
	}
}

func TestProjectsCreateCommandForwardsDescription(t *testing.T) {
	fake := &fakeProjectCreateHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{
		"projects", "create", "--org", "org-1", "--template", "tpl-1",
		"--title", "New Project", "--owner", "user-1", "--description", "what this is for", "--json",
	})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("projects create failed: %v", err)
	}

	if fake.gotReq == nil || fake.gotReq.Description == nil || *fake.gotReq.Description != "what this is for" {
		t.Fatalf("expected the description to be forwarded, got %v", fake.gotReq)
	}
}

type fakeProjectBinLifecycleHandler struct {
	v1connect.UnimplementedProjectServiceHandler
	gotArchiveID string
	gotRestoreID string
	gotPurgeID   string
}

func (f *fakeProjectBinLifecycleHandler) ArchiveProject(
	_ context.Context,
	req *connect.Request[healthv1.ArchiveProjectRequest],
) (*connect.Response[healthv1.ArchiveProjectResponse], error) {
	f.gotArchiveID = req.Msg.ProjectId
	return connect.NewResponse(&healthv1.ArchiveProjectResponse{Success: true}), nil
}

func (f *fakeProjectBinLifecycleHandler) RestoreProject(
	_ context.Context,
	req *connect.Request[healthv1.RestoreProjectRequest],
) (*connect.Response[healthv1.RestoreProjectResponse], error) {
	f.gotRestoreID = req.Msg.ProjectId
	return connect.NewResponse(&healthv1.RestoreProjectResponse{Success: true}), nil
}

func (f *fakeProjectBinLifecycleHandler) PurgeProject(
	_ context.Context,
	req *connect.Request[healthv1.PurgeProjectRequest],
) (*connect.Response[healthv1.PurgeProjectResponse], error) {
	f.gotPurgeID = req.Msg.ProjectId
	return connect.NewResponse(&healthv1.PurgeProjectResponse{Success: true}), nil
}

// M20-T09: delete/restore/purge each carry a Success bool on the wire but
// ignored --json entirely, unlike every other mutating project command -
// an agent scripting against --json got human-readable text back instead.
func TestProjectsDeleteRestorePurgeJSONParity(t *testing.T) {
	fake := &fakeProjectBinLifecycleHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)

	cases := []struct {
		args   []string
		wantID *string
	}{
		{[]string{"projects", "delete", "proj-1", "--json"}, &fake.gotArchiveID},
		{[]string{"projects", "restore", "proj-1", "--json"}, &fake.gotRestoreID},
		{[]string{"projects", "purge", "proj-1", "--json"}, &fake.gotPurgeID},
	}
	for _, tc := range cases {
		b := bytes.NewBufferString("")
		rootCmd.SetOut(b)
		rootCmd.SetArgs(tc.args)
		if err := rootCmd.Execute(); err != nil {
			t.Fatalf("%v failed: %v", tc.args, err)
		}
		out := b.String()
		if !strings.Contains(out, `"success":true`) || !strings.Contains(out, `"projectId":"proj-1"`) {
			t.Errorf("%v: expected JSON success/projectId output, got %s", tc.args, out)
		}
		if *tc.wantID != "proj-1" {
			t.Errorf("%v: expected proj-1 to reach the backend, got %q", tc.args, *tc.wantID)
		}
	}
}

// M20-T10: coverage backfill. `--json` is a rootCmd persistent flag, so
// whichever test in this file runs last leaves its value sitting there for
// every test that runs after it in the whole `cmd` package binary - the
// human-readable-output assertions below explicitly reset it to false first
// rather than relying on file/test execution order to have left it that way
// (the documented flag-leak gotcha this milestone is closing here).

type fakeProjectGetHandler struct {
	v1connect.UnimplementedProjectServiceHandler
	project *healthv1.Project
	err     error
}

func (f *fakeProjectGetHandler) GetProject(
	_ context.Context,
	_ *connect.Request[healthv1.GetProjectRequest],
) (*connect.Response[healthv1.GetProjectResponse], error) {
	if f.err != nil {
		return nil, f.err
	}
	return connect.NewResponse(&healthv1.GetProjectResponse{Project: f.project}), nil
}

func TestProjectsGetCmd(t *testing.T) {
	fake := &fakeProjectGetHandler{project: &healthv1.Project{Id: "proj-1", Name: "Widget Factory", OrgId: "org-1", OwnerId: "user-1"}}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	_ = rootCmd.PersistentFlags().Set("json", "false")
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"projects", "get", "proj-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("projects get failed: %v", err)
	}
	out := b.String()
	if !strings.Contains(out, "Widget Factory") || !strings.Contains(out, "org-1") || !strings.Contains(out, "user-1") {
		t.Fatalf("expected human-readable project details, got %s", out)
	}
}

func TestProjectsGetCmdJSON(t *testing.T) {
	fake := &fakeProjectGetHandler{project: &healthv1.Project{Id: "proj-1", Name: "Widget Factory"}}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"projects", "get", "proj-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("projects get failed: %v", err)
	}
	if !strings.Contains(b.String(), `"id":"proj-1"`) {
		t.Fatalf("expected JSON project output, got %s", b.String())
	}
}

func TestProjectsGetCmdReportsBackendError(t *testing.T) {
	fake := &fakeProjectGetHandler{err: connect.NewError(connect.CodeNotFound, errors.New("project not found"))}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"projects", "get", "proj-missing"})
	err := rootCmd.Execute()
	if err == nil {
		t.Fatal("expected the backend error to propagate")
	}
	if !strings.Contains(b.String(), "Failed to get project") {
		t.Errorf("expected a failure message, got %s", b.String())
	}
}

// projects list has never required --org locally; it falls back to
// TASKER_ORG_ID (default.go's DefaultOrgID()) and only then errors.
func TestProjectsListCmdRequiresOrg(t *testing.T) {
	_ = projectsListCmd.Flags().Set("org", "")
	t.Cleanup(func() { _ = projectsListCmd.Flags().Set("org", "") })
	t.Setenv("TASKER_ORG_ID", "")

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"projects", "list"})
	err := rootCmd.Execute()

	if err == nil {
		t.Error("expected an error when --org is omitted and TASKER_ORG_ID is unset")
	}
	if !strings.Contains(b.String(), "--org is required") {
		t.Errorf("expected an --org-is-required message, got: %s", b.String())
	}
}

func TestProjectsListCmdHumanReadableOutput(t *testing.T) {
	fake := &fakeProjectListHandlerWithData{projects: []*healthv1.Project{
		{Id: "proj-1", Key: "WID", Name: "Widget Factory"},
	}}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	_ = rootCmd.PersistentFlags().Set("json", "false")
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"projects", "list", "--org", "org-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("projects list failed: %v", err)
	}
	out := b.String()
	if !strings.Contains(out, "Projects:") || !strings.Contains(out, "Widget Factory") || !strings.Contains(out, "WID") {
		t.Fatalf("expected a human-readable project listing, got %s", out)
	}
}

type fakeProjectListHandlerWithData struct {
	v1connect.UnimplementedProjectServiceHandler
	projects []*healthv1.Project
	err      error
}

func (f *fakeProjectListHandlerWithData) ListProjects(
	_ context.Context,
	_ *connect.Request[healthv1.ListProjectsRequest],
) (*connect.Response[healthv1.ListProjectsResponse], error) {
	if f.err != nil {
		return nil, f.err
	}
	return connect.NewResponse(&healthv1.ListProjectsResponse{Projects: f.projects}), nil
}

func TestProjectsListCmdReportsBackendError(t *testing.T) {
	fake := &fakeProjectListHandlerWithData{err: connect.NewError(connect.CodeInternal, errors.New("boom"))}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"projects", "list", "--org", "org-1"})
	err := rootCmd.Execute()

	if err == nil {
		t.Fatal("expected the backend error to propagate")
	}
	if !strings.Contains(b.String(), "Failed to list projects") {
		t.Errorf("expected a failure message, got %s", b.String())
	}
}

func TestProjectsCreateCmdHumanReadableOutput(t *testing.T) {
	fake := &fakeProjectCreateHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	_ = rootCmd.PersistentFlags().Set("json", "false")
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"projects", "create", "--org", "org-1", "--template", "tpl-1", "--title", "New Project", "--owner", "user-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("projects create failed: %v", err)
	}
	out := b.String()
	if !strings.Contains(out, "New Project") || !strings.Contains(out, "proj-new") || !strings.Contains(out, "tpl-1") {
		t.Fatalf("expected a human-readable creation summary, got %s", out)
	}
}

func TestProjectsCreateCmdFallsBackToDefaultOrgID(t *testing.T) {
	fake := &fakeProjectCreateHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Setenv("TASKER_ORG_ID", "org-from-env")

	_ = projectsCreateCmd.Flags().Set("org", "")
	t.Cleanup(func() { _ = projectsCreateCmd.Flags().Set("org", "") })

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"projects", "create", "--template", "tpl-1", "--title", "New Project", "--owner", "user-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("projects create failed: %v", err)
	}

	if fake.gotReq == nil || fake.gotReq.OrgId != "org-from-env" {
		t.Fatalf("expected TASKER_ORG_ID to fill in the omitted --org, got %+v", fake.gotReq)
	}
}

func TestProjectsCreateCmdReportsBackendError(t *testing.T) {
	fake := &fakeProjectCreateErrorHandler{err: connect.NewError(connect.CodePermissionDenied, errors.New("not a member"))}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"projects", "create", "--org", "org-1", "--template", "tpl-1", "--title", "New Project", "--owner", "user-1"})
	err := rootCmd.Execute()

	if err == nil {
		t.Fatal("expected the backend error to propagate")
	}
	if !strings.Contains(b.String(), "Failed to create project") {
		t.Errorf("expected a failure message, got %s", b.String())
	}
}

type fakeProjectCreateErrorHandler struct {
	v1connect.UnimplementedProjectServiceHandler
	err error
}

func (f *fakeProjectCreateErrorHandler) CreateProject(
	_ context.Context,
	_ *connect.Request[healthv1.CreateProjectRequest],
) (*connect.Response[healthv1.CreateProjectResponse], error) {
	return nil, f.err
}

func TestProjectsUpdateCmdHumanReadableOutput(t *testing.T) {
	fake := &fakeProjectUpdateHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	_ = rootCmd.PersistentFlags().Set("json", "false")
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"projects", "update", "proj-1", "--title", "Renamed"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("projects update failed: %v", err)
	}
	if !strings.Contains(b.String(), "Project proj-1 updated") {
		t.Fatalf("expected a human-readable update confirmation, got %s", b.String())
	}
}

func TestProjectsUpdateCmdReportsBackendError(t *testing.T) {
	fake := &fakeProjectUpdateErrorHandler{err: connect.NewError(connect.CodeNotFound, errors.New("project not found"))}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"projects", "update", "proj-missing", "--title", "Renamed"})
	err := rootCmd.Execute()

	if err == nil {
		t.Fatal("expected the backend error to propagate")
	}
	if !strings.Contains(b.String(), "Failed to update project") {
		t.Errorf("expected a failure message, got %s", b.String())
	}
}

type fakeProjectUpdateErrorHandler struct {
	v1connect.UnimplementedProjectServiceHandler
	err error
}

func (f *fakeProjectUpdateErrorHandler) UpdateProject(
	_ context.Context,
	_ *connect.Request[healthv1.UpdateProjectRequest],
) (*connect.Response[healthv1.UpdateProjectResponse], error) {
	return nil, f.err
}

func TestProjectsDeleteRestorePurgeHumanReadableOutput(t *testing.T) {
	fake := &fakeProjectBinLifecycleHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)
	_ = rootCmd.PersistentFlags().Set("json", "false")

	cases := []struct {
		args []string
		want string
	}{
		{[]string{"projects", "delete", "proj-1"}, "moved to bin"},
		{[]string{"projects", "restore", "proj-1"}, "restored"},
		{[]string{"projects", "purge", "proj-1"}, "permanently deleted"},
	}
	for _, tc := range cases {
		b := bytes.NewBufferString("")
		rootCmd.SetOut(b)
		rootCmd.SetArgs(tc.args)
		if err := rootCmd.Execute(); err != nil {
			t.Fatalf("%v failed: %v", tc.args, err)
		}
		if !strings.Contains(b.String(), "proj-1") || !strings.Contains(b.String(), tc.want) {
			t.Errorf("%v: expected a human-readable message containing %q, got %s", tc.args, tc.want, b.String())
		}
	}
}

func TestProjectsDeleteRestorePurgeReportBackendErrors(t *testing.T) {
	fake := &fakeProjectBinLifecycleErrorHandler{err: connect.NewError(connect.CodeFailedPrecondition, errors.New("project still has tasks"))}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewProjectServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(projectsCmd)

	cases := []struct {
		args []string
		want string
	}{
		{[]string{"projects", "delete", "proj-1"}, "Failed to delete project"},
		{[]string{"projects", "restore", "proj-1"}, "Failed to restore project"},
		{[]string{"projects", "purge", "proj-1"}, "Failed to purge project"},
	}
	for _, tc := range cases {
		b := bytes.NewBufferString("")
		rootCmd.SetOut(b)
		rootCmd.SetErr(b)
		rootCmd.SetArgs(tc.args)
		if err := rootCmd.Execute(); err == nil {
			t.Errorf("%v: expected the backend error to propagate", tc.args)
		}
		if !strings.Contains(b.String(), tc.want) {
			t.Errorf("%v: expected a failure message containing %q, got %s", tc.args, tc.want, b.String())
		}
	}
}

type fakeProjectBinLifecycleErrorHandler struct {
	v1connect.UnimplementedProjectServiceHandler
	err error
}

func (f *fakeProjectBinLifecycleErrorHandler) ArchiveProject(
	_ context.Context,
	_ *connect.Request[healthv1.ArchiveProjectRequest],
) (*connect.Response[healthv1.ArchiveProjectResponse], error) {
	return nil, f.err
}

func (f *fakeProjectBinLifecycleErrorHandler) RestoreProject(
	_ context.Context,
	_ *connect.Request[healthv1.RestoreProjectRequest],
) (*connect.Response[healthv1.RestoreProjectResponse], error) {
	return nil, f.err
}

func (f *fakeProjectBinLifecycleErrorHandler) PurgeProject(
	_ context.Context,
	_ *connect.Request[healthv1.PurgeProjectRequest],
) (*connect.Response[healthv1.PurgeProjectResponse], error) {
	return nil, f.err
}
