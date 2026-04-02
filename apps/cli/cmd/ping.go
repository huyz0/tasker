package cmd

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
)

// PingClientFactory allows injecting a custom HTTP client and server URL for
// testing purposes. In production the defaults (http.DefaultClient, localhost)
// are used automatically via the cobra.Command initialisation below.
type PingClientFactory func(httpClient *http.Client, serverURL string) v1connect.HealthServiceClient

var defaultPingClientFactory PingClientFactory = func(httpClient *http.Client, serverURL string) v1connect.HealthServiceClient {
	return v1connect.NewHealthServiceClient(httpClient, serverURL)
}

// runPing is the extracted, testable command logic. It writes output to w so
// tests can capture it without relying on os.Stdout.
func runPing(w io.Writer, factory PingClientFactory, httpClient *http.Client, serverURL string) error {
	client := factory(httpClient, serverURL)

	res, err := client.Ping(
		context.Background(),
		connect.NewRequest(&healthv1.PingRequest{}),
	)
	if err != nil {
		return fmt.Errorf("ping failed: %w", err)
	}

	fmt.Fprintf(w, "Received: %v\nDB Status: %v\n", res.Msg.Message, res.Msg.DbStatus)
	return nil
}

var pingCmd = &cobra.Command{
	Use:   "ping",
	Short: "Ping the backend health service",
	Run: func(cmd *cobra.Command, args []string) {
		if err := runPing(os.Stdout, defaultPingClientFactory, http.DefaultClient, "http://localhost:8080"); err != nil {
			fmt.Fprintf(os.Stderr, "%v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	rootCmd.AddCommand(pingCmd)
}

