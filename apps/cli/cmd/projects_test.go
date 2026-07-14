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
