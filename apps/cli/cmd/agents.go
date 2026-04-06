package cmd

import (
	"encoding/json"
	"fmt"
	"github.com/spf13/cobra"
)

var agentsCmd = &cobra.Command{
	Use:   "agents",
	Short: "Manage AI agent roles and instances",
}

var agentsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List active agents and roles",
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			fmt.Println(`[{"id": "agent_alpha", "role": "Researcher", "status": "idle"}]`)
		} else {
			fmt.Println("Available Agents:")
			fmt.Println(" - agent_alpha [Role: Researcher] (Idle)")
		}
	},
}

var agentsCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new agent instance with specific persona",
	Run: func(cmd *cobra.Command, args []string) {
		role, _ := cmd.Flags().GetString("role")
		isJson, _ := cmd.Flags().GetBool("json")
		if role == "" {
			fmt.Println("Error: --role is required.")
			return
		}
		if isJson {
			fmt.Printf(`{"status": "created", "agent_id": "new_agent_123", "role": "%s"}%s`, role, "\n")
		} else {
			fmt.Printf("Spawned new agent with role %s\n", role)
		}
	},
}

func init() {
	rootCmd.AddCommand(agentsCmd)
	agentsCmd.AddCommand(agentsListCmd)
	agentsCmd.AddCommand(agentsCreateCmd)
	
	agentsCreateCmd.Flags().String("role", "", "The designated role persona")
}
