package cmd

import (
	"encoding/json"
	"fmt"
	"github.com/spf13/cobra"
)

var artifactsCmd = &cobra.Command{
	Use:   "artifacts",
	Short: "Manage project evidence, text files, and generated assets",
}

var artifactsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List nested artifacts and folders",
	Run: func(cmd *cobra.Command, args []string) {
		projectID, _ := cmd.Flags().GetString("project")
		isJson, _ := cmd.Flags().GetBool("json")
		
		if isJson {
			fmt.Printf(`[{"file": "env-vars.md", "type": "file", "project": "%s"}]%s`, projectID, "\n")
		} else {
			fmt.Printf("Artifacts in project '%s':\n", projectID)
			fmt.Println(" - env-vars.md")
			fmt.Println(" - (dir) deployments/")
		}
	},
}

var artifactsReadCmd = &cobra.Command{
	Use:   "read [path]",
	Short: "Read file artifact content",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			fmt.Printf(`{"path": "%s", "content": "# Markdown Content\nGenerated via CLI"}%s`, args[0], "\n")
		} else {
			fmt.Printf("# Content from file: %s\n", args[0])
			fmt.Println("Generated via CLI placeholder logic")
		}
	},
}

func init() {
	rootCmd.AddCommand(artifactsCmd)
	artifactsCmd.AddCommand(artifactsListCmd)
	artifactsCmd.AddCommand(artifactsReadCmd)
	
	artifactsListCmd.Flags().String("project", "", "Project ID to list artifacts for")
}
