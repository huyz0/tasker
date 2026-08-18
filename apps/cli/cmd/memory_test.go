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

type fakeMemoryHandler struct {
	v1connect.UnimplementedMemoryServiceHandler
	searchedArgs     *healthv1.SearchBeliefsRequest
	recordedArgs     *healthv1.RecordBeliefRequest
	gotBeliefID      string
	listedArgs       *healthv1.ListBeliefsRequest
	updatedArgs      *healthv1.UpdateBeliefRequest
	supersededArgs   *healthv1.SupersedeBeliefRequest
	promotedArgs     *healthv1.PromoteBeliefRequest
	relatedArgs      *healthv1.RelateBeliefsRequest
	unrelatedID      string
	listedRelFor     string
	listedPromosFor  string
	archivedBeliefID string
	restoredBeliefID string
	purgedBeliefID   string
}

func (f *fakeMemoryHandler) SearchBeliefs(
	_ context.Context,
	req *connect.Request[healthv1.SearchBeliefsRequest],
) (*connect.Response[healthv1.SearchBeliefsResponse], error) {
	f.searchedArgs = req.Msg
	return connect.NewResponse(&healthv1.SearchBeliefsResponse{
		Beliefs: []*healthv1.Belief{{Id: "blf_1", Statement: "Tests must pass", ScopeType: req.Msg.ScopeType, ScopeId: req.Msg.ScopeId, Confidence: "high", Status: "active"}},
	}), nil
}

func (f *fakeMemoryHandler) RecordBelief(
	_ context.Context,
	req *connect.Request[healthv1.RecordBeliefRequest],
) (*connect.Response[healthv1.RecordBeliefResponse], error) {
	f.recordedArgs = req.Msg
	return connect.NewResponse(&healthv1.RecordBeliefResponse{
		Belief: &healthv1.Belief{Id: "blf_1", OrgId: req.Msg.OrgId, ScopeType: req.Msg.ScopeType, ScopeId: req.Msg.ScopeId, Statement: req.Msg.Statement, Confidence: "medium", Status: "active"},
	}), nil
}

func (f *fakeMemoryHandler) GetBelief(
	_ context.Context,
	req *connect.Request[healthv1.GetBeliefRequest],
) (*connect.Response[healthv1.GetBeliefResponse], error) {
	f.gotBeliefID = req.Msg.Id
	return connect.NewResponse(&healthv1.GetBeliefResponse{
		Belief: &healthv1.Belief{Id: req.Msg.Id, Statement: "Fetched belief", ScopeType: "project", ScopeId: "proj_1", Confidence: "medium", Status: "active"},
	}), nil
}

func (f *fakeMemoryHandler) ListBeliefs(
	_ context.Context,
	req *connect.Request[healthv1.ListBeliefsRequest],
) (*connect.Response[healthv1.ListBeliefsResponse], error) {
	f.listedArgs = req.Msg
	return connect.NewResponse(&healthv1.ListBeliefsResponse{
		Beliefs: []*healthv1.Belief{{Id: "blf_1", Statement: "Listed belief", ScopeType: req.Msg.ScopeType, ScopeId: req.Msg.ScopeId, Confidence: "medium", Status: "active"}},
		Page:    &healthv1.PageResponse{},
	}), nil
}

func (f *fakeMemoryHandler) UpdateBelief(
	_ context.Context,
	req *connect.Request[healthv1.UpdateBeliefRequest],
) (*connect.Response[healthv1.UpdateBeliefResponse], error) {
	f.updatedArgs = req.Msg
	b := &healthv1.Belief{Id: req.Msg.Id, ScopeType: "project", ScopeId: "proj_1", Statement: "original", Confidence: "medium", Status: "active"}
	if req.Msg.Statement != nil {
		b.Statement = *req.Msg.Statement
	}
	if req.Msg.Confidence != nil {
		b.Confidence = *req.Msg.Confidence
	}
	return connect.NewResponse(&healthv1.UpdateBeliefResponse{Belief: b}), nil
}

func (f *fakeMemoryHandler) SupersedeBelief(
	_ context.Context,
	req *connect.Request[healthv1.SupersedeBeliefRequest],
) (*connect.Response[healthv1.SupersedeBeliefResponse], error) {
	f.supersededArgs = req.Msg
	return connect.NewResponse(&healthv1.SupersedeBeliefResponse{
		Belief: &healthv1.Belief{Id: "blf_2", Statement: req.Msg.Statement, ScopeType: "project", ScopeId: "proj_1", Confidence: "medium", Status: "active"},
	}), nil
}

