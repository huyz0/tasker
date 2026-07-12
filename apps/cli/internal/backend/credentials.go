package backend

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// CredentialsPath returns the path where the CLI persists its session token.
// This is a plain file, not an OS keychain - the CLI has no keychain
// integration today, so callers should not claim otherwise.
func CredentialsPath() (string, error) {
	if v := os.Getenv("TASKER_CREDENTIALS_PATH"); v != "" {
		return v, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("could not determine home directory: %w", err)
	}
	return filepath.Join(home, ".tasker", "credentials.json"), nil
}

type credentials struct {
	Token string `json:"token"`
}

// SaveCredentials persists the session token to disk with owner-only permissions.
func SaveCredentials(token string) error {
	path, err := CredentialsPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("failed to create credentials directory: %w", err)
	}
	data, err := json.Marshal(credentials{Token: token})
	if err != nil {
		return fmt.Errorf("failed to encode credentials: %w", err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("failed to write credentials file: %w", err)
	}
	return nil
}

// LoadCredentials reads the saved session token, if any. It returns an empty
// string (no error) when no credentials file exists, since being logged out
// is a normal state, not a failure.
func LoadCredentials() (string, error) {
	path, err := CredentialsPath()
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("failed to read credentials file: %w", err)
	}
	var creds credentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return "", fmt.Errorf("failed to parse credentials file: %w", err)
	}
	return creds.Token, nil
}

// ClearCredentials removes the saved session token. Removing an already-absent
// file is not an error - logging out twice should be a no-op, not a failure.
func ClearCredentials() error {
	path, err := CredentialsPath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove credentials file: %w", err)
	}
	return nil
}
