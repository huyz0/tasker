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

type fakeTeamHandler struct {
	v1connect.UnimplementedTeamServiceHandler
	createdArgs      *healthv1.CreateTeamRequest
	updatedArgs      *healthv1.UpdateTeamRequest
	archivedTeamID   string
	restoredTeamID   string
	listedOrgID      string
	listedOnlyDel    bool
	addedMemberArgs  *healthv1.AddTeamMemberRequest
	removedMemberArg *healthv1.RemoveTeamMemberRequest
	listedMembersFor string
}

func (f *fakeTeamHandler) CreateTeam(
	_ context.Context,
	req *connect.Request[healthv1.CreateTeamRequest],
) (*connect.Response[healthv1.CreateTeamResponse], error) {
	f.createdArgs = req.Msg
	return connect.NewResponse(&healthv1.CreateTeamResponse{
		Team: &healthv1.Team{Id: "team_1", OrgId: req.Msg.OrgId, Name: req.Msg.Name},
	}), nil
}

func (f *fakeTeamHandler) UpdateTeam(
	_ context.Context,
	req *connect.Request[healthv1.UpdateTeamRequest],
) (*connect.Response[healthv1.UpdateTeamResponse], error) {
	f.updatedArgs = req.Msg
	return connect.NewResponse(&healthv1.UpdateTeamResponse{
		Team: &healthv1.Team{Id: req.Msg.TeamId, Name: req.Msg.Name},
	}), nil
}

func (f *fakeTeamHandler) ArchiveTeam(
	_ context.Context,
	req *connect.Request[healthv1.ArchiveTeamRequest],
) (*connect.Response[healthv1.ArchiveTeamResponse], error) {
	f.archivedTeamID = req.Msg.TeamId
	return connect.NewResponse(&healthv1.ArchiveTeamResponse{Success: true}), nil
}

func (f *fakeTeamHandler) RestoreTeam(
	_ context.Context,
	req *connect.Request[healthv1.RestoreTeamRequest],
) (*connect.Response[healthv1.RestoreTeamResponse], error) {
	f.restoredTeamID = req.Msg.TeamId
	return connect.NewResponse(&healthv1.RestoreTeamResponse{Success: true}), nil
}

func (f *fakeTeamHandler) ListTeams(
	_ context.Context,
	req *connect.Request[healthv1.ListTeamsRequest],
) (*connect.Response[healthv1.ListTeamsResponse], error) {
	f.listedOrgID = req.Msg.OrgId
	f.listedOnlyDel = req.Msg.OnlyDeleted
	return connect.NewResponse(&healthv1.ListTeamsResponse{
		Teams: []*healthv1.Team{{Id: "team_1", OrgId: req.Msg.OrgId, Name: "Platform"}},
	}), nil
}

func (f *fakeTeamHandler) AddTeamMember(
	_ context.Context,
	req *connect.Request[healthv1.AddTeamMemberRequest],
) (*connect.Response[healthv1.AddTeamMemberResponse], error) {
	f.addedMemberArgs = req.Msg
	return connect.NewResponse(&healthv1.AddTeamMemberResponse{Success: true}), nil
}

func (f *fakeTeamHandler) RemoveTeamMember(
	_ context.Context,
	req *connect.Request[healthv1.RemoveTeamMemberRequest],
) (*connect.Response[healthv1.RemoveTeamMemberResponse], error) {
	f.removedMemberArg = req.Msg
	return connect.NewResponse(&healthv1.RemoveTeamMemberResponse{Success: true}), nil
}

func (f *fakeTeamHandler) ListTeamMembers(
	_ context.Context,
	req *connect.Request[healthv1.ListTeamMembersRequest],
) (*connect.Response[healthv1.ListTeamMembersResponse], error) {
	f.listedMembersFor = req.Msg.TeamId
	return connect.NewResponse(&healthv1.ListTeamMembersResponse{
		Members: []*healthv1.TeamMember{{UserId: "user_1", Name: "Ada", Email: "ada@example.com"}},
	}), nil
}

func withTeamServer(t *testing.T, h *fakeTeamHandler) {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewTeamServiceHandler(h))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
}

