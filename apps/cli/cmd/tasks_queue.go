package cmd

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"
	"google.golang.org/protobuf/proto"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
)

// The agent work queue (M33): take the next task, give back what you claimed,
// see what you hold. Together with `tasks handoffs` these are the whole loop
// an unattended agent runs.

// optionalString is nil for an unset flag, so the server sees "absent" rather
// than an empty string it would have to interpret.
func optionalString(cmd *cobra.Command, name string) *string {
	if !cmd.Flags().Changed(name) {
		return nil
	}
	v, _ := cmd.Flags().GetString(name)
	return &v
}

var tasksClaimNextCmd = &cobra.Command{
	Use:   "claim-next",
	Short: "Claim the oldest open, unassigned task in a project (agent self-service)",
	Long: "Claims the oldest open, unassigned task in the project for the calling principal, in one\n" +
		"call - no list-then-claim race. With nothing to claim it prints nothing and exits 0; with\n" +
		"--json it prints an object with no \"task\". A prior handoff note on the task is shown.",
	RunE: func(cmd *cobra.Command, args []string) error {
		projectID, _ := cmd.Flags().GetString("project")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if projectID == "" {
			return fmt.Errorf("--project is required (or set TASKER_PROJECT_ID)")
		}
		res, err := backend.NewTaskServiceClient().ClaimNextTask(context.Background(), connect.NewRequest(&healthv1.ClaimNextTaskRequest{
			ProjectId:      projectID,
			TaskTypeId:     optionalString(cmd, "type"),
			IdempotencyKey: optionalString(cmd, "idempotency-key"),
		}))
		if err != nil {
			return fmt.Errorf("failed to claim the next task: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if res.Msg.Task == nil {
			cmd.PrintErrln("Nothing to claim.")
			return nil
		}
		cmd.Printf("Claimed %s: %s (id: %s)\n", res.Msg.Task.DisplayId, res.Msg.Task.Title, res.Msg.Task.Id)
		if n := res.Msg.LatestHandoffNote; n != nil {
			cmd.Printf("Handoff note (%s): %s\n", noteAuthor(n), n.Content)
		}
		return nil
	},
}

var tasksReleaseCmd = &cobra.Command{
	Use:   "release [task_id]",
	Short: "Give back a task you claimed, optionally leaving a handoff note",
	Long: "Releases a task the caller holds by its own claim, so another agent can take it. With\n" +
		"--handoff the note is recorded first, and the next claimant receives it. A task a person\n" +
		"assigned to you cannot be released this way (exit 3); ask them to unassign it.",
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewTaskServiceClient().ReleaseTask(context.Background(), connect.NewRequest(&healthv1.ReleaseTaskRequest{
			TaskId:      args[0],
			HandoffNote: optionalString(cmd, "handoff"),
		}))
		if err != nil {
			return fmt.Errorf("failed to release task: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Task %s released\n", args[0])
		if res.Msg.HandoffNote != nil {
			cmd.Println("Handoff note recorded.")
		}
		return nil
	},
}

var tasksMineCmd = &cobra.Command{
	Use:   "mine",
	Short: "List the open tasks you hold, across every project in the organization",
	RunE: func(cmd *cobra.Command, args []string) error {
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		req := &healthv1.ListMyTasksRequest{Page: &healthv1.PageRequest{Limit: limit, Cursor: cursor}}
		// An agent's org is its token's; a person names one.
		if org := optionalString(cmd, "org"); org != nil {
			req.OrgId = org
		} else if def := backend.DefaultOrgID(); def != "" {
			req.OrgId = &def
		}
		if all, _ := cmd.Flags().GetBool("include-done"); all {
			req.IncludeTerminal = &all
		}
		client := backend.NewTaskServiceClient()
		listReq := connect.NewRequest(req)
		if pageAllRequested(cmd) {
			return pageAll(cmd, listReq.Msg, func() (proto.Message, error) {
				r, err := client.ListMyTasks(context.Background(), listReq)
				if err != nil {
					return nil, err
				}
				return r.Msg, nil
			})
		}
		res, err := client.ListMyTasks(context.Background(), listReq)
		if err != nil {
			return fmt.Errorf("failed to list your tasks: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if len(res.Msg.Tasks) == 0 {
			cmd.Println("You hold no open tasks.")
		}
		for _, t := range res.Msg.Tasks {
			cmd.Printf("- %s [%s]: %s (id: %s, project: %s)\n", t.DisplayId, t.Status, t.Title, t.Id, t.ProjectId)
		}
		printNextPageHint(cmd, res.Msg)
		return nil
	},
}

// noteAuthor names a note's agent by name when the server resolved one.
func noteAuthor(n *healthv1.TaskNote) string {
	if n.AgentName != "" {
		return n.AgentName
	}
	return "agent " + n.AgentId
}

func init() {
	tasksCmd.AddCommand(tasksClaimNextCmd, tasksReleaseCmd, tasksMineCmd)

	tasksClaimNextCmd.Flags().StringP("project", "p", "", "Project to take work from (or set TASKER_PROJECT_ID)")
	tasksClaimNextCmd.Flags().String("type", "", "Only tasks of this task type ID")
	tasksClaimNextCmd.Flags().String("idempotency-key", "", "Optional key: a retry with the same key returns the original claim instead of claiming another task")

	tasksReleaseCmd.Flags().String("handoff", "", "A handoff note to record before releasing: what you tried, what is blocked, the next step")

	tasksMineCmd.Flags().String("org", "", "Organization ID (people only - an agent's token names its org; or set TASKER_ORG_ID)")
	tasksMineCmd.Flags().Bool("include-done", false, "Include tasks in a terminal status")
	tasksMineCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	tasksMineCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	tasksMineCmd.Flags().Bool("page-all", false, "Fetch every page, printing one JSON object per item per line (NDJSON)")
}
