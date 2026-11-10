package cmd

import (
	"fmt"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
	"google.golang.org/protobuf/proto"
)

func addReportReadFlags(cmd *cobra.Command) {
	cmd.Flags().String("attempt-id", "", "Only reports associated with this task claim receipt")
	cmd.Flags().Bool("uncorrelated-only", false, "Only reports without a claim receipt")
	cmd.MarkFlagsMutuallyExclusive("attempt-id", "uncorrelated-only")
}

func addReportPageFlags(cmd *cobra.Command) {
	cmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	cmd.Flags().StringP("cursor", "c", "", "Pagination cursor from a previous response")
	cmd.Flags().Bool("page-all", false, "Fetch every page as one JSON object per item per line (NDJSON)")
}

// Preserve legacy requests unless the caller opts into paging or a report filter.
func reportReadPage(cmd *cobra.Command, filtered bool) *healthv1.PageRequest {
	if !filtered && !cmd.Flags().Changed("limit") && !cmd.Flags().Changed("cursor") && !pageAllRequested(cmd) {
		return nil
	}
	limit, _ := cmd.Flags().GetInt32("limit")
	cursor, _ := cmd.Flags().GetString("cursor")
	return &healthv1.PageRequest{Limit: limit, Cursor: cursor}
}

var tasksAttemptsCmd = &cobra.Command{
	Use: "attempts [task_id]", Short: "Read recorded claim ownership, newest first", Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		request := &healthv1.ListTaskAttemptsRequest{TaskId: args[0], Page: &healthv1.PageRequest{Limit: limit, Cursor: cursor}}
		client := backend.NewTaskServiceClient()
		if pageAllRequested(cmd) {
			return pageAll(cmd, request, func() (proto.Message, error) {
				response, err := client.ListTaskAttempts(cmd.Context(), connect.NewRequest(request))
				if err != nil {
					return nil, err
				}
				return response.Msg, nil
			})
		}
		response, err := client.ListTaskAttempts(cmd.Context(), connect.NewRequest(request))
		if err != nil {
			return fmt.Errorf("failed to read claim history: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, response.Msg)
		}
		if len(response.Msg.Attempts) == 0 {
			cmd.Println("No recorded claims. Earlier claims may not have receipts.")
		}
		for _, receipt := range response.Msg.Attempts {
			owner := receipt.GetOwner()
			cmd.Printf("- %s: owner %q %q (%q), claimed %s\n", receipt.Id, owner.GetKind(), owner.GetName(), owner.GetId(), receipt.ClaimedAt)
			if receipt.GetReleasedAt() == "" {
				cmd.Println("  Ownership not recorded as ended")
			} else {
				cmd.Printf("  Ownership ended %s; reason %q\n", receipt.GetReleasedAt(), receipt.GetReleaseReason())
			}
			if receipt.ExternalRunId != nil {
				cmd.Printf("  External correlation: %q\n", receipt.GetExternalRunId())
			}
		}
		printNextPageHint(cmd, response.Msg)
		return nil
	},
}

func init() {
	tasksCmd.AddCommand(tasksAttemptsCmd)
	addReportPageFlags(tasksAttemptsCmd)
}
