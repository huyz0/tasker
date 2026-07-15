package cmd

import (
	"context"
	"encoding/json"
	"fmt"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
)

var tasksCmd = &cobra.Command{
	Use:   "tasks",
	Short: "Workbench for tasks and autonomous agents",
}

var tasksListCmd = &cobra.Command{
	Use:   "list",
	Short: "List tasks within a project",
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		projectID, _ := cmd.Flags().GetString("project")
		filter, _ := cmd.Flags().GetString("filter")
		sort, _ := cmd.Flags().GetString("sort")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if projectID == "" {
			cmd.Println("Error: --project is required (or set TASKER_PROJECT_ID).")
			return fmt.Errorf("--project is required (or set TASKER_PROJECT_ID)")
		}

		client := backend.NewTaskServiceClient()

		req := connect.NewRequest(&healthv1.ListTasksRequest{
			ProjectId: projectID,
			Page:      &healthv1.PageRequest{Limit: limit, Cursor: cursor, Filter: filter, Sort: sort},
		})

		res, err := client.ListTasks(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("Failed to list tasks: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Tasks)
			cmd.Println(string(jsonString))
		} else {
			cmd.Println("Tasks Workbench:")
			for _, task := range res.Msg.Tasks {
				cmd.Printf("- %s [%s]: %s (id: %s)\n", task.DisplayId, task.Status, task.Title, task.Id)
			}
		}
		return nil
	},
}

var tasksCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new task in a project",
	RunE: func(cmd *cobra.Command, args []string) error {
		title, _ := cmd.Flags().GetString("title")
		status, _ := cmd.Flags().GetString("status")
		description, _ := cmd.Flags().GetString("description")
		projectID, _ := cmd.Flags().GetString("project")
		taskTypeID, _ := cmd.Flags().GetString("task-type")
		isJson, _ := cmd.Flags().GetBool("json")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if title == "" || projectID == "" {
			cmd.Println("Error: --project and --title flags are required.")
			return fmt.Errorf("--project and --title flags are required")
		}

		client := backend.NewTaskServiceClient()
		res, err := client.CreateTask(context.Background(), connect.NewRequest(&healthv1.CreateTaskRequest{
			ProjectId:   projectID,
			Title:       title,
			Status:      status,
			Description: description,
			TaskTypeId:  taskTypeID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create task: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Task)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task created: %s [%s] (id: %s)\n", res.Msg.Task.Title, res.Msg.Task.DisplayId, res.Msg.Task.Id)
		}
		return nil
	},
}

var tasksAssignCmd = &cobra.Command{
	Use:   "assign [task_id]",
	Short: "Assign a task to an agent or user",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		agentID, _ := cmd.Flags().GetString("agent")
		userID, _ := cmd.Flags().GetString("user")
		isJson, _ := cmd.Flags().GetBool("json")
		if agentID == "" && userID == "" {
			cmd.Println("Error: one of --agent or --user is required.")
			return fmt.Errorf("one of --agent or --user is required")
		}

		client := backend.NewTaskServiceClient()
		res, err := client.AssignTask(context.Background(), connect.NewRequest(&healthv1.AssignTaskRequest{
			TaskId:  args[0],
			AgentId: agentID,
			UserId:  userID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to assign task: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": res.Msg.Success, "task_id": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task %s assigned\n", args[0])
		}
		return nil
	},
}

var tasksReviewerAddCmd = &cobra.Command{
	Use:   "reviewer-add [task_id]",
	Short: "Add a reviewer to a task",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		userID, _ := cmd.Flags().GetString("user")
		isJson, _ := cmd.Flags().GetBool("json")
		if userID == "" {
			cmd.Println("Error: --user is required.")
			return fmt.Errorf("--user is required")
		}

		client := backend.NewTaskServiceClient()
		res, err := client.AddTaskReviewer(context.Background(), connect.NewRequest(&healthv1.AddTaskReviewerRequest{
			TaskId: args[0],
			UserId: userID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to add reviewer: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": res.Msg.Success, "task_id": args[0], "user_id": userID})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Reviewer %s added to task %s\n", userID, args[0])
		}
		return nil
	},
}

var tasksReviewerRemoveCmd = &cobra.Command{
	Use:   "reviewer-remove [task_id]",
	Short: "Remove a reviewer from a task",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		userID, _ := cmd.Flags().GetString("user")
		isJson, _ := cmd.Flags().GetBool("json")
		if userID == "" {
			cmd.Println("Error: --user is required.")
			return fmt.Errorf("--user is required")
		}

		client := backend.NewTaskServiceClient()
		res, err := client.RemoveTaskReviewer(context.Background(), connect.NewRequest(&healthv1.RemoveTaskReviewerRequest{
			TaskId: args[0],
			UserId: userID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to remove reviewer: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": res.Msg.Success, "task_id": args[0], "user_id": userID})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Reviewer %s removed from task %s\n", userID, args[0])
		}
		return nil
	},
}