func (f *fakeMemoryHandler) PromoteBelief(
	_ context.Context,
	req *connect.Request[healthv1.PromoteBeliefRequest],
) (*connect.Response[healthv1.PromoteBeliefResponse], error) {
	f.promotedArgs = req.Msg
	return connect.NewResponse(&healthv1.PromoteBeliefResponse{
		Belief:    &healthv1.Belief{Id: req.Msg.Id, ScopeType: req.Msg.ToScopeType, ScopeId: req.Msg.ToScopeId, Statement: "promoted", Confidence: "medium", Status: "active"},
		Promotion: &healthv1.BeliefPromotion{Id: "promo_1", BeliefId: req.Msg.Id, FromScopeType: "project", FromScopeId: "proj_1", ToScopeType: req.Msg.ToScopeType, ToScopeId: req.Msg.ToScopeId, PromotedBy: "user_1", PromotedAt: "2026-01-01T00:00:00Z"},
	}), nil
}

func (f *fakeMemoryHandler) RelateBeliefs(
	_ context.Context,
	req *connect.Request[healthv1.RelateBeliefsRequest],
) (*connect.Response[healthv1.RelateBeliefsResponse], error) {
	f.relatedArgs = req.Msg
	return connect.NewResponse(&healthv1.RelateBeliefsResponse{
		Relation: &healthv1.BeliefRelation{Id: "rel_1", BeliefAId: req.Msg.BeliefAId, BeliefBId: req.Msg.BeliefBId, RelationType: req.Msg.RelationType},
	}), nil
}

func (f *fakeMemoryHandler) UnrelateBeliefs(
	_ context.Context,
	req *connect.Request[healthv1.UnrelateBeliefsRequest],
) (*connect.Response[healthv1.UnrelateBeliefsResponse], error) {
	f.unrelatedID = req.Msg.RelationId
	return connect.NewResponse(&healthv1.UnrelateBeliefsResponse{Success: true}), nil
}

func (f *fakeMemoryHandler) ListBeliefRelations(
	_ context.Context,
	req *connect.Request[healthv1.ListBeliefRelationsRequest],
) (*connect.Response[healthv1.ListBeliefRelationsResponse], error) {
	f.listedRelFor = req.Msg.BeliefId
	return connect.NewResponse(&healthv1.ListBeliefRelationsResponse{
		Relations: []*healthv1.BeliefRelation{{Id: "rel_1", BeliefAId: req.Msg.BeliefId, BeliefBId: "blf_2", RelationType: "relates_to"}},
	}), nil
}

func (f *fakeMemoryHandler) ListBeliefPromotions(
	_ context.Context,
	req *connect.Request[healthv1.ListBeliefPromotionsRequest],
) (*connect.Response[healthv1.ListBeliefPromotionsResponse], error) {
	f.listedPromosFor = req.Msg.BeliefId
	return connect.NewResponse(&healthv1.ListBeliefPromotionsResponse{
		Promotions: []*healthv1.BeliefPromotion{{Id: "promo_1", BeliefId: req.Msg.BeliefId, FromScopeType: "project", FromScopeId: "proj_1", ToScopeType: "organization", ToScopeId: "org_1", PromotedBy: "user_1", PromotedAt: "2026-01-01T00:00:00Z"}},
	}), nil
}

func (f *fakeMemoryHandler) ArchiveBelief(
	_ context.Context,
	req *connect.Request[healthv1.ArchiveBeliefRequest],
) (*connect.Response[healthv1.ArchiveBeliefResponse], error) {
	f.archivedBeliefID = req.Msg.Id
	return connect.NewResponse(&healthv1.ArchiveBeliefResponse{Success: true}), nil
}

func (f *fakeMemoryHandler) RestoreBelief(
	_ context.Context,
	req *connect.Request[healthv1.RestoreBeliefRequest],
) (*connect.Response[healthv1.RestoreBeliefResponse], error) {
	f.restoredBeliefID = req.Msg.Id
	return connect.NewResponse(&healthv1.RestoreBeliefResponse{Success: true}), nil
}

func (f *fakeMemoryHandler) PurgeBelief(
	_ context.Context,
	req *connect.Request[healthv1.PurgeBeliefRequest],
) (*connect.Response[healthv1.PurgeBeliefResponse], error) {
	f.purgedBeliefID = req.Msg.Id
	return connect.NewResponse(&healthv1.PurgeBeliefResponse{Success: true}), nil
}

func withMemoryServer(t *testing.T, h *fakeMemoryHandler) {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewMemoryServiceHandler(h))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
}

