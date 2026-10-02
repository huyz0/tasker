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

		client := backend.NewOrgServiceClient()

		req := connect.NewRequest(&healthv1.ListOrgsRequest{
			Page: &healthv1.PageRequest{Limit: limit, Cursor: cursor, Filter: filter, Sort: sort},
		})
		res, err := client.ListOrgs(context.Background(), req)
		if err != nil {
			return fmt.Errorf("failed to list orgs: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}

		for _, org := range res.Msg.Organizations {
			cmd.Printf("- %s (Slug: %s, id: %s)\n", org.Name, org.Slug, org.Id)
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
			return errors.New("--name and --slug are required")
		}

		client := backend.NewOrgServiceClient()
		res, err := client.SeedOrg(context.Background(), connect.NewRequest(&healthv1.SeedOrgRequest{
			Name:        name,
			Slug:        slug,
			ParentOrgId: parentOrgID,
		}))
		if err != nil {
			return fmt.Errorf("failed to seed organization: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Printf("Organization seeded: %s (id: %s, slug: %s)\n", res.Msg.Organization.Name, res.Msg.Organization.Id, res.Msg.Organization.Slug)
		}
		return nil
	},
}

var orgsInviteCmd = &cobra.Command{
	Use:   "invite [org_id]",
	Short: "Invite a user to an organization by email or username",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		email, _ := cmd.Flags().GetString("email")
		username, _ := cmd.Flags().GetString("username")
		role, _ := cmd.Flags().GetString("role")
		// M13-T09: exactly one of email/username, the same rule the server
		// enforces - checked here too so a malformed invocation fails fast
		// with a CLI-shaped message instead of a raw RPC validation error.
		if (email == "") == (username == "") {
			return errors.New("exactly one of --email or --username is required")
		}

		req := &healthv1.InviteUserRequest{OrgId: args[0]}
		target := email
		if email != "" {
			req.Email = &email
		} else {
			req.Username = &username
			target = username
		}
		if role != "" {
			req.Role = &role
		}
		client := backend.NewOrgServiceClient()
		res, err := client.InviteUser(context.Background(), connect.NewRequest(req))
		if err != nil {
			return fmt.Errorf("failed to invite user: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Invited %s to organization %s\n", target, args[0])
		return nil
	},
}

var orgsSetMemberRoleCmd = &cobra.Command{
	Use:   "set-role [org_id] [user_id]",
	Short: "Change a member's role in an organization (owner|admin|member|viewer, requires org admin)",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		role, _ := cmd.Flags().GetString("role")
		if role == "" {
			return errors.New("--role is required")
		}

		client := backend.NewOrgServiceClient()
		res, err := client.UpdateOrgMemberRole(context.Background(), connect.NewRequest(&healthv1.UpdateOrgMemberRoleRequest{
			OrgId:  args[0],
			UserId: args[1],
			Role:   role,
		}))
		if err != nil {
			return fmt.Errorf("failed to update member role: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Set %s's role to %s in organization %s\n", args[1], res.Msg.Member.Role, args[0])
		return nil
	},
}

// Leaving is self-service: the server authorizes on the *target* of the
// removal, so a member removing themselves needs no admin rights. The caller's
// own id is not something the CLI holds, so it is resolved from the session
// via GetIdentity rather than asked for as an argument - requiring a user to
// look up their own id before they can leave would be its own small absurdity.
var orgsLeaveCmd = &cobra.Command{
	Use:   "leave [org_id]",
	Short: "Leave an organization (the last owner cannot leave)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		identity, err := backend.NewAuthServiceClient().GetIdentity(
			context.Background(),
			connect.NewRequest(&healthv1.GetIdentityRequest{}),
		)
		if err != nil {
			return fmt.Errorf("failed to resolve the signed-in user: %w", err)
		}

		client := backend.NewOrgServiceClient()
		res, err := client.RemoveOrgMember(context.Background(), connect.NewRequest(&healthv1.RemoveOrgMemberRequest{
			OrgId:  args[0],
			UserId: identity.Msg.User.Id,
		}))
		if err != nil {
			return fmt.Errorf("failed to leave organization: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Left organization %s\n", args[0])
		return nil
	},
}

