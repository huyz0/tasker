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

var projectsCmd = &cobra.Command{
	Use:   "projects",
	Short: "Manage derived project templates and ownership (mock - not yet wired to the backend)",
}

var projectsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all projects (mock)",
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			data := []map[string]interface{}{
				{"id": "proj_1", "name": "Software Development Alpha", "mock": true},
				{"id": "proj_2", "name": "Marketing Launch", "mock": true},
			}
			jsonString, _ := json.Marshal(data)
			cmd.Println(string(jsonString))
		} else {
			cmd.Println("Projects: [mock data - not yet wired to the backend]")
			cmd.Println("- proj_1: Software Development Alpha")
			cmd.Println("- proj_2: Marketing Launch")
		}
	},
}

var projectsGetCmd = &cobra.Command{
	Use:   "get [id]",
	Short: "Get a specific project (mock)",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			cmd.Printf(`{"id": "%s", "name": "Project Metadata", "mock": true}%s`, args[0], "\n")
		} else {
			cmd.Printf("[mock - not yet wired to the backend] Project Details for ID: %s\n", args[0])
		}
	},
}

var projectsCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Instantiate a new project from a template (mock)",
	Run: func(cmd *cobra.Command, args []string) {
		template, _ := cmd.Flags().GetString("template")
		title, _ := cmd.Flags().GetString("title")
		isJson, _ := cmd.Flags().GetBool("json")
		if title == "" || template == "" {
			cmd.Println("Error: --template and --title flags are required.")
			return
		}
		if isJson {
			cmd.Printf(`{"status": "created", "project_title": "%s", "template": "%s", "mock": true}%s`, title, template, "\n")
		} else {
			cmd.Printf("[mock - not yet wired to the backend] Successfully created project '%s' from template '%s'\n", title, template)
		}
	},
}

var projectsDeleteCmd = &cobra.Command{
	Use:   "delete [project_id]",
	Short: "Move a project to the bin (requires org admin)",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewProjectServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.ArchiveProject(context.Background(), connect.NewRequest(&healthv1.ArchiveProjectRequest{ProjectId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to delete project: %v\n", err)
			return
		}
		cmd.Printf("Project %s moved to bin\n", args[0])
	},
}

var projectsRestoreCmd = &cobra.Command{
	Use:   "restore [project_id]",
	Short: "Restore a project from the bin (requires org admin)",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewProjectServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.RestoreProject(context.Background(), connect.NewRequest(&healthv1.RestoreProjectRequest{ProjectId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to restore project: %v\n", err)
			return
		}
		cmd.Printf("Project %s restored\n", args[0])
	},
}

func init() {
	rootCmd.AddCommand(projectsCmd)
	projectsCmd.AddCommand(projectsListCmd)
	projectsCmd.AddCommand(projectsGetCmd)
	projectsCmd.AddCommand(projectsCreateCmd)
	projectsCmd.AddCommand(projectsDeleteCmd)
	projectsCmd.AddCommand(projectsRestoreCmd)

	projectsCreateCmd.Flags().String("template", "", "Project template to inherit from")
	projectsCreateCmd.Flags().String("title", "", "Descriptive title for the new project")
}
