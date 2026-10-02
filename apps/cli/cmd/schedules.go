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

// M43 (ADR-0036): recurring work - a task or a workflow on a cadence, in UTC.

var weekdayNames = []string{"sun", "mon", "tue", "wed", "thu", "fri", "sat"}

// parseWeekdays reads "mon,thu" (or 0-6) into 0 = Sunday .. 6 = Saturday.
func parseWeekdays(raw string) ([]int32, error) {
	var out []int32
	for _, part := range strings.Split(raw, ",") {
		p := strings.ToLower(strings.TrimSpace(part))
		if p == "" {
			continue
		}
		found := -1
		for i, n := range weekdayNames {
			if p == n || (len(p) > 3 && strings.HasPrefix(p, n)) || p == fmt.Sprint(i) {
				found = i
			}
		}
		if found < 0 {
			return nil, invalidArgf("--weekdays %q: use names like mon,thu or numbers 0 (Sunday) to 6", raw)
		}
		out = append(out, int32(found))
	}
	return out, nil
}

func cadenceText(s *healthv1.Schedule) string {
	at := fmt.Sprintf("at %02d:00 UTC", s.HourUtc)
	switch s.Cadence {
	case "weekly":
		days := make([]string, 0, len(s.Weekdays))
		for _, d := range s.Weekdays {
			if d >= 0 && int(d) < len(weekdayNames) {
				days = append(days, strings.ToUpper(weekdayNames[d][:1])+weekdayNames[d][1:])
			}
		}
		return "every " + strings.Join(days, ", ") + " " + at
	case "monthly":
		return fmt.Sprintf("monthly on day %d %s", s.DayOfMonth, at)
	default:
		return "every day " + at
	}
}

func scheduleLine(s *healthv1.Schedule) string {
	what := "task " + fmt.Sprintf("%q", s.GetTaskTitle())
	if s.TemplateId != nil {
		what = "workflow " + s.GetTemplateId()
	}
	state := "next " + s.NextRunAt
	if !s.Active {
		state = "paused"
	}
	line := fmt.Sprintf("%s (id: %s): %s, %s - %s", s.Name, s.Id, what, cadenceText(s), state)
	if s.LastOutcome != nil {
		line += fmt.Sprintf("; last run %s at %s", s.GetLastOutcome(), s.GetLastRunAt())
	}
	return line
}

func printSchedule(cmd *cobra.Command, msg proto.Message, s *healthv1.Schedule) error {
	if wantsJSON(cmd) {
		return printJSON(cmd, msg)
	}
	cmd.Println(scheduleLine(s))
	return nil
}

// scheduleFields builds the cadence and target from flags, starting from an
// existing schedule on update so unset flags keep their value.
func scheduleFields(cmd *cobra.Command, base *healthv1.Schedule) (*healthv1.UpdateScheduleRequest, error) {
	r := &healthv1.UpdateScheduleRequest{Cadence: "daily", HourUtc: 9}
	if base != nil {
		r = &healthv1.UpdateScheduleRequest{
			Id: base.Id, Name: base.Name, Cadence: base.Cadence, Weekdays: base.Weekdays, HourUtc: base.HourUtc,
			TemplateId: base.TemplateId, TaskTitle: base.TaskTitle, TaskDescription: base.TaskDescription,
		}
		if base.Cadence == "monthly" {
			d := base.DayOfMonth
			r.DayOfMonth = &d
		}
		p, skip := base.TaskPriority, base.SkipIfOpen
		r.TaskPriority, r.SkipIfOpen = &p, &skip
	}
	if v, _ := cmd.Flags().GetString("name"); v != "" {
		r.Name = v
	}
	if cmd.Flags().Changed("cadence") {
		r.Cadence, _ = cmd.Flags().GetString("cadence")
	}
	if v, _ := cmd.Flags().GetString("weekdays"); v != "" {
		days, err := parseWeekdays(v)
		if err != nil {
			return nil, err
		}
		r.Weekdays = days
		if !cmd.Flags().Changed("cadence") {
			r.Cadence = "weekly"
		}
	}
	if cmd.Flags().Changed("day") {
		d, _ := cmd.Flags().GetInt32("day")
		r.DayOfMonth = &d
		if !cmd.Flags().Changed("cadence") {
			r.Cadence = "monthly"
		}
	}
	if cmd.Flags().Changed("hour") {
		r.HourUtc, _ = cmd.Flags().GetInt32("hour")
	}
	if v := optionalString(cmd, "workflow"); v != nil {
		r.TemplateId, r.TaskTitle = v, nil
	}
	if v := optionalString(cmd, "task"); v != nil {
		r.TaskTitle, r.TemplateId = v, nil
	}
	if v := optionalString(cmd, "description"); v != nil {
		r.TaskDescription = v
	}
	p, err := optionalPriority(cmd)
	if err != nil {
		return nil, err
	}
	if p != nil {
		r.TaskPriority = p
	}
	if cmd.Flags().Changed("allow-overlap") {
		overlap, _ := cmd.Flags().GetBool("allow-overlap")
		skip := !overlap
		r.SkipIfOpen = &skip
	}
	if r.Cadence == "weekly" && len(r.Weekdays) == 0 {
		return nil, invalidArgf("a weekly schedule needs --weekdays (e.g. mon,thu)")
	}
	if r.Cadence == "monthly" && r.DayOfMonth == nil {
		return nil, invalidArgf("a monthly schedule needs --day (1-28)")
	}
	if (r.TemplateId == nil) == (r.TaskTitle == nil) {
		return nil, invalidArgf("give --task \"title\" or --workflow <template id>")
	}
	return r, nil
}

