package cmd

import (
	"github.com/spf13/cobra"
)

var orgsCmd = &cobra.Command{
	Use:   "orgs",
	Short: "Manage organizations",
}

var orgsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List organizations with pagination",
	Run: func(cmd *cobra.Command, args []string) {
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		sort, _ := cmd.Flags().GetString("sort")
		filter, _ := cmd.Flags().GetString("filter")

		cmd.Printf("Fetching orgs: limit=%d, cursor=%s, sort=%s, filter=%s\n", limit, cursor, sort, filter)
		// TODO: Call the actual Connect-RPC OrgService.ListOrgs method here
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
