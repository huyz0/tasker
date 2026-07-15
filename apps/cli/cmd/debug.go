package cmd

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/huyz0/tasker/apps/cli/internal/backend"
)

var debugCmd = &cobra.Command{
	Use:   "debug",
	Short: "Debugging helpers for local development",
}

// decodedSessionPayload mirrors the backend's SessionPayload shape
// (apps/backend/src/modules/auth/session.ts) - decoded locally from the
// token itself, without verifying its signature (the CLI has no access to
// JWT_SECRET). This is "what the token claims", not "what the server will
// accept" - the latter requires the /api/auth/session round-trip below.
type decodedSessionPayload struct {
	UserID string `json:"userId"`
	Exp    int64  `json:"exp"`
	Jti    string `json:"jti"`
}

// decodeSessionToken parses the base64url-encoded payload segment of a
// session token (format: <payload>.<signature>) without verifying the
// signature.
func decodeSessionToken(token string) (*decodedSessionPayload, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return nil, fmt.Errorf("not a valid session token: expected <payload>.<signature>")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("failed to decode token payload: %w", err)
	}
	var payload decodedSessionPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("failed to parse token payload: %w", err)
	}
	return &payload, nil
}

// sessionStatusResponse mirrors GET /api/auth/session's response shape.
type sessionStatusResponse struct {
	Authenticated bool    `json:"authenticated"`
	UserID        *string `json:"userId"`
}

// checkSessionWithServer asks the backend whether this token currently
// authenticates - the only way to know if it's actually valid: signature
// verification requires JWT_SECRET (which the CLI never has), and even a
// well-signed, unexpired token may have been revoked since issuance (see
// OBS-14's revokedSessions table).
func checkSessionWithServer(httpClient *http.Client, serverURL string, token string) (*sessionStatusResponse, error) {
	req, err := http.NewRequest(http.MethodGet, serverURL+"/api/auth/session", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	res, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("could not reach backend: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("backend returned status %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}

	var status sessionStatusResponse
	if err := json.NewDecoder(res.Body).Decode(&status); err != nil {
		return nil, fmt.Errorf("unexpected response from backend: %w", err)
	}
	return &status, nil
}

// runDebugSession is the extracted, testable command logic.
func runDebugSession(w io.Writer, httpClient *http.Client, serverURL string, token string) error {
	if token == "" {
		return fmt.Errorf("no token provided and no saved credentials found - pass a token or run `tasker auth login` first")
	}

	payload, decodeErr := decodeSessionToken(token)
	if decodeErr != nil {
		fmt.Fprintf(w, "Could not decode token locally: %v\n", decodeErr)
	} else {
		expiresAt := time.UnixMilli(payload.Exp)
		expiryNote := "valid"
		if time.Now().After(expiresAt) {
			expiryNote = "EXPIRED"
		}
		fmt.Fprintf(w, "Decoded claims (unverified - signature not checked locally):\n")
		fmt.Fprintf(w, "  userId: %s\n", payload.UserID)
		fmt.Fprintf(w, "  jti:    %s\n", payload.Jti)
		fmt.Fprintf(w, "  exp:    %s (%s)\n", expiresAt.Format(time.RFC3339), expiryNote)
	}

	status, err := checkSessionWithServer(httpClient, serverURL, token)
	if err != nil {
		return err
	}

	fmt.Fprintf(w, "\nServer-side validation (checks signature, expiry, and revocation):\n")
	if status.Authenticated {
		userID := ""
		if status.UserID != nil {
			userID = *status.UserID
		}
		fmt.Fprintf(w, "  VALID - authenticates as %s\n", userID)
	} else {
		fmt.Fprintf(w, "  INVALID - rejected by the server (expired, revoked, or malformed)\n")
	}
	return nil
}

var debugSessionCmd = &cobra.Command{
	Use:   "session [token]",
	Short: "Decode and validate a session token",
	Long: "Decodes a session token's claims locally and checks with the backend whether it's\n" +
		"currently valid (not expired, not revoked). Defaults to the saved CLI credentials\n" +
		"if no token is given.",
	Args: cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		token := ""
		if len(args) == 1 {
			token = args[0]
		} else {
			saved, err := backend.LoadCredentials()
			if err != nil {
				fmt.Fprintf(os.Stderr, "Failed to read saved credentials: %v\n", err)
				os.Exit(1)
			}
			token = saved
		}

		if err := runDebugSession(os.Stdout, http.DefaultClient, backend.URL(), token); err != nil {
			fmt.Fprintf(os.Stderr, "%v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	rootCmd.AddCommand(debugCmd)
	debugCmd.AddCommand(debugSessionCmd)
}
