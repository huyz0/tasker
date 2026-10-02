package cmd

import (
	"context"
	"fmt"
	"io"
	"net/http"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
)

// PingClientFactory allows injecting a custom HTTP client and server URL for
// testing purposes. In production the defaults (http.DefaultClient, localhost)
// are used automatically via the cobra.Command initialisation below.
type PingClientFactory func(httpClient *http.Client, serverURL string) v1connect.HealthServiceClient

var defaultPingClientFactory PingClientFactory = func(httpClient *http.Client, serverURL string) v1connect.HealthServiceClient {
	return v1connect.NewHealthServiceClient(httpClient, serverURL, backend.ClientOptions()...)
}

// runPing is the extracted, testable command logic. It writes output to w so
// tests can capture it without relying on os.Stdout.
func runPing(w io.Writer, factory PingClientFactory, httpClient *http.Client, serverURL string, asJSON bool) error {
	client := factory(httpClient, serverURL)

	res, err := client.Ping(
		context.Background(),
		connect.NewRequest(&healthv1.PingRequest{}),
	)
	if err != nil {
		return fmt.Errorf("ping failed: %w", err)
	}
	if asJSON {
		line, err := encodeJSON(res.Msg)
		if err != nil {
			return err
		}
		fmt.Fprintln(w, line)
		return nil
	}

	fmt.Fprintf(w, "Received: %v\nDB Status: %v\nNATS Status: %v\nVersion: %v\nUptime: %vs\n",
		res.Msg.Message, res.Msg.DbStatus, res.Msg.NatsStatus, res.Msg.Version, res.Msg.UptimeSeconds)
	return nil
}

var pingCmd = &cobra.Command{
	Use:   "ping",
	Short: "Ping the backend health service",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runPing(cmd.OutOrStdout(), defaultPingClientFactory, http.DefaultClient, backend.URL(), wantsJSON(cmd))
	},
}

func init() {
	rootCmd.AddCommand(pingCmd)
}
