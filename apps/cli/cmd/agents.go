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
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if orgID == "" {
			cmd.Println("Error: --org is required (or set TASKER_ORG_ID).")
			return errors.New("Error: --org is required (or set TASKER_ORG_ID).")
		}

		client := healthv1connect.NewAgentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.ListAgents(context.Background(), connect.NewRequest(&healthv1.ListAgentsRequest{
			OrgId: orgID,
			Page:  &healthv1.PageRequest{Limit: limit, Cursor: cursor, Filter: filter, Sort: sort},
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list agents: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Agents)
			cmd.Println(string(jsonString))
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
			cmd.Println("Error: --org and --role are required.")
			return errors.New("Error: --org and --role are required.")
		}

		client := healthv1connect.NewAgentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.CreateAgent(context.Background(), connect.NewRequest(&healthv1.CreateAgentRequest{
			OrgId:       orgID,
			AgentRoleId: role,
			Name:        name,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create agent: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Agent)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Spawned new agent '%s' (id: %s) with role %s\n", res.Msg.Agent.Name, res.Msg.Agent.Id, res.Msg.Agent.AgentRoleId)
		}
		return nil
	},
}

var agentsListRolesCmd = &cobra.Command{
	Use:   "list-roles",
	Short: "List all agent role personas",
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		filter, _ := cmd.Flags().GetString("filter")
		sort, _ := cmd.Flags().GetString("sort")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")

		client := healthv1connect.NewAgentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.ListAgentRoles(context.Background(), connect.NewRequest(&healthv1.ListAgentRolesRequest{
			Page: &healthv1.PageRequest{Limit: limit, Cursor: cursor, Filter: filter, Sort: sort},
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list agent roles: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Roles)
			cmd.Println(string(jsonString))
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
	Short: "Create a new agent role persona (system prompt, capabilities)",
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		systemPrompt, _ := cmd.Flags().GetString("system-prompt")
		capabilities, _ := cmd.Flags().GetString("capabilities")
		isJson, _ := cmd.Flags().GetBool("json")
		if name == "" {
			cmd.Println("Error: --name is required.")
			return errors.New("Error: --name is required.")
		}

		client := healthv1connect.NewAgentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.CreateAgentRole(context.Background(), connect.NewRequest(&healthv1.CreateAgentRoleRequest{
			Name:         name,
			SystemPrompt: systemPrompt,
			Capabilities: capabilities,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create agent role: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Role)
			cmd.Println(string(jsonString))
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
		client := healthv1connect.NewAgentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.ArchiveAgent(context.Background(), connect.NewRequest(&healthv1.ArchiveAgentRequest{AgentId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to delete agent: %v\n", err)
			return err
		}
		cmd.Printf("Agent %s moved to bin\n", args[0])
		return nil
	},
}

var agentsRestoreCmd = &cobra.Command{
	Use:   "restore [agent_id]",
	Short: "Restore an agent from the bin",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := healthv1connect.NewAgentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.RestoreAgent(context.Background(), connect.NewRequest(&healthv1.RestoreAgentRequest{AgentId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to restore agent: %v\n", err)
			return err
		}
		cmd.Printf("Agent %s restored\n", args[0])
		return nil
	},
}

var agentsPurgeCmd = &cobra.Command{
	Use:   "purge [agent_id]",
	Short: "Permanently delete an already-binned, unassigned agent",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := healthv1connect.NewAgentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.PurgeAgent(context.Background(), connect.NewRequest(&healthv1.PurgeAgentRequest{AgentId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to purge agent: %v\n", err)
			return err
		}
		cmd.Printf("Agent %s permanently deleted\n", args[0])
		return nil
	},
}

func init() {
	rootCmd.AddCommand(agentsCmd)
	agentsCmd.AddCommand(agentsListCmd)
	agentsCmd.AddCommand(agentsCreateCmd)
	agentsCmd.AddCommand(agentsCreateRoleCmd)
	agentsCmd.AddCommand(agentsListRolesCmd)
	agentsCmd.AddCommand(agentsDeleteCmd)
	agentsCmd.AddCommand(agentsRestoreCmd)
	agentsCmd.AddCommand(agentsPurgeCmd)

	agentsCreateCmd.Flags().String("role", "", "The agent role ID persona")
	agentsCreateCmd.Flags().String("name", "", "Display name for the agent instance")
	agentsCreateCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	agentsListCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	agentsListCmd.Flags().StringP("filter", "f", "", "Substring match against agent name")
	agentsListCmd.Flags().StringP("sort", "s", "", "Sort as \"name\" or \"name:desc\" (works with --cursor for paging)")
	agentsListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	agentsListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	agentsListRolesCmd.Flags().StringP("filter", "f", "", "Substring match against role name")
	agentsListRolesCmd.Flags().StringP("sort", "s", "", "Sort as \"name\" or \"name:desc\" (works with --cursor for paging)")
	agentsListRolesCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	agentsListRolesCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	agentsCreateRoleCmd.Flags().String("name", "", "Role name")
	agentsCreateRoleCmd.Flags().String("system-prompt", "", "System prompt for the role")
	agentsCreateRoleCmd.Flags().String("capabilities", "", "Capabilities/skills description for the role")
}
