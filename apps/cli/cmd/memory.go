package cmd

import (
	"context"
	"encoding/json"
	"errors"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
)

// M21 (ADR-0014/0015/0016). `memory search` is the primary command - a
// belief store is a knowledge base an agent or a person queries ("what do
// we know about X?"), not a table paged through - matching the same
// reasoning `MemoryService.searchBeliefs`'s own doc comment gives. Every
// other subcommand rounds out the surface (`list` is the audit/browse path,
// matching the GUI's own separate "Browse all" view).
var memoryCmd = &cobra.Command{
	Use:   "memory",
	Short: "Record, search, and manage shared beliefs (M21)",
}

// resolveScope reads --scope-type/--scope-id, applying the same
// TASKER_PROJECT_ID/TASKER_ORG_ID fallbacks the rest of the CLI already
// uses for --project/--org: project scope falls back to the project env
// var, organization scope falls back to the org env var (the scope IS the
// org in that case). Team scope has no env fallback - there is no
// TASKER_TEAM_ID convention anywhere else in this CLI, so it must always be
// passed explicitly.
func resolveScope(cmd *cobra.Command) (scopeType string, scopeId string, err error) {
	scopeType, _ = cmd.Flags().GetString("scope-type")
	scopeId, _ = cmd.Flags().GetString("scope-id")
	if scopeId == "" {
		switch scopeType {
		case "project":
			scopeId = backend.DefaultProjectID()
		case "organization":
			scopeId = backend.DefaultOrgID()
		}
	}
	if scopeId == "" {
		return "", "", errors.New("--scope-id is required (or set TASKER_PROJECT_ID/TASKER_ORG_ID for project/organization scope)")
	}
	return scopeType, scopeId, nil
}

func printBelief(cmd *cobra.Command, b *healthv1.Belief) {
	cmd.Printf("Belief %s (%s scope %s, %s confidence, %s)\n", b.Id, b.ScopeType, b.ScopeId, b.Confidence, b.Status)
	cmd.Printf("  %s\n", b.Statement)
}

var memorySearchCmd = &cobra.Command{
	Use:   "search [query]",
	Short: "Search beliefs at a scope, ranked by relevance (primary way to read shared memory)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		scopeType, scopeId, err := resolveScope(cmd)
		if err != nil {
			cmd.Println("Error:", err)
			return err
		}

		req := &healthv1.SearchBeliefsRequest{ScopeType: scopeType, ScopeId: scopeId, Query: args[0]}
		if cmd.Flags().Changed("status") {
			status, _ := cmd.Flags().GetString("status")
			req.Status = &status
		}
		if cmd.Flags().Changed("confidence") {
			confidence, _ := cmd.Flags().GetString("confidence")
			req.Confidence = &confidence
		}
		if cmd.Flags().Changed("task") {
			taskId, _ := cmd.Flags().GetString("task")
			req.TaskId = &taskId
		}
		if cmd.Flags().Changed("limit") {
			limit, _ := cmd.Flags().GetInt32("limit")
			req.Limit = &limit
		}

		client := backend.NewMemoryServiceClient()
		res, err := client.SearchBeliefs(context.Background(), connect.NewRequest(req))
		if err != nil {
			cmd.PrintErrf("Failed to search beliefs: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Beliefs)
			cmd.Println(string(jsonString))
			return nil
		}
		if len(res.Msg.Beliefs) == 0 {
			cmd.Println("No beliefs found.")
			return nil
		}
		for _, b := range res.Msg.Beliefs {
			printBelief(cmd, b)
		}
		return nil
	},
}

