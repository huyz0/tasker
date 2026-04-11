package cmd

import (
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
