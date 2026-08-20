package cmd

import (
	"strings"
	"testing"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

// resetAllFlags restores every flag on the whole command tree to its declared
// default, before the test runs and again after it.
//
// Every command in this package is a package-level `var xCmd = &cobra.Command{}`
// singleton, so its flag values outlive any single test. Cobra also never
// clears `Changed` once set, so `Set(name, "")` alone is not enough — a flag
// can hold its default value while still reporting that the user supplied it.
//
// The failure this prevents is not theoretical, and it is not always a stale
// boolean. Under `go test -shuffle=on`, a test that ran
// `artifacts create --file <t.TempDir()>/logo.png` left that path on
// `artifactsCreateCmd`; the next test to run `artifacts create` without
// `--file` inherited it, tried to read a temp directory the earlier test had
// already cleaned up, and failed with "no such file or directory" naming a
// *different* test's temp dir. Eight tests failed that way. Three narrower
// helpers (resetTokenFlags, resetJSONFlag, resetHandoffsProjectFlag) each
// reset a hand-listed subset, which is inherently incomplete: every new flag
// has to be remembered in the right helper.
//
// The cleanup pass matters as much as the pre-test pass. Tests attach their
// subtree with `rootCmd.AddCommand(...)` *after* setup runs, so a command may
// not be reachable from the root when this is first called — but it always is
// by the time the test finishes, which is what makes the next test start clean.
func resetAllFlags(t *testing.T) {
	t.Helper()
	resetCommandTree(rootCmd)
	t.Cleanup(func() { resetCommandTree(rootCmd) })
}

// resetCommandTree walks `cmd` and every descendant, restoring both local and
// persistent flag sets.
//
// Slice flags need `Replace`, not `Set`. A pflag slice value appends on every
// Set after the first, and renders its default as "[]" / "[a,b]" — text its
// own parser does not read back. Calling Set(DefValue) on `--scope` therefore
// appended a literal "[]" element per reset, and the accumulated garbage
// showed up as a request carrying three hundred empty scopes. Replace writes
// the whole slice at once and is the only correct reset for these.
func resetCommandTree(cmd *cobra.Command) {
	restore := func(f *pflag.Flag) {
		if sv, ok := f.Value.(pflag.SliceValue); ok {
			sv.Replace(defaultSliceOf(f.DefValue))
		} else {
			_ = f.Value.Set(f.DefValue)
		}
		f.Changed = false
	}
	cmd.Flags().VisitAll(restore)
	cmd.PersistentFlags().VisitAll(restore)
	for _, child := range cmd.Commands() {
		resetCommandTree(child)
	}
}

// defaultSliceOf turns pflag's rendered slice default ("[]", "[a,b]") back
// into the elements it stands for. Empty stays nil rather than []string{""},
// which a naive Split would produce and which reads downstream as one empty
// element instead of no elements.
func defaultSliceOf(defValue string) []string {
	trimmed := strings.TrimSuffix(strings.TrimPrefix(defValue, "["), "]")
	if trimmed == "" {
		return nil
	}
	return strings.Split(trimmed, ",")
}
