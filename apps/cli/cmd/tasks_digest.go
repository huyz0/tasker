package cmd

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
)

// M41 (ADR-0034): what a task came to, and one bounded read of its context.

func printSummary(cmd *cobra.Command, s *healthv1.TaskSummary) {
	cmd.Printf("Summary (by %s, %s):\n", s.AuthorName, s.UpdatedAt)
	for _, line := range strings.Split(s.Text, "\n") {
		cmd.Printf("  %s\n", line)
	}
}

var tasksSummaryCmd = &cobra.Command{
	Use:   "summary",
	Short: "A task's durable summary - what it came to",
}

var tasksSummarySetCmd = &cobra.Command{
	Use:   "set [task_id]",
	Short: "Write a task's summary (at most 4,000 characters; replaces the last one)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		text, _ := cmd.Flags().GetString("text")
		file, _ := cmd.Flags().GetString("file")
		if file != "" {
			if cmd.Flags().Changed("text") {
				return invalidArgf("give --text or --file, not both")
			}
			var raw []byte
			var err error
			if file == "-" {
				raw, err = io.ReadAll(cmd.InOrStdin())
			} else {
				raw, err = os.ReadFile(file)
			}
			if err != nil {
				return invalidArgf("cannot read %s: %v", file, err)
			}
			text = string(raw)
		}
		if strings.TrimSpace(text) == "" {
			return invalidArgf("the summary is empty - use --text or --file, or `tasks summary clear` to remove it")
		}
		return setSummary(cmd, args[0], text)
	},
}

var tasksSummaryClearCmd = &cobra.Command{
	Use:   "clear [task_id]",
	Short: "Remove a task's summary",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return setSummary(cmd, args[0], "")
	},
}

func setSummary(cmd *cobra.Command, taskID, text string) error {
	res, err := backend.NewTaskServiceClient().SetTaskSummary(context.Background(), connect.NewRequest(&healthv1.SetTaskSummaryRequest{TaskId: taskID, Text: text}))
	if err != nil {
		return fmt.Errorf("failed to set the summary: %w", err)
	}
	if wantsJSON(cmd) {
		return printJSON(cmd, res.Msg)
	}
	if res.Msg.Summary == nil {
		cmd.Printf("Summary cleared for %s\n", taskID)
		return nil
	}
	printSummary(cmd, res.Msg.Summary)
	return nil
}

var tasksDigestCmd = &cobra.Command{
	Use:   "digest [task_id]",
	Short: "One bounded read of a task: summary, plan, usage, latest handoff, answered questions, relations",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewTaskServiceClient().GetTaskDigest(context.Background(), connect.NewRequest(&healthv1.GetTaskDigestRequest{TaskId: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to get the digest: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		d := res.Msg.Digest
		t := d.Task
		cmd.Println(taskLine(t))
		if d.FinishedAt != nil {
			cmd.Printf("Finished: %s\n", d.GetFinishedAt())
		}
		if t.Summary != nil {
			printSummary(cmd, t.Summary)
		} else {
			cmd.Println("Summary: none yet - `tasker tasks summary set` once it is done")
		}
		if u := t.Usage; u != nil && u.Reports > 0 {
			cmd.Printf("Usage: %s\n", usageSummary(u))
		}
		if len(t.Plan) > 0 {
			printPlan(cmd, t.Plan)
		}
		if n := d.LatestHandoffNote; n != nil {
			cmd.Printf("Latest handoff (%s):\n  %s\n", n.CreatedAt, strings.ReplaceAll(n.Content, "\n", "\n  "))
		}
		if len(d.AnsweredQuestions) > 0 {
			cmd.Println("Answered questions:")
			for _, q := range d.AnsweredQuestions {
				cmd.Printf("  - %s -> %s\n", q.Question, q.GetAnswer())
			}
		}
		if n := t.OpenInputRequestCount; n > 0 {
			cmd.Printf("Open questions: %d\n", n)
		}
		printRelations(cmd, d.Relations)
		if d.Truncated {
			cmd.PrintErrln("(Some lists were cut at their cap - use `tasks questions --task` or `tasks link list` for all of them.)")
		}
		return nil
	},
}

var tasksCompactionCandidatesCmd = &cobra.Command{
	Use:   "compaction-candidates",
	Short: "A project's finished tasks with no summary, oldest first",
	RunE: func(cmd *cobra.Command, args []string) error {
		project, _ := cmd.Flags().GetString("project")
		if project == "" {
			project = backend.DefaultProjectID()
		}
		if project == "" {
			return invalidArgf("--project is required (or set TASKER_PROJECT_ID)")
		}
		days, _ := cmd.Flags().GetInt32("older-than-days")
		limit, _ := cmd.Flags().GetInt32("limit")
		res, err := backend.NewTaskServiceClient().ListCompactionCandidates(context.Background(), connect.NewRequest(&healthv1.ListCompactionCandidatesRequest{
			ProjectId: project, OlderThanDays: &days, Limit: &limit,
		}))
		if err != nil {
			return fmt.Errorf("failed to list candidates: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if len(res.Msg.Candidates) == 0 {
			cmd.PrintErrln("Nothing to summarize.")
			return nil
		}
		for _, c := range res.Msg.Candidates {
			cmd.Printf("- %s [%s]: %s - finished %s (id: %s)\n", c.DisplayId, c.Status, c.Title, c.FinishedAt, c.TaskId)
		}
		if int(res.Msg.TotalCount) > len(res.Msg.Candidates) {
			cmd.PrintErrf("%d of %d shown; summarizing one takes it off the list.\n", len(res.Msg.Candidates), res.Msg.TotalCount)
		}
		return nil
	},
}

func init() {
	tasksCmd.AddCommand(tasksSummaryCmd, tasksDigestCmd, tasksCompactionCandidatesCmd)
	tasksSummaryCmd.AddCommand(tasksSummarySetCmd, tasksSummaryClearCmd)
	tasksSummarySetCmd.Flags().String("text", "", "The summary text")
	tasksSummarySetCmd.Flags().String("file", "", "Read the summary from a file, or - for stdin")
	tasksCompactionCandidatesCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
	tasksCompactionCandidatesCmd.Flags().Int32("older-than-days", 30, "Finished at least this many days ago, 0-3650")
	tasksCompactionCandidatesCmd.Flags().Int32P("limit", "l", 50, "Maximum number of tasks to return, 1-100")
}
