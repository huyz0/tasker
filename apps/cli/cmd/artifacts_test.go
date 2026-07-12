package cmd

import (
	"bytes"
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
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

func (f *fakeArtifactHandler) CreateArtifact(
	_ context.Context,
	req *connect.Request[healthv1.CreateArtifactRequest],
) (*connect.Response[healthv1.CreateArtifactResponse], error) {
	return connect.NewResponse(&healthv1.CreateArtifactResponse{
		Artifact: &healthv1.Artifact{
			Id:          "art_1",
			FolderId:    req.Msg.FolderId,
			Name:        req.Msg.Name,
			Content:     req.Msg.Content,
			ContentType: req.Msg.ContentType,
		},
	}), nil
}

func TestArtifactsCreateCommandDefaultsContentTypeToTextMarkdown(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(&fakeArtifactHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"artifacts", "create", "--folder", "fld_1", "--name", "Doc", "--content", "# hi", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), `"contentType":"text/markdown"`) {
		t.Errorf("Expected default contentType text/markdown, got %s", b.String())
	}
}

func TestArtifactsCreateCommandUploadsFileAsBase64Image(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(&fakeArtifactHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	pngBytes := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	tmpFile := t.TempDir() + "/logo.png"
	if err := os.WriteFile(tmpFile, pngBytes, 0644); err != nil {
		t.Fatal(err)
	}

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"artifacts", "create", "--folder", "fld_1", "--name", "logo.png", "--file", tmpFile, "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, `"contentType":"image/png"`) {
		t.Errorf("Expected auto-detected image/png contentType, got %s", out)
	}
	if !strings.Contains(out, base64.StdEncoding.EncodeToString(pngBytes)) {
		t.Errorf("Expected base64-encoded file content, got %s", out)
	}
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
