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

type fakeAgentHandler struct {
	v1connect.UnimplementedAgentServiceHandler
	archivedID string
	restoredID string
	purgedID   string
}

func (f *fakeAgentHandler) ListAgents(
	_ context.Context,
	req *connect.Request[healthv1.ListAgentsRequest],
) (*connect.Response[healthv1.ListAgentsResponse], error) {
	return connect.NewResponse(&healthv1.ListAgentsResponse{
		Agents: []*healthv1.Agent{
			{Id: "ag_1", OrgId: req.Msg.OrgId, AgentRoleId: "ar_1", Name: "Reviewer Bot"},
		},
	}), nil
}

func (f *fakeAgentHandler) CreateAgent(
	_ context.Context,
	req *connect.Request[healthv1.CreateAgentRequest],
) (*connect.Response[healthv1.CreateAgentResponse], error) {
	return connect.NewResponse(&healthv1.CreateAgentResponse{
		Agent: &healthv1.Agent{Id: "ag_new", OrgId: req.Msg.OrgId, AgentRoleId: req.Msg.AgentRoleId, Name: req.Msg.Name},
	}), nil
}

func (f *fakeAgentHandler) ListAgentRoles(
	_ context.Context,
	_ *connect.Request[healthv1.ListAgentRolesRequest],
) (*connect.Response[healthv1.ListAgentRolesResponse], error) {
	return connect.NewResponse(&healthv1.ListAgentRolesResponse{
		Roles: []*healthv1.AgentRole{{Id: "ar_1", Name: "Reviewer"}},
	}), nil
}

func (f *fakeAgentHandler) CreateAgentRole(
	_ context.Context,
	req *connect.Request[healthv1.CreateAgentRoleRequest],
) (*connect.Response[healthv1.CreateAgentRoleResponse], error) {
	return connect.NewResponse(&healthv1.CreateAgentRoleResponse{
		Role: &healthv1.AgentRole{Id: "ar_new", Name: req.Msg.Name, SystemPrompt: req.Msg.SystemPrompt, Capabilities: req.Msg.Capabilities},
	}), nil
}

func (f *fakeAgentHandler) ArchiveAgent(
	_ context.Context,
	req *connect.Request[healthv1.ArchiveAgentRequest],
) (*connect.Response[healthv1.ArchiveAgentResponse], error) {
	f.archivedID = req.Msg.AgentId
	return connect.NewResponse(&healthv1.ArchiveAgentResponse{Success: true}), nil
}

func (f *fakeAgentHandler) RestoreAgent(
	_ context.Context,
	req *connect.Request[healthv1.RestoreAgentRequest],
) (*connect.Response[healthv1.RestoreAgentResponse], error) {
	f.restoredID = req.Msg.AgentId
	return connect.NewResponse(&healthv1.RestoreAgentResponse{Success: true}), nil
}

func (f *fakeAgentHandler) PurgeAgent(
	_ context.Context,
	req *connect.Request[healthv1.PurgeAgentRequest],
) (*connect.Response[healthv1.PurgeAgentResponse], error) {
	f.purgedID = req.Msg.AgentId
	return connect.NewResponse(&healthv1.PurgeAgentResponse{Success: true}), nil
}

func withAgentServer(t *testing.T, h *fakeAgentHandler) {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewAgentServiceHandler(h))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
}

func TestAgentsListCmd(t *testing.T) {
	withAgentServer(t, &fakeAgentHandler{})

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"agents", "list", "--org", "org-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Reviewer Bot") {
		t.Fatalf("expected output to contain the listed agent, got %s", out)
	}
}

func TestAgentsCreateCmd(t *testing.T) {
	withAgentServer(t, &fakeAgentHandler{})

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"agents", "create", "--org", "org-1", "--role", "ar_1", "--name", "Reviewer Bot"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Reviewer Bot") || !strings.Contains(out, "ag_new") {
		t.Fatalf("expected output to confirm the created agent, got %s", out)
	}
}

func TestAgentsListRolesCmd(t *testing.T) {
	withAgentServer(t, &fakeAgentHandler{})

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"agents", "list-roles"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Reviewer") {
		t.Fatalf("expected output to contain the listed role, got %s", out)
	}
}

func TestAgentsCreateRoleCmd(t *testing.T) {
	withAgentServer(t, &fakeAgentHandler{})

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"agents", "create-role", "--name", "Reviewer", "--system-prompt", "You review code", "--capabilities", "read,comment"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Reviewer") || !strings.Contains(out, "ar_new") {
		t.Fatalf("expected output to confirm the created role, got %s", out)
	}
}

func TestAgentsDeleteRestorePurgeCmd(t *testing.T) {
	fake := &fakeAgentHandler{}
	withAgentServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")

	rootCmd.SetArgs([]string{"agents", "delete", "ag_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.archivedID != "ag_1" {
		t.Fatalf("expected ArchiveAgent to be called with ag_1, got %q", fake.archivedID)
	}

	rootCmd.SetArgs([]string{"agents", "restore", "ag_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.restoredID != "ag_1" {
		t.Fatalf("expected RestoreAgent to be called with ag_1, got %q", fake.restoredID)
	}

	rootCmd.SetArgs([]string{"agents", "purge", "ag_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.purgedID != "ag_1" {
		t.Fatalf("expected PurgeAgent to be called with ag_1, got %q", fake.purgedID)
	}
}