func TestTeamsCreateCmd(t *testing.T) {
	fake := &fakeTeamHandler{}
	withTeamServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"teams", "create", "org_1", "--name", "Platform"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.createdArgs == nil || fake.createdArgs.OrgId != "org_1" || fake.createdArgs.Name != "Platform" {
		t.Fatalf("expected CreateTeam called with org_1/Platform, got %+v", fake.createdArgs)
	}
	if !strings.Contains(b.String(), "team_1") {
		t.Fatalf("expected output to contain the created team's id, got %s", b.String())
	}
}

func TestTeamsCreateCmdRequiresName(t *testing.T) {
	fake := &fakeTeamHandler{}
	withTeamServer(t, fake)
	teamsCreateCmd.Flags().Set("name", "")

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"teams", "create", "org_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when --name is omitted")
	}
	if fake.createdArgs != nil {
		t.Fatal("expected CreateTeam not to be called when validation fails client-side")
	}
}

func TestTeamsRenameCmd(t *testing.T) {
	fake := &fakeTeamHandler{}
	withTeamServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"teams", "rename", "team_1", "--name", "Platform Engineering"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.updatedArgs == nil || fake.updatedArgs.TeamId != "team_1" || fake.updatedArgs.Name != "Platform Engineering" {
		t.Fatalf("expected UpdateTeam called with team_1/Platform Engineering, got %+v", fake.updatedArgs)
	}
}

func TestTeamsDeleteAndRestoreCmd(t *testing.T) {
	fake := &fakeTeamHandler{}
	withTeamServer(t, fake)

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"teams", "delete", "team_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.archivedTeamID != "team_1" {
		t.Fatalf("expected ArchiveTeam called with team_1, got %q", fake.archivedTeamID)
	}

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"teams", "restore", "team_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.restoredTeamID != "team_1" {
		t.Fatalf("expected RestoreTeam called with team_1, got %q", fake.restoredTeamID)
	}
}

func TestTeamsListCmd(t *testing.T) {
	fake := &fakeTeamHandler{}
	withTeamServer(t, fake)
	teamsListCmd.Flags().Set("only-deleted", "false")

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"teams", "list", "org_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.listedOrgID != "org_1" {
		t.Fatalf("expected ListTeams called with org_1, got %q", fake.listedOrgID)
	}
	if !strings.Contains(b.String(), "Platform") {
		t.Fatalf("expected output to contain the team name, got %s", b.String())
	}
}

func TestTeamsListCmdOnlyDeleted(t *testing.T) {
	fake := &fakeTeamHandler{}
	withTeamServer(t, fake)

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"teams", "list", "org_1", "--only-deleted"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !fake.listedOnlyDel {
		t.Fatal("expected ListTeams to be called with onlyDeleted=true")
	}
	teamsListCmd.Flags().Set("only-deleted", "false")
}

func TestTeamsAddAndRemoveMemberCmd(t *testing.T) {
	fake := &fakeTeamHandler{}
	withTeamServer(t, fake)

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"teams", "add-member", "team_1", "user_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.addedMemberArgs == nil || fake.addedMemberArgs.TeamId != "team_1" || fake.addedMemberArgs.UserId != "user_1" {
		t.Fatalf("expected AddTeamMember called with team_1/user_1, got %+v", fake.addedMemberArgs)
	}

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"teams", "remove-member", "team_1", "user_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.removedMemberArg == nil || fake.removedMemberArg.TeamId != "team_1" || fake.removedMemberArg.UserId != "user_1" {
		t.Fatalf("expected RemoveTeamMember called with team_1/user_1, got %+v", fake.removedMemberArg)
	}
}

func TestTeamsListMembersCmd(t *testing.T) {
	fake := &fakeTeamHandler{}
	withTeamServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"teams", "list-members", "team_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.listedMembersFor != "team_1" {
		t.Fatalf("expected ListTeamMembers called with team_1, got %q", fake.listedMembersFor)
	}
	if !strings.Contains(b.String(), "Ada") {
		t.Fatalf("expected output to contain the member's name, got %s", b.String())
	}
}
