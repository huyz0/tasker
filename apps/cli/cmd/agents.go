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

var agentsCmd = &cobra.Command{
	Use:   "agents",
	Short: "Manage AI agent instances",
}

var agentsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List active agents in an organization",
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		orgID, _ := cmd.Flags().GetString("org")
		filter, _ := cmd.Flags().GetString("filter")
		sort, _ := cmd.Flags().GetString("sort")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		onlyDeleted, _ := cmd.Flags().GetBool("only-deleted")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if orgID == "" {
			return errors.New("--org is required (or set TASKER_ORG_ID)")
		}

		client := backend.NewAgentServiceClient()
		res, err := client.ListAgents(context.Background(), connect.NewRequest(&healthv1.ListAgentsRequest{
			OrgId:       orgID,
			OnlyDeleted: onlyDeleted,
			Page:        &healthv1.PageRequest{Limit: limit, Cursor: cursor, Filter: filter, Sort: sort},
		}))
		if err != nil {
			return fmt.Errorf("failed to list agents: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Println("Available Agents:")
			for _, a := range res.Msg.Agents {
				cmd.Printf(" - %s [Role: %s] (%s)\n", a.Name, a.AgentRoleId, a.Id)
			}
		}
		return nil
	},
}

var agentsCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new agent instance with specific role",
	RunE: func(cmd *cobra.Command, args []string) error {
		role, _ := cmd.Flags().GetString("role")
		name, _ := cmd.Flags().GetString("name")
		orgID, _ := cmd.Flags().GetString("org")
		isJson, _ := cmd.Flags().GetBool("json")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if role == "" || orgID == "" {
			return errors.New("--org and --role are required")
		}

		client := backend.NewAgentServiceClient()
		res, err := client.CreateAgent(context.Background(), connect.NewRequest(&healthv1.CreateAgentRequest{
			OrgId:       orgID,
			AgentRoleId: role,
			Name:        name,
		}))
		if err != nil {
			return fmt.Errorf("failed to create agent: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Printf("Spawned new agent '%s' (id: %s) with role %s\n", res.Msg.Agent.Name, res.Msg.Agent.Id, res.Msg.Agent.AgentRoleId)
		}
		return nil
	},
}

var agentsUpdateCmd = &cobra.Command{
	Use:   "update [agent_id]",
	Short: "Rename an agent or reassign it to a different role",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		role, _ := cmd.Flags().GetString("role")
		isJson, _ := cmd.Flags().GetBool("json")
		if name == "" && role == "" {
			return errors.New("at least one of --name or --role is required")
		}

		req := &healthv1.UpdateAgentRequest{AgentId: args[0]}
		if name != "" {
			req.Name = &name
		}
		if role != "" {
			req.AgentRoleId = &role
		}

		client := backend.NewAgentServiceClient()
		res, err := client.UpdateAgent(context.Background(), connect.NewRequest(req))
		if err != nil {
			return fmt.Errorf("failed to update agent: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Printf("Agent %s updated: '%s' [Role: %s]\n", res.Msg.Agent.Id, res.Msg.Agent.Name, res.Msg.Agent.AgentRoleId)
		}
		return nil
	},
}

var agentsUpdateRoleCmd = &cobra.Command{
	Use:   "update-role [role_id]",
	Short: "Edit an agent role persona's name, system prompt, or capabilities",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		systemPrompt, _ := cmd.Flags().GetString("system-prompt")
		capabilities, _ := cmd.Flags().GetString("capabilities")
		isJson, _ := cmd.Flags().GetBool("json")
		if name == "" && systemPrompt == "" && capabilities == "" {
			return errors.New("at least one of --name, --system-prompt, or --capabilities is required")
		}

		req := &healthv1.UpdateAgentRoleRequest{Id: args[0]}
		if name != "" {
			req.Name = &name
		}
		if systemPrompt != "" {
			req.SystemPrompt = &systemPrompt
		}
		if capabilities != "" {
			req.Capabilities = &capabilities
		}

		client := backend.NewAgentServiceClient()
		res, err := client.UpdateAgentRole(context.Background(), connect.NewRequest(req))
		if err != nil {
			return fmt.Errorf("failed to update agent role: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Printf("Agent role %s updated: %s\n", res.Msg.Role.Id, res.Msg.Role.Name)
		}
		return nil
	},
}

