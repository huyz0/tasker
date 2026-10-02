package cmd

import (
	"context"
	"errors"
	"fmt"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
	"google.golang.org/protobuf/proto"
)

var taskTypesCmd = &cobra.Command{
	Use:   "task-types",
	Short: "Manage task types and their status enum / transition state machine",
}

var taskTypesCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a task type for an organization (optionally scoped to a project)",
	RunE: func(cmd *cobra.Command, args []string) error {
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
			return errors.New("--org and --name are required")
		}

		client := backend.NewTaskTypeServiceClient()
		res, err := client.CreateTaskType(context.Background(), connect.NewRequest(&healthv1.CreateTaskTypeRequest{
			OrgId:     orgID,
			ProjectId: projectID,
			Name:      name,
			ParentId:  parentID,
		}))
		if err != nil {
			return fmt.Errorf("failed to create task type: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Printf("Task type created: %s (id: %s)\n", res.Msg.TaskType.Name, res.Msg.TaskType.Id)
		}
		return nil
	},
}

var taskTypesListCmd = &cobra.Command{
	Use:   "list",
	Short: "List task types for an organization",
	RunE: func(cmd *cobra.Command, args []string) error {
		orgID, _ := cmd.Flags().GetString("org")
		filter, _ := cmd.Flags().GetString("filter")
		sort, _ := cmd.Flags().GetString("sort")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		isJson, _ := cmd.Flags().GetBool("json")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if orgID == "" {
			return errors.New("--org is required (or set TASKER_ORG_ID)")
		}

		client := backend.NewTaskTypeServiceClient()
		listReq := connect.NewRequest(&healthv1.ListTaskTypesRequest{
			OrgId: orgID,
			Page:  &healthv1.PageRequest{Limit: limit, Cursor: cursor, Filter: filter, Sort: sort},
		})
		if pageAllRequested(cmd) {
			return pageAll(cmd, listReq.Msg, func() (proto.Message, error) {
				r, err := client.ListTaskTypes(context.Background(), listReq)
				if err != nil {
					return nil, err
				}
				return r.Msg, nil
			})
		}
		res, err := client.ListTaskTypes(context.Background(), listReq)
		if err != nil {
			return fmt.Errorf("failed to list task types: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			for _, t := range res.Msg.TaskTypes {
				cmd.Printf("  - %s (id: %s)\n", t.Name, t.Id)
			}
		}
		printNextPageHint(cmd, res.Msg)
		return nil
	},
}

var taskTypesGetCmd = &cobra.Command{
	Use:   "get [task_type_id]",
	Short: "Show a task type along with its configured statuses and transitions",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewTaskTypeServiceClient()
		res, err := client.GetTaskType(context.Background(), connect.NewRequest(&healthv1.GetTaskTypeRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to get task type: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
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
				gate := ""
				if t.RequiresApproval {
					gate = " (agents need approval)"
				}
				cmd.Printf("  - %s -> %s (id: %s)%s\n", t.FromStatusId, t.ToStatusId, t.Id, gate)
			}
		}
		return nil
	},
}

var taskTypesCreateStatusCmd = &cobra.Command{
	Use:   "create-status [task_type_id]",
	Short: "Add a status to a task type's enum",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		isJson, _ := cmd.Flags().GetBool("json")
		if name == "" {
			return errors.New("--name is required")
		}

		client := backend.NewTaskTypeServiceClient()
		res, err := client.CreateTaskStatus(context.Background(), connect.NewRequest(&healthv1.CreateTaskStatusRequest{
			TaskTypeId: args[0],
			Name:       name,
		}))
		if err != nil {
			return fmt.Errorf("failed to create task status: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Printf("Status created: %s (id: %s)\n", res.Msg.Status.Name, res.Msg.Status.Id)
		}
		return nil
	},
}

var taskTypesCreateTransitionCmd = &cobra.Command{
	Use:   "create-transition [task_type_id]",
	Short: "Allow a status transition (edge) in a task type's state machine",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		fromStatusID, _ := cmd.Flags().GetString("from")
		toStatusID, _ := cmd.Flags().GetString("to")
		isJson, _ := cmd.Flags().GetBool("json")
		if fromStatusID == "" || toStatusID == "" {
			return errors.New("--from and --to status IDs are required")
		}

		client := backend.NewTaskTypeServiceClient()
		res, err := client.CreateTaskStatusTransition(context.Background(), connect.NewRequest(&healthv1.CreateTaskStatusTransitionRequest{
			TaskTypeId:   args[0],
			FromStatusId: fromStatusID,
			ToStatusId:   toStatusID,
		}))
		if err != nil {
			return fmt.Errorf("failed to create status transition: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else {
			cmd.Printf("Transition allowed: %s -> %s\n", res.Msg.Transition.FromStatusId, res.Msg.Transition.ToStatusId)
		}
		return nil
	},
}

var taskTypesGateTransitionCmd = &cobra.Command{
	Use:   "gate-transition [task_type_id] [transition_id]",
	Short: "Require a person's approval when an agent makes this move (--off to lift it)",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		off, _ := cmd.Flags().GetBool("off")
		res, err := backend.NewTaskTypeServiceClient().SetTransitionApproval(context.Background(), connect.NewRequest(&healthv1.SetTransitionApprovalRequest{
			TaskTypeId: args[0], TransitionId: args[1], RequiresApproval: !off,
		}))
		if err != nil {
			return fmt.Errorf("failed to set the approval gate: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		t := res.Msg.Transition
		if t.RequiresApproval {
			cmd.Printf("Transition %s -> %s now needs a person's approval when an agent makes it\n", t.FromStatusId, t.ToStatusId)
		} else {
			cmd.Printf("Transition %s -> %s no longer needs approval\n", t.FromStatusId, t.ToStatusId)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(taskTypesCmd)
	taskTypesCmd.AddCommand(taskTypesGateTransitionCmd)
	taskTypesGateTransitionCmd.Flags().Bool("off", false, "Lift the gate instead of setting it")
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
	taskTypesListCmd.Flags().StringP("sort", "s", "", "Sort as \"name\" or \"name:desc\" (works with --cursor for paging)")
	taskTypesListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	taskTypesListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	taskTypesListCmd.Flags().Bool("page-all", false, "Fetch every page, printing one JSON object per item per line (NDJSON)")

	taskTypesCreateStatusCmd.Flags().String("name", "", "Status name (e.g. open, in_review, closed)")

	taskTypesCreateTransitionCmd.Flags().String("from", "", "Status ID this transition starts from")
	taskTypesCreateTransitionCmd.Flags().String("to", "", "Status ID this transition ends at")
}
