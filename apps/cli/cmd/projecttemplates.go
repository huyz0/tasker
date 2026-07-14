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

var projectTemplatesCmd = &cobra.Command{
	Use:   "project-templates",
	Short: "Manage project templates",
}

var projectTemplatesCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a project template for an organization",
	Run: func(cmd *cobra.Command, args []string) {
		name, _ := cmd.Flags().GetString("name")
		description, _ := cmd.Flags().GetString("description")
		orgID, _ := cmd.Flags().GetString("org")
		rootTaskTypeID, _ := cmd.Flags().GetString("root-task-type")
		isJson, _ := cmd.Flags().GetBool("json")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if name == "" || orgID == "" {
			cmd.Println("Error: --org and --name are required.")
			return
		}

		client := healthv1connect.NewProjectTemplateServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.CreateTemplate(context.Background(), connect.NewRequest(&healthv1.CreateProjectTemplateRequest{
			OrgId:          orgID,
			Name:           name,
			Description:    description,
			RootTaskTypeId: rootTaskTypeID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create project template: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Template)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Project template created: %s (id: %s)\n", res.Msg.Template.Name, res.Msg.Template.Id)
		}
	},
}

var projectTemplatesGetCmd = &cobra.Command{
	Use:   "get [template_id]",
	Short: "Show a project template",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")

		client := healthv1connect.NewProjectTemplateServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.GetTemplate(context.Background(), connect.NewRequest(&healthv1.GetProjectTemplateRequest{Id: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to get project template: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Template)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Template: %s (id: %s)\n", res.Msg.Template.Name, res.Msg.Template.Id)
			if res.Msg.Template.RootTaskTypeId != "" {
				cmd.Printf("Root task type: %s\n", res.Msg.Template.RootTaskTypeId)
			}
		}
	},
}

var projectTemplatesListCmd = &cobra.Command{
	Use:   "list",
	Short: "List project templates for an organization",
	Run: func(cmd *cobra.Command, args []string) {
		orgID, _ := cmd.Flags().GetString("org")
		isJson, _ := cmd.Flags().GetBool("json")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if orgID == "" {
			cmd.Println("Error: --org is required.")
			return
		}

		client := healthv1connect.NewProjectTemplateServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.ListTemplates(context.Background(), connect.NewRequest(&healthv1.ListProjectTemplatesRequest{
			OrgId: orgID,
			Page:  &healthv1.PageRequest{Limit: limit, Cursor: cursor},
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list project templates: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Templates)
			cmd.Println(string(jsonString))
		} else {
			for _, t := range res.Msg.Templates {
				cmd.Printf("  - %s (id: %s)\n", t.Name, t.Id)
			}
		}
	},
}

func init() {
	rootCmd.AddCommand(projectTemplatesCmd)
	projectTemplatesCmd.AddCommand(projectTemplatesCreateCmd)
	projectTemplatesCmd.AddCommand(projectTemplatesGetCmd)
	projectTemplatesCmd.AddCommand(projectTemplatesListCmd)

	projectTemplatesCreateCmd.Flags().String("name", "", "Project template name")
	projectTemplatesCreateCmd.Flags().String("description", "", "Project template description")
	projectTemplatesCreateCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	projectTemplatesCreateCmd.Flags().String("root-task-type", "", "Optional root task type ID for this template")

	projectTemplatesListCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	projectTemplatesListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	projectTemplatesListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
}