var agentsListRolesCmd = &cobra.Command{
	Use:   "list-roles",
	Short: "List an organization's agent role personas",
	RunE: func(cmd *cobra.Command, args []string) error {
		orgID, _ := cmd.Flags().GetString("org")
		if orgID == "" {
			return errors.New("--org is required")
		}
		isJson, _ := cmd.Flags().GetBool("json")
		filter, _ := cmd.Flags().GetString("filter")
		sort, _ := cmd.Flags().GetString("sort")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")

		client := backend.NewAgentServiceClient()
		res, err := client.ListAgentRoles(context.Background(), connect.NewRequest(&healthv1.ListAgentRolesRequest{
			OrgId: orgID,
			Page:  &healthv1.PageRequest{Limit: limit, Cursor: cursor, Filter: filter, Sort: sort},
		}))
		if err != nil {
			return fmt.Errorf("failed to list agent roles: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Println("Agent Roles:")
			for _, r := range res.Msg.Roles {
				cmd.Printf(" - %s (id: %s)\n", r.Name, r.Id)
			}
		}
		return nil
	},
}

var agentsCreateRoleCmd = &cobra.Command{
	Use:   "create-role",
	Short: "Create an agent role persona in an organization (requires org admin)",
	RunE: func(cmd *cobra.Command, args []string) error {
		orgID, _ := cmd.Flags().GetString("org")
		if orgID == "" {
			return errors.New("--org is required")
		}
		name, _ := cmd.Flags().GetString("name")
		systemPrompt, _ := cmd.Flags().GetString("system-prompt")
		capabilities, _ := cmd.Flags().GetString("capabilities")
		isJson, _ := cmd.Flags().GetBool("json")
		if name == "" {
			return errors.New("--name is required")
		}

		client := backend.NewAgentServiceClient()
		res, err := client.CreateAgentRole(context.Background(), connect.NewRequest(&healthv1.CreateAgentRoleRequest{
			OrgId:        orgID,
			Name:         name,
			SystemPrompt: systemPrompt,
			Capabilities: capabilities,
		}))
		if err != nil {
			return fmt.Errorf("failed to create agent role: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Printf("Agent role created: %s (id: %s)\n", res.Msg.Role.Name, res.Msg.Role.Id)
		}
		return nil
	},
}

var agentsDeleteCmd = &cobra.Command{
	Use:   "delete [agent_id]",
	Short: "Move an agent to the bin",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		client := backend.NewAgentServiceClient()
		_, err := client.ArchiveAgent(context.Background(), connect.NewRequest(&healthv1.ArchiveAgentRequest{AgentId: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to delete agent: %w", err)
		}
		if isJson {
			if err := printJSONValue(cmd, map[string]any{"success": true, "agentId": args[0]}); err != nil {
				return err
			}
		} else {
			cmd.Printf("Agent %s moved to bin\n", args[0])
		}
		return nil
	},
}

var agentsRestoreCmd = &cobra.Command{
	Use:   "restore [agent_id]",
	Short: "Restore an agent from the bin",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		client := backend.NewAgentServiceClient()
		_, err := client.RestoreAgent(context.Background(), connect.NewRequest(&healthv1.RestoreAgentRequest{AgentId: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to restore agent: %w", err)
		}
		if isJson {
			if err := printJSONValue(cmd, map[string]any{"success": true, "agentId": args[0]}); err != nil {
				return err
			}
		} else {
			cmd.Printf("Agent %s restored\n", args[0])
		}
		return nil
	},
}

var agentsPurgeCmd = &cobra.Command{
	Use:   "purge [agent_id]",
	Short: "Permanently delete an already-binned, unassigned agent",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		client := backend.NewAgentServiceClient()
		_, err := client.PurgeAgent(context.Background(), connect.NewRequest(&healthv1.PurgeAgentRequest{AgentId: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to purge agent: %w", err)
		}
		if isJson {
			if err := printJSONValue(cmd, map[string]any{"success": true, "agentId": args[0]}); err != nil {
				return err
			}
		} else {
			cmd.Printf("Agent %s permanently deleted\n", args[0])
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(agentsCmd)
	agentsCmd.AddCommand(agentsListCmd)
	agentsCmd.AddCommand(agentsCreateCmd)
	agentsCmd.AddCommand(agentsUpdateCmd)
	agentsCmd.AddCommand(agentsCreateRoleCmd)
	agentsCmd.AddCommand(agentsUpdateRoleCmd)
	agentsCmd.AddCommand(agentsListRolesCmd)
	agentsCmd.AddCommand(agentsDeleteCmd)
	agentsCmd.AddCommand(agentsRestoreCmd)
	agentsCmd.AddCommand(agentsPurgeCmd)

	agentsCreateCmd.Flags().String("role", "", "The agent role ID persona")
	agentsCreateCmd.Flags().String("name", "", "Display name for the agent instance")
	agentsCreateCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	agentsUpdateCmd.Flags().String("name", "", "New display name for the agent")
	agentsUpdateCmd.Flags().String("role", "", "Reassign the agent to this role ID")
	agentsListCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	agentsListCmd.Flags().StringP("filter", "f", "", "Substring match against agent name")
	agentsListCmd.Flags().StringP("sort", "s", "", "Sort as \"name\" or \"name:desc\" (works with --cursor for paging)")
	agentsListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	agentsListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	agentsListCmd.Flags().Bool("only-deleted", false, "List only agents in the bin, instead of active ones")
	agentsListRolesCmd.Flags().String("org", "", "Organization ID whose roles to list (required)")
	agentsListRolesCmd.Flags().StringP("filter", "f", "", "Substring match against role name")
	agentsListRolesCmd.Flags().StringP("sort", "s", "", "Sort as \"name\" or \"name:desc\" (works with --cursor for paging)")
	agentsListRolesCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	agentsListRolesCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	agentsCreateRoleCmd.Flags().String("org", "", "Organization the role belongs to (required)")
	agentsCreateRoleCmd.Flags().String("name", "", "Role name")
	agentsCreateRoleCmd.Flags().String("system-prompt", "", "System prompt for the role")
	agentsCreateRoleCmd.Flags().String("capabilities", "", "Capabilities/skills description for the role")
	agentsUpdateRoleCmd.Flags().String("name", "", "New role name")
	agentsUpdateRoleCmd.Flags().String("system-prompt", "", "New system prompt for the role")
	agentsUpdateRoleCmd.Flags().String("capabilities", "", "New capabilities/skills description for the role")
}
