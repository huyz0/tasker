package cmd

import (
	"bytes"
	"testing"
	"strings"
)

// Maps to TC-007 from TEST-PLAN.md: CLI - Agent predictability via strict JSON
func TestProjectsCreateRejectsUnknownFlags(t *testing.T) {
	rootCmd.AddCommand(projectsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetErr(b)
	
	// Agent hallucinating an unknown flag `--extra-data`
	rootCmd.SetArgs([]string{"projects", "create", "--json", "--title", "foo", "--extra-data", "bad"})
	err := rootCmd.Execute()
	
	if err == nil {
		t.Errorf("Expected CLI to hard reject unknown flags for agent determinism, but command succeeded")
	}
	
	output := b.String()
	if !strings.Contains(output, "unknown flag: --extra-data") {
		t.Errorf("Expected rejection due to unknown flag, got output: %s", output)
	}
}
