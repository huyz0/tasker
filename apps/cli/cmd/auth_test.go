package cmd

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestAuthCommandMetadata(t *testing.T) {
	if authCmd.Use != "auth" {
		t.Errorf("expected authCmd.Use 'auth', got %q", authCmd.Use)
	}
	if authCmd.Short == "" {
		t.Error("expected authCmd to have a short description")
	}
}

func TestLoginCommandMetadata(t *testing.T) {
	if loginCmd.Use != "login" {
		t.Errorf("expected loginCmd.Use 'login', got %q", loginCmd.Use)
	}
	if loginCmd.Short == "" {
		t.Error("expected loginCmd to have a short description")
	}
	if loginCmd.Run == nil {
		t.Error("expected loginCmd.Run to be defined")
	}
}

func TestAuthCommandRegistration(t *testing.T) {
	// loginCmd must be a sub-command of authCmd
	found := false
	for _, sub := range authCmd.Commands() {
		if sub.Use == "login" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected 'login' to be registered under 'auth'")
	}
}

func TestAuthRegisteredUnderRoot(t *testing.T) {
	found := false
	for _, sub := range rootCmd.Commands() {
		if sub.Use == "auth" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected 'auth' to be registered under root command")
	}
}

func TestSaveCredentialsPersistsTokenToDisk(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	if err := saveCredentials("test-token-123"); err != nil {
		t.Fatalf("expected saveCredentials to succeed, got: %v", err)
	}

	path, err := credentialsPath()
	if err != nil {
		t.Fatalf("expected credentialsPath to succeed, got: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("expected credentials file to exist at %s, got: %v", path, err)
	}
	if info.Mode().Perm() != 0600 {
		t.Errorf("expected credentials file to be 0600, got %o", info.Mode().Perm())
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read credentials file: %v", err)
	}
	var saved map[string]string
	if err := json.Unmarshal(raw, &saved); err != nil {
		t.Fatalf("failed to parse credentials file: %v", err)
	}
	if saved["token"] != "test-token-123" {
		t.Errorf("expected saved token 'test-token-123', got %q", saved["token"])
	}
}

func TestCredentialsPathIsUnderHomeDotTasker(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	path, err := credentialsPath()
	if err != nil {
		t.Fatalf("expected credentialsPath to succeed, got: %v", err)
	}
	expected := filepath.Join(tmpHome, ".tasker", "credentials.json")
	if path != expected {
		t.Errorf("expected path %q, got %q", expected, path)
	}
}
