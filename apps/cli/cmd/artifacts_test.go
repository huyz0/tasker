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
	gotListFoldersPage   *healthv1.PageRequest
	gotListArtifactsPage *healthv1.PageRequest
	// artifactPages simulates a folder whose artifacts span multiple pages,
	// keyed by the cursor that requests that page ("" for the first page).
	artifactPages map[string]*healthv1.ListArtifactsResponse
}

func (f *fakeArtifactHandler) ListFolders(
	_ context.Context,
	req *connect.Request[healthv1.ListFoldersRequest],
) (*connect.Response[healthv1.ListFoldersResponse], error) {
	f.gotListFoldersPage = req.Msg.Page
	return connect.NewResponse(&healthv1.ListFoldersResponse{
		Folders: []*healthv1.Folder{
			{Id: "fld_1", ProjectId: req.Msg.ProjectId, Name: "deployments"},
		},
	}), nil
}

func (f *fakeArtifactHandler) ListArtifacts(
	_ context.Context,
	req *connect.Request[healthv1.ListArtifactsRequest],
) (*connect.Response[healthv1.ListArtifactsResponse], error) {
	f.gotListArtifactsPage = req.Msg.Page
	if f.artifactPages != nil {
		cursor := ""
		if req.Msg.Page != nil {
			cursor = req.Msg.Page.Cursor
		}
		if page, ok := f.artifactPages[cursor]; ok {
			return connect.NewResponse(page), nil
		}
	}
	return connect.NewResponse(&healthv1.ListArtifactsResponse{}), nil
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

func TestArtifactsListCommandForwardsCursorAndLimit(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"artifacts", "list", "--project", "test-123", "--cursor", "cursor-2", "--limit", "10", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.gotListFoldersPage == nil || fake.gotListFoldersPage.Cursor != "cursor-2" || fake.gotListFoldersPage.Limit != 10 {
		t.Fatalf("expected cursor/limit to be forwarded to ListFolders, got %+v", fake.gotListFoldersPage)
	}

	b.Reset()
	rootCmd.SetArgs([]string{"artifacts", "list", "--folder", "fld_1", "--cursor", "cursor-2", "--limit", "10", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.gotListArtifactsPage == nil || fake.gotListArtifactsPage.Cursor != "cursor-2" || fake.gotListArtifactsPage.Limit != 10 {
		t.Fatalf("expected cursor/limit to be forwarded to ListArtifacts, got %+v", fake.gotListArtifactsPage)
	}
}

// Without paging through every page, an artifact past the folder's first
// page of results would falsely report as "not found" even though it exists.
func TestArtifactsReadCommandFindsArtifactPastFirstPage(t *testing.T) {
	fake := &fakeArtifactHandler{
		artifactPages: map[string]*healthv1.ListArtifactsResponse{
			"": {
				Artifacts: []*healthv1.Artifact{{Id: "art_1", Name: "page-one.md", Content: "first page"}},
				Page:      &healthv1.PageResponse{NextCursor: "cursor-2"},
			},
			"cursor-2": {
				Artifacts: []*healthv1.Artifact{{Id: "art_2", Name: "page-two.md", Content: "second page content"}},
				Page:      &healthv1.PageResponse{},
			},
		},
	}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"artifacts", "read", "art_2", "--folder", "fld_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	output := b.String()
	if strings.Contains(output, "not found") {
		t.Fatalf("expected artifact on the second page to be found, got %s", output)
	}
	if !strings.Contains(output, "second page content") {
		t.Fatalf("expected output to contain the artifact's content, got %s", output)
	}
}
