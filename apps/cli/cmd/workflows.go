package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"
	"google.golang.org/protobuf/proto"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
)

// M42 (ADR-0035): repeatable step graphs, started as ordinary tasks.

// stepFile is the JSON a template's steps are written in: either a bare array
// of steps or {"name", "description", "steps"}.
type stepFile struct {
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Steps       []fileStep `json:"steps"`
}

type fileStep struct {
	Key         string   `json:"key"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Priority    int32    `json:"priority"`
	TaskTypeID  string   `json:"taskTypeId"`
	Status      string   `json:"status"`
	DependsOn   []string `json:"dependsOn"`
}

func (s fileStep) toProto() *healthv1.WorkflowStep {
	st := &healthv1.WorkflowStep{Key: s.Key, Title: s.Title, Description: s.Description, Priority: s.Priority, DependsOn: s.DependsOn}
	if s.TaskTypeID != "" {
		st.TaskTypeId = &s.TaskTypeID
	}
	if s.Status != "" {
		st.Status = &s.Status
	}
	return st
}

// parseStepFlag reads "key:title[:dep1,dep2]".
func parseStepFlag(raw string) (*healthv1.WorkflowStep, error) {
	parts := strings.SplitN(raw, ":", 3)
	if len(parts) < 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
		return nil, invalidArgf("--step %q: use \"key:title\" or \"key:title:dep1,dep2\"", raw)
	}
	st := &healthv1.WorkflowStep{Key: strings.TrimSpace(parts[0]), Title: strings.TrimSpace(parts[1])}
	if len(parts) == 3 {
		for _, d := range strings.Split(parts[2], ",") {
			if d = strings.TrimSpace(d); d != "" {
				st.DependsOn = append(st.DependsOn, d)
			}
		}
	}
	return st, nil
}

// readSteps gathers steps from --file (JSON, or - for stdin) or repeated
// --step flags; a file may also carry the name and description.
func readSteps(cmd *cobra.Command) (*stepFile, []*healthv1.WorkflowStep, error) {
	file, _ := cmd.Flags().GetString("file")
	flags, _ := cmd.Flags().GetStringArray("step")
	if file != "" && len(flags) > 0 {
		return nil, nil, invalidArgf("give --file or --step, not both")
	}
	if file != "" {
		var raw []byte
		var err error
		if file == "-" {
			raw, err = io.ReadAll(cmd.InOrStdin())
		} else {
			raw, err = os.ReadFile(file)
		}
		if err != nil {
			return nil, nil, invalidArgf("cannot read %s: %v", file, err)
		}
		sf := &stepFile{}
		if trimmed := strings.TrimSpace(string(raw)); strings.HasPrefix(trimmed, "[") {
			err = json.Unmarshal(raw, &sf.Steps)
		} else {
			err = json.Unmarshal(raw, sf)
		}
		if err != nil {
			return nil, nil, invalidArgf("%s is not a steps file: %v", file, err)
		}
		steps := make([]*healthv1.WorkflowStep, 0, len(sf.Steps))
		for _, s := range sf.Steps {
			steps = append(steps, s.toProto())
		}
		return sf, steps, nil
	}
	steps := make([]*healthv1.WorkflowStep, 0, len(flags))
	for _, f := range flags {
		st, err := parseStepFlag(f)
		if err != nil {
			return nil, nil, err
		}
		steps = append(steps, st)
	}
	return &stepFile{}, steps, nil
}

func printTemplate(cmd *cobra.Command, t *healthv1.WorkflowTemplate) {
	scope := "organization"
	if t.ProjectId != nil {
		scope = "project " + t.GetProjectId()
	}
	cmd.Printf("%s (id: %s, %s, %d steps)\n", t.Name, t.Id, scope, len(t.Steps))
	if t.Description != "" {
		cmd.Printf("  %s\n", t.Description)
	}
	for _, s := range t.Steps {
		line := fmt.Sprintf("  - %s: %s", s.Key, s.Title)
		if s.Priority != 0 {
			line += " {" + priorityName(s.Priority) + "}"
		}
		if len(s.DependsOn) > 0 {
			line += " after " + strings.Join(s.DependsOn, ", ")
		}
		cmd.Println(line)
	}
}

var workflowsCmd = &cobra.Command{
	Use:   "workflows",
	Short: "Repeatable multi-step workflows: define a template, start it as wired tasks",
}

var workflowsListCmd = &cobra.Command{
	Use:   "list",
	Short: "Workflow templates of the organization (with --project, plus that project's own)",
	RunE: func(cmd *cobra.Command, args []string) error {
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		org, project := optionalString(cmd, "org"), optionalString(cmd, "project")
		if org == nil && project == nil {
			if d := backend.DefaultOrgID(); d != "" {
				org = &d
			}
		}
		client := backend.NewWorkflowServiceClient()
		req := connect.NewRequest(&healthv1.ListWorkflowTemplatesRequest{OrgId: org, ProjectId: project, Page: &healthv1.PageRequest{Limit: limit, Cursor: cursor}})
		if pageAllRequested(cmd) {
			return pageAll(cmd, req.Msg, func() (proto.Message, error) {
				r, err := client.ListWorkflowTemplates(context.Background(), req)
				if err != nil {
					return nil, err
				}
				return r.Msg, nil
			})
		}
		res, err := client.ListWorkflowTemplates(context.Background(), req)
		if err != nil {
			return fmt.Errorf("failed to list workflow templates: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if len(res.Msg.Templates) == 0 {
			cmd.PrintErrln("No workflow templates.")
		}
		for _, t := range res.Msg.Templates {
			cmd.Printf("- %s (id: %s, %d steps)\n", t.Name, t.Id, len(t.Steps))
		}
		printNextPageHint(cmd, res.Msg)
		return nil
	},
}

var workflowsGetCmd = &cobra.Command{
	Use:   "get [template_id]",
	Short: "A workflow template's steps and dependencies",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewWorkflowServiceClient().GetWorkflowTemplate(context.Background(), connect.NewRequest(&healthv1.GetWorkflowTemplateRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to get the workflow template: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		printTemplate(cmd, res.Msg.Template)
		return nil
	},
}

var workflowsCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Define a workflow template from --step flags or a JSON --file (people only)",
	RunE: func(cmd *cobra.Command, args []string) error {
		sf, steps, err := readSteps(cmd)
		if err != nil {
			return err
		}
		name, _ := cmd.Flags().GetString("name")
		if name == "" {
			name = sf.Name
		}
		if strings.TrimSpace(name) == "" {
			return invalidArgf("--name is required (or a \"name\" in the steps file)")
		}
		if len(steps) == 0 {
			return invalidArgf("a workflow needs steps - use --step \"key:title[:deps]\" or --file")
		}
		org, _ := cmd.Flags().GetString("org")
		if org == "" {
			org = backend.DefaultOrgID()
		}
		if org == "" {
			return invalidArgf("--org is required (or set TASKER_ORG_ID)")
		}
		desc := optionalString(cmd, "description")
		if desc == nil && sf.Description != "" {
			desc = &sf.Description
		}
		res, err := backend.NewWorkflowServiceClient().CreateWorkflowTemplate(context.Background(), connect.NewRequest(&healthv1.CreateWorkflowTemplateRequest{
			OrgId: org, ProjectId: optionalString(cmd, "project"), Name: name, Description: desc, Steps: steps,
		}))
		if err != nil {
			return fmt.Errorf("failed to create the workflow template: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		printTemplate(cmd, res.Msg.Template)
		return nil
	},
}

var workflowsUpdateCmd = &cobra.Command{
	Use:   "update [template_id]",
	Short: "Replace a template's name, description and steps (running instances are not touched)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		sf, steps, err := readSteps(cmd)
		if err != nil {
			return err
		}
		client := backend.NewWorkflowServiceClient()
		current, err := client.GetWorkflowTemplate(context.Background(), connect.NewRequest(&healthv1.GetWorkflowTemplateRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to get the workflow template: %w", err)
		}
		t := current.Msg.Template
		name, desc := t.Name, t.Description
		if sf.Name != "" {
			name = sf.Name
		}
		if v, _ := cmd.Flags().GetString("name"); v != "" {
			name = v
		}
		if sf.Description != "" {
			desc = sf.Description
		}
		if d := optionalString(cmd, "description"); d != nil {
			desc = *d
		}
		if len(steps) == 0 {
			steps = t.Steps
		}
		res, err := client.UpdateWorkflowTemplate(context.Background(), connect.NewRequest(&healthv1.UpdateWorkflowTemplateRequest{
			Id: args[0], Name: name, Description: &desc, Steps: steps,
		}))
		if err != nil {
			return fmt.Errorf("failed to update the workflow template: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		printTemplate(cmd, res.Msg.Template)
		return nil
	},
}

var workflowsDeleteCmd = &cobra.Command{
	Use:   "delete [template_id]",
	Short: "Delete a workflow template (tasks it already created stay)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewWorkflowServiceClient().DeleteWorkflowTemplate(context.Background(), connect.NewRequest(&healthv1.DeleteWorkflowTemplateRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to delete the workflow template: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Workflow template %s deleted\n", args[0])
		return nil
	},
}

var workflowsStartCmd = &cobra.Command{
	Use:   "start [template_id]",
	Short: "Create a workflow's parent task and its steps, each blocked by the steps it depends on",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		project, _ := cmd.Flags().GetString("project")
		if project == "" {
			project = backend.DefaultProjectID()
		}
		if project == "" {
			return invalidArgf("--project is required (or set TASKER_PROJECT_ID)")
		}
		res, err := backend.NewWorkflowServiceClient().InstantiateWorkflow(context.Background(), connect.NewRequest(&healthv1.InstantiateWorkflowRequest{
			TemplateId: args[0], ProjectId: project, Title: optionalString(cmd, "title"), IdempotencyKey: optionalString(cmd, "idempotency-key"),
		}))
		if err != nil {
			return fmt.Errorf("failed to start the workflow: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Started %s\n", taskLine(res.Msg.Parent))
		for _, s := range res.Msg.Steps {
			cmd.Printf("  - %s\n", taskLine(s))
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(workflowsCmd)
	workflowsCmd.AddCommand(workflowsListCmd, workflowsGetCmd, workflowsCreateCmd, workflowsUpdateCmd, workflowsDeleteCmd, workflowsStartCmd)
	workflowsListCmd.Flags().String("org", "", "Organization (or set TASKER_ORG_ID; an agent's is implied)")
	workflowsListCmd.Flags().String("project", "", "Also include this project's own templates")
	workflowsListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	workflowsListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	workflowsListCmd.Flags().Bool("page-all", false, "Fetch every page, printing one JSON object per item per line (NDJSON)")
	for _, c := range []*cobra.Command{workflowsCreateCmd, workflowsUpdateCmd} {
		c.Flags().String("name", "", "Template name")
		c.Flags().String("description", "", "What the workflow is for; becomes the parent task's description")
		c.Flags().StringArray("step", nil, "A step as \"key:title\" or \"key:title:dep1,dep2\"; repeat in order")
		c.Flags().String("file", "", "Steps as JSON (an array, or {name, description, steps}); - for stdin")
	}
	workflowsCreateCmd.Flags().String("org", "", "Organization (or set TASKER_ORG_ID)")
	workflowsCreateCmd.Flags().String("project", "", "Only this project may use the template")
	workflowsStartCmd.Flags().String("project", "", "Project to create the tasks in (or set TASKER_PROJECT_ID)")
	workflowsStartCmd.Flags().String("title", "", "Parent task title (default: the template's name)")
	workflowsStartCmd.Flags().String("idempotency-key", "", "Retry with the same key to get the first instance back")
}
