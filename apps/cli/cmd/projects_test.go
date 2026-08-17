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
func TestProjectsUpdateCommand(t *testing.T) {
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