var orgsListInvitesCmd = &cobra.Command{
	Use:   "list-invites [org_id]",
	Short: "List outstanding invitations for an organization (requires org admin)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")

		client := backend.NewOrgServiceClient()
		res, err := client.ListInvitations(context.Background(), connect.NewRequest(&healthv1.ListInvitationsRequest{
			OrgId: args[0],
			Page:  &healthv1.PageRequest{Limit: limit, Cursor: cursor},
		}))
		if err != nil {
			return fmt.Errorf("failed to list invitations: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
			return nil
		}

		if len(res.Msg.Invitations) == 0 {
			cmd.Println("No outstanding invitations.")
			return nil
		}
		cmd.Println("Invitations:")
		for _, i := range res.Msg.Invitations {
			// The expired marker is the reason to read this list at all - an
			// invitation that lapsed unredeemed looks identical to a live one
			// without it.
			status := "pending"
			if i.Expired {
				status = "EXPIRED"
			}
			cmd.Printf(" - %s  role=%s  %s  (id: %s)\n", i.Email, i.Role, status, i.Id)
		}
		return nil
	},
}

var orgsRevokeInviteCmd = &cobra.Command{
	Use:   "revoke-invite [invitation_id]",
	Short: "Withdraw an outstanding invitation (requires org admin)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := backend.NewOrgServiceClient()
		res, err := client.RevokeInvitation(context.Background(), connect.NewRequest(&healthv1.RevokeInvitationRequest{
			InvitationId: args[0],
		}))
		if err != nil {
			return fmt.Errorf("failed to revoke invitation: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Revoked invitation %s\n", args[0])
		return nil
	},
}

var orgsDeleteCmd = &cobra.Command{
	Use:   "delete [org_id]",
	Short: "Move an organization to the bin (requires org admin)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := backend.NewOrgServiceClient()
		res, err := client.ArchiveOrg(context.Background(), connect.NewRequest(&healthv1.ArchiveOrgRequest{OrgId: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to delete organization: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
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
		client := backend.NewOrgServiceClient()
		res, err := client.RestoreOrg(context.Background(), connect.NewRequest(&healthv1.RestoreOrgRequest{OrgId: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to restore organization: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
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
		client := backend.NewOrgServiceClient()
		res, err := client.PurgeOrg(context.Background(), connect.NewRequest(&healthv1.PurgeOrgRequest{OrgId: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to purge organization: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
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
			return errors.New("--days must be at least 1")
		}
		client := backend.NewOrgServiceClient()
		res, err := client.SetOrgRetentionDays(context.Background(), connect.NewRequest(&healthv1.SetOrgRetentionDaysRequest{OrgId: args[0], BinRetentionDays: days}))
		if err != nil {
			return fmt.Errorf("failed to set retention: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
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
	orgsCmd.AddCommand(orgsSetMemberRoleCmd)
	orgsCmd.AddCommand(orgsLeaveCmd)
	orgsCmd.AddCommand(orgsListInvitesCmd)
	orgsCmd.AddCommand(orgsRevokeInviteCmd)
	orgsCmd.AddCommand(orgsDeleteCmd)
	orgsCmd.AddCommand(orgsRestoreCmd)
	orgsCmd.AddCommand(orgsPurgeCmd)
	orgsCmd.AddCommand(orgsSetRetentionCmd)

	orgsListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	orgsListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	orgsListCmd.Flags().StringP("filter", "f", "", "Substring match against organization name")
	orgsListCmd.Flags().StringP("sort", "s", "", "Sort as \"name\" or \"name:desc\" (works with --cursor for paging)")
	orgsListInvitesCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	orgsListInvitesCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	orgsSetRetentionCmd.Flags().Int32("days", 30, "Number of days before archived items are automatically purged")
	orgsSeedCmd.Flags().String("name", "", "Organization name")
	orgsSeedCmd.Flags().String("slug", "", "Organization slug (unique, URL-safe)")
	orgsSeedCmd.Flags().String("parent", "", "Optional parent organization ID, to create a sub-organization")
	orgsInviteCmd.Flags().String("email", "", "Email address to invite (exactly one of --email/--username)")
	orgsInviteCmd.Flags().String("username", "", "Local username to invite (exactly one of --email/--username)")
	orgsInviteCmd.Flags().String("role", "", "Role the invitee gets on accept: admin, member, or viewer (defaults to member)")
	orgsSetMemberRoleCmd.Flags().String("role", "", "New role: owner, admin, member, or viewer")
}