var schedulesCmd = &cobra.Command{
	Use:   "schedules",
	Short: "Recurring work: a task or workflow created on a cadence (UTC)",
}

var schedulesListCmd = &cobra.Command{
	Use:   "list",
	Short: "Schedules of the organization, or one project",
	RunE: func(cmd *cobra.Command, args []string) error {
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		org, project := optionalString(cmd, "org"), optionalString(cmd, "project")
		if org == nil && project == nil {
			if d := backend.DefaultOrgID(); d != "" {
				org = &d
			}
		}
		client := backend.NewScheduleServiceClient()
		req := connect.NewRequest(&healthv1.ListSchedulesRequest{OrgId: org, ProjectId: project, Page: &healthv1.PageRequest{Limit: limit, Cursor: cursor}})
		if pageAllRequested(cmd) {
			return pageAll(cmd, req.Msg, func() (proto.Message, error) {
				r, err := client.ListSchedules(context.Background(), req)
				if err != nil {
					return nil, err
				}
				return r.Msg, nil
			})
		}
		res, err := client.ListSchedules(context.Background(), req)
		if err != nil {
			return fmt.Errorf("failed to list schedules: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if len(res.Msg.Schedules) == 0 {
			cmd.PrintErrln("No schedules.")
		}
		for _, s := range res.Msg.Schedules {
			cmd.Printf("- %s\n", scheduleLine(s))
		}
		printNextPageHint(cmd, res.Msg)
		return nil
	},
}

var schedulesGetCmd = &cobra.Command{
	Use:   "get [schedule_id]",
	Short: "One schedule: what it creates, when, and how its last run went",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewScheduleServiceClient().GetSchedule(context.Background(), connect.NewRequest(&healthv1.GetScheduleRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to get the schedule: %w", err)
		}
		return printSchedule(cmd, res.Msg, res.Msg.Schedule)
	},
}

var schedulesCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a schedule (people only): --task or --workflow, with --cadence/--weekdays/--day and --hour (UTC)",
	RunE: func(cmd *cobra.Command, args []string) error {
		project, _ := cmd.Flags().GetString("project")
		if project == "" {
			project = backend.DefaultProjectID()
		}
		if project == "" {
			return invalidArgf("--project is required (or set TASKER_PROJECT_ID)")
		}
		f, err := scheduleFields(cmd, nil)
		if err != nil {
			return err
		}
		if strings.TrimSpace(f.Name) == "" {
			return invalidArgf("--name is required")
		}
		res, err := backend.NewScheduleServiceClient().CreateSchedule(context.Background(), connect.NewRequest(&healthv1.CreateScheduleRequest{
			ProjectId: project, Name: f.Name, Cadence: f.Cadence, Weekdays: f.Weekdays, DayOfMonth: f.DayOfMonth, HourUtc: f.HourUtc,
			TemplateId: f.TemplateId, TaskTitle: f.TaskTitle, TaskDescription: f.TaskDescription, TaskPriority: f.TaskPriority, SkipIfOpen: f.SkipIfOpen,
		}))
		if err != nil {
			return fmt.Errorf("failed to create the schedule: %w", err)
		}
		return printSchedule(cmd, res.Msg, res.Msg.Schedule)
	},
}

