package cmd

import (
	"os"

	"github.com/spf13/cobra"
)

// rootCmd represents the base command when called without any subcommands
var rootCmd = &cobra.Command{
	Use:   "cli",
	Short: "Manage Tasker organizations, projects, tasks, artifacts, agents, and repository integrations",
	Long: `Tasker CLI - the terminal interface for Tasker, a task-and-knowledge
management system built for AI agents and humans working together.

Use "cli [command] --help" for details on any subcommand, e.g.
"cli tasks --help" or "cli repo --help". Most commands accept --json for
machine-readable output, and read TASKER_BACKEND_URL, TASKER_ORG_ID, and
TASKER_PROJECT_ID from the environment as defaults.`,
	// Every subcommand already prints its own user-facing error message
	// (via cmd.PrintErrf/cmd.Println) before returning the error from RunE,
	// so the usage block cobra would otherwise dump on every RunE failure
	// stays silenced. Cobra's own "Error: ..." line is left enabled since
	// it's what surfaces flag-parsing failures (e.g. unknown flags).
	SilenceUsage: true,
}

// Execute adds all child commands to the root command and sets flags appropriately.
// This is called by main.main(). It only needs to happen once to the rootCmd.
func Execute() {
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().Bool("json", false, "Output in JSON format")
}
