package cmd

import (
	"context"
	"net/http"
	"github.com/spf13/cobra"
	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	healthv1connect "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
)

var orgsCmd = &cobra.Command{
	Use:   "orgs",
	Short: "Manage organizations",
}

var orgsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List organizations with pagination",
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewOrgServiceClient(
			http.DefaultClient,
			"http://localhost:8080",
		)

		req := connect.NewRequest(&healthv1.ListOrgsRequest{})
		res, err := client.ListOrgs(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("Failed to list orgs: %v\n", err)
			return
		}

		for _, org := range res.Msg.Organizations {
			cmd.Printf("- %s (Slug: %s)\n", org.Name, org.Slug)
		}
	},
}

func init() {
	rootCmd.AddCommand(orgsCmd)
	orgsCmd.AddCommand(orgsListCmd)

	orgsListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	orgsListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	orgsListCmd.Flags().StringP("sort", "s", "", "Sorting parameters")
	orgsListCmd.Flags().StringP("filter", "f", "", "Filtering parameters")
}