func TestMemorySearchCmd(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	t.Cleanup(func() {
		_ = memorySearchCmd.Flags().Set("scope-id", "")
	})
	rootCmd.SetArgs([]string{"memory", "search", "Tests must pass", "--scope-type", "project", "--scope-id", "proj_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.searchedArgs == nil || fake.searchedArgs.ScopeType != "project" || fake.searchedArgs.ScopeId != "proj_1" || fake.searchedArgs.Query != "Tests must pass" {
		t.Fatalf("expected SearchBeliefs called with project/proj_1/Tests must pass, got %+v", fake.searchedArgs)
	}
	if !strings.Contains(b.String(), "blf_1") {
		t.Fatalf("expected output to contain the belief id, got %s", b.String())
	}
}

func TestMemorySearchCmdDefaultsScopeToProjectEnv(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)
	t.Setenv("TASKER_PROJECT_ID", "proj_env")

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"memory", "search", "q"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.searchedArgs == nil || fake.searchedArgs.ScopeType != "project" || fake.searchedArgs.ScopeId != "proj_env" {
		t.Fatalf("expected scope to default to project/TASKER_PROJECT_ID, got %+v", fake.searchedArgs)
	}
}

func TestMemorySearchCmdOrganizationScopeUsesOrgEnv(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)
	t.Setenv("TASKER_ORG_ID", "org_env")
	// flag-leak hygiene (M20-T10's documented gotcha): --scope-type here is
	// the same FlagSet value every other test in this file reads its own
	// default from, so it has to come back to "project" regardless of how
	// this test exits.
	t.Cleanup(func() {
		_ = memorySearchCmd.Flags().Set("scope-type", "project")
	})

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"memory", "search", "q", "--scope-type", "organization"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.searchedArgs == nil || fake.searchedArgs.ScopeType != "organization" || fake.searchedArgs.ScopeId != "org_env" {
		t.Fatalf("expected scope to default to organization/TASKER_ORG_ID, got %+v", fake.searchedArgs)
	}
}

func TestMemorySearchCmdRequiresScopeIdForTeamScope(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)
	t.Cleanup(func() {
		_ = memorySearchCmd.Flags().Set("scope-type", "project")
	})

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"memory", "search", "q", "--scope-type", "team"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when team scope has no --scope-id and no env fallback")
	}
	if fake.searchedArgs != nil {
		t.Fatal("expected SearchBeliefs not to be called when scope validation fails client-side")
	}
}

func TestMemorySearchCmdForwardsFilters(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)
	t.Cleanup(func() {
		_ = memorySearchCmd.Flags().Set("scope-id", "")
		_ = memorySearchCmd.Flags().Set("status", "")
		_ = memorySearchCmd.Flags().Set("confidence", "")
		_ = memorySearchCmd.Flags().Set("task", "")
		_ = memorySearchCmd.Flags().Set("limit", "0")
	})

	rootCmd.SetArgs([]string{
		"memory", "search", "q", "--scope-type", "project", "--scope-id", "proj_1",
		"--status", "superseded", "--confidence", "high", "--task", "task_1", "--limit", "5",
	})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	req := fake.searchedArgs
	if req == nil || req.Status == nil || *req.Status != "superseded" || req.Confidence == nil || *req.Confidence != "high" ||
		req.TaskId == nil || *req.TaskId != "task_1" || req.Limit == nil || *req.Limit != 5 {
		t.Fatalf("expected every filter forwarded, got %+v", req)
	}
}

func TestMemoryRecordCmd(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	t.Cleanup(func() {
		_ = memoryRecordCmd.Flags().Set("org", "")
		_ = memoryRecordCmd.Flags().Set("scope-id", "")
		_ = memoryRecordCmd.Flags().Set("confidence", "")
	})
	rootCmd.SetArgs([]string{"memory", "record", "New fact", "--org", "org_1", "--scope-type", "project", "--scope-id", "proj_1", "--confidence", "high"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.recordedArgs == nil || fake.recordedArgs.OrgId != "org_1" || fake.recordedArgs.Statement != "New fact" ||
		fake.recordedArgs.Confidence == nil || *fake.recordedArgs.Confidence != "high" {
		t.Fatalf("expected RecordBelief called with org_1/New fact/high, got %+v", fake.recordedArgs)
	}
	if !strings.Contains(b.String(), "blf_1") {
		t.Fatalf("expected output to contain the created belief id, got %s", b.String())
	}
}

func TestMemoryRecordCmdRequiresOrg(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)
	t.Setenv("TASKER_ORG_ID", "")
	t.Cleanup(func() {
		_ = memoryRecordCmd.Flags().Set("scope-id", "")
	})

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"memory", "record", "New fact", "--scope-type", "project", "--scope-id", "proj_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when --org is omitted and TASKER_ORG_ID is unset")
	}
	if fake.recordedArgs != nil {
		t.Fatal("expected RecordBelief not to be called when validation fails client-side")
	}
}

