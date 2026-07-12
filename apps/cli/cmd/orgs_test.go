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

type fakeOrgHandler struct {
	v1connect.UnimplementedOrgServiceHandler
	invitedEmail string
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
	f.invitedEmail = req.Msg.Email
	return connect.NewResponse(&healthv1.InviteUserResponse{Success: true}), nil
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
