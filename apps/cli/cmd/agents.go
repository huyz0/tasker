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

var agentsCmd = &cobra.Command{
	Use:   "agents",
	Short: "Manage AI agent roles and instances (mock - not yet wired to the backend)",
}

var agentsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List active agents and roles (mock)",
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			cmd.Println(`[{"id": "agent_alpha", "role": "Researcher", "status": "idle", "mock": true}]`)
		} else {
			cmd.Println("Available Agents: [mock data - not yet wired to the backend]")
			cmd.Println(" - agent_alpha [Role: Researcher] (Idle)")
		}
	},
}

var agentsCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new agent instance with specific persona (mock)",
	Run: func(cmd *cobra.Command, args []string) {
		role, _ := cmd.Flags().GetString("role")
		isJson, _ := cmd.Flags().GetBool("json")
		if role == "" {
			cmd.Println("Error: --role is required.")
			return
		}
		if isJson {
			cmd.Printf(`{"status": "created", "agent_id": "new_agent_123", "role": "%s", "mock": true}%s`, role, "\n")
		} else {
			cmd.Printf("[mock - not yet wired to the backend] Spawned new agent with role %s\n", role)
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

func init() {
	rootCmd.AddCommand(agentsCmd)
	agentsCmd.AddCommand(agentsListCmd)
	agentsCmd.AddCommand(agentsCreateCmd)
	agentsCmd.AddCommand(agentsDeleteCmd)
	agentsCmd.AddCommand(agentsRestoreCmd)

	agentsCreateCmd.Flags().String("role", "", "The designated role persona")
}
