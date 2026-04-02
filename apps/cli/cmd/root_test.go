package cmd

import (
	"testing"
)

func TestRootCommandMetadata(t *testing.T) {
	if rootCmd.Use != "cli" {
		t.Errorf("expected rootCmd.Use 'cli', got %q", rootCmd.Use)
	}
	if rootCmd.Short == "" {
		t.Error("expected rootCmd to have a short description")
	}
	if rootCmd.Long == "" {
		t.Error("expected rootCmd to have a long description")
	}
}

func TestRootCommandHasToggleFlag(t *testing.T) {
	flag := rootCmd.Flags().Lookup("toggle")
	if flag == nil {
		t.Error("expected --toggle flag to be registered on root command")
	}
	if flag.DefValue != "false" {
		t.Errorf("expected --toggle default value 'false', got %q", flag.DefValue)
	}
}

func TestRootCommandHasExpectedSubcommands(t *testing.T) {
	names := make(map[string]bool)
	for _, sub := range rootCmd.Commands() {
		names[sub.Use] = true
	}

	expected := []string{"ping", "auth"}
	for _, name := range expected {
		if !names[name] {
			t.Errorf("expected subcommand %q to be registered under root", name)
		}
	}
}
