package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	healthv1connect "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
)

var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "Authentication commands",
}

// cliCallbackPort must match the backend's CLI_CALLBACK_PORT constant in
// apps/backend/src/modules/auth/auth.ts - that's where the OAuth callback
// redirects to once a login started with ?cli=true completes.
const cliCallbackPort = 3952

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Login to the Tasker system via Google",
	Run: func(cmd *cobra.Command, args []string) {
		loginURL := fmt.Sprintf("%s/api/auth/google/login?cli=true", backend.URL())
		cmd.Println("Please open this URL to authenticate:")
		cmd.Println(loginURL)
		cmd.Printf("Waiting for callback on localhost:%d... ⏳\n", cliCallbackPort)

		ch := make(chan string, 1)
		mux := http.NewServeMux()
		mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
			token := r.URL.Query().Get("token")
			ch <- token
			fmt.Fprintf(w, "Success! You can close this window now.")
		})

		srv := &http.Server{Addr: fmt.Sprintf(":%d", cliCallbackPort), Handler: mux}
		go srv.ListenAndServe()
		defer srv.Close()

		select {
		case token := <-ch:
			if token == "" {
				cmd.PrintErrln("Authentication failed: no token received.")
				return
			}
			if err := backend.SaveCredentials(token); err != nil {
				cmd.PrintErrf("Logged in, but failed to save credentials: %v\n", err)
				return
			}
			path, _ := backend.CredentialsPath()
			cmd.Printf("Success! Logged in. Credentials saved to %s\n", path)
		case <-time.After(5 * time.Minute):
			cmd.Println("Timeout waiting for authentication.")
		}
	},
}

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Remove the saved session credentials",
	Run: func(cmd *cobra.Command, args []string) {
		if err := backend.ClearCredentials(); err != nil {
			cmd.PrintErrf("Failed to log out: %v\n", err)
			return
		}
		cmd.Println("Logged out.")
	},
}

var whoamiCmd = &cobra.Command{
	Use:   "whoami",
	Short: "Show the currently authenticated user",
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		token, err := backend.LoadCredentials()
		if err != nil {
			cmd.PrintErrf("Failed to read saved credentials: %v\n", err)
			return
		}
		if token == "" {
			cmd.Println("Not logged in. Run `tasker auth login` first.")
			return
		}

		client := healthv1connect.NewAuthServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.GetIdentity(context.Background(), connect.NewRequest(&healthv1.GetIdentityRequest{}))
		if err != nil {
			cmd.PrintErrf("Failed to fetch identity: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.User)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Logged in as %s (%s)\n", res.Msg.User.Name, res.Msg.User.Email)
		}
	},
}

func init() {
	rootCmd.AddCommand(authCmd)
	authCmd.AddCommand(loginCmd)
	authCmd.AddCommand(logoutCmd)
	authCmd.AddCommand(whoamiCmd)
}
