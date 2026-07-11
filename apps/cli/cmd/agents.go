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

var agentsCmd = &cobra.Command{
	Use:   "agents",
	Short: "Manage AI agent instances",
}

var agentsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List active agents in an organization",
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		orgID, _ := cmd.Flags().GetString("org")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if orgID == "" {
			cmd.Println("Error: --org is required (or set TASKER_ORG_ID).")
			return
		}

		client := healthv1connect.NewAgentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.ListAgents(context.Background(), connect.NewRequest(&healthv1.ListAgentsRequest{OrgId: orgID}))
		if err != nil {
			cmd.PrintErrf("Failed to list agents: %v\n", err)
			return
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
	},
}

var agentsCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new agent instance with specific role",
	Run: func(cmd *cobra.Command, args []string) {
		role, _ := cmd.Flags().GetString("role")
		name, _ := cmd.Flags().GetString("name")
		orgID, _ := cmd.Flags().GetString("org")
		isJson, _ := cmd.Flags().GetBool("json")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if role == "" || orgID == "" {
			cmd.Println("Error: --org and --role are required.")
			return
		}

		client := healthv1connect.NewAgentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.CreateAgent(context.Background(), connect.NewRequest(&healthv1.CreateAgentRequest{
			OrgId:       orgID,
			AgentRoleId: role,
			Name:        name,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create agent: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Agent)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Spawned new agent '%s' (id: %s) with role %s\n", res.Msg.Agent.Name, res.Msg.Agent.Id, res.Msg.Agent.AgentRoleId)
		}
	},
}

var agentsDeleteCmd = &cobra.Command{
	Use:   "delete [agent_id]",
	Short: "Move an agent to the bin",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewAgentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.ArchiveAgent(context.Background(), connect.NewRequest(&healthv1.ArchiveAgentRequest{AgentId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to delete agent: %v\n", err)
			return
		}
		cmd.Printf("Agent %s moved to bin\n", args[0])
	},
}

var agentsRestoreCmd = &cobra.Command{
	Use:   "restore [agent_id]",
	Short: "Restore an agent from the bin",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewAgentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.RestoreAgent(context.Background(), connect.NewRequest(&healthv1.RestoreAgentRequest{AgentId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to restore agent: %v\n", err)
			return
		}
		cmd.Printf("Agent %s restored\n", args[0])
	},
}

var agentsPurgeCmd = &cobra.Command{
	Use:   "purge [agent_id]",
	Short: "Permanently delete an already-binned, unassigned agent",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewAgentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.PurgeAgent(context.Background(), connect.NewRequest(&healthv1.PurgeAgentRequest{AgentId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to purge agent: %v\n", err)
			return
		}
		cmd.Printf("Agent %s permanently deleted\n", args[0])
	},
}

func init() {
	rootCmd.AddCommand(agentsCmd)
	agentsCmd.AddCommand(agentsListCmd)
	agentsCmd.AddCommand(agentsCreateCmd)
	agentsCmd.AddCommand(agentsDeleteCmd)
	agentsCmd.AddCommand(agentsRestoreCmd)
	agentsCmd.AddCommand(agentsPurgeCmd)

	agentsCreateCmd.Flags().String("role", "", "The agent role ID persona")
	agentsCreateCmd.Flags().String("name", "", "Display name for the agent instance")
	agentsCreateCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	agentsListCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
}
