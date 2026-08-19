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
		noteType, _ := cmd.Flags().GetString("type")
		isJson, _ := cmd.Flags().GetBool("json")
		if content == "" {
			cmd.Println("Error: --content is required.")
			return fmt.Errorf("--content is required")
		}

		client := backend.NewTaskNoteServiceClient()
		res, err := client.CreateTaskNote(context.Background(), connect.NewRequest(&healthv1.CreateTaskNoteRequest{
			TaskId:   args[0],
			Content:  content,
			NoteType: noteType,
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
				// M22-T04 (ADR-0017): tagged so a handoff note stands out in a
				// chronological list dominated by plain comments.
				if n.NoteType == "handoff" {
					cmd.Printf(" - [agent %s] [handoff] %s\n", n.AgentId, n.Content)
				} else {
					cmd.Printf(" - [agent %s] %s\n", n.AgentId, n.Content)
				}
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

// M22-T06 (ADR-0017): one row per task - the latest handoff note only,
// project-scoped - the CLI counterpart to the GUI's top-level Handoffs
// screen (M22-T05) and the primary command a cloud agent's own tooling
// would reach for: "what's currently mid-handoff in this project".
var tasksHandoffsCmd = &cobra.Command{
	Use:   "handoffs",
	Short: "List tasks with a pending handoff note (one row per task, the latest only)",
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		projectID, _ := cmd.Flags().GetString("project")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if projectID == "" {
			cmd.Println("Error: --project is required (or set TASKER_PROJECT_ID).")
			return fmt.Errorf("--project is required (or set TASKER_PROJECT_ID)")
		}

		client := backend.NewTaskNoteServiceClient()
		res, err := client.ListHandoffNotes(context.Background(), connect.NewRequest(&healthv1.ListHandoffNotesRequest{
			ProjectId: projectID,
			Page:      &healthv1.PageRequest{Limit: limit, Cursor: cursor},
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list handoffs: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Entries)
			cmd.Println(string(jsonString))
		} else {
			if len(res.Msg.Entries) == 0 {
				cmd.Println("No tasks currently have a pending handoff note.")
			}
			for _, e := range res.Msg.Entries {
				cmd.Printf("- %s [%s] (task %s): %s\n", e.TaskTitle, e.TaskStatus, e.Note.TaskId, e.Note.Content)
			}
			if res.Msg.Page != nil && res.Msg.Page.NextCursor != "" {
				cmd.Printf("(more available - pass --cursor %s)\n", res.Msg.Page.NextCursor)
			}
		}
		return nil
	},
}

func init() {
	tasksCmd.AddCommand(tasksNoteAddCmd)
	tasksCmd.AddCommand(tasksNotesCmd)
	tasksCmd.AddCommand(tasksNoteUpdateCmd)
	tasksCmd.AddCommand(tasksNoteDeleteCmd)
	tasksCmd.AddCommand(tasksHandoffsCmd)

	tasksNoteAddCmd.Flags().String("content", "", "Note text")
	tasksNoteAddCmd.Flags().String("type", "", "Note type: comment (default) or handoff")
	// --agent is gone (M04-T06): a task note is authored by the authenticated
	// agent, not by whoever the caller names. Authenticate with an agent token
	// (M04-T09 adds --token / TASKER_TOKEN).
	tasksNoteUpdateCmd.Flags().String("content", "", "New note text")

	tasksHandoffsCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
	tasksHandoffsCmd.Flags().Int32("limit", 0, "Max rows to return")
	tasksHandoffsCmd.Flags().String("cursor", "", "Page cursor from a previous response")
}
