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

var taskTypesCmd = &cobra.Command{
	Use:   "task-types",
	Short: "Manage task types and their status enum / transition state machine",
}

var taskTypesCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a task type for an organization (optionally scoped to a project)",
	Run: func(cmd *cobra.Command, args []string) {
		name, _ := cmd.Flags().GetString("name")
		orgID, _ := cmd.Flags().GetString("org")
		projectID, _ := cmd.Flags().GetString("project")
		parentID, _ := cmd.Flags().GetString("parent")
		isJson, _ := cmd.Flags().GetBool("json")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if name == "" || orgID == "" {
			cmd.Println("Error: --org and --name are required.")
			return
		}

		client := healthv1connect.NewTaskTypeServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.CreateTaskType(context.Background(), connect.NewRequest(&healthv1.CreateTaskTypeRequest{
			OrgId:     orgID,
			ProjectId: projectID,
			Name:      name,
			ParentId:  parentID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create task type: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.TaskType)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task type created: %s (id: %s)\n", res.Msg.TaskType.Name, res.Msg.TaskType.Id)
		}
	},
}

var taskTypesListCmd = &cobra.Command{
	Use:   "list",
	Short: "List task types for an organization",
	Run: func(cmd *cobra.Command, args []string) {
		orgID, _ := cmd.Flags().GetString("org")
		filter, _ := cmd.Flags().GetString("filter")
		sort, _ := cmd.Flags().GetString("sort")
		isJson, _ := cmd.Flags().GetBool("json")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if orgID == "" {
			cmd.Println("Error: --org is required (or set TASKER_ORG_ID).")
			return
		}

		client := healthv1connect.NewTaskTypeServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.ListTaskTypes(context.Background(), connect.NewRequest(&healthv1.ListTaskTypesRequest{
			OrgId: orgID,
			Page:  &healthv1.PageRequest{Filter: filter, Sort: sort},
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list task types: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.TaskTypes)
			cmd.Println(string(jsonString))
		} else {
			for _, t := range res.Msg.TaskTypes {
				cmd.Printf("  - %s (id: %s)\n", t.Name, t.Id)
			}
		}
	},
}

var taskTypesGetCmd = &cobra.Command{
	Use:   "get [task_type_id]",
	Short: "Show a task type along with its configured statuses and transitions",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")

		client := healthv1connect.NewTaskTypeServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.GetTaskType(context.Background(), connect.NewRequest(&healthv1.GetTaskTypeRequest{Id: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to get task type: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task type: %s (id: %s)\n", res.Msg.TaskType.Name, res.Msg.TaskType.Id)
			if res.Msg.TaskType.ParentId != "" {
				cmd.Printf("Parent: %s\n", res.Msg.TaskType.ParentId)
			}
			cmd.Println("Statuses:")
			for _, s := range res.Msg.Statuses {
				cmd.Printf("  - %s (id: %s)\n", s.Name, s.Id)
			}
			cmd.Println("Transitions:")
			for _, t := range res.Msg.Transitions {
				cmd.Printf("  - %s -> %s\n", t.FromStatusId, t.ToStatusId)
			}
		}
	},
}

var taskTypesCreateStatusCmd = &cobra.Command{
	Use:   "create-status [task_type_id]",
	Short: "Add a status to a task type's enum",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		name, _ := cmd.Flags().GetString("name")
		isJson, _ := cmd.Flags().GetBool("json")
		if name == "" {
			cmd.Println("Error: --name is required.")
			return
		}

		client := healthv1connect.NewTaskTypeServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.CreateTaskStatus(context.Background(), connect.NewRequest(&healthv1.CreateTaskStatusRequest{
			TaskTypeId: args[0],
			Name:       name,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create task status: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Status)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Status created: %s (id: %s)\n", res.Msg.Status.Name, res.Msg.Status.Id)
		}
	},
}

var taskTypesCreateTransitionCmd = &cobra.Command{
	Use:   "create-transition [task_type_id]",
	Short: "Allow a status transition (edge) in a task type's state machine",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		fromStatusID, _ := cmd.Flags().GetString("from")
		toStatusID, _ := cmd.Flags().GetString("to")
		isJson, _ := cmd.Flags().GetBool("json")
		if fromStatusID == "" || toStatusID == "" {
			cmd.Println("Error: --from and --to status IDs are required.")
			return
		}

		client := healthv1connect.NewTaskTypeServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.CreateTaskStatusTransition(context.Background(), connect.NewRequest(&healthv1.CreateTaskStatusTransitionRequest{
			TaskTypeId:   args[0],
			FromStatusId: fromStatusID,
			ToStatusId:   toStatusID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create status transition: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Transition)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Transition allowed: %s -> %s\n", res.Msg.Transition.FromStatusId, res.Msg.Transition.ToStatusId)
		}
	},
}

func init() {
	rootCmd.AddCommand(taskTypesCmd)
	taskTypesCmd.AddCommand(taskTypesCreateCmd)
	taskTypesCmd.AddCommand(taskTypesListCmd)
	taskTypesCmd.AddCommand(taskTypesGetCmd)
	taskTypesCmd.AddCommand(taskTypesCreateStatusCmd)
	taskTypesCmd.AddCommand(taskTypesCreateTransitionCmd)

	taskTypesCreateCmd.Flags().String("name", "", "Task type name")
	taskTypesCreateCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	taskTypesCreateCmd.Flags().String("project", "", "Optional project ID to scope this type to (or set TASKER_PROJECT_ID)")
	taskTypesCreateCmd.Flags().String("parent", "", "Optional parent task type ID, for building a task type hierarchy")

	taskTypesListCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	taskTypesListCmd.Flags().StringP("filter", "f", "", "Substring match against task type name")
	taskTypesListCmd.Flags().StringP("sort", "s", "", "Sort as \"name\" or \"name:desc\"")

	taskTypesCreateStatusCmd.Flags().String("name", "", "Status name (e.g. open, in_review, closed)")

	taskTypesCreateTransitionCmd.Flags().String("from", "", "Status ID this transition starts from")
	taskTypesCreateTransitionCmd.Flags().String("to", "", "Status ID this transition ends at")
}
