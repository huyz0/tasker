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

var teamsCmd = &cobra.Command{
	Use:   "teams",
	Short: "Manage teams (M10)",
}

var teamsListCmd = &cobra.Command{
	Use:   "list [org_id]",
	Short: "List teams in an organization, with pagination",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		onlyDeleted, _ := cmd.Flags().GetBool("only-deleted")

		client := backend.NewTeamServiceClient()
		res, err := client.ListTeams(context.Background(), connect.NewRequest(&healthv1.ListTeamsRequest{
			OrgId:       args[0],
			Page:        &healthv1.PageRequest{Limit: limit, Cursor: cursor},
			OnlyDeleted: onlyDeleted,
		}))
		if err != nil {
			return fmt.Errorf("failed to list teams: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
			return nil
		}

		if len(res.Msg.Teams) == 0 {
			cmd.Println("No teams.")
			return nil
		}
		for _, t := range res.Msg.Teams {
			cmd.Printf("- %s (id: %s)\n", t.Name, t.Id)
		}
		return nil
	},
}

var teamsCreateCmd = &cobra.Command{
	Use:   "create [org_id]",
	Short: "Create a team in an organization (requires team:write)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		isJson, _ := cmd.Flags().GetBool("json")
		if name == "" {
			return errors.New("--name is required")
		}

		client := backend.NewTeamServiceClient()
		res, err := client.CreateTeam(context.Background(), connect.NewRequest(&healthv1.CreateTeamRequest{
			OrgId: args[0],
			Name:  name,
		}))
		if err != nil {
			return fmt.Errorf("failed to create team: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Printf("Team created: %s (id: %s)\n", res.Msg.Team.Name, res.Msg.Team.Id)
		}
		return nil
	},
}

var teamsRenameCmd = &cobra.Command{
	Use:   "rename [team_id]",
	Short: "Rename a team (requires team:write)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		if name == "" {
			return errors.New("--name is required")
		}

		client := backend.NewTeamServiceClient()
		res, err := client.UpdateTeam(context.Background(), connect.NewRequest(&healthv1.UpdateTeamRequest{
			TeamId: args[0],
			Name:   name,
		}))
		if err != nil {
			return fmt.Errorf("failed to rename team: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Team %s renamed to %s\n", args[0], name)
		return nil
	},
}

var teamsDeleteCmd = &cobra.Command{
	Use:   "delete [team_id]",
	Short: "Move a team to the bin (requires team:admin)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := backend.NewTeamServiceClient()
		res, err := client.ArchiveTeam(context.Background(), connect.NewRequest(&healthv1.ArchiveTeamRequest{TeamId: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to delete team: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Team %s moved to bin\n", args[0])
		return nil
	},
}

var teamsRestoreCmd = &cobra.Command{
	Use:   "restore [team_id]",
	Short: "Restore a team from the bin (requires team:admin)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := backend.NewTeamServiceClient()
		res, err := client.RestoreTeam(context.Background(), connect.NewRequest(&healthv1.RestoreTeamRequest{TeamId: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to restore team: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Team %s restored\n", args[0])
		return nil
	},
}

var teamsAddMemberCmd = &cobra.Command{
	Use:   "add-member [team_id] [user_id]",
	Short: "Add a member to a team (requires team:write)",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := backend.NewTeamServiceClient()
		res, err := client.AddTeamMember(context.Background(), connect.NewRequest(&healthv1.AddTeamMemberRequest{
			TeamId: args[0],
			UserId: args[1],
		}))
		if err != nil {
			return fmt.Errorf("failed to add team member: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Added %s to team %s\n", args[1], args[0])
		return nil
	},
}

var teamsRemoveMemberCmd = &cobra.Command{
	Use:   "remove-member [team_id] [user_id]",
	Short: "Remove a member from a team (requires team:write)",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := backend.NewTeamServiceClient()
		res, err := client.RemoveTeamMember(context.Background(), connect.NewRequest(&healthv1.RemoveTeamMemberRequest{
			TeamId: args[0],
			UserId: args[1],
		}))
		if err != nil {
			return fmt.Errorf("failed to remove team member: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Removed %s from team %s\n", args[1], args[0])
		return nil
	},
}

var teamsListMembersCmd = &cobra.Command{
	Use:   "list-members [team_id]",
	Short: "List a team's members, with pagination",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")

		client := backend.NewTeamServiceClient()
		res, err := client.ListTeamMembers(context.Background(), connect.NewRequest(&healthv1.ListTeamMembersRequest{
			TeamId: args[0],
			Page:   &healthv1.PageRequest{Limit: limit, Cursor: cursor},
		}))
		if err != nil {
			return fmt.Errorf("failed to list team members: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
			return nil
		}

		if len(res.Msg.Members) == 0 {
			cmd.Println("No members.")
			return nil
		}
		for _, m := range res.Msg.Members {
			cmd.Printf("- %s <%s> (id: %s)\n", m.Name, m.Email, m.UserId)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(teamsCmd)
	teamsCmd.AddCommand(teamsListCmd)
	teamsCmd.AddCommand(teamsCreateCmd)
	teamsCmd.AddCommand(teamsRenameCmd)
	teamsCmd.AddCommand(teamsDeleteCmd)
	teamsCmd.AddCommand(teamsRestoreCmd)
	teamsCmd.AddCommand(teamsAddMemberCmd)
	teamsCmd.AddCommand(teamsRemoveMemberCmd)
	teamsCmd.AddCommand(teamsListMembersCmd)

	teamsListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	teamsListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	teamsListCmd.Flags().Bool("only-deleted", false, "List only archived (binned) teams")
	teamsCreateCmd.Flags().String("name", "", "Team name")
	teamsRenameCmd.Flags().String("name", "", "New team name")
	teamsListMembersCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	teamsListMembersCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
}
