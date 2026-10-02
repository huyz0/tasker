package cmd

import (
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"connectrpc.com/connect"
	"github.com/huyz0/tasker/apps/cli/internal/backend"

	"github.com/spf13/cobra"
)

// rootCmd represents the base command when called without any subcommands
var rootCmd = &cobra.Command{
	// M12-T08. The binary is `tasker`, and cobra derives `--help`, usage lines
	// and every error message from this — with "cli" here, the tool documented
	// itself under a name that never appears on anyone's disk.
	Use:   "tasker",
	Short: "Manage Tasker organizations, projects, tasks, artifacts, agents, and repository integrations",
	Long: `Tasker CLI - the terminal interface for Tasker, a task-and-knowledge
management system built for AI agents and humans working together.

Use "tasker [command] --help" for details on any subcommand, e.g.
"tasker tasks --help" or "tasker repo --help". Most commands accept --json for
machine-readable output, and read TASKER_BACKEND_URL, TASKER_ORG_ID, and
TASKER_PROJECT_ID from the environment as defaults.`,
	// A command reports failure only by returning an error; runCLI prints it,
	// once, to stderr. Cobra's own printing is off for both usage and errors
	// so nothing reaches the terminal twice (M31-T01).
	SilenceUsage:  true,
	SilenceErrors: true,
}

// SetVersion records the build stamp `main` was compiled with, so
// `tasker --version` reports the release rather than a placeholder (M12-T07).
//
// Set from `main` rather than read here, because the ldflags GoReleaser writes
// have to target the `main` package — a `-X` against this one would be
// silently ignored and the binary would report "dev" forever.
func SetVersion(version, commit, date string) {
	rootCmd.Version = version
	rootCmd.SetVersionTemplate(
		"tasker {{.Version}}\ncommit " + commit + "\nbuilt " + date + "\n",
	)
}

// Execute runs the CLI against the process's own streams and exits with the
// code runCLI chose. Called once, by main.main().
func Execute() {
	os.Exit(runCLI(os.Args[1:], os.Stdout, os.Stderr))
}

// Exit codes (M31-T01). A script driving the CLI needs to know what kind of
// failure it saw - retry, re-authenticate, move on, or stop - without parsing
// a message. Documented in docs/cli-reference.md.
const (
	exitOK          = 0
	exitFailure     = 1
	exitAuth        = 3 // Unauthenticated, PermissionDenied
	exitNotFound    = 4
	exitConflict    = 5 // FailedPrecondition, AlreadyExists, Aborted - e.g. a claim lost
	exitInvalid     = 6 // InvalidArgument, OutOfRange
	exitUnavailable = 7 // Unavailable, ResourceExhausted, DeadlineExceeded - retry later
)

// runCLI is Execute without the exit, so tests can hand it real streams.
//
// Results go to stdout and nothing else does. Every command prints with
// cobra's cmd.Print*, which writes to OutOrStderr() - so until M31 every
// result, --json included, went to stderr, and `$(tasker … --json)` captured
// nothing. Setting the writers here, on the root, fixes all of them at once.
func runCLI(args []string, stdout, stderr io.Writer) int {
	rootCmd.SetOut(stdout)
	rootCmd.SetErr(stderr)
	rootCmd.SetArgs(args)
	err := rootCmd.Execute()
	if err == nil {
		return exitOK
	}
	fmt.Fprintf(stderr, "Error: %s\n", describeError(err))
	return exitCodeFor(err)
}

// describeError is the one line a failure prints. A throttle arrives as
// Unavailable with the transport's text, which reads as "the backend is down"
// when the caller needs to slow down - so it says that instead.
func describeError(err error) string {
	msg := err.Error()
	var connectErr *connect.Error
	if errors.As(err, &connectErr) && connectErr.Code() == connect.CodeUnavailable &&
		strings.Contains(strings.ToLower(connectErr.Message()), "too many requests") {
		msg += " (rate limit exceeded - wait before retrying)"
	}
	return msg
}

func exitCodeFor(err error) int {
	var connectErr *connect.Error
	if !errors.As(err, &connectErr) {
		return exitFailure
	}
	switch connectErr.Code() {
	case connect.CodeUnauthenticated, connect.CodePermissionDenied:
		return exitAuth
	case connect.CodeNotFound:
		return exitNotFound
	case connect.CodeFailedPrecondition, connect.CodeAlreadyExists, connect.CodeAborted:
		return exitConflict
	case connect.CodeInvalidArgument, connect.CodeOutOfRange:
		return exitInvalid
	case connect.CodeUnavailable, connect.CodeResourceExhausted, connect.CodeDeadlineExceeded:
		return exitUnavailable
	default:
		return exitFailure
	}
}

func init() {
	rootCmd.PersistentFlags().Bool("json", false, "Output in JSON format")
	rootCmd.PersistentFlags().String("token", "", "Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)")

	// Read once, before any command runs, rather than in each RunE: every
	// command authenticates, and a flag only some of them consulted would be a
	// flag that silently does nothing on the rest.
	cobra.OnInitialize(func() {
		token, _ := rootCmd.PersistentFlags().GetString("token")
		backend.SetTokenOverride(token)
	})
}
