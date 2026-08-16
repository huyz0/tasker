package cmd

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"connectrpc.com/connect"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
)

type fakeOrgHandler struct {
	v1connect.UnimplementedOrgServiceHandler
	invitedEmail      string
	invitedUsername   string
	invitedRole       string
	updatedRoleArgs   *healthv1.UpdateOrgMemberRoleRequest
	removedArgs       *healthv1.RemoveOrgMemberRequest
	listedInvitesFor  string
	revokedInvitation string
}

func (f *fakeOrgHandler) ListInvitations(
	_ context.Context,
	req *connect.Request[healthv1.ListInvitationsRequest],
) (*connect.Response[healthv1.ListInvitationsResponse], error) {
	f.listedInvitesFor = req.Msg.OrgId
	return connect.NewResponse(&healthv1.ListInvitationsResponse{
		Invitations: []*healthv1.Invitation{
			{Id: "inv_1", Email: "live@example.com", Role: "member", Expired: false},
			{Id: "inv_2", Email: "lapsed@example.com", Role: "viewer", Expired: true},
		},
	}), nil
}

func (f *fakeOrgHandler) RevokeInvitation(
	_ context.Context,
	req *connect.Request[healthv1.RevokeInvitationRequest],
) (*connect.Response[healthv1.RevokeInvitationResponse], error) {
	f.revokedInvitation = req.Msg.InvitationId
	return connect.NewResponse(&healthv1.RevokeInvitationResponse{Success: true}), nil
}

func (f *fakeOrgHandler) RemoveOrgMember(
	_ context.Context,
	req *connect.Request[healthv1.RemoveOrgMemberRequest],
) (*connect.Response[healthv1.RemoveOrgMemberResponse], error) {
	f.removedArgs = req.Msg
	return connect.NewResponse(&healthv1.RemoveOrgMemberResponse{Success: true}), nil
}

func (f *fakeOrgHandler) SeedOrg(
	_ context.Context,
	req *connect.Request[healthv1.SeedOrgRequest],
) (*connect.Response[healthv1.SeedOrgResponse], error) {
	return connect.NewResponse(&healthv1.SeedOrgResponse{
		Organization: &healthv1.Organization{
			Id:          "org_1",
			Name:        req.Msg.Name,
			Slug:        req.Msg.Slug,
			ParentOrgId: req.Msg.ParentOrgId,
		},
	}), nil
}

func (f *fakeOrgHandler) InviteUser(
	_ context.Context,
	req *connect.Request[healthv1.InviteUserRequest],
) (*connect.Response[healthv1.InviteUserResponse], error) {
	if req.Msg.Email != nil {
		f.invitedEmail = *req.Msg.Email
	}
	if req.Msg.Username != nil {
		f.invitedUsername = *req.Msg.Username
	}
	if req.Msg.Role != nil {
		f.invitedRole = *req.Msg.Role
	}
	return connect.NewResponse(&healthv1.InviteUserResponse{Success: true}), nil
}

func (f *fakeOrgHandler) UpdateOrgMemberRole(
	_ context.Context,
	req *connect.Request[healthv1.UpdateOrgMemberRoleRequest],
) (*connect.Response[healthv1.UpdateOrgMemberRoleResponse], error) {
	f.updatedRoleArgs = req.Msg
	return connect.NewResponse(&healthv1.UpdateOrgMemberRoleResponse{
		Member: &healthv1.OrgMember{UserId: req.Msg.UserId, Role: req.Msg.Role},
	}), nil
}

func (f *fakeOrgHandler) ListOrgs(
	_ context.Context,
	_ *connect.Request[healthv1.ListOrgsRequest],
) (*connect.Response[healthv1.ListOrgsResponse], error) {
	return connect.NewResponse(&healthv1.ListOrgsResponse{
		Organizations: []*healthv1.Organization{{Id: "org_1", Name: "Seeded Org", Slug: "seeded-org"}},
	}), nil
}

