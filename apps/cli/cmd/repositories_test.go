package cmd

import (
	"bytes"
	"strings"
	"testing"
)

func TestRepoListCmd(t *testing.T) {
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"repo", "list"})
	err := rootCmd.Execute()
	if err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Repository Links:") {
		t.Fatalf("expected output to contain 'Repository Links:', got %s", out)
	}
}

func TestRepoLinkCmd(t *testing.T) {
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.Flags().Set("json", "false")
	rootCmd.SetArgs([]string{"repo", "link", "--provider", "github", "--remote", "test/repo"})
	err := rootCmd.Execute()
	if err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, "Successfully linked github repository: test/repo") {
		t.Fatalf("expected success message, got %s", out)
	}
}
