package cmd

import (
	"github.com/spf13/cobra"
)

var artifactsCmd = &cobra.Command{
	Use:   "artifacts",
	Short: "Manage project evidence, text files, and generated assets (mock - not yet wired to the backend)",
}

var artifactsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List nested artifacts and folders (mock)",
	Run: func(cmd *cobra.Command, args []string) {
		projectID, _ := cmd.Flags().GetString("project")
		isJson, _ := cmd.Flags().GetBool("json")

		if isJson {
			cmd.Printf(`[{"file": "env-vars.md", "type": "file", "project": "%s", "mock": true}]%s`, projectID, "\n")
		} else {
			cmd.Printf("Artifacts in project '%s': [mock data - not yet wired to the backend]\n", projectID)
			cmd.Println(" - env-vars.md")
			cmd.Println(" - (dir) deployments/")
		}
	},
}

var artifactsReadCmd = &cobra.Command{
	Use:   "read [path]",
	Short: "Read file artifact content (mock)",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			cmd.Printf(`{"path": "%s", "content": "# Markdown Content\nGenerated via CLI", "mock": true}%s`, args[0], "\n")
		} else {
			cmd.Printf("# Content from file: %s\n", args[0])
			cmd.Println("[mock content - not yet wired to the backend]")
		}
	},
}

func init() {
	rootCmd.AddCommand(artifactsCmd)
	artifactsCmd.AddCommand(artifactsListCmd)
	artifactsCmd.AddCommand(artifactsReadCmd)

	artifactsListCmd.Flags().String("project", "", "Project ID to list artifacts for")
}
