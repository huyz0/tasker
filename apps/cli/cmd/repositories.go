package cmd

import (
	"encoding/json"
	"github.com/spf13/cobra"
)

var repoCmd = &cobra.Command{
	Use:   "repo",
	Short: "Manage repository integrations and pull requests (mock - not yet wired to the backend)",
}

var repoListCmd = &cobra.Command{
	Use:   "list",
	Short: "List repository links for a project or PRs for a task (mock)",
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		taskId, _ := cmd.Flags().GetString("task-id")

		if taskId != "" {
			if isJson {
				data := []map[string]interface{}{
					{"id": "pr_1", "remote_pr_id": "123", "title": "Implement auth", "status": "open", "mock": true},
				}
				jsonString, _ := json.Marshal(data)
				cmd.Println(string(jsonString))
			} else {
				cmd.Printf("Pull Requests for task %s: [mock data - not yet wired to the backend]\n", taskId)
				cmd.Println("- PR 123: Implement auth (open)")
			}
			return
		}
		if isJson {
			data := []map[string]interface{}{
				{"id": "link_1", "provider": "github", "remote_name": "huyz0/tasker", "mock": true},
			}
			jsonString, _ := json.Marshal(data)
			cmd.Println(string(jsonString))
		} else {
			cmd.Println("Repository Links: [mock data - not yet wired to the backend]")
			cmd.Println("- github: huyz0/tasker")
		}
	},
}

var repoLinkCmd = &cobra.Command{
	Use:   "link",
	Short: "Link a new repository to a project (mock)",
	Run: func(cmd *cobra.Command, args []string) {
		provider, _ := cmd.Flags().GetString("provider")
		remote, _ := cmd.Flags().GetString("remote")
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			cmd.Printf(`{"status": "linked", "provider": "%s", "remote_name": "%s", "mock": true}%s`, provider, remote, "\n")
		} else {
			cmd.Printf("[mock - not yet wired to the backend] Successfully linked %s repository: %s\n", provider, remote)
		}
	},
}

var repoSyncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Sync pull requests from linked repositories (mock)",
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			cmd.Printf(`{"status": "synced", "message": "Pull requests synchronized successfully", "mock": true}%s`, "\n")
		} else {
			cmd.Println("[mock - not yet wired to the backend] Pull requests synchronized successfully.")
		}
	},
}

var repoBuildsCmd = &cobra.Command{
	Use:   "builds",
	Short: "List builds for a repository link (mock)",
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			data := []map[string]interface{}{
				{"id": "build_1", "status": "SUCCESS", "commitSha": "abc1234", "mock": true},
			}
			jsonString, _ := json.Marshal(data)
			cmd.Println(string(jsonString))
		} else {
			cmd.Println("Builds: [mock data - not yet wired to the backend]")
			cmd.Println("- abc1234: SUCCESS")
		}
	},
}

var repoDeploymentsCmd = &cobra.Command{
	Use:   "deployments",
	Short: "List deployments for a build (mock)",
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			data := []map[string]interface{}{
				{"id": "dep_1", "environment": "PRODUCTION", "status": "SUCCESS", "mock": true},
			}
			jsonString, _ := json.Marshal(data)
			cmd.Println(string(jsonString))
		} else {
			cmd.Println("Deployments: [mock data - not yet wired to the backend]")
			cmd.Println("- PRODUCTION: SUCCESS")
		}
	},
}

func init() {
	rootCmd.AddCommand(repoCmd)
	repoCmd.AddCommand(repoListCmd)
	repoCmd.AddCommand(repoLinkCmd)
	repoCmd.AddCommand(repoSyncCmd)
	repoCmd.AddCommand(repoBuildsCmd)
	repoCmd.AddCommand(repoDeploymentsCmd)

	repoListCmd.Flags().String("task-id", "", "Task ID to list pull requests for")

	repoLinkCmd.Flags().String("provider", "github", "Provider (e.g. github, gitlab)")
	repoLinkCmd.Flags().String("remote", "", "Remote repository name")
}
