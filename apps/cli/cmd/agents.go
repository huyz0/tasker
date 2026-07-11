package cmd

import (
	"github.com/spf13/cobra"
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

func init() {
	rootCmd.AddCommand(agentsCmd)
	agentsCmd.AddCommand(agentsListCmd)
	agentsCmd.AddCommand(agentsCreateCmd)

	agentsCreateCmd.Flags().String("role", "", "The designated role persona")
}
