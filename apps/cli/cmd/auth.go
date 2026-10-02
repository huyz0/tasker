package cmd

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
	"golang.org/x/term"
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

// M13-T13. passwordLoginResponse mirrors POST /api/auth/password/login's
// success body (apps/backend/src/modules/auth/auth.ts). The session token
// itself is never in this body - only in the Set-Cookie header, the same
// way the browser flow gets one - so callers must read it off
// http.Response.Cookies(), not this struct.
type passwordLoginResponse struct {
	UserID             string `json:"userId"`
	MustChangePassword bool   `json:"mustChangePassword"`
}

// problemDetailsBody mirrors the RFC 7807 error body every
// /api/auth/password/* failure returns (lib/problemDetails.ts on the
// backend), including a locked-account 429 (rateLimitProblem) - both
// shapes carry the same title/detail/status fields.
type problemDetailsBody struct {
	Title  string `json:"title"`
	Detail string `json:"detail"`
	Status int    `json:"status"`
}

// loginWithPassword posts credentials to the backend's local password login
// route and returns the session token plus mustChangePassword. Explicit
// params rather than package globals, mirroring runDebugSession's shape
// (debug.go) - this is what makes it testable against an httptest server
// without touching global backend.URL()/http.DefaultClient state.
func loginWithPassword(httpClient *http.Client, serverURL, username, password string) (token string, mustChangePassword bool, err error) {
	payload, err := json.Marshal(map[string]string{"username": username, "password": password})
	if err != nil {
		return "", false, err
	}

	req, err := http.NewRequest(http.MethodPost, serverURL+"/api/auth/password/login", bytes.NewReader(payload))
	if err != nil {
		return "", false, err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := httpClient.Do(req)
	if err != nil {
		return "", false, fmt.Errorf("could not reach backend: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		var problem problemDetailsBody
		if json.Unmarshal(body, &problem) == nil && problem.Detail != "" {
			return "", false, errors.New(problem.Detail)
		}
		return "", false, fmt.Errorf("backend returned status %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}

	var result passwordLoginResponse
	if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
		return "", false, fmt.Errorf("unexpected response from backend: %w", err)
	}

	for _, c := range res.Cookies() {
		if c.Name == "session" {
			return c.Value, result.MustChangePassword, nil
		}
	}
	return "", false, errors.New("login succeeded but no session cookie was returned")
}

// readLine reads one line from a plain (non-terminal) reader - the
// fallback path for piped stdin (e.g. a script, or a test), extracted as
// its own function so it can be tested hermetically against a
// strings.Reader instead of the real os.Stdin, which a test process
// generally has attached to something that never produces a line to read
// (blocking indefinitely) rather than an immediate EOF.
func readLine(in io.Reader) (string, error) {
	line, err := bufio.NewReader(in).ReadString('\n')
	line = strings.TrimRight(line, "\r\n")
	if err == io.EOF && line != "" {
		// The stream closed right after the line with no trailing
		// newline - still a real line, not a failure to read one.
		return line, nil
	}
	return line, err
}

// promptSecret reads one line from stdin without echoing it - a masked
// prompt isn't a stdlib one-liner across platforms, which is why
// golang.org/x/term is this milestone's one new CLI dependency (recorded
// in tech-stack.md). Falls back to readLine on stdin when it isn't a real
// terminal (e.g. piped input in a script), since term.ReadPassword fails
// outright on a non-terminal file descriptor.
func promptSecret(out io.Writer, prompt string) (string, error) {
	fmt.Fprint(out, prompt)
	if term.IsTerminal(int(os.Stdin.Fd())) {
		b, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(out)
		return string(b), err
	}
	line, err := readLine(os.Stdin)
	return line, err
}

// runPasswordLogin is loginCmd's local-account path, split out for testing
// the same way loginCmd's Google-OAuth path already is via
// newCallbackHandler.
func runPasswordLogin(cmd *cobra.Command, username, password string) error {
	if password == "" {
		var err error
		password, err = promptSecret(cmd.ErrOrStderr(), "Password: ")
		if err != nil {
			return fmt.Errorf("failed to read password: %w", err)
		}
	}
	if password == "" {
		return errors.New("password is required")
	}

	token, mustChangePassword, err := loginWithPassword(http.DefaultClient, backend.URL(), username, password)
	if err != nil {
		return fmt.Errorf("login failed: %w", err)
	}
	if err := backend.SaveCredentials(token); err != nil {
		return fmt.Errorf("logged in, but failed to save credentials: %w", err)
	}
	path, _ := backend.CredentialsPath()
	cmd.Printf("Success! Logged in. Credentials saved to %s\n", path)
	if mustChangePassword {
		cmd.Println("Your password was reset by an admin - run `tasker auth set-password` before continuing.")
	}
	return nil
}

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Login to the Tasker system via Google, or a local username and password",
	RunE: func(cmd *cobra.Command, args []string) error {
		// M13-T13. --username selects the local-account path entirely -
		// there is nothing to disambiguate against the Google flow below,
		// since Google login never takes flags at all.
		username, _ := cmd.Flags().GetString("username")
		if username != "" {
			password, _ := cmd.Flags().GetString("password")
			return runPasswordLogin(cmd, username, password)
		}

		nonce, err := generateNonce()
		if err != nil {
			return fmt.Errorf("failed to start login: %w", err)
		}

		loginURL := fmt.Sprintf("%s/api/auth/google/login?cli=true&cliNonce=%s", backend.URL(), nonce)
		// Guidance, not output: stderr, so a captured stdout holds only results.
		cmd.PrintErrln("Please open this URL to authenticate:")
		cmd.PrintErrln(loginURL)
		cmd.PrintErrf("Waiting for callback on localhost:%d...\n", cliCallbackPort)

		ch := make(chan string, 1)
		mux := http.NewServeMux()
		mux.HandleFunc("/callback", newCallbackHandler(nonce, ch))

		// Loopback only (M31-T05): the callback carries a session token, and
		// ":port" listened on every interface the machine has.
		srv := &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", cliCallbackPort), Handler: mux}
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
				return errors.New("authentication failed: no token received")
			}
			if err := backend.SaveCredentials(token); err != nil {
				return fmt.Errorf("logged in, but failed to save credentials: %w", err)
			}
			path, _ := backend.CredentialsPath()
			cmd.Printf("Success! Logged in. Credentials saved to %s\n", path)
		case err := <-listenErrCh:
			return fmt.Errorf("failed to start local callback listener on localhost:%d: %w", cliCallbackPort, err)
		case <-time.After(5 * time.Minute):
			return errors.New("timeout waiting for authentication")
		}
		return nil
	},
}

