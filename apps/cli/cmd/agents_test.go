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
	archivedID    string
	restoredID    string
	purgedID      string
	gotListPage   *healthv1.PageRequest
	gotRolePage   *healthv1.PageRequest
	gotListReq    *healthv1.ListAgentsRequest
	gotUpdate     *healthv1.UpdateAgentRequest
	gotRoleUpdate *healthv1.UpdateAgentRoleRequest
}

func (f *fakeAgentHandler) ListAgents(
	_ context.Context,
	req *connect.Request[healthv1.ListAgentsRequest],
) (*connect.Response[healthv1.ListAgentsResponse], error) {
	f.gotListPage = req.Msg.Page
	f.gotListReq = req.Msg
	return connect.NewResponse(&healthv1.ListAgentsResponse{
		Agents: []*healthv1.Agent{
			{Id: "ag_1", OrgId: req.Msg.OrgId, AgentRoleId: "ar_1", Name: "Reviewer Bot"},
		},
	}), nil
}

func (f *fakeAgentHandler) UpdateAgent(
	_ context.Context,
	req *connect.Request[healthv1.UpdateAgentRequest],
) (*connect.Response[healthv1.UpdateAgentResponse], error) {
	f.gotUpdate = req.Msg
	agent := &healthv1.Agent{Id: req.Msg.AgentId, Name: "Reviewer Bot", AgentRoleId: "ar_1"}
	if req.Msg.Name != nil {
		agent.Name = *req.Msg.Name
	}
	if req.Msg.AgentRoleId != nil {
		agent.AgentRoleId = *req.Msg.AgentRoleId
	}
	return connect.NewResponse(&healthv1.UpdateAgentResponse{Agent: agent}), nil
}

func (f *fakeAgentHandler) UpdateAgentRole(
	_ context.Context,
	req *connect.Request[healthv1.UpdateAgentRoleRequest],
) (*connect.Response[healthv1.UpdateAgentRoleResponse], error) {
	f.gotRoleUpdate = req.Msg
	role := &healthv1.AgentRole{Id: req.Msg.Id, Name: "Reviewer"}
	if req.Msg.Name != nil {
		role.Name = *req.Msg.Name
	}
	if req.Msg.SystemPrompt != nil {
		role.SystemPrompt = *req.Msg.SystemPrompt
	}
	if req.Msg.Capabilities != nil {
		role.Capabilities = *req.Msg.Capabilities
	}
	return connect.NewResponse(&healthv1.UpdateAgentRoleResponse{Role: role}), nil
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
	req *connect.Request[healthv1.ListAgentRolesRequest],
) (*connect.Response[healthv1.ListAgentRolesResponse], error) {
	f.gotRolePage = req.Msg.Page
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
	fake := &fakeAgentHandler{}
	withAgentServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"agents", "list", "--org", "org-1", "--cursor", "cursor-2", "--limit", "10"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Reviewer Bot") {
		t.Fatalf("expected output to contain the listed agent, got %s", out)
	}
	if fake.gotListPage == nil || fake.gotListPage.Cursor != "cursor-2" || fake.gotListPage.Limit != 10 {
		t.Fatalf("expected cursor/limit to be forwarded, got %+v", fake.gotListPage)
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

func TestAgentsListCmdOnlyDeleted(t *testing.T) {
	fake := &fakeAgentHandler{}
	withAgentServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"agents", "list", "--org", "org-1", "--only-deleted"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.gotListReq == nil || !fake.gotListReq.OnlyDeleted {
		t.Fatalf("expected --only-deleted to be forwarded as OnlyDeleted=true, got %+v", fake.gotListReq)
	}
}

func TestAgentsUpdateCmd(t *testing.T) {
	fake := &fakeAgentHandler{}
	withAgentServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"agents", "update", "ag_1", "--name", "Renamed Bot", "--role", "ar_2"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.gotUpdate == nil || fake.gotUpdate.AgentId != "ag_1" {
		t.Fatalf("expected UpdateAgent to be called with ag_1, got %+v", fake.gotUpdate)
	}
	if fake.gotUpdate.Name == nil || *fake.gotUpdate.Name != "Renamed Bot" {
		t.Errorf("expected name to be forwarded, got %+v", fake.gotUpdate.Name)
	}
	if fake.gotUpdate.AgentRoleId == nil || *fake.gotUpdate.AgentRoleId != "ar_2" {
		t.Errorf("expected role to be forwarded, got %+v", fake.gotUpdate.AgentRoleId)
	}
	out := b.String()
	if !strings.Contains(out, "Renamed Bot") {
		t.Fatalf("expected output to confirm the update, got %s", out)
	}
}

func TestAgentsUpdateCmdRequiresNameOrRole(t *testing.T) {
	withAgentServer(t, &fakeAgentHandler{})

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	agentsUpdateCmd.Flags().Set("name", "")
	agentsUpdateCmd.Flags().Set("role", "")
	rootCmd.SetArgs([]string{"agents", "update", "ag_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected update with neither --name nor --role to be refused")
	}
}

func TestAgentsUpdateRoleCmd(t *testing.T) {
	fake := &fakeAgentHandler{}
	withAgentServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"agents", "update-role", "ar_1", "--system-prompt", "Be extra careful"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.gotRoleUpdate == nil || fake.gotRoleUpdate.Id != "ar_1" {
		t.Fatalf("expected UpdateAgentRole to be called with ar_1, got %+v", fake.gotRoleUpdate)
	}
	if fake.gotRoleUpdate.SystemPrompt == nil || *fake.gotRoleUpdate.SystemPrompt != "Be extra careful" {
		t.Errorf("expected system prompt to be forwarded, got %+v", fake.gotRoleUpdate.SystemPrompt)
	}
	if fake.gotRoleUpdate.Name != nil {
		t.Errorf("expected name to be left unset when not passed, got %+v", fake.gotRoleUpdate.Name)
	}
}

func TestAgentsUpdateRoleCmdRequiresAField(t *testing.T) {
	withAgentServer(t, &fakeAgentHandler{})

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	agentsUpdateRoleCmd.Flags().Set("name", "")
	agentsUpdateRoleCmd.Flags().Set("system-prompt", "")
	agentsUpdateRoleCmd.Flags().Set("capabilities", "")
	rootCmd.SetArgs([]string{"agents", "update-role", "ar_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected update-role with no fields to be refused")
	}
}

func TestAgentsListRolesCmd(t *testing.T) {
	fake := &fakeAgentHandler{}
	withAgentServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"agents", "list-roles", "--org", "org_1", "--cursor", "cursor-2", "--limit", "10"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Reviewer") {
		t.Fatalf("expected output to contain the listed role, got %s", out)
	}
	if fake.gotRolePage == nil || fake.gotRolePage.Cursor != "cursor-2" || fake.gotRolePage.Limit != 10 {
		t.Fatalf("expected cursor/limit to be forwarded, got %+v", fake.gotRolePage)
	}
}