func TestMemoryRecordCmdForwardsSourceLinks(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)
	t.Cleanup(func() {
		_ = memoryRecordCmd.Flags().Set("org", "")
		_ = memoryRecordCmd.Flags().Set("scope-id", "")
		_ = memoryRecordCmd.Flags().Set("source-task", "")
		_ = memoryRecordCmd.Flags().Set("source-comment", "")
		_ = memoryRecordCmd.Flags().Set("source-note", "")
		_ = memoryRecordCmd.Flags().Set("source-artifact", "")
	})

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{
		"memory", "record", "New fact", "--org", "org_1", "--scope-type", "project", "--scope-id", "proj_1",
		"--source-task", "task_1", "--source-comment", "cmt_1", "--source-note", "note_1", "--source-artifact", "art_1",
	})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	req := fake.recordedArgs
	if req == nil || req.SourceTaskId == nil || *req.SourceTaskId != "task_1" ||
		req.SourceCommentId == nil || *req.SourceCommentId != "cmt_1" ||
		req.SourceTaskNoteId == nil || *req.SourceTaskNoteId != "note_1" ||
		req.SourceArtifactId == nil || *req.SourceArtifactId != "art_1" {
		t.Fatalf("expected every source link forwarded, got %+v", req)
	}
}

func TestMemoryGetCmd(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"memory", "get", "blf_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.gotBeliefID != "blf_1" {
		t.Fatalf("expected GetBelief called with blf_1, got %q", fake.gotBeliefID)
	}
	if !strings.Contains(b.String(), "Fetched belief") {
		t.Fatalf("expected output to contain the belief statement, got %s", b.String())
	}
}

