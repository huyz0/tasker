package cmd

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"
	"google.golang.org/protobuf/proto"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
)

// M40 (ADR-0033): what agents report their work cost. Money travels as
// integer micro-dollars; these helpers convert at the edge, exactly.

// parseUSD reads a decimal dollar amount ("0.015", "12", "$1.50") into
// micro-dollars without going through a float.
func parseUSD(raw string) (int64, error) {
	s := strings.TrimPrefix(strings.TrimSpace(raw), "$")
	whole, frac, _ := strings.Cut(s, ".")
	if whole == "" {
		whole = "0"
	}
	if len(frac) > 6 || strings.ContainsAny(whole+frac, "+-") {
		return 0, invalidArgf("--cost-usd %q: use a non-negative amount with at most 6 decimal places", raw)
	}
	w, err := strconv.ParseInt(whole, 10, 64)
	if err != nil {
		return 0, invalidArgf("--cost-usd %q is not an amount", raw)
	}
	f := int64(0)
	if frac != "" {
		if f, err = strconv.ParseInt(frac+strings.Repeat("0", 6-len(frac)), 10, 64); err != nil {
			return 0, invalidArgf("--cost-usd %q is not an amount", raw)
		}
	}
	if w > 1000 || w*1_000_000+f > 1_000_000_000 {
		return 0, invalidArgf("--cost-usd %q is more than one report may carry (USD 1,000)", raw)
	}
	return w*1_000_000 + f, nil
}

// formatUSD renders micro-dollars as dollars, keeping only significant
// fractional digits, but at least cents: 15000 -> "$0.015", 1500000 -> "$1.50".
func formatUSD(micros int64) string {
	frac := strings.TrimRight(fmt.Sprintf("%06d", micros%1_000_000), "0")
	for len(frac) < 2 {
		frac += "0"
	}
	return fmt.Sprintf("$%d.%s", micros/1_000_000, frac)
}

func usageSummary(t *healthv1.UsageTotals) string {
	return fmt.Sprintf("%s over %d report(s) - %d input / %d output tokens", formatUSD(t.CostMicros), t.Reports, t.InputTokens, t.OutputTokens)
}

func usageRecordLine(r *healthv1.UsageRecord) string {
	model := r.ModelName
	if model == "" {
		model = "(model not given)"
	}
	return fmt.Sprintf("%s %s %s: %s, %d in / %d out (%s)", r.CreatedAt, r.ReportedByName, model, formatUSD(r.CostMicros), r.InputTokens, r.OutputTokens, r.Id)
}

var tasksUsageCmd = &cobra.Command{
	Use:   "usage",
	Short: "Tokens and cost reported against a task",
}

var tasksUsageReportCmd = &cobra.Command{
	Use:   "report [task_id]",
	Short: "Report the tokens and cost a piece of work on a task took (idempotent with --idempotency-key)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		in, _ := cmd.Flags().GetInt64("input-tokens")
		out, _ := cmd.Flags().GetInt64("output-tokens")
		micros, _ := cmd.Flags().GetInt64("cost-micros")
		if usd := optionalString(cmd, "cost-usd"); usd != nil {
			if cmd.Flags().Changed("cost-micros") {
				return invalidArgf("give --cost-usd or --cost-micros, not both")
			}
			var err error
			if micros, err = parseUSD(*usd); err != nil {
				return err
			}
		}
		if in < 0 || out < 0 || micros < 0 {
			return invalidArgf("tokens and cost cannot be negative")
		}
		if in+out+micros == 0 {
			return invalidArgf("a report must carry tokens or cost - set --input-tokens, --output-tokens or --cost-usd")
		}
		res, err := backend.NewTaskServiceClient().ReportUsage(context.Background(), connect.NewRequest(&healthv1.ReportUsageRequest{
			TaskId: args[0], ModelName: optionalString(cmd, "model"), InputTokens: in, OutputTokens: out, CostMicros: micros,
			IdempotencyKey: optionalString(cmd, "idempotency-key"),
		}))
		if err != nil {
			return fmt.Errorf("failed to report usage: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if res.Msg.Replayed {
			cmd.Printf("Already reported (same key): %s\n", usageRecordLine(res.Msg.Record))
		} else {
			cmd.Printf("Reported: %s\n", usageRecordLine(res.Msg.Record))
		}
		cmd.Printf("Task total: %s\n", usageSummary(res.Msg.Totals))
		return nil
	},
}

