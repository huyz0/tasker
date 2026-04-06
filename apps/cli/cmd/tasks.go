package cmd

import (
	"encoding/json"
	"fmt"
	"github.com/spf13/cobra"
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
		if isJson {
			data := []map[string]interface{}{
				{"id": "task_1", "status": "todo", "title": "Implement auth"},
				{"id": "task_2", "status": "in_progress", "title": "Setup metrics"},
			}
			jsonString, _ := json.Marshal(data)
			fmt.Println(string(jsonString))
		} else {
			fmt.Println("Tasks Workbench:")
			fmt.Println("- task_1 [TODO]: Implement auth")
			fmt.Println("- task_2 [IN PROGRESS]: Setup metrics")
		}
	},
}

var tasksCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new task",
	Run: func(cmd *cobra.Command, args []string) {
		title, _ := cmd.Flags().GetString("title")
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			fmt.Printf(`{"status": "created", "task": "%s"}%s`, title, "\n")
		} else {
			fmt.Printf("Task created: %s\n", title)
		}
	},
}

var tasksAssignCmd = &cobra.Command{
	Use:   "assign [task_id]",
	Short: "Assign a task to an agent or user",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		assignee, _ := cmd.Flags().GetString("assignee")
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			fmt.Printf(`{"status": "assigned", "task_id": "%s", "assignee": "%s"}%s`, args[0], assignee, "\n")
		} else {
			fmt.Printf("Task %s assigned to %s\n", args[0], assignee)
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
