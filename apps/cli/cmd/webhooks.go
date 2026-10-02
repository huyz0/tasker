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

// M37 (ADR-0030): an organization's HTTPS endpoints for its task events.
// Admin-only on the server; agent tokens are refused.

var webhooksCmd = &cobra.Command{
	Use:   "webhooks",
	Short: "Send task events to HTTPS endpoints, signed (org admins)",
	Long: "Each matching task event is POSTed as JSON with X-Tasker-Event, X-Tasker-Delivery,\n" +
		"X-Tasker-Timestamp and X-Tasker-Signature (sha256=HMAC of \"<timestamp>.<body>\" with the\n" +
		"webhook's secret). Delivery is at least once; failures retry with backoff, and a webhook\n" +
		"that keeps failing is disabled. See docs/webhooks.md.",
}

func webhookLine(w *healthv1.Webhook) string {
	state := "active"
	if !w.Active {
		state = "inactive"
		if r := w.GetDisabledReason(); r != "" {
			state = "disabled: " + r
		}
	}
	scope := "whole organization"
	if p := w.GetProjectId(); p != "" {
		scope = "project " + p
	}
	return fmt.Sprintf("%s  %s  [%s]  events: %s  (%s; id: %s)", w.Url, scope, state, strings.Join(w.Events, ","), w.Description, w.Id)
}

func orgFlag(cmd *cobra.Command) (string, error) {
	org, _ := cmd.Flags().GetString("org")
	if org == "" {
		org = backend.DefaultOrgID()
	}
	if org == "" {
		return "", invalidArgf("--org is required (or set TASKER_ORG_ID)")
	}
	return org, nil
}

var webhooksCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Register an HTTPS endpoint; prints its signing secret once",
	RunE: func(cmd *cobra.Command, args []string) error {
		org, err := orgFlag(cmd)
		if err != nil {
			return err
		}
		url, _ := cmd.Flags().GetString("url")
		events, _ := cmd.Flags().GetStringSlice("event")
		if url == "" || len(events) == 0 {
			return invalidArgf("--url and at least one --event are required")
		}
		res, err := backend.NewWebhookServiceClient().CreateWebhook(context.Background(), connect.NewRequest(&healthv1.CreateWebhookRequest{
			OrgId: org, Url: url, Events: events, ProjectId: optionalString(cmd, "project"), Description: optionalString(cmd, "description"),
		}))
		if err != nil {
			return fmt.Errorf("failed to create webhook: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Webhook created: %s\n", webhookLine(res.Msg.Webhook))
		cmd.Printf("Signing secret (shown once): %s\n", res.Msg.Secret)
		return nil
	},
}

