package cmd

import (
	"encoding/json"
	"github.com/spf13/cobra"
)

var projectsCmd = &cobra.Command{
	Use:   "projects",
	Short: "Manage derived project templates and ownership",
}

var projectsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all projects",
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			data := []map[string]interface{}{
				{"id": "proj_1", "name": "Software Development Alpha"},
				{"id": "proj_2", "name": "Marketing Launch"},
			}
			jsonString, _ := json.Marshal(data)
			cmd.Println(string(jsonString))
		} else {
			cmd.Println("Projects:")
			cmd.Println("- proj_1: Software Development Alpha")
			cmd.Println("- proj_2: Marketing Launch")
		}
	},
}

var projectsGetCmd = &cobra.Command{
	Use:   "get [id]",
	Short: "Get a specific project",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			cmd.Printf(`{"id": "%s", "name": "Project Metadata"}%s`, args[0], "\n")
		} else {
			cmd.Printf("Project Details for ID: %s\n", args[0])
		}
	},
}

var projectsCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Instantiate a new project from a template",
	Run: func(cmd *cobra.Command, args []string) {
		template, _ := cmd.Flags().GetString("template")
		title, _ := cmd.Flags().GetString("title")
		isJson, _ := cmd.Flags().GetBool("json")
		if title == "" || template == "" {
			cmd.Println("Error: --template and --title flags are required.")
			return
		}
		if isJson {
			cmd.Printf(`{"status": "created", "project_title": "%s", "template": "%s"}%s`, title, template, "\n")
		} else {
			cmd.Printf("Successfully created project '%s' from template '%s'\n", title, template)
		}
	},
}

func init() {
	rootCmd.AddCommand(projectsCmd)
	projectsCmd.AddCommand(projectsListCmd)
	projectsCmd.AddCommand(projectsGetCmd)
	projectsCmd.AddCommand(projectsCreateCmd)

	projectsCreateCmd.Flags().String("template", "", "Project template to inherit from")
	projectsCreateCmd.Flags().String("title", "", "Descriptive title for the new project")
}
