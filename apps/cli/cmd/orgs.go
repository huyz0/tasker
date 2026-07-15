package cmd

import (
	"connectrpc.com/connect"
	"context"
	"encoding/json"
	"errors"
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
	Short: "List organizations with pagination, name filtering, and sorting",
	RunE: func(cmd *cobra.Command, args []string) error {
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		filter, _ := cmd.Flags().GetString("filter")
		sort, _ := cmd.Flags().GetString("sort")

		client := healthv1connect.NewOrgServiceClient(
			http.DefaultClient,
			backend.URL(),
			backend.ClientOptions()...,
		)

		req := connect.NewRequest(&healthv1.ListOrgsRequest{
			Page: &healthv1.PageRequest{Limit: limit, Cursor: cursor, Filter: filter, Sort: sort},
		})
		res, err := client.ListOrgs(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("Failed to list orgs: %v\n", err)
			return err
		}

		for _, org := range res.Msg.Organizations {
			cmd.Printf("- %s (Slug: %s)\n", org.Name, org.Slug)
		}
		return nil
	},
}

var orgsSeedCmd = &cobra.Command{
	Use:   "seed",
	Short: "Bootstrap a new organization (or sub-organization) - typically the first setup step",
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		slug, _ := cmd.Flags().GetString("slug")
		parentOrgID, _ := cmd.Flags().GetString("parent")
		isJson, _ := cmd.Flags().GetBool("json")
		if name == "" || slug == "" {
			cmd.Println("Error: --name and --slug are required.")
			return errors.New("Error: --name and --slug are required.")
		}

		client := healthv1connect.NewOrgServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.SeedOrg(context.Background(), connect.NewRequest(&healthv1.SeedOrgRequest{
			Name:        name,
			Slug:        slug,
			ParentOrgId: parentOrgID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to seed organization: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Organization)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Organization seeded: %s (id: %s, slug: %s)\n", res.Msg.Organization.Name, res.Msg.Organization.Id, res.Msg.Organization.Slug)
		}
		return nil
	},
}

var orgsInviteCmd = &cobra.Command{
	Use:   "invite [org_id]",
	Short: "Invite a user to an organization by email",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		email, _ := cmd.Flags().GetString("email")
		if email == "" {
			cmd.Println("Error: --email is required.")
			return errors.New("Error: --email is required.")
		}

		client := healthv1connect.NewOrgServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.InviteUser(context.Background(), connect.NewRequest(&healthv1.InviteUserRequest{
			OrgId: args[0],
			Email: email,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to invite user: %v\n", err)
			return err
		}
		cmd.Printf("Invited %s to organization %s\n", email, args[0])
		return nil
	},
}

var orgsDeleteCmd = &cobra.Command{
	Use:   "delete [org_id]",
	Short: "Move an organization to the bin (requires org admin)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := healthv1connect.NewOrgServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.ArchiveOrg(context.Background(), connect.NewRequest(&healthv1.ArchiveOrgRequest{OrgId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to delete organization: %v\n", err)
			return err
		}
		cmd.Printf("Organization %s moved to bin\n", args[0])
		return nil
	},
}

var orgsRestoreCmd = &cobra.Command{
	Use:   "restore [org_id]",
	Short: "Restore an organization from the bin (requires org admin)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := healthv1connect.NewOrgServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.RestoreOrg(context.Background(), connect.NewRequest(&healthv1.RestoreOrgRequest{OrgId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to restore organization: %v\n", err)
			return err
		}
		cmd.Printf("Organization %s restored\n", args[0])
		return nil
	},
}

var orgsPurgeCmd = &cobra.Command{
	Use:   "purge [org_id]",
	Short: "Permanently delete an already-binned, empty organization (requires org admin)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := healthv1connect.NewOrgServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.PurgeOrg(context.Background(), connect.NewRequest(&healthv1.PurgeOrgRequest{OrgId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to purge organization: %v\n", err)
			return err
		}
		cmd.Printf("Organization %s permanently deleted\n", args[0])
		return nil
	},
}

var orgsSetRetentionCmd = &cobra.Command{
	Use:   "set-retention [org_id]",
	Short: "Set how many days archived items stay in the bin before auto-purge (requires org admin)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		days, _ := cmd.Flags().GetInt32("days")
		if days < 1 {
			cmd.Println("Error: --days must be at least 1.")
			return errors.New("Error: --days must be at least 1.")
		}
		client := healthv1connect.NewOrgServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.SetOrgRetentionDays(context.Background(), connect.NewRequest(&healthv1.SetOrgRetentionDaysRequest{OrgId: args[0], BinRetentionDays: days}))
		if err != nil {
			cmd.PrintErrf("Failed to set retention: %v\n", err)
			return err
		}
		cmd.Printf("Organization %s bin retention set to %d days\n", args[0], days)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(orgsCmd)
	orgsCmd.AddCommand(orgsListCmd)
	orgsCmd.AddCommand(orgsSeedCmd)
	orgsCmd.AddCommand(orgsInviteCmd)
	orgsCmd.AddCommand(orgsDeleteCmd)
	orgsCmd.AddCommand(orgsRestoreCmd)
	orgsCmd.AddCommand(orgsPurgeCmd)
	orgsCmd.AddCommand(orgsSetRetentionCmd)

	orgsListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	orgsListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	orgsListCmd.Flags().StringP("filter", "f", "", "Substring match against organization name")
	orgsListCmd.Flags().StringP("sort", "s", "", "Sort as \"name\" or \"name:desc\" (works with --cursor for paging)")
	orgsSetRetentionCmd.Flags().Int32("days", 30, "Number of days before archived items are automatically purged")
	orgsSeedCmd.Flags().String("name", "", "Organization name")
	orgsSeedCmd.Flags().String("slug", "", "Organization slug (unique, URL-safe)")
	orgsSeedCmd.Flags().String("parent", "", "Optional parent organization ID, to create a sub-organization")
	orgsInviteCmd.Flags().String("email", "", "Email address to invite")
}
