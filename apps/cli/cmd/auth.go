package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"
)

var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "Authentication commands",
}

// credentialsPath returns the path where the CLI persists its session token.
func credentialsPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("could not determine home directory: %w", err)
	}
	return filepath.Join(home, ".tasker", "credentials.json"), nil
}

// saveCredentials persists the session token to disk with owner-only
// permissions. This is a plain file, not an OS keychain - the CLI has no
// keychain integration today, so callers should not claim otherwise.
func saveCredentials(token string) error {
	path, err := credentialsPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("failed to create credentials directory: %w", err)
	}
	data, err := json.Marshal(map[string]string{"token": token})
	if err != nil {
		return fmt.Errorf("failed to encode credentials: %w", err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("failed to write credentials file: %w", err)
	}
	return nil
}

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Login to the Tasker system via Google",
	Run: func(cmd *cobra.Command, args []string) {
		// Scaffold: Start local HTTP server to catch OAuth callback.
		// NOTE: the backend's current Google OAuth callback sets a
		// browser session cookie and redirects to "/" - it does not yet
		// redirect to a localhost callback with a token, so this command
		// cannot actually complete today. It's left wired up (rather than
		// removed) so the shape is ready once that backend support exists.
		cmd.Println("Please open this URL to authenticate:")
		cmd.Println("http://localhost:3000/api/auth/google/login?cli=true")
		cmd.Println("Waiting for callback on localhost:3952... ⏳")

		ch := make(chan string)
		http.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
			token := r.URL.Query().Get("token")
			ch <- token
			fmt.Fprintf(w, "Success! You can close this window now.")
		})

		srv := &http.Server{Addr: ":3952"}
		go srv.ListenAndServe()

		select {
		case token := <-ch:
			if token == "" {
				cmd.PrintErrln("Authentication failed: no token received.")
				srv.Close()
				return
			}
			if err := saveCredentials(token); err != nil {
				cmd.PrintErrf("Logged in, but failed to save credentials: %v\n", err)
				srv.Close()
				return
			}
			path, _ := credentialsPath()
			cmd.Printf("Success! Logged in. Credentials saved to %s\n", path)
			srv.Close()
		case <-time.After(5 * time.Minute):
			cmd.Println("Timeout waiting for authentication.")
			srv.Close()
		}
	},
}

func init() {
	rootCmd.AddCommand(authCmd)
	authCmd.AddCommand(loginCmd)
}
