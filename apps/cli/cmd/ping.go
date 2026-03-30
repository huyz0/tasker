package cmd

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
)

var pingCmd = &cobra.Command{
	Use:   "ping",
	Short: "Ping the backend health service",
	Run: func(cmd *cobra.Command, args []string) {
		client := v1connect.NewHealthServiceClient(
			http.DefaultClient,
			"http://localhost:8080",
		)

		res, err := client.Ping(
			context.Background(),
			connect.NewRequest(&healthv1.PingRequest{}),
		)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Ping failed: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("Received: %v\nDB Status: %v\n", res.Msg.Message, res.Msg.DbStatus)
	},
}

func init() {
	rootCmd.AddCommand(pingCmd)
}
