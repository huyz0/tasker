package cmd

import (
	"testing"
)

func TestAuthLoginCommand(t *testing.T) {
	// Scaffold test verifying the 'auth login' CLI sub-command initialization
	if loginCmd.Use != "login" {
		t.Errorf("Expected command use 'login', got %s", loginCmd.Use)
	}

	if loginCmd.Short == "" {
		t.Error("Expected login command to have a short description")
	}
}