var memoryRecordCmd = &cobra.Command{
	Use:   "record [statement]",
	Short: "Record a new belief at a scope (requires memory:write)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		orgID, _ := cmd.Flags().GetString("org")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if orgID == "" {
			cmd.Println("Error: --org is required (or set TASKER_ORG_ID).")
			return errors.New("--org is required (or set TASKER_ORG_ID)")
		}
		scopeType, scopeId, err := resolveScope(cmd)
		if err != nil {
			cmd.Println("Error:", err)
			return err
		}

		req := &healthv1.RecordBeliefRequest{OrgId: orgID, ScopeType: scopeType, ScopeId: scopeId, Statement: args[0]}
		if cmd.Flags().Changed("confidence") {
			confidence, _ := cmd.Flags().GetString("confidence")
			req.Confidence = &confidence
		}
		if cmd.Flags().Changed("source-task") {
			v, _ := cmd.Flags().GetString("source-task")
			req.SourceTaskId = &v
		}
		if cmd.Flags().Changed("source-comment") {
			v, _ := cmd.Flags().GetString("source-comment")
			req.SourceCommentId = &v
		}
		if cmd.Flags().Changed("source-note") {
			v, _ := cmd.Flags().GetString("source-note")
			req.SourceTaskNoteId = &v
		}
		if cmd.Flags().Changed("source-artifact") {
			v, _ := cmd.Flags().GetString("source-artifact")
			req.SourceArtifactId = &v
		}

		client := backend.NewMemoryServiceClient()
		res, err := client.RecordBelief(context.Background(), connect.NewRequest(req))
		if err != nil {
			cmd.PrintErrf("Failed to record belief: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Belief)
			cmd.Println(string(jsonString))
		} else {
			printBelief(cmd, res.Msg.Belief)
		}
		return nil
	},
}

var memoryGetCmd = &cobra.Command{
	Use:   "get [belief_id]",
	Short: "Get a single belief by id",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewMemoryServiceClient()
		res, err := client.GetBelief(context.Background(), connect.NewRequest(&healthv1.GetBeliefRequest{Id: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to get belief: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Belief)
			cmd.Println(string(jsonString))
		} else {
			printBelief(cmd, res.Msg.Belief)
		}
		return nil
	},
}

var memoryListCmd = &cobra.Command{
	Use:   "list",
	Short: "List beliefs at a scope, with pagination (audit/browse - prefer `memory search` to find something)",
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		scopeType, scopeId, err := resolveScope(cmd)
		if err != nil {
			cmd.Println("Error:", err)
			return err
		}

		req := &healthv1.ListBeliefsRequest{
			ScopeType: scopeType, ScopeId: scopeId,
			Page: &healthv1.PageRequest{Limit: limit, Cursor: cursor},
		}
		if cmd.Flags().Changed("status") {
			status, _ := cmd.Flags().GetString("status")
			req.Status = &status
		}
		if cmd.Flags().Changed("confidence") {
			confidence, _ := cmd.Flags().GetString("confidence")
			req.Confidence = &confidence
		}

		client := backend.NewMemoryServiceClient()
		res, err := client.ListBeliefs(context.Background(), connect.NewRequest(req))
		if err != nil {
			cmd.PrintErrf("Failed to list beliefs: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"beliefs": res.Msg.Beliefs, "page": res.Msg.Page})
			cmd.Println(string(jsonString))
			return nil
		}
		if len(res.Msg.Beliefs) == 0 {
			cmd.Println("No beliefs.")
			return nil
		}
		for _, b := range res.Msg.Beliefs {
			printBelief(cmd, b)
		}
		if res.Msg.Page != nil && res.Msg.Page.NextCursor != "" {
			cmd.Printf("More results available; re-run with --cursor %s\n", res.Msg.Page.NextCursor)
		}
		return nil
	},
}