var webhooksListCmd = &cobra.Command{
	Use:   "list",
	Short: "List an organization's webhooks",
	RunE: func(cmd *cobra.Command, args []string) error {
		org, err := orgFlag(cmd)
		if err != nil {
			return err
		}
		res, err := backend.NewWebhookServiceClient().ListWebhooks(context.Background(), connect.NewRequest(&healthv1.ListWebhooksRequest{OrgId: org}))
		if err != nil {
			return fmt.Errorf("failed to list webhooks: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if len(res.Msg.Webhooks) == 0 {
			cmd.PrintErrln("No webhooks.")
		}
		for _, w := range res.Msg.Webhooks {
			cmd.Printf("- %s\n", webhookLine(w))
		}
		return nil
	},
}

var webhooksUpdateCmd = &cobra.Command{
	Use:   "update [webhook_id]",
	Short: "Change a webhook's URL, events or description, or enable/disable it",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		enable, _ := cmd.Flags().GetBool("enable")
		disable, _ := cmd.Flags().GetBool("disable")
		if enable && disable {
			return invalidArgf("--enable and --disable cannot both be given")
		}
		events, _ := cmd.Flags().GetStringSlice("event")
		req := &healthv1.UpdateWebhookRequest{
			Id: args[0], Url: optionalString(cmd, "url"), Events: events, Description: optionalString(cmd, "description"),
		}
		if enable || disable {
			req.Active = proto.Bool(enable)
		}
		res, err := backend.NewWebhookServiceClient().UpdateWebhook(context.Background(), connect.NewRequest(req))
		if err != nil {
			return fmt.Errorf("failed to update webhook: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Webhook updated: %s\n", webhookLine(res.Msg.Webhook))
		return nil
	},
}

var webhooksDeleteCmd = &cobra.Command{
	Use:   "delete [webhook_id]",
	Short: "Delete a webhook and its delivery history",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewWebhookServiceClient().DeleteWebhook(context.Background(), connect.NewRequest(&healthv1.DeleteWebhookRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to delete webhook: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Webhook %s deleted\n", args[0])
		return nil
	},
}

var webhooksRotateCmd = &cobra.Command{
	Use:   "rotate-secret [webhook_id]",
	Short: "Replace a webhook's signing secret; prints the new one once",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewWebhookServiceClient().RotateWebhookSecret(context.Background(), connect.NewRequest(&healthv1.RotateWebhookSecretRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to rotate the webhook secret: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("New signing secret (shown once; the old one no longer signs): %s\n", res.Msg.Secret)
		return nil
	},
}

func deliveryLine(d *healthv1.WebhookDelivery) string {
	detail := ""
	if c := d.GetLastStatusCode(); c != 0 {
		detail = fmt.Sprintf(" HTTP %d", c)
	}
	if e := d.GetLastError(); e != "" {
		detail += " - " + e
	}
	return fmt.Sprintf("%s  %s  %s after %d attempt(s)%s (id: %s)", d.CreatedAt, d.EventType, d.Status, d.Attempts, detail, d.Id)
}

var webhooksPingCmd = &cobra.Command{
	Use:   "ping [webhook_id]",
	Short: "Queue a \"ping\" delivery to check the receiver end to end",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewWebhookServiceClient().PingWebhook(context.Background(), connect.NewRequest(&healthv1.PingWebhookRequest{Id: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to ping webhook: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Ping queued (delivery %s); check it with `tasker webhooks deliveries %s`\n", res.Msg.Delivery.Id, args[0])
		return nil
	},
}

var webhooksDeliveriesCmd = &cobra.Command{
	Use:   "deliveries [webhook_id]",
	Short: "Recent deliveries to a webhook, newest first",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		client := backend.NewWebhookServiceClient()
		req := connect.NewRequest(&healthv1.ListWebhookDeliveriesRequest{WebhookId: args[0], Page: &healthv1.PageRequest{Limit: limit, Cursor: cursor}})
		if pageAllRequested(cmd) {
			return pageAll(cmd, req.Msg, func() (proto.Message, error) {
				r, err := client.ListWebhookDeliveries(context.Background(), req)
				if err != nil {
					return nil, err
				}
				return r.Msg, nil
			})
		}
		res, err := client.ListWebhookDeliveries(context.Background(), req)
		if err != nil {
			return fmt.Errorf("failed to list deliveries: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if len(res.Msg.Deliveries) == 0 {
			cmd.PrintErrln("No deliveries.")
		}
		for _, d := range res.Msg.Deliveries {
			cmd.Printf("- %s\n", deliveryLine(d))
		}
		printNextPageHint(cmd, res.Msg)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(webhooksCmd)
	webhooksCmd.AddCommand(webhooksCreateCmd, webhooksListCmd, webhooksUpdateCmd, webhooksDeleteCmd, webhooksRotateCmd, webhooksPingCmd, webhooksDeliveriesCmd)

	for _, c := range []*cobra.Command{webhooksCreateCmd, webhooksListCmd} {
		c.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	}
	webhooksCreateCmd.Flags().String("url", "", "HTTPS endpoint to POST events to")
	webhooksCreateCmd.Flags().StringSlice("event", nil, "Event type, \"task.*\"/\"tasknote.*\", or \"*\" (repeat or comma-separate)")
	webhooksCreateCmd.Flags().String("project", "", "Only this project's events (default: the whole organization)")
	webhooksCreateCmd.Flags().String("description", "", "What the endpoint is for")
	webhooksUpdateCmd.Flags().String("url", "", "New HTTPS endpoint")
	webhooksUpdateCmd.Flags().StringSlice("event", nil, "Replace the event filter (repeat or comma-separate)")
	webhooksUpdateCmd.Flags().String("description", "", "New description")
	webhooksUpdateCmd.Flags().Bool("enable", false, "Turn the webhook on (clears its failure count)")
	webhooksUpdateCmd.Flags().Bool("disable", false, "Pause the webhook")
	webhooksDeliveriesCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	webhooksDeliveriesCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	webhooksDeliveriesCmd.Flags().Bool("page-all", false, "Fetch every page, printing one JSON object per item per line (NDJSON)")
}
