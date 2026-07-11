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
		projectID, _ := cmd.Flags().GetString("project")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if projectID == "" {
			cmd.Println("Error: --project is required (or set TASKER_PROJECT_ID).")
			return
		}

		client := healthv1connect.NewTaskServiceClient(
			http.DefaultClient,
			backend.URL(),
			backend.ClientOptions()...,
		)

		req := connect.NewRequest(&healthv1.ListTasksRequest{
			ProjectId: projectID,
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
	Short: "Create a new task in a project",
	Run: func(cmd *cobra.Command, args []string) {
		title, _ := cmd.Flags().GetString("title")
		status, _ := cmd.Flags().GetString("status")
		description, _ := cmd.Flags().GetString("description")
		projectID, _ := cmd.Flags().GetString("project")
		isJson, _ := cmd.Flags().GetBool("json")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if title == "" || projectID == "" {
			cmd.Println("Error: --project and --title flags are required.")
			return
		}

		client := healthv1connect.NewTaskServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.CreateTask(context.Background(), connect.NewRequest(&healthv1.CreateTaskRequest{
			ProjectId:   projectID,
			Title:       title,
			Status:      status,
			Description: description,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create task: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Task)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task created: %s (id: %s)\n", res.Msg.Task.Title, res.Msg.Task.Id)
		}
	},
}

var tasksAssignCmd = &cobra.Command{
	Use:   "assign [task_id]",
	Short: "Assign a task to an agent or user",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		agentID, _ := cmd.Flags().GetString("agent")
		userID, _ := cmd.Flags().GetString("user")
		isJson, _ := cmd.Flags().GetBool("json")
		if agentID == "" && userID == "" {
			cmd.Println("Error: one of --agent or --user is required.")
			return
		}

		client := healthv1connect.NewTaskServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.AssignTask(context.Background(), connect.NewRequest(&healthv1.AssignTaskRequest{
			TaskId:  args[0],
			AgentId: agentID,
			UserId:  userID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to assign task: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": res.Msg.Success, "task_id": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task %s assigned\n", args[0])
		}
	},
}

var tasksUpdateStatusCmd = &cobra.Command{
	Use:   "update-status [task_id]",
	Short: "Update a task's status",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		status, _ := cmd.Flags().GetString("status")
		isJson, _ := cmd.Flags().GetBool("json")

		client := healthv1connect.NewTaskServiceClient(
			http.DefaultClient,
			backend.URL(),
			backend.ClientOptions()...,
		)

		req := connect.NewRequest(&healthv1.UpdateTaskStatusRequest{
			TaskId: args[0],
			Status: status,
		})

		res, err := client.UpdateTaskStatus(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("Failed to update task status: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Task)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task %s status updated to %s\n", res.Msg.Task.Id, res.Msg.Task.Status)
		}
	},
}

var tasksDeleteCmd = &cobra.Command{
	Use:   "delete [task_id]",
	Short: "Move a task to the bin (soft delete; requires org admin)",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")

		client := healthv1connect.NewTaskServiceClient(
			http.DefaultClient,
			backend.URL(),
			backend.ClientOptions()...,
		)

		req := connect.NewRequest(&healthv1.DeleteTaskRequest{
			TaskId: args[0],
		})

		_, err := client.DeleteTask(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("Failed to delete task: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "task_id": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task %s moved to bin\n", args[0])
		}
	},
}

var tasksRestoreCmd = &cobra.Command{
	Use:   "restore [task_id]",
	Short: "Restore a task from the bin (requires org admin)",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")

		client := healthv1connect.NewTaskServiceClient(
			http.DefaultClient,
			backend.URL(),
			backend.ClientOptions()...,
		)

		req := connect.NewRequest(&healthv1.RestoreTaskRequest{
			TaskId: args[0],
		})

		_, err := client.RestoreTask(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("Failed to restore task: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "task_id": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task %s restored\n", args[0])
		}
	},
}

var tasksPurgeCmd = &cobra.Command{
	Use:   "purge [task_id]",
	Short: "Permanently delete an already-binned task and its dependent records (requires org admin)",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")

		client := healthv1connect.NewTaskServiceClient(
			http.DefaultClient,
			backend.URL(),
			backend.ClientOptions()...,
		)

		req := connect.NewRequest(&healthv1.PurgeTaskRequest{
			TaskId: args[0],
		})

		_, err := client.PurgeTask(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("Failed to purge task: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "task_id": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task %s permanently deleted\n", args[0])
		}
	},
}

func init() {
	rootCmd.AddCommand(tasksCmd)
	tasksCmd.AddCommand(tasksListCmd)
	tasksCmd.AddCommand(tasksCreateCmd)
	tasksCmd.AddCommand(tasksAssignCmd)
	tasksCmd.AddCommand(tasksUpdateStatusCmd)
	tasksCmd.AddCommand(tasksDeleteCmd)
	tasksCmd.AddCommand(tasksRestoreCmd)
	tasksCmd.AddCommand(tasksPurgeCmd)

	tasksCreateCmd.Flags().String("title", "", "The title of the task")
	tasksCreateCmd.Flags().String("status", "", "Initial status")
	tasksCreateCmd.Flags().String("description", "", "Task description")
	tasksCreateCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
	tasksAssignCmd.Flags().String("agent", "", "Agent ID to assign")
	tasksAssignCmd.Flags().String("user", "", "User ID to assign")
	tasksUpdateStatusCmd.Flags().String("status", "", "The new status (todo, in-progress, done)")
	tasksListCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
}
