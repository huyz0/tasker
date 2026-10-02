package cmd

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
	"google.golang.org/protobuf/proto"
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
		onlyDeleted, _ := cmd.Flags().GetBool("only-deleted")
		status, _ := cmd.Flags().GetString("status")
		assigneeFilter, _ := cmd.Flags().GetString("assignee-filter")
		priority, err := optionalPriority(cmd)
		if err != nil {
			return err
		}
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if projectID == "" {
			return fmt.Errorf("--project is required (or set TASKER_PROJECT_ID)")
		}

		client := backend.NewTaskServiceClient()

		req := connect.NewRequest(&healthv1.ListTasksRequest{
			ProjectId:      projectID,
			Page:           &healthv1.PageRequest{Limit: limit, Cursor: cursor, Filter: filter, Sort: sort},
			OnlyDeleted:    onlyDeleted,
			Status:         status,
			AssigneeFilter: assigneeFilter,
			Priority:       priority,
			Ready:          optionalBool(cmd, "ready"),
			LabelId:        optionalString(cmd, "label"),
			ParentTaskId:   optionalString(cmd, "parent"),
		})

		listReq := req
		if pageAllRequested(cmd) {
			return pageAll(cmd, listReq.Msg, func() (proto.Message, error) {
				r, err := client.ListTasks(context.Background(), listReq)
				if err != nil {
					return nil, err
				}
				return r.Msg, nil
			})
		}
		res, err := client.ListTasks(context.Background(), listReq)
		if err != nil {
			return fmt.Errorf("failed to list tasks: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Println("Tasks Workbench:")
			for _, task := range res.Msg.Tasks {
				cmd.Printf("- %s\n", taskLine(task))
			}
		}
		printNextPageHint(cmd, res.Msg)
		return nil
	},
}

var tasksGetCmd = &cobra.Command{
	Use:   "get [task_id]",
	Short: "Get a single task, including its description",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewTaskServiceClient()
		res, err := client.GetTask(context.Background(), connect.NewRequest(&healthv1.GetTaskRequest{
			TaskId: args[0],
		}))
		if err != nil {
			return fmt.Errorf("failed to get task: %w", err)
		}

		if isJson {
			// M22-T04: the whole response, not just Task - the wrapper is how
			// latestHandoffNote (present only when a handoff note exists) gets
			// out at all. A breaking shape change from the bare-task object this
			// printed before, made deliberately: inspecting a task is exactly
			// the moment prior handoff context should arrive with it.
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Println(taskLine(res.Msg.Task))
			if p := res.Msg.Task.GetParentTaskId(); p != "" {
				cmd.Printf("Parent: %s\n", p)
			}
			if res.Msg.Task.Description != "" {
				cmd.Printf("\n%s\n", res.Msg.Task.Description)
			}
			if res.Msg.LatestHandoffNote != nil {
				cmd.Printf("\nHandoff note (%s): %s\n", noteAuthor(res.Msg.LatestHandoffNote), res.Msg.LatestHandoffNote.Content)
			}
		}
		return nil
	},
}

