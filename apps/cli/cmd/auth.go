package cmd

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	healthv1connect "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
)

// generateNonce returns a random hex string used to bind this login attempt's
// localhost callback to the login this process actually started - see
// newCallbackHandler.
func generateNonce() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// newCallbackHandler builds the /callback handler for the CLI's local OAuth
// listener. Extracted from loginCmd.Run for testability. Only accepts a
// callback that echoes back the nonce this specific login attempt
// generated - rejects a token an unrelated page might fetch this endpoint
// with, since it can't know a nonce that was never exposed to it.
func newCallbackHandler(nonce string, ch chan<- string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("nonce") != nonce {
			http.Error(w, "Invalid or missing nonce", http.StatusBadRequest)
			return
		}
		token := r.URL.Query().Get("token")
		ch <- token
		fmt.Fprintf(w, "Success! You can close this window now.")
	}
}

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
	RunE: func(cmd *cobra.Command, args []string) error {
		nonce, err := generateNonce()
		if err != nil {
			cmd.PrintErrf("Failed to start login: %v\n", err)
			return err
		}

		loginURL := fmt.Sprintf("%s/api/auth/google/login?cli=true&cliNonce=%s", backend.URL(), nonce)
		cmd.Println("Please open this URL to authenticate:")
		cmd.Println(loginURL)
		cmd.Printf("Waiting for callback on localhost:%d... ⏳\n", cliCallbackPort)

		ch := make(chan string, 1)
		mux := http.NewServeMux()
		mux.HandleFunc("/callback", newCallbackHandler(nonce, ch))

		srv := &http.Server{Addr: fmt.Sprintf(":%d", cliCallbackPort), Handler: mux}
		// Surfaced separately from the callback channel so a bind failure
		// (e.g. another `tasker auth login` already running, or something
		// else holding the port) fails fast instead of silently sitting
		// through the full 5-minute timeout with a listener that never started.
		listenErrCh := make(chan error, 1)
		go func() {
			if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				listenErrCh <- err
			}
		}()
		defer srv.Close()

		select {
		case token := <-ch:
			if token == "" {
				cmd.PrintErrln("Authentication failed: no token received.")
				return errors.New("authentication failed: no token received")
			}
			if err := backend.SaveCredentials(token); err != nil {
				cmd.PrintErrf("Logged in, but failed to save credentials: %v\n", err)
				return err
			}
			path, _ := backend.CredentialsPath()
			cmd.Printf("Success! Logged in. Credentials saved to %s\n", path)
		case err := <-listenErrCh:
			cmd.PrintErrf("Failed to start local callback listener on localhost:%d: %v\n", cliCallbackPort, err)
			return err
		case <-time.After(5 * time.Minute):
			cmd.Println("Timeout waiting for authentication.")
			return errors.New("timeout waiting for authentication")
		}
		return nil
	},
}

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Remove the saved session credentials",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := backend.ClearCredentials(); err != nil {
			cmd.PrintErrf("Failed to log out: %v\n", err)
			return err
		}
		cmd.Println("Logged out.")
		return nil
	},
}

var whoamiCmd = &cobra.Command{
	Use:   "whoami",
	Short: "Show the currently authenticated user",
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		token, err := backend.LoadCredentials()
		if err != nil {
			cmd.PrintErrf("Failed to read saved credentials: %v\n", err)
			return err
		}
		if token == "" {
			cmd.Println("Not logged in. Run `tasker auth login` first.")
			return nil
		}

		client := healthv1connect.NewAuthServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.GetIdentity(context.Background(), connect.NewRequest(&healthv1.GetIdentityRequest{}))
		if err != nil {
			cmd.PrintErrf("Failed to fetch identity: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.User)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Logged in as %s (%s)\n", res.Msg.User.Name, res.Msg.User.Email)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(authCmd)
	authCmd.AddCommand(loginCmd)
	authCmd.AddCommand(logoutCmd)
	authCmd.AddCommand(whoamiCmd)
}