var tasksReviewersCmd = &cobra.Command{
	Use:   "reviewers [task_id]",
	Short: "List a task's reviewers",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewTaskServiceClient()
		res, err := client.ListTaskReviewers(context.Background(), connect.NewRequest(&healthv1.ListTaskReviewersRequest{
			TaskId: args[0],
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list reviewers: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Reviewers)
			cmd.Println(string(jsonString))
		} else {
			for _, r := range res.Msg.Reviewers {
				cmd.Printf("  - %s\n", r.UserId)
			}
		}
		return nil
	},
}

var tasksUpdateStatusCmd = &cobra.Command{
	Use:   "update-status [task_id]",
	Short: "Update a task's status",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		status, _ := cmd.Flags().GetString("status")
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewTaskServiceClient()

		req := connect.NewRequest(&healthv1.UpdateTaskStatusRequest{
			TaskId: args[0],
			Status: status,
		})

		res, err := client.UpdateTaskStatus(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("Failed to update task status: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Task)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task %s status updated to %s\n", res.Msg.Task.Id, res.Msg.Task.Status)
		}
		return nil
	},
}

var tasksDeleteCmd = &cobra.Command{
	Use:   "delete [task_id]",
	Short: "Move a task to the bin (soft delete; requires org admin)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewTaskServiceClient()

		req := connect.NewRequest(&healthv1.DeleteTaskRequest{
			TaskId: args[0],
		})

		_, err := client.DeleteTask(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("Failed to delete task: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "task_id": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task %s moved to bin\n", args[0])
		}
		return nil
	},
}

var tasksRestoreCmd = &cobra.Command{
	Use:   "restore [task_id]",
	Short: "Restore a task from the bin (requires org admin)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewTaskServiceClient()

		req := connect.NewRequest(&healthv1.RestoreTaskRequest{
			TaskId: args[0],
		})

		_, err := client.RestoreTask(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("Failed to restore task: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "task_id": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task %s restored\n", args[0])
		}
		return nil
	},
}

var tasksPurgeCmd = &cobra.Command{
	Use:   "purge [task_id]",
	Short: "Permanently delete an already-binned task and its dependent records (requires org admin)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewTaskServiceClient()

		req := connect.NewRequest(&healthv1.PurgeTaskRequest{
			TaskId: args[0],
		})

		_, err := client.PurgeTask(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("Failed to purge task: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "task_id": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Task %s permanently deleted\n", args[0])
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(tasksCmd)
	tasksCmd.AddCommand(tasksListCmd)
	tasksCmd.AddCommand(tasksCreateCmd)
	tasksCmd.AddCommand(tasksAssignCmd)
	tasksCmd.AddCommand(tasksReviewerAddCmd)
	tasksCmd.AddCommand(tasksReviewerRemoveCmd)
	tasksCmd.AddCommand(tasksReviewersCmd)
	tasksCmd.AddCommand(tasksUpdateStatusCmd)
	tasksCmd.AddCommand(tasksDeleteCmd)
	tasksCmd.AddCommand(tasksRestoreCmd)
	tasksCmd.AddCommand(tasksPurgeCmd)

	tasksCreateCmd.Flags().String("title", "", "The title of the task")
	tasksCreateCmd.Flags().String("status", "", "Initial status")
	tasksCreateCmd.Flags().String("description", "", "Task description")
	tasksCreateCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
	tasksCreateCmd.Flags().String("task-type", "", "Optional task type ID; enforces that type's status enum/transitions if configured")
	tasksAssignCmd.Flags().String("agent", "", "Agent ID to assign")
	tasksAssignCmd.Flags().String("user", "", "User ID to assign")
	tasksReviewerAddCmd.Flags().String("user", "", "User ID to add as reviewer")
	tasksReviewerRemoveCmd.Flags().String("user", "", "User ID to remove as reviewer")
	tasksUpdateStatusCmd.Flags().String("status", "", "The new status (todo, in-progress, done)")
	tasksListCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
	tasksListCmd.Flags().StringP("filter", "f", "", "Substring match against task title")
	tasksListCmd.Flags().StringP("sort", "s", "", "Sort as \"title\"/\"status\" or \"title:desc\" (works with --cursor for paging)")
	tasksListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	tasksListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
}