func TestAgentsCreateRoleCmd(t *testing.T) {
	withAgentServer(t, &fakeAgentHandler{})

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"agents", "create-role", "--org", "org_1", "--name", "Reviewer", "--system-prompt", "You review code", "--capabilities", "read,comment"})
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

// M17-T03: delete/restore/purge always printed plain text, even under --json.
func TestAgentsDeleteRestorePurgeCmdJSON(t *testing.T) {
	fake := &fakeAgentHandler{}
	withAgentServer(t, fake)
	t.Cleanup(func() { rootCmd.Flags().Set("json", "false") })

	for _, args := range [][]string{
		{"agents", "delete", "ag_1", "--json"},
		{"agents", "restore", "ag_1", "--json"},
		{"agents", "purge", "ag_1", "--json"},
	} {
		b := bytes.NewBufferString("")
		rootCmd.SetOut(b)
		rootCmd.SetArgs(args)
		if err := rootCmd.Execute(); err != nil {
			t.Fatal(err)
		}
		out := b.String()
		if !strings.Contains(out, `"success":true`) || !strings.Contains(out, `"ag_1"`) {
			t.Fatalf("expected %v to print JSON, got %s", args, out)
		}
	}
}

// M03-T05: a role belongs to one organization, so both commands must refuse
// rather than silently act on whatever the server would default to.
//
// The explicit flag reset is not ceremony: cobra keeps flag values on the
// command object, and every test in this binary shares one rootCmd, so a
// previous test passing --org leaves it set and this test would pass while
// proving nothing.
func TestAgentRoleCommandsRequireAnOrg(t *testing.T) {
	agentsListRolesCmd.Flags().Set("org", "")
	agentsCreateRoleCmd.Flags().Set("org", "")

	for _, args := range [][]string{
		{"agents", "list-roles"},
		{"agents", "create-role", "--name", "Reviewer"},
	} {
		withAgentServer(t, &fakeAgentHandler{})
		b := bytes.NewBufferString("")
		rootCmd.SetOut(b)
		rootCmd.SetErr(b)
		rootCmd.SetArgs(args)
		if err := rootCmd.Execute(); err == nil {
			t.Fatalf("expected %v to require --org", args)
		}
		if !strings.Contains(b.String(), "--org is required") {
			t.Fatalf("expected %v to say why it failed, got %s", args, b.String())
		}
	}
}