func withOrgServer(t *testing.T, h *fakeOrgHandler) {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewOrgServiceHandler(h))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
}

func TestOrgsSeedCmd(t *testing.T) {
	withOrgServer(t, &fakeOrgHandler{})

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"orgs", "seed", "--name", "Seeded Org", "--slug", "seeded-org"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Seeded Org") || !strings.Contains(out, "org_1") {
		t.Fatalf("expected output to contain the seeded org, got %s", out)
	}
}

func TestOrgsInviteCmd(t *testing.T) {
	fake := &fakeOrgHandler{}
	withOrgServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"orgs", "invite", "org_1", "--email", "newuser@example.com"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.invitedEmail != "newuser@example.com" {
		t.Fatalf("expected invite to be sent to newuser@example.com, got %q", fake.invitedEmail)
	}
	if !strings.Contains(b.String(), "newuser@example.com") {
		t.Fatalf("expected output to mention the invited email, got %s", b.String())
	}
}

// M13-T09. orgsInviteCmd's flags are a package-level singleton that Cobra
// does not reset between Execute() calls in the same test binary, so a
// value another test set (e.g. --email) would otherwise leak in here and
// trip the exactly-one-of validation. Explicit resets, not a fresh command.
func TestOrgsInviteCmdByUsername(t *testing.T) {
	fake := &fakeOrgHandler{}
	withOrgServer(t, fake)
	orgsInviteCmd.Flags().Set("email", "")
	orgsInviteCmd.Flags().Set("role", "")

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"orgs", "invite", "org_1", "--username", "invited-handle"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.invitedUsername != "invited-handle" {
		t.Fatalf("expected invite to be sent to username invited-handle, got %q", fake.invitedUsername)
	}
	if fake.invitedEmail != "" {
		t.Fatalf("expected no email on a username invite, got %q", fake.invitedEmail)
	}
	if !strings.Contains(b.String(), "invited-handle") {
		t.Fatalf("expected output to mention the invited username, got %s", b.String())
	}
}

func TestOrgsInviteCmdRejectsNeitherEmailNorUsername(t *testing.T) {
	fake := &fakeOrgHandler{}
	withOrgServer(t, fake)
	orgsInviteCmd.Flags().Set("email", "")
	orgsInviteCmd.Flags().Set("username", "")

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"orgs", "invite", "org_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when neither --email nor --username is given")
	}
}

func TestOrgsInviteCmdRejectsBothEmailAndUsername(t *testing.T) {
	fake := &fakeOrgHandler{}
	withOrgServer(t, fake)

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"orgs", "invite", "org_1", "--email", "a@b.com", "--username", "a-handle"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when both --email and --username are given")
	}
}

func TestOrgsInviteCmdWithRole(t *testing.T) {
	fake := &fakeOrgHandler{}
	withOrgServer(t, fake)
	orgsInviteCmd.Flags().Set("username", "")

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"orgs", "invite", "org_1", "--email", "viewer@example.com", "--role", "viewer"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.invitedRole != "viewer" {
		t.Fatalf("expected invited role to be viewer, got %q", fake.invitedRole)
	}
}

func TestOrgsSetMemberRoleCmd(t *testing.T) {
	fake := &fakeOrgHandler{}
	withOrgServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"orgs", "set-role", "org_1", "user_1", "--role", "admin"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.updatedRoleArgs == nil || fake.updatedRoleArgs.OrgId != "org_1" || fake.updatedRoleArgs.UserId != "user_1" || fake.updatedRoleArgs.Role != "admin" {
		t.Fatalf("expected updateOrgMemberRole to be called with org_1/user_1/admin, got %+v", fake.updatedRoleArgs)
	}
	if !strings.Contains(b.String(), "admin") {
		t.Fatalf("expected output to mention the new role, got %s", b.String())
	}
}

func TestOrgsSetMemberRoleCmdRequiresRole(t *testing.T) {
	fake := &fakeOrgHandler{}
	withOrgServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"orgs", "set-role", "org_1", "user_1", "--role", ""})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when --role is omitted")
	}
}

