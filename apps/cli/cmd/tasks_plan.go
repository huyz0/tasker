package cmd

import (
	"context"
	"fmt"
	"strings"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"
	"google.golang.org/protobuf/proto"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
)

// M38 (ADR-0031): the working agent's plan, and questions for a person.

var planStatuses = []string{"pending", "in_progress", "done", "skipped"}

// parseStep reads "[status:]title" - status defaults to pending.
func parseStep(raw string) (*healthv1.PlanStep, error) {
	status, title := "pending", strings.TrimSpace(raw)
	if i := strings.Index(raw, ":"); i > 0 {
		candidate := strings.TrimSpace(raw[:i])
		for _, s := range planStatuses {
			if candidate == s {
				status, title = s, strings.TrimSpace(raw[i+1:])
			}
		}
	}
	if title == "" {
		return nil, invalidArgf("empty step %q - use \"[status:]title\", status one of %s", raw, strings.Join(planStatuses, ", "))
	}
	return &healthv1.PlanStep{Title: title, Status: status}, nil
}

var planMarks = map[string]string{"done": "[x]", "in_progress": "[>]", "skipped": "[-]", "pending": "[ ]"}

func printPlan(cmd *cobra.Command, steps []*healthv1.PlanStep) {
	done := 0
	for _, s := range steps {
		if s.Status == "done" {
			done++
		}
	}
	cmd.Printf("Plan (%d/%d done):\n", done, len(steps))
	for _, s := range steps {
		mark := planMarks[s.Status]
		if mark == "" {
			mark = "[?]"
		}
		cmd.Printf("  %s %s\n", mark, s.Title)
	}
}

var tasksPlanCmd = &cobra.Command{
	Use:   "plan",
	Short: "Show or replace the working agent's plan for a task",
}

var tasksPlanSetCmd = &cobra.Command{
	Use:   "set [task_id]",
	Short: "Replace a task's plan with the given steps (no steps clears it)",
	Long: "Each --step is \"[status:]title\", status one of pending (the default), in_progress, done\n" +
		"or skipped. The whole plan is replaced: send every step, every time.",
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		raw, _ := cmd.Flags().GetStringArray("step")
		steps := make([]*healthv1.PlanStep, 0, len(raw))
		for _, r := range raw {
			s, err := parseStep(r)
			if err != nil {
				return err
			}
			steps = append(steps, s)
		}
		res, err := backend.NewTaskServiceClient().SetTaskPlan(context.Background(), connect.NewRequest(&healthv1.SetTaskPlanRequest{TaskId: args[0], Steps: steps}))
		if err != nil {
			return fmt.Errorf("failed to set the plan: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if len(res.Msg.Plan) == 0 {
			cmd.Println("Plan cleared")
			return nil
		}
		printPlan(cmd, res.Msg.Plan)
		return nil
	},
}

var tasksPlanShowCmd = &cobra.Command{
	Use:   "show [task_id]",
	Short: "Show a task's plan",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewTaskServiceClient().GetTask(context.Background(), connect.NewRequest(&healthv1.GetTaskRequest{TaskId: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to get task: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, &healthv1.SetTaskPlanResponse{Plan: res.Msg.Task.Plan})
		}
		if len(res.Msg.Task.Plan) == 0 {
			cmd.PrintErrln("No plan.")
			return nil
		}
		printPlan(cmd, res.Msg.Task.Plan)
		return nil
	},
}

func questionLine(r *healthv1.InputRequest) string {
	line := fmt.Sprintf("%s [%s] %s asks on %s: %s", r.Id, r.Status, r.AskedByName, r.TaskDisplayId, r.Question)
	if len(r.Options) > 0 {
		line += " (options: " + strings.Join(r.Options, " / ") + ")"
	}
	if r.Answer != nil {
		line += fmt.Sprintf(" -> %q by %s", r.GetAnswer(), r.GetAnsweredByName())
	}
	return line
}

func printQuestion(cmd *cobra.Command, msg proto.Message, r *healthv1.InputRequest) error {
	if wantsJSON(cmd) {
		return printJSON(cmd, msg)
	}
	cmd.Println(questionLine(r))
	return nil
}