var schedulesUpdateCmd = &cobra.Command{
	Use:   "update [schedule_id]",
	Short: "Change a schedule; flags not given keep their value (--pause / --resume to stop and start it)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client := backend.NewScheduleServiceClient()
		cur, err := client.GetSchedule(context.Background(), connect.NewRequest(&healthv1.GetScheduleRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to get the schedule: %w", err)
		}
		f, err := scheduleFields(cmd, cur.Msg.Schedule)
		if err != nil {
			return err
		}
		pause, _ := cmd.Flags().GetBool("pause")
		resume, _ := cmd.Flags().GetBool("resume")
		if pause && resume {
			return invalidArgf("give --pause or --resume, not both")
		}
		if pause || resume {
			f.Active = &resume
		}
		res, err := client.UpdateSchedule(context.Background(), connect.NewRequest(f))
		if err != nil {
			return fmt.Errorf("failed to update the schedule: %w", err)
		}
		return printSchedule(cmd, res.Msg, res.Msg.Schedule)
	},
}

var schedulesDeleteCmd = &cobra.Command{
	Use:   "delete [schedule_id]",
	Short: "Delete a schedule and its run history (tasks it created stay)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewScheduleServiceClient().DeleteSchedule(context.Background(), connect.NewRequest(&healthv1.DeleteScheduleRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to delete the schedule: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Schedule %s deleted\n", args[0])
		return nil
	},
}

func runLine(r *healthv1.ScheduleRun) string {
	line := fmt.Sprintf("%s %s (%s)", r.RanAt, r.Outcome, r.Trigger)
	if r.TaskId != nil {
		line += " task " + r.GetTaskId()
	}
	if r.Detail != nil {
		line += ": " + r.GetDetail()
	}
	return line
}

var schedulesRunCmd = &cobra.Command{
	Use:   "run [schedule_id]",
	Short: "Fire a schedule now, as you; its regular next run is unchanged",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewScheduleServiceClient().RunSchedule(context.Background(), connect.NewRequest(&healthv1.RunScheduleRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to run the schedule: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Println(runLine(res.Msg.Run))
		return nil
	},
}

var schedulesRunsCmd = &cobra.Command{
	Use:   "runs [schedule_id]",
	Short: "A schedule's run history, newest first",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		client := backend.NewScheduleServiceClient()
		req := connect.NewRequest(&healthv1.ListScheduleRunsRequest{ScheduleId: args[0], Page: &healthv1.PageRequest{Limit: limit, Cursor: cursor}})
		if pageAllRequested(cmd) {
			return pageAll(cmd, req.Msg, func() (proto.Message, error) {
				r, err := client.ListScheduleRuns(context.Background(), req)
				if err != nil {
					return nil, err
				}
				return r.Msg, nil
			})
		}
		res, err := client.ListScheduleRuns(context.Background(), req)
		if err != nil {
			return fmt.Errorf("failed to list runs: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if len(res.Msg.Runs) == 0 {
			cmd.PrintErrln("No runs yet.")
		}
		for _, r := range res.Msg.Runs {
			cmd.Printf("- %s\n", runLine(r))
		}
		printNextPageHint(cmd, res.Msg)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(schedulesCmd)
	schedulesCmd.AddCommand(schedulesListCmd, schedulesGetCmd, schedulesCreateCmd, schedulesUpdateCmd, schedulesDeleteCmd, schedulesRunCmd, schedulesRunsCmd)
	schedulesListCmd.Flags().String("org", "", "Organization (or set TASKER_ORG_ID; an agent's is implied)")
	schedulesListCmd.Flags().String("project", "", "Only this project's schedules")
	for _, c := range []*cobra.Command{schedulesListCmd, schedulesRunsCmd} {
		c.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
		c.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	}
	for _, c := range []*cobra.Command{schedulesListCmd, schedulesRunsCmd} {
		c.Flags().Bool("page-all", false, "Fetch every page, printing one JSON object per item per line (NDJSON)")
	}
	for _, c := range []*cobra.Command{schedulesCreateCmd, schedulesUpdateCmd} {
		c.Flags().String("name", "", "Schedule name")
		c.Flags().String("cadence", "daily", "daily, weekly or monthly (implied by --weekdays / --day)")
		c.Flags().String("weekdays", "", "Weekly: days such as mon,thu")
		c.Flags().Int32("day", 1, "Monthly: day of the month, 1-28")
		c.Flags().Int32("hour", 9, "Hour of the day, 0-23, in UTC")
		c.Flags().String("task", "", "Create one task with this title each time")
		c.Flags().String("workflow", "", "Start this workflow template each time instead")
		c.Flags().String("description", "", "The task's description (with --task)")
		c.Flags().String("priority", "", "The task's priority: urgent, high, medium, low or none")
		c.Flags().Bool("allow-overlap", false, "Run even while the previous run's task is unfinished")
	}
	schedulesCreateCmd.Flags().String("project", "", "Project (or set TASKER_PROJECT_ID)")
	schedulesUpdateCmd.Flags().Bool("pause", false, "Stop firing until resumed")
	schedulesUpdateCmd.Flags().Bool("resume", false, "Start firing again")
}
