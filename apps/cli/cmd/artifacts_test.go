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
	gotListFoldersReq    *healthv1.ListFoldersRequest
	gotListArtifactsReq  *healthv1.ListArtifactsRequest
	// artifactPages simulates a folder whose artifacts span multiple pages,
	// keyed by the cursor that requests that page ("" for the first page).
	artifactPages map[string]*healthv1.ListArtifactsResponse
	// artifactsByID backs GetArtifact/GetArtifactContent - the real backend's
	// pair for a deep link, and what `artifacts read` calls now (M18-T07).
	artifactsByID       map[string]*healthv1.Artifact
	gotLinkRequest      *healthv1.LinkTaskArtifactRequest
	gotUnlinkRequest    *healthv1.UnlinkTaskArtifactRequest
	gotUpdateContentReq *healthv1.UpdateArtifactContentRequest
	gotUpdateFolderReq  *healthv1.UpdateFolderRequest
	links               []*healthv1.TaskArtifactLink
	// M18-T09: archive/restore/purge for artifacts and folders had no fake
	// handler at all, so a --json fix to any of them (or a test of the
	// positive path) could not have been verified through this fixture.
	archivedArtifactID string
	restoredArtifactID string
	purgedArtifactID   string
	archivedFolderID   string
	restoredFolderID   string
	purgedFolderID     string
	gotCreateFolderReq *healthv1.CreateFolderRequest
}

func (f *fakeArtifactHandler) ListFolders(
	_ context.Context,
	req *connect.Request[healthv1.ListFoldersRequest],
) (*connect.Response[healthv1.ListFoldersResponse], error) {
	f.gotListFoldersPage = req.Msg.Page
	f.gotListFoldersReq = req.Msg
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
	f.gotListArtifactsReq = req.Msg
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

func (f *fakeArtifactHandler) UpdateArtifactContent(
	_ context.Context,
	req *connect.Request[healthv1.UpdateArtifactContentRequest],
) (*connect.Response[healthv1.UpdateArtifactContentResponse], error) {
	f.gotUpdateContentReq = req.Msg
	contentType := ""
	if req.Msg.ContentType != nil {
		contentType = *req.Msg.ContentType
	}
	return connect.NewResponse(&healthv1.UpdateArtifactContentResponse{
		Artifact: &healthv1.Artifact{Id: req.Msg.ArtifactId, Content: req.Msg.Content, ContentType: contentType},
	}), nil
}

func (f *fakeArtifactHandler) UpdateFolder(
	_ context.Context,
	req *connect.Request[healthv1.UpdateFolderRequest],
) (*connect.Response[healthv1.UpdateFolderResponse], error) {
	f.gotUpdateFolderReq = req.Msg
	return connect.NewResponse(&healthv1.UpdateFolderResponse{
		Folder: &healthv1.Folder{Id: req.Msg.FolderId, Name: req.Msg.Name},
	}), nil
}

func (f *fakeArtifactHandler) ListTaskArtifactLinks(
	_ context.Context,
	_ *connect.Request[healthv1.ListTaskArtifactLinksRequest],
) (*connect.Response[healthv1.ListTaskArtifactLinksResponse], error) {
	return connect.NewResponse(&healthv1.ListTaskArtifactLinksResponse{Links: f.links}), nil
}

func (f *fakeArtifactHandler) GetArtifact(
	_ context.Context,
	req *connect.Request[healthv1.GetArtifactRequest],
) (*connect.Response[healthv1.GetArtifactResponse], error) {
	a, ok := f.artifactsByID[req.Msg.ArtifactId]
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, nil)
	}
	return connect.NewResponse(&healthv1.GetArtifactResponse{Artifact: &healthv1.Artifact{
		Id: a.Id, FolderId: a.FolderId, Name: a.Name, Description: a.Description, ContentType: a.ContentType,
	}}), nil
}