var tasksAskCmd = &cobra.Command{
	Use:   "ask [task_id]",
	Short: "Ask a person a question on a task; its reviewers (or org admins) are notified",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		question, _ := cmd.Flags().GetString("question")
		options, _ := cmd.Flags().GetStringArray("option")
		if strings.TrimSpace(question) == "" {
			return invalidArgf("--question is required")
		}
		res, err := backend.NewTaskServiceClient().RequestInput(context.Background(), connect.NewRequest(&healthv1.RequestInputRequest{TaskId: args[0], Question: question, Options: options}))
		if err != nil {
			return fmt.Errorf("failed to ask: %w", err)
		}
		return printQuestion(cmd, res.Msg, res.Msg.InputRequest)
	},
}

var tasksAnswerCmd = &cobra.Command{
	Use:   "answer [question_id]",
	Short: "Answer a question an agent asked (people only)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		answer, _ := cmd.Flags().GetString("answer")
		if strings.TrimSpace(answer) == "" {
			return invalidArgf("--answer is required")
		}
		res, err := backend.NewTaskServiceClient().AnswerInputRequest(context.Background(), connect.NewRequest(&healthv1.AnswerInputRequestRequest{Id: args[0], Answer: answer}))
		if err != nil {
			return fmt.Errorf("failed to answer: %w", err)
		}
		return printQuestion(cmd, res.Msg, res.Msg.InputRequest)
	},
}

var tasksQuestionCmd = &cobra.Command{
	Use:   "question [question_id]",
	Short: "Show one question and, once given, its answer",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewTaskServiceClient().GetInputRequest(context.Background(), connect.NewRequest(&healthv1.GetInputRequestRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to get the question: %w", err)
		}
		return printQuestion(cmd, res.Msg, res.Msg.InputRequest)
	},
}

var tasksCancelQuestionCmd = &cobra.Command{
	Use:   "cancel-question [question_id]",
	Short: "Withdraw a question you asked (or, as an admin, close any)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewTaskServiceClient().CancelInputRequest(context.Background(), connect.NewRequest(&healthv1.CancelInputRequestRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to cancel the question: %w", err)
		}
		return printQuestion(cmd, res.Msg, res.Msg.InputRequest)
	},
}

var tasksQuestionsCmd = &cobra.Command{
	Use:   "questions",
	Short: "Questions waiting on people - the organization's queue, or one task's",
	RunE: func(cmd *cobra.Command, args []string) error {
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		org := optionalString(cmd, "org")
		if org == nil && optionalString(cmd, "task") == nil {
			if d := backend.DefaultOrgID(); d != "" {
				org = &d
			}
		}
		client := backend.NewTaskServiceClient()
		req := connect.NewRequest(&healthv1.ListInputRequestsRequest{
			OrgId: org, TaskId: optionalString(cmd, "task"), Status: optionalString(cmd, "status"),
			Page: &healthv1.PageRequest{Limit: limit, Cursor: cursor},
		})
		if pageAllRequested(cmd) {
			return pageAll(cmd, req.Msg, func() (proto.Message, error) {
				r, err := client.ListInputRequests(context.Background(), req)
				if err != nil {
					return nil, err
				}
				return r.Msg, nil
			})
		}
		res, err := client.ListInputRequests(context.Background(), req)
		if err != nil {
			return fmt.Errorf("failed to list questions: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if len(res.Msg.InputRequests) == 0 {
			cmd.PrintErrln("No questions.")
		}
		for _, r := range res.Msg.InputRequests {
			cmd.Printf("- %s\n", questionLine(r))
		}
		printNextPageHint(cmd, res.Msg)
		return nil
	},
}

func init() {
	tasksCmd.AddCommand(tasksPlanCmd, tasksAskCmd, tasksAnswerCmd, tasksQuestionCmd, tasksCancelQuestionCmd, tasksQuestionsCmd)
	tasksPlanCmd.AddCommand(tasksPlanSetCmd, tasksPlanShowCmd)
	tasksPlanSetCmd.Flags().StringArray("step", nil, "A step as \"[status:]title\"; repeat in order")
	tasksAskCmd.Flags().String("question", "", "What you need decided")
	tasksAskCmd.Flags().StringArray("option", nil, "A suggested answer; repeat for each (at most 10)")
	tasksAnswerCmd.Flags().String("answer", "", "Your answer")
	tasksQuestionsCmd.Flags().String("org", "", "Organization (or set TASKER_ORG_ID; an agent's is implied)")
	tasksQuestionsCmd.Flags().String("task", "", "Only this task's questions")
	tasksQuestionsCmd.Flags().String("status", "", "open (default), answered, cancelled or all")
	tasksQuestionsCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	tasksQuestionsCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	tasksQuestionsCmd.Flags().Bool("page-all", false, "Fetch every page, printing one JSON object per item per line (NDJSON)")
}
