package cmd

import (
	"bytes"
	"testing"
	"strings"
)

// Maps to TC-006 from TEST-PLAN.md: CLI - Artifacts command
func TestArtifactsListCommandIntegration(t *testing.T) {
	rootCmd.AddCommand(artifactsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"artifacts", "list", "--project", "test-123", "--json"})
	_ = rootCmd.Execute()
	
	output := b.String()
	if !strings.Contains(output, "env-vars.md") {
		t.Errorf("Expected artifact output to contain env-vars.md, got %s", output)
	}
}
