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

type fakeArtifactHandler struct {
	v1connect.UnimplementedArtifactServiceHandler
}

func (f *fakeArtifactHandler) ListFolders(
	_ context.Context,
	req *connect.Request[healthv1.ListFoldersRequest],
) (*connect.Response[healthv1.ListFoldersResponse], error) {
	return connect.NewResponse(&healthv1.ListFoldersResponse{
		Folders: []*healthv1.Folder{
			{Id: "fld_1", ProjectId: req.Msg.ProjectId, Name: "deployments"},
		},
	}), nil
}

// Maps to TC-006 from TEST-PLAN.md: CLI - Artifacts command
func TestArtifactsListCommandIntegration(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(&fakeArtifactHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"artifacts", "list", "--project", "test-123", "--json"})
	_ = rootCmd.Execute()

	output := b.String()
	if !strings.Contains(output, "deployments") {
		t.Errorf("Expected folder output to contain deployments, got %s", output)
	}
}
