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
	Short: "Manage projects derived from templates",
}

var projectsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all projects in an organization",
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		orgID, _ := cmd.Flags().GetString("org")
		filter, _ := cmd.Flags().GetString("filter")
		sort, _ := cmd.Flags().GetString("sort")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if orgID == "" {
			cmd.Println("Error: --org is required (or set TASKER_ORG_ID).")
			return
		}

		client := healthv1connect.NewProjectServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.ListProjects(context.Background(), connect.NewRequest(&healthv1.ListProjectsRequest{
			OrgId: orgID,
			Page:  &healthv1.PageRequest{Filter: filter, Sort: sort},
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list projects: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Projects)
			cmd.Println(string(jsonString))
		} else {
			cmd.Println("Projects:")
			for _, p := range res.Msg.Projects {
				cmd.Printf("- %s: %s\n", p.Id, p.Name)
			}
		}
	},
}

var projectsGetCmd = &cobra.Command{
	Use:   "get [id]",
	Short: "Get a specific project",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")

		client := healthv1connect.NewProjectServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.GetProject(context.Background(), connect.NewRequest(&healthv1.GetProjectRequest{Id: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to get project: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Project)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Project %s: %s (org: %s, owner: %s)\n", res.Msg.Project.Id, res.Msg.Project.Name, res.Msg.Project.OrgId, res.Msg.Project.OwnerId)
		}
	},
}

var projectsCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Instantiate a new project from a template",
	Run: func(cmd *cobra.Command, args []string) {
		template, _ := cmd.Flags().GetString("template")
		title, _ := cmd.Flags().GetString("title")
		orgID, _ := cmd.Flags().GetString("org")
		owner, _ := cmd.Flags().GetString("owner")
		isJson, _ := cmd.Flags().GetBool("json")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if title == "" || template == "" || orgID == "" {
			cmd.Println("Error: --org, --template and --title flags are required.")
			return
		}

		client := healthv1connect.NewProjectServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.CreateProject(context.Background(), connect.NewRequest(&healthv1.CreateProjectRequest{
			OrgId:      orgID,
			TemplateId: template,
			Name:       title,
			OwnerId:    owner,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create project: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Project)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Successfully created project '%s' (id: %s) from template '%s'\n", res.Msg.Project.Name, res.Msg.Project.Id, template)
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

var projectsPurgeCmd = &cobra.Command{
	Use:   "purge [project_id]",
	Short: "Permanently delete an already-binned, empty project (requires org admin)",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewProjectServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.PurgeProject(context.Background(), connect.NewRequest(&healthv1.PurgeProjectRequest{ProjectId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to purge project: %v\n", err)
			return
		}
		cmd.Printf("Project %s permanently deleted\n", args[0])
	},
}

func init() {
	rootCmd.AddCommand(projectsCmd)
	projectsCmd.AddCommand(projectsListCmd)
	projectsCmd.AddCommand(projectsGetCmd)
	projectsCmd.AddCommand(projectsCreateCmd)
	projectsCmd.AddCommand(projectsDeleteCmd)
	projectsCmd.AddCommand(projectsRestoreCmd)
	projectsCmd.AddCommand(projectsPurgeCmd)

	projectsCreateCmd.Flags().String("template", "", "Project template to inherit from")
	projectsCreateCmd.Flags().String("title", "", "Descriptive title for the new project")
	projectsCreateCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	projectsCreateCmd.Flags().String("owner", "", "User ID of the project owner")
	projectsListCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	projectsListCmd.Flags().StringP("filter", "f", "", "Substring match against project name")
	projectsListCmd.Flags().StringP("sort", "s", "", "Sort as \"name\" or \"name:desc\" (works with --cursor for paging)")
}