func (f *fakeArtifactHandler) GetArtifactContent(
	_ context.Context,
	req *connect.Request[healthv1.GetArtifactContentRequest],
) (*connect.Response[healthv1.GetArtifactContentResponse], error) {
	a, ok := f.artifactsByID[req.Msg.ArtifactId]
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, nil)
	}
	return connect.NewResponse(&healthv1.GetArtifactContentResponse{
		Content: a.Content, ContentType: a.ContentType, SizeBytes: int64(len(a.Content)),
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

func (f *fakeArtifactHandler) CreateFolder(
	_ context.Context,
	req *connect.Request[healthv1.CreateFolderRequest],
) (*connect.Response[healthv1.CreateFolderResponse], error) {
	f.gotCreateFolderReq = req.Msg
	return connect.NewResponse(&healthv1.CreateFolderResponse{
		Folder: &healthv1.Folder{Id: "fld_new", ProjectId: req.Msg.ProjectId, ParentId: req.Msg.ParentId, Name: req.Msg.Name},
	}), nil
}

func (f *fakeArtifactHandler) ArchiveArtifact(
	_ context.Context,
	req *connect.Request[healthv1.ArchiveArtifactRequest],
) (*connect.Response[healthv1.ArchiveArtifactResponse], error) {
	f.archivedArtifactID = req.Msg.ArtifactId
	return connect.NewResponse(&healthv1.ArchiveArtifactResponse{Success: true}), nil
}

func (f *fakeArtifactHandler) RestoreArtifact(
	_ context.Context,
	req *connect.Request[healthv1.RestoreArtifactRequest],
) (*connect.Response[healthv1.RestoreArtifactResponse], error) {
	f.restoredArtifactID = req.Msg.ArtifactId
	return connect.NewResponse(&healthv1.RestoreArtifactResponse{Success: true}), nil
}

func (f *fakeArtifactHandler) PurgeArtifact(
	_ context.Context,
	req *connect.Request[healthv1.PurgeArtifactRequest],
) (*connect.Response[healthv1.PurgeArtifactResponse], error) {
	f.purgedArtifactID = req.Msg.ArtifactId
	return connect.NewResponse(&healthv1.PurgeArtifactResponse{Success: true}), nil
}

func (f *fakeArtifactHandler) ArchiveFolder(
	_ context.Context,
	req *connect.Request[healthv1.ArchiveFolderRequest],
) (*connect.Response[healthv1.ArchiveFolderResponse], error) {
	f.archivedFolderID = req.Msg.FolderId
	return connect.NewResponse(&healthv1.ArchiveFolderResponse{Success: true}), nil
}

func (f *fakeArtifactHandler) RestoreFolder(
	_ context.Context,
	req *connect.Request[healthv1.RestoreFolderRequest],
) (*connect.Response[healthv1.RestoreFolderResponse], error) {
	f.restoredFolderID = req.Msg.FolderId
	return connect.NewResponse(&healthv1.RestoreFolderResponse{Success: true}), nil
}

func (f *fakeArtifactHandler) PurgeFolder(
	_ context.Context,
	req *connect.Request[healthv1.PurgeFolderRequest],
) (*connect.Response[healthv1.PurgeFolderResponse], error) {
	f.purgedFolderID = req.Msg.FolderId
	return connect.NewResponse(&healthv1.PurgeFolderResponse{Success: true}), nil
}

func (f *fakeArtifactHandler) LinkTaskArtifact(
	_ context.Context,
	req *connect.Request[healthv1.LinkTaskArtifactRequest],
) (*connect.Response[healthv1.LinkTaskArtifactResponse], error) {
	f.gotLinkRequest = req.Msg
	return connect.NewResponse(&healthv1.LinkTaskArtifactResponse{
		Link: &healthv1.TaskArtifactLink{
			Id:           "link_1",
			TaskId:       req.Msg.TaskId,
			ArtifactId:   req.Msg.ArtifactId,
			ArtifactName: "logo.png",
			TaskTitle:    "Ship the release",
		},
	}), nil
}

func (f *fakeArtifactHandler) UnlinkTaskArtifact(
	_ context.Context,
	req *connect.Request[healthv1.UnlinkTaskArtifactRequest],
) (*connect.Response[healthv1.UnlinkTaskArtifactResponse], error) {
	f.gotUnlinkRequest = req.Msg
	return connect.NewResponse(&healthv1.UnlinkTaskArtifactResponse{Success: true}), nil
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

// M18-T07: --file used to base64-encode every upload regardless of type,
// the same bug the GUI's upload path had before M18-T04 fixed it there - a
// text file uploaded via the CLI and then opened in the GUI would have shown
// as a wall of base64. Now only content that cannot survive being read as
// text is ever base64-encoded (see isBinaryContentType).
func TestArtifactsCreateCommandUploadsATextFileAsPlainText(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(&fakeArtifactHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	tmpFile := t.TempDir() + "/notes.md"
	if err := os.WriteFile(tmpFile, []byte("# hello"), 0644); err != nil {
		t.Fatal(err)
	}

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"artifacts", "create", "--folder", "fld_1", "--name", "notes.md", "--file", tmpFile, "--content-type", "text/markdown", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, `"content":"# hello"`) {
		t.Errorf("expected the file's plain text content, not base64, got %s", out)
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

// M18-T07: `read` used to print Artifact.Content from ListArtifacts, which
// the real backend deliberately leaves empty on a listing (content is
// populated only by GetArtifactContent) - always an empty body, for every
// artifact, against the real server. It now calls GetArtifact (metadata) +
// GetArtifactContent (body), the pair the backend built for exactly this - a
// deep link with an artifact id and nothing else - so no --folder is needed
// and there is no folder to page through.
func TestArtifactsReadCommandPrintsContentFromGetArtifactContent(t *testing.T) {
	fake := &fakeArtifactHandler{
		artifactsByID: map[string]*healthv1.Artifact{
			"art_1": {Id: "art_1", FolderId: "fld_1", Name: "readme.md", ContentType: "text/markdown", Content: "hello world"},
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
	rootCmd.SetArgs([]string{"artifacts", "read", "art_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	output := b.String()
	if !strings.Contains(output, "readme.md") || !strings.Contains(output, "hello world") {
		t.Fatalf("expected the artifact's name and content, got %s", output)
	}
}

func TestArtifactsReadCommandReportsANonexistentArtifact(t *testing.T) {
	fake := &fakeArtifactHandler{artifactsByID: map[string]*healthv1.Artifact{}}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"artifacts", "read", "art-does-not-exist"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error for a nonexistent artifact")
	}
}

func TestArtifactsReadCommandOutputsJSON(t *testing.T) {
	fake := &fakeArtifactHandler{
		artifactsByID: map[string]*healthv1.Artifact{
			"art_1": {Id: "art_1", FolderId: "fld_1", Name: "readme.md", Description: "d", ContentType: "text/markdown", Content: "hello"},
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
	rootCmd.SetArgs([]string{"artifacts", "read", "art_1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), `"content":"hello"`) {
		t.Errorf("expected the content field in JSON output, got %s", b.String())
	}
}

// Base64 dumped to a terminal is unreadable, and for an actual image is not
// text at all - printed as a note instead, pointing at --json for the bytes.
func TestArtifactsReadCommandDescribesBinaryContentInsteadOfDumpingBase64(t *testing.T) {
	fake := &fakeArtifactHandler{
		artifactsByID: map[string]*healthv1.Artifact{
			"art_1": {Id: "art_1", FolderId: "fld_1", Name: "logo.png", ContentType: "image/png", Content: "iVBORw0KGgo="},
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
	// --json persists on rootCmd across Execute() calls in this test binary;
	// an earlier test's --json would otherwise leak into this one.
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"artifacts", "read", "art_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	output := b.String()
	if strings.Contains(output, "iVBORw0KGgo=") {
		t.Fatalf("expected the raw base64 body not to be dumped to the terminal, got %s", output)
	}
	if !strings.Contains(output, "binary content") || !strings.Contains(output, "--json") {
		t.Fatalf("expected a note pointing at --json for the bytes, got %s", output)
	}
}

// M14-T08: LinkTaskArtifact/UnlinkTaskArtifact existed as RPCs since M05 but
// were unreachable from the CLI - an agent working headlessly had no way to
// attach its own output to the task it was given.
func TestArtifactsLinkTaskCommandSendsTaskAndArtifactIds(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"artifacts", "link-task", "--task", "tsk_1", "--artifact", "art_1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if fake.gotLinkRequest == nil {
		t.Fatal("expected LinkTaskArtifact to be called")
	}
	if fake.gotLinkRequest.TaskId != "tsk_1" || fake.gotLinkRequest.ArtifactId != "art_1" {
		t.Errorf("expected taskId=tsk_1 artifactId=art_1, got %+v", fake.gotLinkRequest)
	}
	if !strings.Contains(b.String(), `"artifactName":"logo.png"`) {
		t.Errorf("expected the created link in the output, got %s", b.String())
	}
}

func TestArtifactsLinkTaskCommandRequiresBothFlags(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	// pflag values persist across Execute() calls on the same command
	// instance - without this reset, an earlier test's --artifact would
	// still be set here (same reason teams_test.go resets --name).
	artifactsLinkTaskCmd.Flags().Set("artifact", "")

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"artifacts", "link-task", "--task", "tsk_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when --artifact is omitted")
	}
	if fake.gotLinkRequest != nil {
		t.Error("expected LinkTaskArtifact not to be called with an incomplete request")
	}
}

func TestArtifactsUnlinkTaskCommandSendsTaskAndArtifactIds(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	// --json persists on rootCmd across Execute() calls in this test binary;
	// TestArtifactsLinkTaskCommandSendsTaskAndArtifactIds sets it and would
	// otherwise leak into this test.
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"artifacts", "unlink-task", "--task", "tsk_1", "--artifact", "art_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if fake.gotUnlinkRequest == nil {
		t.Fatal("expected UnlinkTaskArtifact to be called")
	}
	if fake.gotUnlinkRequest.TaskId != "tsk_1" || fake.gotUnlinkRequest.ArtifactId != "art_1" {
		t.Errorf("expected taskId=tsk_1 artifactId=art_1, got %+v", fake.gotUnlinkRequest)
	}
	if !strings.Contains(b.String(), "Unlinked artifact art_1 from task tsk_1") {
		t.Errorf("expected a confirmation message, got %s", b.String())
	}
}

// M18-T09: unlink-task ignored --json entirely and always printed plain text.
func TestArtifactsUnlinkTaskCommandJSON(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	t.Cleanup(func() { rootCmd.Flags().Set("json", "false") })
	rootCmd.SetArgs([]string{"artifacts", "unlink-task", "--task", "tsk_1", "--artifact", "art_1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, `"success":true`) || !strings.Contains(out, `"tsk_1"`) || !strings.Contains(out, `"art_1"`) {
		t.Fatalf("expected JSON output, got %s", out)
	}
}

// M18-T08: updateArtifactContent has existed as an RPC since M05 but had no
// CLI command - the only way to change an artifact's content was
// delete-and-recreate, which loses the artifact id and any task links.
func TestArtifactsUpdateContentCommand(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"artifacts", "update-content", "art_1", "--content", "new body", "--content-type", "text/plain"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if fake.gotUpdateContentReq == nil || fake.gotUpdateContentReq.ArtifactId != "art_1" || fake.gotUpdateContentReq.Content != "new body" {
		t.Fatalf("expected UpdateArtifactContent to be called with art_1/new body, got %+v", fake.gotUpdateContentReq)
	}
	if fake.gotUpdateContentReq.ContentType == nil || *fake.gotUpdateContentReq.ContentType != "text/plain" {
		t.Errorf("expected contentType text/plain to be forwarded, got %+v", fake.gotUpdateContentReq.ContentType)
	}
}

func TestArtifactsUpdateContentCommandUploadsATextFileAsPlainText(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	tmpFile := t.TempDir() + "/notes.md"
	if err := os.WriteFile(tmpFile, []byte("# updated"), 0644); err != nil {
		t.Fatal(err)
	}

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"artifacts", "update-content", "art_1", "--file", tmpFile, "--content-type", "text/markdown"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if fake.gotUpdateContentReq == nil || fake.gotUpdateContentReq.Content != "# updated" {
		t.Fatalf("expected the file's plain text content, not base64, got %+v", fake.gotUpdateContentReq)
	}
}

func TestArtifactsUpdateContentCommandRequiresContentOrFile(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	artifactsUpdateContentCmd.Flags().Set("content", "")
	artifactsUpdateContentCmd.Flags().Set("file", "")

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"artifacts", "update-content", "art_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when neither --content nor --file is given")
	}
	if fake.gotUpdateContentReq != nil {
		t.Error("expected UpdateArtifactContent not to be called")
	}
}

// M18-T08: updateFolder has existed as an RPC since M05 but had no CLI
// command - a typo'd folder name had no way to be fixed short of deleting
// and recreating it, orphaning anything already filed under the old id.
func TestArtifactsUpdateFolderCommand(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"artifacts", "update-folder", "fld_1", "--name", "renamed"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if fake.gotUpdateFolderReq == nil || fake.gotUpdateFolderReq.FolderId != "fld_1" || fake.gotUpdateFolderReq.Name != "renamed" {
		t.Fatalf("expected UpdateFolder to be called with fld_1/renamed, got %+v", fake.gotUpdateFolderReq)
	}
	if !strings.Contains(b.String(), "renamed") {
		t.Errorf("expected confirmation with the new name, got %s", b.String())
	}
}

func TestArtifactsUpdateFolderCommandRequiresName(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	artifactsUpdateFolderCmd.Flags().Set("name", "")

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"artifacts", "update-folder", "fld_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when --name is omitted")
	}
	if fake.gotUpdateFolderReq != nil {
		t.Error("expected UpdateFolder not to be called")
	}
}

// M18-T08: link-task/unlink-task let an agent attach or detach its own
// output blind - there was no way to see what was currently linked to a
// task or artifact without going to the GUI.
func TestArtifactsListTaskLinksCommand(t *testing.T) {
	fake := &fakeArtifactHandler{
		links: []*healthv1.TaskArtifactLink{
			{Id: "link_1", TaskId: "tsk_1", ArtifactId: "art_1", TaskTitle: "Ship the release", ArtifactName: "logo.png"},
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
	rootCmd.SetArgs([]string{"artifacts", "list-task-links", "--task", "tsk_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), "Ship the release") || !strings.Contains(b.String(), "logo.png") {
		t.Errorf("expected the link's task and artifact names, got %s", b.String())
	}
}

func TestArtifactsListTaskLinksCommandSaysSoWhenEmpty(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	// --task persists on this command across Execute() calls in this test
	// binary; an earlier test's --task would otherwise leak in alongside
	// this test's --artifact and trip the "exactly one" check.
	artifactsListTaskLinksCmd.Flags().Set("task", "")

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"artifacts", "list-task-links", "--artifact", "art_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), "No links found") {
		t.Errorf("expected an empty-state message, got %s", b.String())
	}
}

func TestArtifactsListTaskLinksCommandRequiresExactlyOneOfTaskOrArtifact(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	artifactsListTaskLinksCmd.Flags().Set("task", "")
	artifactsListTaskLinksCmd.Flags().Set("artifact", "")

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.SetArgs([]string{"artifacts", "list-task-links"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when neither --task nor --artifact is given")
	}

	rootCmd.SetArgs([]string{"artifacts", "list-task-links", "--task", "tsk_1", "--artifact", "art_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when both --task and --artifact are given")
	}
}

// M18-T08: `list` had no way to browse the Bin - restore/purge could only be
// used if the id was already known from elsewhere.
func TestArtifactsListCommandForwardsOnlyDeleted(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	// --folder persists on this command across Execute() calls in this test
	// binary; an earlier test's --folder would otherwise leak in and take
	// the ListArtifacts branch instead of ListFolders for the first case.
	artifactsListCmd.Flags().Set("folder", "")

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"artifacts", "list", "--project", "test-123", "--only-deleted", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.gotListFoldersReq == nil || !fake.gotListFoldersReq.OnlyDeleted {
		t.Fatalf("expected OnlyDeleted to be forwarded to ListFolders, got %+v", fake.gotListFoldersReq)
	}

	b.Reset()
	rootCmd.SetArgs([]string{"artifacts", "list", "--folder", "fld_1", "--only-deleted", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.gotListArtifactsReq == nil || !fake.gotListArtifactsReq.OnlyDeleted {
		t.Fatalf("expected OnlyDeleted to be forwarded to ListArtifacts, got %+v", fake.gotListArtifactsReq)
	}
}

// M18-T09: delete/restore/purge for artifacts and folders had no fake
// handler at all - a --json fix to any of them could not have been verified
// through this fixture, and the positive path itself was untested.
func TestArtifactsAndFoldersDeleteRestorePurgeCmd(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")

	rootCmd.SetArgs([]string{"artifacts", "delete", "art_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.archivedArtifactID != "art_1" {
		t.Errorf("expected ArchiveArtifact to be called with art_1, got %q", fake.archivedArtifactID)
	}

	rootCmd.SetArgs([]string{"artifacts", "restore", "art_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.restoredArtifactID != "art_1" {
		t.Errorf("expected RestoreArtifact to be called with art_1, got %q", fake.restoredArtifactID)
	}

	rootCmd.SetArgs([]string{"artifacts", "purge", "art_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.purgedArtifactID != "art_1" {
		t.Errorf("expected PurgeArtifact to be called with art_1, got %q", fake.purgedArtifactID)
	}

	rootCmd.SetArgs([]string{"artifacts", "delete-folder", "fld_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.archivedFolderID != "fld_1" {
		t.Errorf("expected ArchiveFolder to be called with fld_1, got %q", fake.archivedFolderID)
	}

	rootCmd.SetArgs([]string{"artifacts", "restore-folder", "fld_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.restoredFolderID != "fld_1" {
		t.Errorf("expected RestoreFolder to be called with fld_1, got %q", fake.restoredFolderID)
	}

	rootCmd.SetArgs([]string{"artifacts", "purge-folder", "fld_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.purgedFolderID != "fld_1" {
		t.Errorf("expected PurgeFolder to be called with fld_1, got %q", fake.purgedFolderID)
	}
}

// M18-T09: none of these six commands honored --json - always plain text.
func TestArtifactsAndFoldersDeleteRestorePurgeCmdJSON(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Cleanup(func() { rootCmd.Flags().Set("json", "false") })

	rootCmd.AddCommand(artifactsCmd)
	for _, args := range [][]string{
		{"artifacts", "delete", "art_1", "--json"},
		{"artifacts", "restore", "art_1", "--json"},
		{"artifacts", "purge", "art_1", "--json"},
		{"artifacts", "delete-folder", "fld_1", "--json"},
		{"artifacts", "restore-folder", "fld_1", "--json"},
		{"artifacts", "purge-folder", "fld_1", "--json"},
	} {
		b := bytes.NewBufferString("")
		rootCmd.SetOut(b)
		rootCmd.SetArgs(args)
		if err := rootCmd.Execute(); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(b.String(), `"success":true`) {
			t.Fatalf("expected %v to print JSON, got %s", args, b.String())
		}
	}
}

// M18-T09: foldersCreateCmd had no test at all.
func TestFoldersCreateCommand(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"artifacts", "create-folder", "--project", "proj_1", "--name", "New Folder"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if fake.gotCreateFolderReq == nil || fake.gotCreateFolderReq.ProjectId != "proj_1" || fake.gotCreateFolderReq.Name != "New Folder" {
		t.Fatalf("expected CreateFolder to be called with proj_1/New Folder, got %+v", fake.gotCreateFolderReq)
	}
	if !strings.Contains(b.String(), "New Folder") {
		t.Errorf("expected confirmation with the new folder's name, got %s", b.String())
	}
}

// M18-T09: none of these required-flag validations had a test asserting
// the actual error message, only (in some cases) that an error occurred at
// all via a different test's incidental coverage.
func TestArtifactsRequiredFlagValidations(t *testing.T) {
	fake := &fakeArtifactHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewArtifactServiceHandler(fake))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	rootCmd.AddCommand(artifactsCmd)

	// Every flag every case below touches, reset before each case: flags
	// persist on their command across Execute() calls in this test binary,
	// so a value set by one case (or an earlier test in this file) would
	// otherwise leak into the next and silently satisfy a check meant to
	// fail.
	reset := func() {
		artifactsCreateCmd.Flags().Set("folder", "")
		artifactsCreateCmd.Flags().Set("name", "")
		artifactsCreateCmd.Flags().Set("file", "")
		artifactsListCmd.Flags().Set("project", "")
		artifactsListCmd.Flags().Set("folder", "")
		foldersCreateCmd.Flags().Set("project", "")
		foldersCreateCmd.Flags().Set("name", "")
	}

	for _, tc := range []struct {
		args    []string
		wantErr string
	}{
		{[]string{"artifacts", "create", "--name", "Doc"}, "--folder and --name are required"},
		{[]string{"artifacts", "create", "--folder", "fld_1"}, "--folder and --name are required"},
		{[]string{"artifacts", "list"}, "--project or --folder is required"},
		{[]string{"artifacts", "create-folder", "--name", "F"}, "--project and --name are required"},
		{[]string{"artifacts", "create-folder", "--project", "proj_1"}, "--project and --name are required"},
	} {
		reset()
		b := bytes.NewBufferString("")
		rootCmd.SetOut(b)
		rootCmd.SetErr(b)
		rootCmd.SetArgs(tc.args)
		if err := rootCmd.Execute(); err == nil {
			t.Fatalf("expected %v to require a flag", tc.args)
		}
		if !strings.Contains(b.String(), tc.wantErr) {
			t.Errorf("expected %v to say %q, got %s", tc.args, tc.wantErr, b.String())
		}
	}
}
