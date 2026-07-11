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

var tasksCmd = &cobra.Command{
	Use:   "tasks",
	Short: "Workbench for tasks and autonomous agents",
}

var tasksListCmd = &cobra.Command{
	Use:   "list",
	Short: "List tasks within a project",
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")

		client := healthv1connect.NewTaskServiceClient(
			http.DefaultClient,
			backend.URL(),
			backend.ClientOptions()...,
		)

		req := connect.NewRequest(&healthv1.ListTasksRequest{
			ProjectId: "prj-1", // Using a hardcoded mock project ID until CLI context management is built
		})

		res, err := client.ListTasks(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("Failed to list tasks: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Tasks)
			cmd.Println(string(jsonString))
		} else {
			cmd.Println("Tasks Workbench:")
			for _, task := range res.Msg.Tasks {
				cmd.Printf("- %s [%s]: %s\n", task.Id, task.Status, task.Title)
			}
		}
	},
}

var tasksCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new task (mock - not yet wired to the backend)",
	Run: func(cmd *cobra.Command, args []string) {
		title, _ := cmd.Flags().GetString("title")
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			cmd.Printf(`{"status": "created", "task": "%s", "mock": true}%s`, title, "\n")
		} else {
			cmd.Printf("[mock - not yet wired to the backend] Task created: %s\n", title)
		}
	},
}

var tasksAssignCmd = &cobra.Command{
	Use:   "assign [task_id]",
	Short: "Assign a task to an agent or user (mock - not yet wired to the backend)",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		assignee, _ := cmd.Flags().GetString("assignee")
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			cmd.Printf(`{"status": "assigned", "task_id": "%s", "assignee": "%s", "mock": true}%s`, args[0], assignee, "\n")
		} else {
			cmd.Printf("[mock - not yet wired to the backend] Task %s assigned to %s\n", args[0], assignee)
		}
	},
}

func init() {
	rootCmd.AddCommand(tasksCmd)
	tasksCmd.AddCommand(tasksListCmd)
	tasksCmd.AddCommand(tasksCreateCmd)
	tasksCmd.AddCommand(tasksAssignCmd)

	tasksCreateCmd.Flags().String("title", "", "The title of the task")
	tasksAssignCmd.Flags().String("assignee", "", "The ID or name to assign")
}