var memoryUpdateCmd = &cobra.Command{
	Use:   "update [belief_id]",
	Short: "Update a belief's statement or confidence (requires memory:write)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		req := &healthv1.UpdateBeliefRequest{Id: args[0]}
		// Both fields are real proto3 `optional` (the same M14/M17/M19/M20
		// lesson every other update command in this CLI already follows):
		// only set the pointer for a flag the caller actually passed, so an
		// unset --statement/--confidence leaves the existing value untouched
		// rather than the server reading a zero-value overwrite.
		if cmd.Flags().Changed("statement") {
			statement, _ := cmd.Flags().GetString("statement")
			req.Statement = &statement
		}
		if cmd.Flags().Changed("confidence") {
			confidence, _ := cmd.Flags().GetString("confidence")
			req.Confidence = &confidence
		}
		if !cmd.Flags().Changed("statement") && !cmd.Flags().Changed("confidence") {
			cmd.Println("Error: pass --statement and/or --confidence.")
			return errors.New("--statement and/or --confidence is required")
		}

		client := backend.NewMemoryServiceClient()
		res, err := client.UpdateBelief(context.Background(), connect.NewRequest(req))
		if err != nil {
			cmd.PrintErrf("Failed to update belief: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Belief)
			cmd.Println(string(jsonString))
		} else {
			printBelief(cmd, res.Msg.Belief)
		}
		return nil
	},
}

var memorySupersedeCmd = &cobra.Command{
	Use:   "supersede [belief_id] [statement]",
	Short: "Record a replacement belief and mark the old one superseded (requires memory:write)",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		req := &healthv1.SupersedeBeliefRequest{Id: args[0], Statement: args[1]}
		if cmd.Flags().Changed("confidence") {
			confidence, _ := cmd.Flags().GetString("confidence")
			req.Confidence = &confidence
		}
		if cmd.Flags().Changed("source-task") {
			v, _ := cmd.Flags().GetString("source-task")
			req.SourceTaskId = &v
		}
		if cmd.Flags().Changed("source-comment") {
			v, _ := cmd.Flags().GetString("source-comment")
			req.SourceCommentId = &v
		}
		if cmd.Flags().Changed("source-note") {
			v, _ := cmd.Flags().GetString("source-note")
			req.SourceTaskNoteId = &v
		}
		if cmd.Flags().Changed("source-artifact") {
			v, _ := cmd.Flags().GetString("source-artifact")
			req.SourceArtifactId = &v
		}

		client := backend.NewMemoryServiceClient()
		res, err := client.SupersedeBelief(context.Background(), connect.NewRequest(req))
		if err != nil {
			cmd.PrintErrf("Failed to supersede belief: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Belief)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Belief %s superseded by %s\n", args[0], res.Msg.Belief.Id)
			printBelief(cmd, res.Msg.Belief)
		}
		return nil
	},
}

// Human-only (ADR-0015: memory:admin has no agent-token form) - this
// command works the same as any other for a human session; an agent token
// gets PermissionDenied from the backend, same as `projects delete`'s own
// admin-only RPCs do for one.
var memoryPromoteCmd = &cobra.Command{
	Use:   "promote [belief_id]",
	Short: "Promote a belief to a wider scope, with an audit trail (requires memory:admin, human-only)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		toScopeType, _ := cmd.Flags().GetString("to-scope-type")
		toScopeId, _ := cmd.Flags().GetString("to-scope-id")
		if toScopeType == "" || toScopeId == "" {
			cmd.Println("Error: --to-scope-type and --to-scope-id are required.")
			return errors.New("--to-scope-type and --to-scope-id are required")
		}

		req := &healthv1.PromoteBeliefRequest{Id: args[0], ToScopeType: toScopeType, ToScopeId: toScopeId}
		if cmd.Flags().Changed("note") {
			note, _ := cmd.Flags().GetString("note")
			req.Note = &note
		}

		client := backend.NewMemoryServiceClient()
		res, err := client.PromoteBelief(context.Background(), connect.NewRequest(req))
		if err != nil {
			cmd.PrintErrf("Failed to promote belief: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"belief": res.Msg.Belief, "promotion": res.Msg.Promotion})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Belief %s promoted to %s scope %s\n", args[0], toScopeType, toScopeId)
			printBelief(cmd, res.Msg.Belief)
		}
		return nil
	},
}