func TestMemoryGetCmdJSON(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	t.Cleanup(func() {
		_ = rootCmd.Flags().Set("json", "false")
	})
	rootCmd.Flags().Set("json", "true")
	rootCmd.SetArgs([]string{"memory", "get", "blf_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), `"id":"blf_1"`) {
		t.Fatalf("expected JSON output with the belief id, got %s", b.String())
	}
}

func TestMemoryListCmd(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	t.Cleanup(func() {
		_ = memoryListCmd.Flags().Set("scope-id", "")
	})
	rootCmd.SetArgs([]string{"memory", "list", "--scope-type", "project", "--scope-id", "proj_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.listedArgs == nil || fake.listedArgs.ScopeType != "project" || fake.listedArgs.ScopeId != "proj_1" {
		t.Fatalf("expected ListBeliefs called with project/proj_1, got %+v", fake.listedArgs)
	}
	if !strings.Contains(b.String(), "Listed belief") {
		t.Fatalf("expected output to contain the belief statement, got %s", b.String())
	}
}

func TestMemoryUpdateCmd(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	t.Cleanup(func() {
		_ = memoryUpdateCmd.Flags().Set("confidence", "")
	})
	rootCmd.SetArgs([]string{"memory", "update", "blf_1", "--confidence", "low"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.updatedArgs == nil || fake.updatedArgs.Id != "blf_1" || fake.updatedArgs.Statement != nil ||
		fake.updatedArgs.Confidence == nil || *fake.updatedArgs.Confidence != "low" {
		t.Fatalf("expected UpdateBelief called with only confidence set (statement left nil), got %+v", fake.updatedArgs)
	}
}

// cmd.Flags().Changed(name) never resets itself once a flag has been set -
// Set()'s value goes back to "", but Changed stays true forever after, for
// the lifetime of this package-level command singleton (M20-T10's
// documented gotcha, projects_test.go's TestProjectsUpdateCommand records
// the same fix). TestMemoryUpdateCmd, above, sets --confidence on this same
// memoryUpdateCmd, which would otherwise make this test's "neither field
// passed" case pass only by accident of declaration order.
func TestMemoryUpdateCmdRequiresAField(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)
	for _, name := range []string{"statement", "confidence"} {
		if f := memoryUpdateCmd.Flags().Lookup(name); f != nil {
			f.Changed = false
		}
	}

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"memory", "update", "blf_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when neither --statement nor --confidence is passed")
	}
	if fake.updatedArgs != nil {
		t.Fatal("expected UpdateBelief not to be called when validation fails client-side")
	}
}

func TestMemorySupersedeCmd(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"memory", "supersede", "blf_1", "Corrected statement"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.supersededArgs == nil || fake.supersededArgs.Id != "blf_1" || fake.supersededArgs.Statement != "Corrected statement" {
		t.Fatalf("expected SupersedeBelief called with blf_1/Corrected statement, got %+v", fake.supersededArgs)
	}
	if !strings.Contains(b.String(), "blf_1") || !strings.Contains(b.String(), "blf_2") {
		t.Fatalf("expected output to name both the old and the new belief id, got %s", b.String())
	}
}

func TestMemoryPromoteCmd(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	t.Cleanup(func() {
		_ = memoryPromoteCmd.Flags().Set("to-scope-type", "")
		_ = memoryPromoteCmd.Flags().Set("to-scope-id", "")
		_ = memoryPromoteCmd.Flags().Set("note", "")
	})
	rootCmd.SetArgs([]string{"memory", "promote", "blf_1", "--to-scope-type", "organization", "--to-scope-id", "org_1", "--note", "widely useful"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.promotedArgs == nil || fake.promotedArgs.Id != "blf_1" || fake.promotedArgs.ToScopeType != "organization" ||
		fake.promotedArgs.ToScopeId != "org_1" || fake.promotedArgs.Note == nil || *fake.promotedArgs.Note != "widely useful" {
		t.Fatalf("expected PromoteBelief called with the full request, got %+v", fake.promotedArgs)
	}
	if !strings.Contains(b.String(), "organization") {
		t.Fatalf("expected output to mention the destination scope, got %s", b.String())
	}
}

func TestMemoryPromoteCmdRequiresDestination(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"memory", "promote", "blf_1"})
	if err := rootCmd.Execute(); err == nil {
		t.Fatal("expected an error when --to-scope-type/--to-scope-id are omitted")
	}
	if fake.promotedArgs != nil {
		t.Fatal("expected PromoteBelief not to be called when validation fails client-side")
	}
}

func TestMemoryRelateAndUnrelateCmd(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)

	t.Cleanup(func() {
		_ = memoryRelateCmd.Flags().Set("type", "relates_to")
	})
	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"memory", "relate", "blf_1", "blf_2", "--type", "contradicts"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.relatedArgs == nil || fake.relatedArgs.BeliefAId != "blf_1" || fake.relatedArgs.BeliefBId != "blf_2" || fake.relatedArgs.RelationType != "contradicts" {
		t.Fatalf("expected RelateBeliefs called with blf_1/blf_2/contradicts, got %+v", fake.relatedArgs)
	}

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"memory", "unrelate", "rel_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.unrelatedID != "rel_1" {
		t.Fatalf("expected UnrelateBeliefs called with rel_1, got %q", fake.unrelatedID)
	}
}

func TestMemoryListRelationsAndPromotionsCmd(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"memory", "list-relations", "blf_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.listedRelFor != "blf_1" {
		t.Fatalf("expected ListBeliefRelations called with blf_1, got %q", fake.listedRelFor)
	}
	if !strings.Contains(b.String(), "rel_1") {
		t.Fatalf("expected output to contain the relation id, got %s", b.String())
	}

	b2 := bytes.NewBufferString("")
	rootCmd.SetOut(b2)
	rootCmd.SetArgs([]string{"memory", "list-promotions", "blf_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.listedPromosFor != "blf_1" {
		t.Fatalf("expected ListBeliefPromotions called with blf_1, got %q", fake.listedPromosFor)
	}
	if !strings.Contains(b2.String(), "organization") {
		t.Fatalf("expected output to contain the promotion's destination scope, got %s", b2.String())
	}
}

func TestMemoryArchiveRestorePurgeCmd(t *testing.T) {
	fake := &fakeMemoryHandler{}
	withMemoryServer(t, fake)

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"memory", "archive", "blf_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.archivedBeliefID != "blf_1" {
		t.Fatalf("expected ArchiveBelief called with blf_1, got %q", fake.archivedBeliefID)
	}

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"memory", "restore", "blf_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.restoredBeliefID != "blf_1" {
		t.Fatalf("expected RestoreBelief called with blf_1, got %q", fake.restoredBeliefID)
	}

	rootCmd.SetOut(bytes.NewBufferString(""))
	rootCmd.SetArgs([]string{"memory", "purge", "blf_1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if fake.purgedBeliefID != "blf_1" {
		t.Fatalf("expected PurgeBelief called with blf_1, got %q", fake.purgedBeliefID)
	}
}
