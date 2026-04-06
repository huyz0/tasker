package cmd

import (
	"bytes"
	"testing"
)

func TestTasksCreateCommand(t *testing.T) {
	rootCmd.AddCommand(tasksCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"tasks", "create", "--title", "UnitTest", "--json"})
	_ = rootCmd.Execute()
	
	output := b.String()
	if len(output) == 0 {
		t.Errorf("Expected JSON output, got empty")
	}
}
