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

type fakeTokenHandler struct {
	v1connect.UnimplementedAgentServiceHandler
	gotCreate  *healthv1.CreateAgentTokenRequest
	gotRevoked string
	tokens     []*healthv1.AgentToken
}

func (f *fakeTokenHandler) CreateAgentToken(
	_ context.Context,
	req *connect.Request[healthv1.CreateAgentTokenRequest],
) (*connect.Response[healthv1.CreateAgentTokenResponse], error) {
	f.gotCreate = req.Msg
	return connect.NewResponse(&healthv1.CreateAgentTokenResponse{
		Token: &healthv1.AgentToken{
			Id: "tok_1", AgentId: req.Msg.AgentId, Name: req.Msg.Name,
			TokenPrefix: "tskr_ab12", Scopes: req.Msg.Scopes, ExpiresAt: "2026-11-13T00:00:00Z",
		},
		Plaintext: "tskr_ab12thisisthesecret",
	}), nil
}

func (f *fakeTokenHandler) ListAgentTokens(
	_ context.Context,
	_ *connect.Request[healthv1.ListAgentTokensRequest],
) (*connect.Response[healthv1.ListAgentTokensResponse], error) {
	return connect.NewResponse(&healthv1.ListAgentTokensResponse{Tokens: f.tokens}), nil
}

func (f *fakeTokenHandler) RevokeAgentToken(
	_ context.Context,
	req *connect.Request[healthv1.RevokeAgentTokenRequest],
) (*connect.Response[healthv1.RevokeAgentTokenResponse], error) {
	f.gotRevoked = req.Msg.TokenId
	return connect.NewResponse(&healthv1.RevokeAgentTokenResponse{Success: true}), nil
}

func withTokenServer(t *testing.T, h *fakeTokenHandler) {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewAgentServiceHandler(h))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
}

// Cobra keeps flag values on the command object between Execute() calls in one
// test binary, so a flag set by an earlier test leaks into a later one unless
// it is cleared. M03 lost time to exactly this.
func resetTokenFlags(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		_ = authTokenCreateCmd.Flags().Set("name", "")
		_ = authTokenCreateCmd.Flags().Set("scope", "")
		_ = authTokenCreateCmd.Flags().Set("expires-in-days", "0")
		_ = authTokenCreateCmd.Flags().Set("json", "false")
		_ = authTokenListCmd.Flags().Set("json", "false")
	})
}

func TestAuthTokenCreateShowsThePlaintextOnce(t *testing.T) {
	fake := &fakeTokenHandler{}
	withTokenServer(t, fake)
	resetTokenFlags(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"auth", "token", "create", "agent-1", "--name", "CI worker", "--scope", "tasks:read", "--scope", "tasks:write"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	out := b.String()
	if !strings.Contains(out, "tskr_ab12thisisthesecret") {
		t.Fatalf("the secret must be printed - there is no second chance to see it: %s", out)
	}
	if !strings.Contains(out, "only time") {
		t.Errorf("expected the output to say this is the only showing, got %s", out)
	}
	if fake.gotCreate == nil || len(fake.gotCreate.Scopes) != 2 {
		t.Fatalf("expected both scopes to be forwarded, got %+v", fake.gotCreate)
	}
	if fake.gotCreate.Scopes[0] != "tasks:read" || fake.gotCreate.Scopes[1] != "tasks:write" {
		t.Errorf("expected repeated --scope flags to accumulate, got %v", fake.gotCreate.Scopes)
	}
}

func TestAuthTokenCreateForwardsExpiry(t *testing.T) {
	fake := &fakeTokenHandler{}
	withTokenServer(t, fake)
	resetTokenFlags(t)

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"auth", "token", "create", "agent-1", "--name", "n", "--scope", "tasks:read", "--expires-in-days", "30"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.gotCreate.ExpiresInDays != 30 {
		t.Errorf("expected 30, got %d", fake.gotCreate.ExpiresInDays)
	}
}

func TestAuthTokenCreateRequiresNameAndScope(t *testing.T) {
	withTokenServer(t, &fakeTokenHandler{})
	resetTokenFlags(t)

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"auth", "token", "create", "agent-1"})
	if err := rootCmd.Execute(); err == nil {
		t.Error("expected a token with no name and no scopes to be refused")
	}
}

func TestAuthTokenListNeverPrintsASecret(t *testing.T) {
	fake := &fakeTokenHandler{tokens: []*healthv1.AgentToken{
		{Id: "tok_1", Name: "CI", TokenPrefix: "tskr_ab12", ExpiresAt: "2026-11-13T00:00:00Z"},
		{Id: "tok_2", Name: "Old", TokenPrefix: "tskr_cd34", ExpiresAt: "2026-01-01T00:00:00Z", Expired: true},
		{Id: "tok_3", Name: "Dead", TokenPrefix: "tskr_ef56", ExpiresAt: "2026-11-13T00:00:00Z", RevokedAt: "2026-08-01T00:00:00Z"},
	}}
	withTokenServer(t, fake)
	resetTokenFlags(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"auth", "token", "list", "agent-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	out := b.String()
	for _, want := range []string{"tok_1", "tskr_ab12", "active", "expired", "revoked", "never used"} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in the listing, got %s", want, out)
		}
	}
}

func TestAuthTokenListSaysSoWhenThereAreNone(t *testing.T) {
	withTokenServer(t, &fakeTokenHandler{})
	resetTokenFlags(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"auth", "token", "list", "agent-1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	// An agent with no tokens is a normal state, not an error or a blank screen.
	if !strings.Contains(b.String(), "No tokens") {
		t.Errorf("expected an empty-state line, got %s", b.String())
	}
}

func TestAuthTokenRevoke(t *testing.T) {
	fake := &fakeTokenHandler{}
	withTokenServer(t, fake)
	resetTokenFlags(t)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"auth", "token", "revoke", "tok_9"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.gotRevoked != "tok_9" {
		t.Errorf("expected tok_9 to be revoked, got %q", fake.gotRevoked)
	}
	if !strings.Contains(b.String(), "revoked") {
		t.Errorf("expected confirmation, got %s", b.String())
	}
}

// M17-T03: revoke had no --json support at all.
func TestAuthTokenRevokeJSON(t *testing.T) {
	fake := &fakeTokenHandler{}
	withTokenServer(t, fake)
	resetTokenFlags(t)
	t.Cleanup(func() { rootCmd.Flags().Set("json", "false") })

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"auth", "token", "revoke", "tok_9", "--json"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.gotRevoked != "tok_9" {
		t.Errorf("expected tok_9 to be revoked, got %q", fake.gotRevoked)
	}
	out := b.String()
	if !strings.Contains(out, `"success":true`) || !strings.Contains(out, `"tok_9"`) {
		t.Fatalf("expected JSON output, got %s", out)
	}
}
