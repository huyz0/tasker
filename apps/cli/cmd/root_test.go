package cmd

import (
	"bytes"
	"strings"
	"testing"
)

func TestRootCommandMetadata(t *testing.T) {
	resetAllFlags(t)
	// The name on disk (M12-T08). Cobra derives every usage line and error
	// message from this, so a mismatch means the tool documents itself under a
	// name nobody has installed.
	if rootCmd.Use != "tasker" {
		t.Errorf("expected rootCmd.Use 'tasker', got %q", rootCmd.Use)
	}
	if rootCmd.Short == "" {
		t.Error("expected rootCmd to have a short description")
	}
	if rootCmd.Long == "" {
		t.Error("expected rootCmd to have a long description")
	}
}

func TestRootCommandLongHelpUsesTheBinaryName(t *testing.T) {
	// The long description spells out example invocations. Left saying "cli",
	// it teaches a command that does not exist.
	resetAllFlags(t)
	if strings.Contains(rootCmd.Long, "\"cli ") {
		t.Errorf("rootCmd.Long still refers to the old binary name:\n%s", rootCmd.Long)
	}
	if !strings.Contains(rootCmd.Long, "tasker [command] --help") {
		t.Error("expected rootCmd.Long to show `tasker [command] --help`")
	}
}

func TestRootCommandHasJsonFlag(t *testing.T) {
	resetAllFlags(t)
	flag := rootCmd.PersistentFlags().Lookup("json")
	if flag == nil {
		t.Error("expected --json persistent flag to be registered on root command")
	}
	if flag.DefValue != "false" {
		t.Errorf("expected --json default value 'false', got %q", flag.DefValue)
	}
}

func TestRootCommandHasExpectedSubcommands(t *testing.T) {
	resetAllFlags(t)
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

func TestSetVersionReportsTheBuildStamp(t *testing.T) {
	// A release binary that says "dev" is one nobody can identify from a bug
	// report. The stamp comes from `main`, because that is the package
	// GoReleaser's `-X` flags can reach.
	resetAllFlags(t)
	previous := rootCmd.Version
	t.Cleanup(func() { rootCmd.Version = previous })

	SetVersion("v1.2.3", "abc1234", "2026-08-22")

	if rootCmd.Version != "v1.2.3" {
		t.Errorf("expected version 'v1.2.3', got %q", rootCmd.Version)
	}

	out := &bytes.Buffer{}
	rootCmd.SetOut(out)
	rootCmd.SetArgs([]string{"--version"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("--version returned an error: %v", err)
	}
	rendered := out.String()
	for _, want := range []string{"tasker v1.2.3", "commit abc1234", "built 2026-08-22"} {
		if !strings.Contains(rendered, want) {
			t.Errorf("expected --version output to contain %q, got:\n%s", want, rendered)
		}
	}
}
