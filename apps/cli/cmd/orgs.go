package cmd

import (
	"connectrpc.com/connect"
	"context"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	healthv1connect "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
	"net/http"
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
			backend.URL(),
			backend.ClientOptions()...,
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

var orgsDeleteCmd = &cobra.Command{
	Use:   "delete [org_id]",
	Short: "Move an organization to the bin (requires org admin)",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewOrgServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.ArchiveOrg(context.Background(), connect.NewRequest(&healthv1.ArchiveOrgRequest{OrgId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to delete organization: %v\n", err)
			return
		}
		cmd.Printf("Organization %s moved to bin\n", args[0])
	},
}

var orgsRestoreCmd = &cobra.Command{
	Use:   "restore [org_id]",
	Short: "Restore an organization from the bin (requires org admin)",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewOrgServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.RestoreOrg(context.Background(), connect.NewRequest(&healthv1.RestoreOrgRequest{OrgId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to restore organization: %v\n", err)
			return
		}
		cmd.Printf("Organization %s restored\n", args[0])
	},
}

func init() {
	rootCmd.AddCommand(orgsCmd)
	orgsCmd.AddCommand(orgsListCmd)
	orgsCmd.AddCommand(orgsDeleteCmd)
	orgsCmd.AddCommand(orgsRestoreCmd)

	orgsListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	orgsListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	orgsListCmd.Flags().StringP("sort", "s", "", "Sorting parameters")
	orgsListCmd.Flags().StringP("filter", "f", "", "Filtering parameters")
}