func TestOrgsListCmd(t *testing.T) {
	withOrgServer(t, &fakeOrgHandler{})

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"orgs", "list"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), "Seeded Org") {
		t.Fatalf("expected output to list the seeded org, got %s", b.String())
	}
}

// `orgs leave` never asks for a user id: it resolves the signed-in user from
// the session. That is the whole point of the command, so the test asserts the
// id reaching RemoveOrgMember is the one GetIdentity returned - not one the
// caller typed.
func TestOrgsLeaveCmdRemovesTheSignedInUser(t *testing.T) {
	orgFake := &fakeOrgHandler{}
	authFake := &fakeAuthHandler{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewOrgServiceHandler(orgFake))
	mux.Handle(v1connect.NewAuthServiceHandler(authFake))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"orgs", "leave", "org_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if orgFake.removedArgs == nil {
		t.Fatal("expected leave to call RemoveOrgMember")
	}
	if orgFake.removedArgs.OrgId != "org_1" {
		t.Fatalf("expected org_1, got %q", orgFake.removedArgs.OrgId)
	}
	if orgFake.removedArgs.UserId != "user-1" {
		t.Fatalf("expected the signed-in user id from GetIdentity, got %q", orgFake.removedArgs.UserId)
	}
	if !strings.Contains(b.String(), "Left organization org_1") {
		t.Fatalf("expected confirmation output, got %s", b.String())
	}
}

// The server rejects a sole owner leaving. The CLI must surface that as a
// failure, not print "Left organization" over the top of an error.
func TestOrgsLeaveCmdReportsServerRefusal(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewOrgServiceHandler(&refusingOrgHandler{}))
	mux.Handle(v1connect.NewAuthServiceHandler(&fakeAuthHandler{}))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"orgs", "leave", "org_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected leaving as the last owner to fail")
	}
	if !strings.Contains(b.String(), "Failed to leave organization") {
		t.Fatalf("expected the refusal to be reported, got %s", b.String())
	}
	if strings.Contains(b.String(), "Left organization") {
		t.Fatalf("reported success despite an error: %s", b.String())
	}
}

type refusingOrgHandler struct {
	v1connect.UnimplementedOrgServiceHandler
}

func (refusingOrgHandler) RemoveOrgMember(
	_ context.Context,
	_ *connect.Request[healthv1.RemoveOrgMemberRequest],
) (*connect.Response[healthv1.RemoveOrgMemberResponse], error) {
	return nil, connect.NewError(connect.CodeFailedPrecondition, errors.New("cannot remove the organization's last owner"))
}

// M03-T12: the expired marker is the reason to read this list at all — a
// lapsed invitation looks identical to a live one without it.
func TestOrgsListInvitesCmdMarksExpiredInvitations(t *testing.T) {
	fake := &fakeOrgHandler{}
	withOrgServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"orgs", "list-invites", "org_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if fake.listedInvitesFor != "org_1" {
		t.Fatalf("expected the org id to reach the server, got %q", fake.listedInvitesFor)
	}
	out := b.String()
	if !strings.Contains(out, "live@example.com") || !strings.Contains(out, "lapsed@example.com") {
		t.Fatalf("expected both invitations listed, got %s", out)
	}
	if !strings.Contains(out, "EXPIRED") {
		t.Fatalf("expected the lapsed invitation to be marked expired, got %s", out)
	}
}

func TestOrgsRevokeInviteCmd(t *testing.T) {
	fake := &fakeOrgHandler{}
	withOrgServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"orgs", "revoke-invite", "inv_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	if fake.revokedInvitation != "inv_1" {
		t.Fatalf("expected inv_1 to be revoked, got %q", fake.revokedInvitation)
	}
	if !strings.Contains(b.String(), "Revoked invitation inv_1") {
		t.Fatalf("expected confirmation output, got %s", b.String())
	}
}
