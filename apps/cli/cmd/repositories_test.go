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

type fakeRepositoryHandler struct {
	v1connect.UnimplementedRepositoryServiceHandler
}

func (f *fakeRepositoryHandler) ListRepositoryLinks(
	_ context.Context,
	req *connect.Request[healthv1.ListRepositoryLinksRequest],
) (*connect.Response[healthv1.ListRepositoryLinksResponse], error) {
	return connect.NewResponse(&healthv1.ListRepositoryLinksResponse{
		Links: []*healthv1.RepositoryLink{
			{Id: "link_1", ProjectId: req.Msg.ProjectId, Provider: "github", RemoteName: "huyz0/tasker"},
		},
	}), nil
}

func (f *fakeRepositoryHandler) AddRepositoryLink(
	_ context.Context,
	req *connect.Request[healthv1.AddRepositoryLinkRequest],
) (*connect.Response[healthv1.AddRepositoryLinkResponse], error) {
	return connect.NewResponse(&healthv1.AddRepositoryLinkResponse{
		Link: &healthv1.RepositoryLink{Id: "link_2", ProjectId: req.Msg.ProjectId, Provider: req.Msg.Provider, RemoteName: req.Msg.RemoteName, AuthEmail: req.Msg.Email},
	}), nil
}

func (f *fakeRepositoryHandler) ListPullRequests(
	_ context.Context,
	req *connect.Request[healthv1.ListPullRequestsRequest],
) (*connect.Response[healthv1.ListPullRequestsResponse], error) {
	return connect.NewResponse(&healthv1.ListPullRequestsResponse{
		PullRequests: []*healthv1.RemotePullRequest{
			{Id: "pr_1", RemotePrId: "123", Title: "Implement auth", Status: "open"},
		},
	}), nil
}

func (f *fakeRepositoryHandler) ListDeployments(
	_ context.Context,
	req *connect.Request[healthv1.ListDeploymentsRequest],
) (*connect.Response[healthv1.ListDeploymentsResponse], error) {
	return connect.NewResponse(&healthv1.ListDeploymentsResponse{
		Deployments: []*healthv1.Deployment{
			{Id: "dep_1", BuildId: req.Msg.BuildId, Environment: "production", Status: "SUCCESS"},
		},
	}), nil
}

func TestRepoListCmd(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewRepositoryServiceHandler(&fakeRepositoryHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"repo", "list", "--project", "proj-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Repository Links:") || !strings.Contains(out, "huyz0/tasker") {
		t.Fatalf("expected output to contain repository links, got %s", out)
	}
}

func TestRepoLinkCmd(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewRepositoryServiceHandler(&fakeRepositoryHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"repo", "link", "--project", "proj-1", "--provider", "github", "--remote", "test/repo", "--oauth-code", "fake-code"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Successfully linked github repository: test/repo") {
		t.Fatalf("expected success message, got %s", out)
	}
}

func TestRepoLinkCmdWithDirectApiToken(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewRepositoryServiceHandler(&fakeRepositoryHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "true")
	rootCmd.SetArgs([]string{
		"repo", "link", "--project", "proj-1", "--provider", "bitbucket", "--remote", "team/repo",
		"--api-token", "ATATT-fake", "--email", "user@example.com", "--json",
	})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "user@example.com") {
		t.Fatalf("expected output to contain the auth email, got %s", out)
	}
	rootCmd.Flags().Set("json", "false")
}

func TestRepoLinkCmdWithGithubDirectApiTokenNeedsNoEmail(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewRepositoryServiceHandler(&fakeRepositoryHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{
		"repo", "link", "--project", "proj-1", "--provider", "github", "--remote", "huyz0/tasker",
		"--oauth-code", "", "--api-token", "ghp_fake-pat", "--email", "",
	})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Successfully linked github repository: huyz0/tasker") {
		t.Fatalf("expected success message, got %s", out)
	}
}

func TestRepoLinkCmdRequiresOauthCodeOrApiTokenWithEmail(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewRepositoryServiceHandler(&fakeRepositoryHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"repo", "link", "--project", "proj-1", "--provider", "bitbucket", "--remote", "team/repo", "--oauth-code", "", "--api-token", "tok-without-email", "--email", ""})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Error:") {
		t.Fatalf("expected an error about missing email, got %s", out)
	}
}

func TestRepoPrsCmd(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewRepositoryServiceHandler(&fakeRepositoryHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "true")
	rootCmd.SetArgs([]string{"repo", "prs", "--project", "proj-1", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "remote_pr_id") {
		t.Fatalf("expected JSON output containing PRs, got %s", out)
	}
}

func TestRepoDeploymentsCmd(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewRepositoryServiceHandler(&fakeRepositoryHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"repo", "deployments", "run-123", "--link", "link_1", "--commit", "abc123"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "production") || !strings.Contains(out, "SUCCESS") {
		t.Fatalf("expected output to contain the deployment, got %s", out)
	}
}

func TestRepoDeploymentsCmdRequiresLinkAndCommit(t *testing.T) {
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	repoDeploymentsCmd.Flags().Set("link", "")
	repoDeploymentsCmd.Flags().Set("commit", "")
	rootCmd.SetArgs([]string{"repo", "deployments", "run-123"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "--link and --commit are both required") {
		t.Fatalf("expected a validation error, got %s", out)
	}
}
