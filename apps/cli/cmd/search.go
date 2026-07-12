package cmd

import (
	"connectrpc.com/connect"
	"context"
	"encoding/json"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	healthv1connect "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
	"net/http"
)

var searchCmd = &cobra.Command{
	Use:   "search [query]",
	Short: "Search tasks and artifacts across an organization",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		orgID, _ := cmd.Flags().GetString("org")
		isJson, _ := cmd.Flags().GetBool("json")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if orgID == "" {
			cmd.Println("Error: --org is required (or set TASKER_ORG_ID).")
			return
		}

		client := healthv1connect.NewSearchServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.UniversalSearch(context.Background(), connect.NewRequest(&healthv1.UniversalSearchRequest{
			Query: args[0],
			OrgId: orgID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to search: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Results)
			cmd.Println(string(jsonString))
		} else {
			if len(res.Msg.Results) == 0 {
				cmd.Println("No results found.")
				return
			}
			for _, r := range res.Msg.Results {
				cmd.Printf("[%s] %s (id: %s)\n", r.Type, r.Title, r.Id)
				if r.Snippet != "" {
					cmd.Printf("    %s\n", r.Snippet)
				}
			}
		}
	},
}

func init() {
	rootCmd.AddCommand(searchCmd)
	searchCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
}
