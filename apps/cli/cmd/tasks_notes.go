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

var tasksNoteAddCmd = &cobra.Command{
	Use:   "note-add [task_id]",
	Short: "Add an AI agent note to a task",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		content, _ := cmd.Flags().GetString("content")
		agentID, _ := cmd.Flags().GetString("agent")
		isJson, _ := cmd.Flags().GetBool("json")
		if content == "" || agentID == "" {
			cmd.Println("Error: --agent and --content are required.")
			return fmt.Errorf("--agent and --content are required")
		}

		client := backend.NewTaskNoteServiceClient()
		res, err := client.CreateTaskNote(context.Background(), connect.NewRequest(&healthv1.CreateTaskNoteRequest{
			TaskId:  args[0],
			AgentId: agentID,
			Content: content,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to add note: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.TaskNote)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Note added to task %s (id: %s)\n", args[0], res.Msg.TaskNote.Id)
		}
		return nil
	},
}

var tasksNotesCmd = &cobra.Command{
	Use:   "notes [task_id]",
	Short: "List AI agent notes on a task",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewTaskNoteServiceClient()
		res, err := client.ListTaskNotes(context.Background(), connect.NewRequest(&healthv1.ListTaskNotesRequest{
			TaskId: args[0],
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list notes: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.TaskNotes)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Notes on task %s:\n", args[0])
			for _, n := range res.Msg.TaskNotes {
				cmd.Printf(" - [agent %s] %s\n", n.AgentId, n.Content)
			}
		}
		return nil
	},
}

func init() {
	tasksCmd.AddCommand(tasksNoteAddCmd)
	tasksCmd.AddCommand(tasksNotesCmd)

	tasksNoteAddCmd.Flags().String("content", "", "Note text")
	tasksNoteAddCmd.Flags().String("agent", "", "Agent ID authoring the note")
}
