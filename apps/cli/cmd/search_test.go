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

type fakeSearchHandler struct {
	v1connect.UnimplementedSearchServiceHandler
}

func (f *fakeSearchHandler) UniversalSearch(
	_ context.Context,
	req *connect.Request[healthv1.UniversalSearchRequest],
) (*connect.Response[healthv1.UniversalSearchResponse], error) {
	if req.Msg.Query == "nothing" {
		return connect.NewResponse(&healthv1.UniversalSearchResponse{Results: []*healthv1.SearchResult{}}), nil
	}
	return connect.NewResponse(&healthv1.UniversalSearchResponse{
		Results: []*healthv1.SearchResult{
			{Id: "tsk-1", Type: "task", Title: "Matching Task", Snippet: "a snippet"},
		},
	}), nil
}

func TestSearchCmd(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewSearchServiceHandler(&fakeSearchHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(searchCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"search", "Matching", "--org", "org-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Matching Task") || !strings.Contains(out, "tsk-1") {
		t.Fatalf("expected output to contain the matching task, got %s", out)
	}
}

func TestSearchCmdNoResults(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewSearchServiceHandler(&fakeSearchHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(searchCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"search", "nothing", "--org", "org-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), "No results found") {
		t.Fatalf("expected 'No results found' message, got %s", b.String())
	}
}
