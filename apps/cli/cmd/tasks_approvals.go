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

// M39 (ADR-0032): an agent's move across a gated transition waits here for a
// person's yes.

func approvalLine(a *healthv1.TransitionApproval) string {
	line := fmt.Sprintf("%s [%s] %s asks to move %s from %q to %q", a.Id, a.Status, a.RequestedByName, a.TaskDisplayId, a.FromStatus, a.ToStatus)
	if a.DecidedByName != nil {
		line += " - decided by " + a.GetDecidedByName()
	}
	if a.Reason != nil {
		line += fmt.Sprintf(": %q", a.GetReason())
	}
	return line
}

func printApproval(cmd *cobra.Command, msg proto.Message, a *healthv1.TransitionApproval) error {
	if wantsJSON(cmd) {
		return printJSON(cmd, msg)
	}
	cmd.Println(approvalLine(a))
	return nil
}

func decideApproval(approve bool) func(cmd *cobra.Command, args []string) error {
	return func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewTaskServiceClient().DecideTransitionApproval(context.Background(), connect.NewRequest(&healthv1.DecideTransitionApprovalRequest{
			Id: args[0], Approve: approve, Reason: optionalString(cmd, "reason"),
		}))
		if err != nil {
			return fmt.Errorf("failed to decide the approval: %w", err)
		}
		return printApproval(cmd, res.Msg, res.Msg.Approval)
	}
}

var tasksApproveCmd = &cobra.Command{
	Use:   "approve [approval_id]",
	Short: "Approve an agent's held status change; it is applied as you (people only)",
	Args:  cobra.ExactArgs(1),
	RunE:  decideApproval(true),
}

var tasksRejectCmd = &cobra.Command{
	Use:   "reject [approval_id]",
	Short: "Reject an agent's held status change; the task stays where it is (people only)",
	Args:  cobra.ExactArgs(1),
	RunE:  decideApproval(false),
}

var tasksApprovalCmd = &cobra.Command{
	Use:   "approval [approval_id]",
	Short: "Show one approval request and, once made, its decision",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewTaskServiceClient().GetTransitionApproval(context.Background(), connect.NewRequest(&healthv1.GetTransitionApprovalRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to get the approval: %w", err)
		}
		return printApproval(cmd, res.Msg, res.Msg.Approval)
	},
}

var tasksApprovalsCmd = &cobra.Command{
	Use:   "approvals",
	Short: "Status changes waiting on a person's approval - the organization's queue, or one task's",
	RunE: func(cmd *cobra.Command, args []string) error {
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		org := optionalString(cmd, "org")
		if org == nil && optionalString(cmd, "task") == nil {
			if d := backend.DefaultOrgID(); d != "" {
				org = &d
			}
		}
		client := backend.NewTaskServiceClient()
		req := connect.NewRequest(&healthv1.ListTransitionApprovalsRequest{
			OrgId: org, TaskId: optionalString(cmd, "task"), Status: optionalString(cmd, "status"),
			Page: &healthv1.PageRequest{Limit: limit, Cursor: cursor},
		})
		if pageAllRequested(cmd) {
			return pageAll(cmd, req.Msg, func() (proto.Message, error) {
				r, err := client.ListTransitionApprovals(context.Background(), req)
				if err != nil {
					return nil, err
				}
				return r.Msg, nil
			})
		}
		res, err := client.ListTransitionApprovals(context.Background(), req)
		if err != nil {
			return fmt.Errorf("failed to list approvals: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if len(res.Msg.Approvals) == 0 {
			cmd.PrintErrln("No approvals.")
		}
		for _, a := range res.Msg.Approvals {
			cmd.Printf("- %s\n", approvalLine(a))
		}
		printNextPageHint(cmd, res.Msg)
		return nil
	},
}

func init() {
	tasksCmd.AddCommand(tasksApproveCmd, tasksRejectCmd, tasksApprovalCmd, tasksApprovalsCmd)
	tasksApproveCmd.Flags().String("reason", "", "Optional note recorded with the decision")
	tasksRejectCmd.Flags().String("reason", "", "Why - the agent is told")
	tasksApprovalsCmd.Flags().String("org", "", "Organization (or set TASKER_ORG_ID; an agent's is implied)")
	tasksApprovalsCmd.Flags().String("task", "", "Only this task's approvals")
	tasksApprovalsCmd.Flags().String("status", "", "pending (default), approved, rejected, stale or all")
	tasksApprovalsCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	tasksApprovalsCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	tasksApprovalsCmd.Flags().Bool("page-all", false, "Fetch every page, printing one JSON object per item per line (NDJSON)")
}