var memoryRelateCmd = &cobra.Command{
	Use:   "relate [belief_a_id] [belief_b_id]",
	Short: "Link two beliefs together (requires memory:write on both)",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		relationType, _ := cmd.Flags().GetString("type")

		client := backend.NewMemoryServiceClient()
		res, err := client.RelateBeliefs(context.Background(), connect.NewRequest(&healthv1.RelateBeliefsRequest{
			BeliefAId: args[0], BeliefBId: args[1], RelationType: relationType,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to relate beliefs: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Relation)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Related %s -> %s as %s (relation id: %s)\n", args[0], args[1], relationType, res.Msg.Relation.Id)
		}
		return nil
	},
}

var memoryUnrelateCmd = &cobra.Command{
	Use:   "unrelate [relation_id]",
	Short: "Remove a relation between two beliefs (requires memory:write on both)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := backend.NewMemoryServiceClient()
		_, err := client.UnrelateBeliefs(context.Background(), connect.NewRequest(&healthv1.UnrelateBeliefsRequest{RelationId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to unrelate beliefs: %v\n", err)
			return err
		}
		cmd.Printf("Relation %s removed\n", args[0])
		return nil
	},
}

var memoryListRelationsCmd = &cobra.Command{
	Use:   "list-relations [belief_id]",
	Short: "List a belief's related beliefs",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewMemoryServiceClient()
		res, err := client.ListBeliefRelations(context.Background(), connect.NewRequest(&healthv1.ListBeliefRelationsRequest{BeliefId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to list belief relations: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Relations)
			cmd.Println(string(jsonString))
			return nil
		}
		if len(res.Msg.Relations) == 0 {
			cmd.Println("No relations.")
			return nil
		}
		for _, r := range res.Msg.Relations {
			cmd.Printf("- %s: %s <-> %s (id: %s)\n", r.RelationType, r.BeliefAId, r.BeliefBId, r.Id)
		}
		return nil
	},
}

var memoryListPromotionsCmd = &cobra.Command{
	Use:   "list-promotions [belief_id]",
	Short: "List a belief's promotion history",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewMemoryServiceClient()
		res, err := client.ListBeliefPromotions(context.Background(), connect.NewRequest(&healthv1.ListBeliefPromotionsRequest{BeliefId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to list belief promotions: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Promotions)
			cmd.Println(string(jsonString))
			return nil
		}
		if len(res.Msg.Promotions) == 0 {
			cmd.Println("Never promoted.")
			return nil
		}
		for _, p := range res.Msg.Promotions {
			cmd.Printf("- %s scope %s -> %s scope %s, by %s at %s\n", p.FromScopeType, p.FromScopeId, p.ToScopeType, p.ToScopeId, p.PromotedBy, p.PromotedAt)
		}
		return nil
	},
}

// Human-only (ADR-0015), same reasoning as `memory promote` above.
var memoryArchiveCmd = &cobra.Command{
	Use:   "archive [belief_id]",
	Short: "Archive a belief, moving it to the bin (requires memory:admin, human-only)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := backend.NewMemoryServiceClient()
		_, err := client.ArchiveBelief(context.Background(), connect.NewRequest(&healthv1.ArchiveBeliefRequest{Id: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to archive belief: %v\n", err)
			return err
		}
		cmd.Printf("Belief %s archived\n", args[0])
		return nil
	},
}

var memoryRestoreCmd = &cobra.Command{
	Use:   "restore [belief_id]",
	Short: "Restore an archived belief (requires memory:admin, human-only)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := backend.NewMemoryServiceClient()
		_, err := client.RestoreBelief(context.Background(), connect.NewRequest(&healthv1.RestoreBeliefRequest{Id: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to restore belief: %v\n", err)
			return err
		}
		cmd.Printf("Belief %s restored\n", args[0])
		return nil
	},
}

var memoryPurgeCmd = &cobra.Command{
	Use:   "purge [belief_id]",
	Short: "Permanently delete an archived belief (requires memory:admin, human-only)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := backend.NewMemoryServiceClient()
		_, err := client.PurgeBelief(context.Background(), connect.NewRequest(&healthv1.PurgeBeliefRequest{Id: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to purge belief: %v\n", err)
			return err
		}
		cmd.Printf("Belief %s permanently deleted\n", args[0])
		return nil
	},
}

func init() {
	rootCmd.AddCommand(memoryCmd)
	memoryCmd.AddCommand(memorySearchCmd)
	memoryCmd.AddCommand(memoryRecordCmd)
	memoryCmd.AddCommand(memoryGetCmd)
	memoryCmd.AddCommand(memoryListCmd)
	memoryCmd.AddCommand(memoryUpdateCmd)
	memoryCmd.AddCommand(memorySupersedeCmd)
	memoryCmd.AddCommand(memoryPromoteCmd)
	memoryCmd.AddCommand(memoryRelateCmd)
	memoryCmd.AddCommand(memoryUnrelateCmd)
	memoryCmd.AddCommand(memoryListRelationsCmd)
	memoryCmd.AddCommand(memoryListPromotionsCmd)
	memoryCmd.AddCommand(memoryArchiveCmd)
	memoryCmd.AddCommand(memoryRestoreCmd)
	memoryCmd.AddCommand(memoryPurgeCmd)

	// --scope-type/--scope-id shared by every scope-reading command
	// (search/record/list). "project" defaults to the narrowest existing
	// tier (ADR-0014) - the same default the capture flow (a skill
	// running mid-task, M21-T09) always uses.
	for _, c := range []*cobra.Command{memorySearchCmd, memoryRecordCmd, memoryListCmd} {
		c.Flags().String("scope-type", "project", "Scope type: project, team, or organization")
		c.Flags().String("scope-id", "", "Scope id (or TASKER_PROJECT_ID/TASKER_ORG_ID for project/organization scope)")
	}

	memorySearchCmd.Flags().String("status", "", "Filter by status: active, superseded, or retracted (default: active)")
	memorySearchCmd.Flags().String("confidence", "", "Filter by confidence: low, medium, or high")
	memorySearchCmd.Flags().String("task", "", "Filter to beliefs captured from this task id")
	memorySearchCmd.Flags().Int32("limit", 0, "Maximum number of results (server default if unset)")

	memoryRecordCmd.Flags().String("org", "", "Organization id (or set TASKER_ORG_ID)")
	memoryRecordCmd.Flags().String("confidence", "", "Confidence: low, medium, or high (default: medium)")
	memoryRecordCmd.Flags().String("source-task", "", "Task id this belief was captured from")
	memoryRecordCmd.Flags().String("source-comment", "", "Comment id this belief was captured from")
	memoryRecordCmd.Flags().String("source-note", "", "Task note id this belief was captured from")
	memoryRecordCmd.Flags().String("source-artifact", "", "Artifact id this belief was captured from")

	memoryListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	memoryListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	memoryListCmd.Flags().String("status", "", "Filter by status: active, superseded, or retracted")
	memoryListCmd.Flags().String("confidence", "", "Filter by confidence: low, medium, or high")

	memoryUpdateCmd.Flags().String("statement", "", "New statement text")
	memoryUpdateCmd.Flags().String("confidence", "", "New confidence: low, medium, or high")

	memorySupersedeCmd.Flags().String("confidence", "", "Confidence of the replacement: low, medium, or high")
	memorySupersedeCmd.Flags().String("source-task", "", "Task id the replacement was captured from")
	memorySupersedeCmd.Flags().String("source-comment", "", "Comment id the replacement was captured from")
	memorySupersedeCmd.Flags().String("source-note", "", "Task note id the replacement was captured from")
	memorySupersedeCmd.Flags().String("source-artifact", "", "Artifact id the replacement was captured from")

	memoryPromoteCmd.Flags().String("to-scope-type", "", "Destination scope type: project, team, or organization")
	memoryPromoteCmd.Flags().String("to-scope-id", "", "Destination scope id")
	memoryPromoteCmd.Flags().String("note", "", "Why this belief applies beyond its current scope")

	memoryRelateCmd.Flags().String("type", "relates_to", "Relation type: relates_to, supports, contradicts, or duplicates")
}