var tasksUsageShowCmd = &cobra.Command{
	Use:   "show [task_id]",
	Short: "A task's usage reports, newest first, with its totals",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		client := backend.NewTaskServiceClient()
		req := connect.NewRequest(&healthv1.ListUsageRecordsRequest{TaskId: args[0], Page: &healthv1.PageRequest{Limit: limit, Cursor: cursor}})
		if pageAllRequested(cmd) {
			return pageAll(cmd, req.Msg, func() (proto.Message, error) {
				r, err := client.ListUsageRecords(context.Background(), req)
				if err != nil {
					return nil, err
				}
				return r.Msg, nil
			})
		}
		res, err := client.ListUsageRecords(context.Background(), req)
		if err != nil {
			return fmt.Errorf("failed to list usage: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if len(res.Msg.Records) == 0 {
			cmd.PrintErrln("No usage reported.")
			return nil
		}
		cmd.Printf("Total: %s\n", usageSummary(res.Msg.Totals))
		for _, r := range res.Msg.Records {
			cmd.Printf("- %s\n", usageRecordLine(r))
		}
		printNextPageHint(cmd, res.Msg)
		return nil
	},
}

var reportsCmd = &cobra.Command{
	Use:   "reports",
	Short: "Supervision reports (people only)",
}

var reportsUsageCmd = &cobra.Command{
	Use:   "usage",
	Short: "Agent spend over the last N days, by agent, project and day",
	RunE: func(cmd *cobra.Command, args []string) error {
		days, _ := cmd.Flags().GetInt32("days")
		if days < 1 || days > 365 {
			return invalidArgf("--days must be from 1 to 365")
		}
		org, project := optionalString(cmd, "org"), optionalString(cmd, "project")
		if org == nil && project == nil {
			if d := backend.DefaultOrgID(); d != "" {
				org = &d
			}
		}
		res, err := backend.NewReportServiceClient().GetUsageReport(context.Background(), connect.NewRequest(&healthv1.GetUsageReportRequest{
			OrgId: org, ProjectId: project, Days: &days,
		}))
		if err != nil {
			return fmt.Errorf("failed to get the usage report: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Since %s: %s\n", res.Msg.Since, usageSummary(res.Msg.Totals))
		for _, section := range []struct {
			title   string
			buckets []*healthv1.UsageBucket
		}{{"By agent", res.Msg.ByAgent}, {"By project", res.Msg.ByProject}} {
			cmd.Printf("%s:\n", section.title)
			if len(section.buckets) == 0 {
				cmd.Println("  (none)")
			}
			for _, b := range section.buckets {
				cmd.Printf("  %-30s %12s  %d report(s)\n", b.Label, formatUSD(b.CostMicros), b.Reports)
			}
		}
		cmd.Println("By day:")
		for _, b := range res.Msg.ByDay {
			if b.Reports > 0 {
				cmd.Printf("  %s %12s  %d report(s)\n", b.Key, formatUSD(b.CostMicros), b.Reports)
			}
		}
		return nil
	},
}

func init() {
	tasksCmd.AddCommand(tasksUsageCmd)
	tasksUsageCmd.AddCommand(tasksUsageReportCmd, tasksUsageShowCmd)
	tasksUsageReportCmd.Flags().String("model", "", "Model that did the work")
	tasksUsageReportCmd.Flags().Int64("input-tokens", 0, "Input tokens")
	tasksUsageReportCmd.Flags().Int64("output-tokens", 0, "Output tokens")
	tasksUsageReportCmd.Flags().String("cost-usd", "", "Cost in US dollars, e.g. 0.015 (up to 6 decimals)")
	tasksUsageReportCmd.Flags().Int64("cost-micros", 0, "Cost in micro-dollars (USD x 1,000,000), instead of --cost-usd")
	tasksUsageReportCmd.Flags().String("idempotency-key", "", "Retry with the same key to get the original report back instead of counting twice")
	tasksUsageShowCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	tasksUsageShowCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	tasksUsageShowCmd.Flags().Bool("page-all", false, "Fetch every page, printing one JSON object per item per line (NDJSON)")

	rootCmd.AddCommand(reportsCmd)
	reportsCmd.AddCommand(reportsUsageCmd)
	reportsUsageCmd.Flags().String("org", "", "Organization (or set TASKER_ORG_ID)")
	reportsUsageCmd.Flags().String("project", "", "Only this project")
	reportsUsageCmd.Flags().Int32("days", 30, "Window in days, 1-365")
}