// M13-T13. setPasswordCmd is the CLI-only counterpart of the GUI's account
// settings password form (AccountSettings.tsx) - without it, a CLI-only
// user who registered locally, or whose password an admin reset
// (mustChangePassword), would have no way to ever change one. Uses
// AuthService.SetPassword directly (a real ConnectRPC method, unlike
// login), the same client construction whoamiCmd already uses.
var setPasswordCmd = &cobra.Command{
	Use:   "set-password",
	Short: "Set or change your local password",
	RunE: func(cmd *cobra.Command, args []string) error {
		currentPassword, _ := cmd.Flags().GetString("current-password")
		newPassword, _ := cmd.Flags().GetString("new-password")
		if newPassword == "" {
			var err error
			newPassword, err = promptSecret(cmd.ErrOrStderr(), "New password: ")
			if err != nil {
				return fmt.Errorf("failed to read new password: %w", err)
			}
		}
		if newPassword == "" {
			return errors.New("new password is required")
		}

		client := backend.NewAuthServiceClient()
		res, err := client.SetPassword(context.Background(), connect.NewRequest(&healthv1.SetPasswordRequest{
			CurrentPassword: currentPassword,
			NewPassword:     newPassword,
		}))
		if err != nil {
			return fmt.Errorf("failed to set password: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Println("Password updated.")
		return nil
	},
}

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Remove the saved session credentials",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := backend.ClearCredentials(); err != nil {
			return fmt.Errorf("failed to log out: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSONValue(cmd, map[string]any{"success": true})
		}
		cmd.Println("Logged out.")
		return nil
	},
}

// errNotLoggedIn is an authentication failure, so it exits 3 like any other:
// "not logged in" used to print and exit 0, which a script read as success.
var errNotLoggedIn = connect.NewError(connect.CodeUnauthenticated,
	errors.New("not logged in - run `tasker auth login`, or pass --token / set TASKER_TOKEN"))

var whoamiCmd = &cobra.Command{
	Use:   "whoami",
	Short: "Show the currently authenticated user",
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		// The credential every other command would use - --token, then
		// TASKER_TOKEN, then the saved session - not the saved session alone,
		// which made whoami say "not logged in" to an agent holding a token.
		token, err := backend.ResolveToken()
		if err != nil {
			return fmt.Errorf("failed to read saved credentials: %w", err)
		}
		if token == "" {
			return errNotLoggedIn
		}

		client := backend.NewAuthServiceClient()
		res, err := client.GetIdentity(context.Background(), connect.NewRequest(&healthv1.GetIdentityRequest{}))
		if err != nil {
			return fmt.Errorf("failed to fetch identity: %w", err)
		}

		if isJson {
			if err := printJSON(cmd, res.Msg); err != nil {
				return err
			}
		} else if a := res.Msg.Agent; a != nil {
			// M33-T05: an agent token answers with the agent, not a user.
			cmd.Printf("Agent %s (%s) in organization %s\nScopes: %s\n", a.Name, a.Id, a.OrgId, strings.Join(a.Scopes, ", "))
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
	authCmd.AddCommand(setPasswordCmd)

	loginCmd.Flags().String("username", "", "Local username - logs in with a password instead of Google")
	loginCmd.Flags().String("password", "", "Password for --username (prompted, masked, if omitted)")
	setPasswordCmd.Flags().String("current-password", "", "Required if the account already has a password")
	setPasswordCmd.Flags().String("new-password", "", "Prompted, masked, if omitted")
}
