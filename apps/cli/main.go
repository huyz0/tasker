package main

import "github.com/huyz0/tasker/apps/cli/cmd"

// Stamped by GoReleaser's ldflags at release time (M12-T07), and left at these
// values for a local `go build` — so `tasker --version` on a development build
// says "dev" rather than claiming to be a release that was never cut.
var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	cmd.SetVersion(version, commit, date)
	cmd.Execute()
}
