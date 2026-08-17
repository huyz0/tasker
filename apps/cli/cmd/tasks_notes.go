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
	Short: "Add an AI agent note to a task (requires an agent token)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		content, _ := cmd.Flags().GetString("content")
		isJson, _ := cmd.Flags().GetBool("json")
		if content == "" {
			cmd.Println("Error: --content is required.")
			return fmt.Errorf("--content is required")
		}

		client := backend.NewTaskNoteServiceClient()
		res, err := client.CreateTaskNote(context.Background(), connect.NewRequest(&healthv1.CreateTaskNoteRequest{
			TaskId:  args[0],
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

// M19-T08: updateTaskNote/deleteTaskNote have existed on the wire since M04,
// author-gated since M19-T01, but were never reachable from the CLI - only
// note-add/notes were wired. Sequenced after M19-T01 deliberately: the
// author-only check had to exist before the CLI could reach the RPC at all.
var tasksNoteUpdateCmd = &cobra.Command{
	Use:   "note-update [note_id]",
	Short: "Update an agent note's content (author only, requires an agent token)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		content, _ := cmd.Flags().GetString("content")
		isJson, _ := cmd.Flags().GetBool("json")
		if content == "" {
			cmd.Println("Error: --content is required.")
			return fmt.Errorf("--content is required")
		}

		client := backend.NewTaskNoteServiceClient()
		res, err := client.UpdateTaskNote(context.Background(), connect.NewRequest(&healthv1.UpdateTaskNoteRequest{
			TaskNoteId: args[0],
			Content:    content,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to update note: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.TaskNote)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Note %s updated\n", res.Msg.TaskNote.Id)
		}
		return nil
	},
}

var tasksNoteDeleteCmd = &cobra.Command{
	Use:   "note-delete [note_id]",
	Short: "Delete an agent note (author only, requires an agent token)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewTaskNoteServiceClient()
		_, err := client.DeleteTaskNote(context.Background(), connect.NewRequest(&healthv1.DeleteTaskNoteRequest{
			TaskNoteId: args[0],
		}))
		if err != nil {
			cmd.PrintErrf("Failed to delete note: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "task_note_id": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Note %s deleted\n", args[0])
		}
		return nil
	},
}

func init() {
	tasksCmd.AddCommand(tasksNoteAddCmd)
	tasksCmd.AddCommand(tasksNotesCmd)
	tasksCmd.AddCommand(tasksNoteUpdateCmd)
	tasksCmd.AddCommand(tasksNoteDeleteCmd)

	tasksNoteAddCmd.Flags().String("content", "", "Note text")
	// --agent is gone (M04-T06): a task note is authored by the authenticated
	// agent, not by whoever the caller names. Authenticate with an agent token
	// (M04-T09 adds --token / TASKER_TOKEN).
	tasksNoteUpdateCmd.Flags().String("content", "", "New note text")
}
