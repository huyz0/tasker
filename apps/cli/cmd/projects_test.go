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
	gotPage *healthv1.PageRequest
}

func (f *fakeProjectListHandler) ListProjects(
	_ context.Context,
	req *connect.Request[healthv1.ListProjectsRequest],
) (*connect.Response[healthv1.ListProjectsResponse], error) {
	f.gotPage = req.Msg.Page
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
