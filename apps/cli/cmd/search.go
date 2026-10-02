package cmd

import (
	"context"
	"errors"
	"fmt"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
)

var searchCmd = &cobra.Command{
	Use:   "search [query]",
	Short: "Search tasks and artifacts across an organization",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		orgID, _ := cmd.Flags().GetString("org")
		isJson, _ := cmd.Flags().GetBool("json")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if orgID == "" {
			return errors.New("--org is required (or set TASKER_ORG_ID)")
		}

		client := backend.NewSearchServiceClient()
		res, err := client.UniversalSearch(context.Background(), connect.NewRequest(&healthv1.UniversalSearchRequest{
			Query: args[0],
			OrgId: orgID,
			Page:  &healthv1.PageRequest{Limit: limit, Cursor: cursor},
		}))
		if err != nil {
			return fmt.Errorf("failed to search: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			if len(res.Msg.Results) == 0 {
				cmd.Println("No results found.")
				return nil
			}
			for _, r := range res.Msg.Results {
				cmd.Printf("[%s] %s (id: %s)\n", r.Type, r.Title, r.Id)
				if r.Snippet != "" {
					cmd.Printf("    %s\n", r.Snippet)
				}
			}
			if res.Msg.Page != nil && res.Msg.Page.NextCursor != "" {
				cmd.Printf("More results available; re-run with --cursor %s\n", res.Msg.Page.NextCursor)
			}
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(searchCmd)
	searchCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	searchCmd.Flags().Int32P("limit", "l", 20, "Maximum number of items to return")
	searchCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
}