var tasksUpdateCmd = &cobra.Command{
	Use:   "update [task_id]",
	Short: "Update a task's title, description, type, priority or parent",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		req := &healthv1.UpdateTaskRequest{TaskId: args[0]}
		// Fields are real proto3 `optional` (M14-T01's lesson: omitted must stay
		// distinct from explicitly cleared to "") - only set the pointer for a
		// flag the caller actually passed, so an unset --description leaves the
		// task's existing description untouched instead of blanking it.
		if cmd.Flags().Changed("title") {
			title, _ := cmd.Flags().GetString("title")
			req.Title = &title
		}
		if cmd.Flags().Changed("description") {
			description, _ := cmd.Flags().GetString("description")
			req.Description = &description
		}
		if cmd.Flags().Changed("task-type") {
			taskType, _ := cmd.Flags().GetString("task-type")
			req.TaskTypeId = &taskType
		}
		priority, err := optionalPriority(cmd)
		if err != nil {
			return err
		}
		req.Priority = priority
		req.ParentTaskId = optionalString(cmd, "parent")

		client := backend.NewTaskServiceClient()
		res, err := client.UpdateTask(context.Background(), connect.NewRequest(req))
		if err != nil {
			return fmt.Errorf("failed to update task: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Printf("Task %s updated\n", res.Msg.Task.Id)
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
		idempotencyKey, _ := cmd.Flags().GetString("idempotency-key")
		isJson, _ := cmd.Flags().GetBool("json")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if title == "" || projectID == "" {
			return fmt.Errorf("--project and --title flags are required")
		}
		priority, err := optionalPriority(cmd)
		if err != nil {
			return err
		}
		blockedBy, _ := cmd.Flags().GetStringSlice("blocked-by")

		client := backend.NewTaskServiceClient()
		res, err := client.CreateTask(context.Background(), connect.NewRequest(&healthv1.CreateTaskRequest{
			ProjectId:            projectID,
			Title:                title,
			Status:               status,
			Description:          description,
			TaskTypeId:           taskTypeID,
			IdempotencyKey:       idempotencyKey,
			Priority:             priority,
			ParentTaskId:         optionalString(cmd, "parent"),
			BlockedBy:            blockedBy,
			DiscoveredFromTaskId: optionalString(cmd, "discovered-from"),
		}))
		if err != nil {
			return fmt.Errorf("failed to create task: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Printf("Task created: %s [%s] (id: %s)\n", res.Msg.Task.Title, res.Msg.Task.DisplayId, res.Msg.Task.Id)
		}
		return nil
	},
}

// M19-T06: the M14-T06 headline agent-self-service feature - atomically
// claim an unassigned task for the calling principal - had no CLI surface
// at all despite the RPC existing since M14. An agent could only reach it
// by hand-rolling a raw ConnectRPC call.
var tasksClaimCmd = &cobra.Command{
	Use:   "claim [task_id]",
	Short: "Atomically claim an unassigned task for the calling principal (agent self-service)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		idempotencyKey, _ := cmd.Flags().GetString("idempotency-key")
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewTaskServiceClient()
		res, err := client.ClaimTask(context.Background(), connect.NewRequest(&healthv1.ClaimTaskRequest{
			TaskId:         args[0],
			IdempotencyKey: idempotencyKey,
		}))
		if err != nil {
			return fmt.Errorf("failed to claim task: %w", err)
		}

		if isJson {
			// M22-T04: same reasoning as `get`'s --json change above - the
			// whole response, so latestHandoffNote (present only when one
			// exists) is reachable at all.
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Printf("Task %s claimed\n", res.Msg.Task.Id)
			if res.Msg.LatestHandoffNote != nil {
				cmd.Printf("Handoff note (%s): %s\n", noteAuthor(res.Msg.LatestHandoffNote), res.Msg.LatestHandoffNote.Content)
			}
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
			return fmt.Errorf("one of --agent or --user is required")
		}

		client := backend.NewTaskServiceClient()
		req := &healthv1.AssignTaskRequest{TaskId: args[0]}
		// M19-T03: agent_id/user_id are now `optional string` on the wire -
		// only set the pointer for whichever one the caller actually passed,
		// rather than always sending both (one real, one the empty string).
		if agentID != "" {
			req.AgentId = &agentID
		}
		if userID != "" {
			req.UserId = &userID
		}
		res, err := client.AssignTask(context.Background(), connect.NewRequest(req))
		if err != nil {
			return fmt.Errorf("failed to assign task: %w", err)
		}

		if isJson {
			if err := printJSONValue(cmd, map[string]any{"success": res.Msg.Success, "taskId": args[0]}); err != nil {
				return err
			}
		} else {
			cmd.Printf("Task %s assigned\n", args[0])
		}
		return nil
	},
}

var tasksUnassignCmd = &cobra.Command{
	Use:   "unassign [task_id]",
	Short: "Remove an agent or user's assignment from a task",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		agentID, _ := cmd.Flags().GetString("agent")
		userID, _ := cmd.Flags().GetString("user")
		isJson, _ := cmd.Flags().GetBool("json")
		if agentID == "" && userID == "" {
			return fmt.Errorf("one of --agent or --user is required")
		}

		client := backend.NewTaskServiceClient()
		res, err := client.UnassignTask(context.Background(), connect.NewRequest(&healthv1.UnassignTaskRequest{
			TaskId:  args[0],
			AgentId: agentID,
			UserId:  userID,
		}))
		if err != nil {
			return fmt.Errorf("failed to unassign task: %w", err)
		}

		if isJson {
			if err := printJSONValue(cmd, map[string]any{"success": res.Msg.Success, "taskId": args[0]}); err != nil {
				return err
			}
		} else {
			cmd.Printf("Task %s unassigned\n", args[0])
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
			return fmt.Errorf("--user is required")
		}

		client := backend.NewTaskServiceClient()
		res, err := client.AddTaskReviewer(context.Background(), connect.NewRequest(&healthv1.AddTaskReviewerRequest{
			TaskId: args[0],
			UserId: userID,
		}))
		if err != nil {
			return fmt.Errorf("failed to add reviewer: %w", err)
		}

		if isJson {
			if err := printJSONValue(cmd, map[string]any{"success": res.Msg.Success, "taskId": args[0], "userId": userID}); err != nil {
				return err
			}
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
			return fmt.Errorf("--user is required")
		}

		client := backend.NewTaskServiceClient()
		res, err := client.RemoveTaskReviewer(context.Background(), connect.NewRequest(&healthv1.RemoveTaskReviewerRequest{
			TaskId: args[0],
			UserId: userID,
		}))
		if err != nil {
			return fmt.Errorf("failed to remove reviewer: %w", err)
		}

		if isJson {
			if err := printJSONValue(cmd, map[string]any{"success": res.Msg.Success, "taskId": args[0], "userId": userID}); err != nil {
				return err
			}
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
			return fmt.Errorf("failed to list reviewers: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
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
			return fmt.Errorf("failed to update task status: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
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
			return fmt.Errorf("failed to delete task: %w", err)
		}

		if isJson {
			if err := printJSONValue(cmd, map[string]any{"success": true, "taskId": args[0]}); err != nil {
				return err
			}
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
			return fmt.Errorf("failed to restore task: %w", err)
		}

		if isJson {
			if err := printJSONValue(cmd, map[string]any{"success": true, "taskId": args[0]}); err != nil {
				return err
			}
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
			return fmt.Errorf("failed to purge task: %w", err)
		}

		if isJson {
			if err := printJSONValue(cmd, map[string]any{"success": true, "taskId": args[0]}); err != nil {
				return err
			}
		} else {
			cmd.Printf("Task %s permanently deleted\n", args[0])
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(tasksCmd)
	tasksCmd.AddCommand(tasksListCmd)
	tasksCmd.AddCommand(tasksGetCmd)
	tasksCmd.AddCommand(tasksCreateCmd)
	tasksCmd.AddCommand(tasksUpdateCmd)
	tasksCmd.AddCommand(tasksClaimCmd)
	tasksCmd.AddCommand(tasksAssignCmd)
	tasksCmd.AddCommand(tasksUnassignCmd)
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
	tasksCreateCmd.Flags().String("idempotency-key", "", "Optional key: replaying the same key from the same principal returns the original task instead of creating a second one")
	tasksCreateCmd.Flags().String("priority", "", "urgent, high, medium, low or none (default none)")
	tasksCreateCmd.Flags().String("parent", "", "Parent task ID in the same project")
	tasksCreateCmd.Flags().StringSlice("blocked-by", nil, "Task IDs that must finish first (repeat or comma-separate)")
	tasksCreateCmd.Flags().String("discovered-from", "", "The task whose work turned this one up")
	tasksClaimCmd.Flags().String("idempotency-key", "", "Optional key: replaying the same key from the same principal returns the original claim instead of erroring on an already-claimed task")
	tasksAssignCmd.Flags().String("agent", "", "Agent ID to assign")
	tasksAssignCmd.Flags().String("user", "", "User ID to assign")
	tasksUnassignCmd.Flags().String("agent", "", "Agent ID to unassign")
	tasksUnassignCmd.Flags().String("user", "", "User ID to unassign")
	tasksUpdateCmd.Flags().String("title", "", "New title")
	tasksUpdateCmd.Flags().String("description", "", "New description (pass an empty string to clear it)")
	tasksUpdateCmd.Flags().String("task-type", "", "New task type ID")
	tasksUpdateCmd.Flags().String("priority", "", "urgent, high, medium, low or none")
	tasksUpdateCmd.Flags().String("parent", "", "New parent task ID (pass an empty string to clear it)")
	tasksReviewerAddCmd.Flags().String("user", "", "User ID to add as reviewer")
	tasksReviewerRemoveCmd.Flags().String("user", "", "User ID to remove as reviewer")
	tasksUpdateStatusCmd.Flags().String("status", "", "The new status (todo, in-progress, done)")
	tasksListCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
	tasksListCmd.Flags().StringP("filter", "f", "", "Substring match against task title")
	tasksListCmd.Flags().StringP("sort", "s", "", "Sort as \"title\"/\"status\"/\"priority\" or \"title:desc\" (works with --cursor for paging); \"priority\" is urgent first")
	tasksListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	tasksListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	tasksListCmd.Flags().Bool("page-all", false, "Fetch every page, printing one JSON object per item per line (NDJSON)")
	tasksListCmd.Flags().Bool("only-deleted", false, "List only binned (soft-deleted) tasks, instead of active ones")
	tasksListCmd.Flags().String("status", "", "Filter to one status column (e.g. todo, in-progress, done, or a custom task-type status)")
	tasksListCmd.Flags().String("assignee-filter", "", "\"unassigned\" for claimable work, or \"me\" to resolve to the calling principal")
	tasksListCmd.Flags().Bool("ready", false, "Only ready work: open, unassigned, nothing unfinished blocking it")
	tasksListCmd.Flags().String("priority", "", "Only tasks of this priority (urgent, high, medium, low, none)")
	tasksListCmd.Flags().String("label", "", "Only tasks carrying this label ID")
	tasksListCmd.Flags().String("parent", "", "Only subtasks of this task ID")
}
