package cmd

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
)

// The work graph (M35, ADR-0028): priority, blockers, parents and where a
// task was discovered.

var priorityNames = []string{"none", "urgent", "high", "medium", "low"}

// invalidArgf is a bad flag value caught before any request: exit 6, the same
// as the server refusing it (M31's exit-code contract).
func invalidArgf(format string, a ...any) error {
	return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf(format, a...))
}

// parsePriority accepts a name (urgent, high, medium, low, none) or 0-4.
func parsePriority(v string) (int32, error) {
	v = strings.ToLower(strings.TrimSpace(v))
	for i, name := range priorityNames {
		if v == name {
			return int32(i), nil
		}
	}
	if n, err := strconv.Atoi(v); err == nil && n >= 0 && n <= 4 {
		return int32(n), nil
	}
	return 0, invalidArgf("invalid priority %q - expected urgent, high, medium, low, none, or 0-4", v)
}

// optionalPriority is nil for an unset --priority flag.
func optionalPriority(cmd *cobra.Command) (*int32, error) {
	if !cmd.Flags().Changed("priority") {
		return nil, nil
	}
	v, _ := cmd.Flags().GetString("priority")
	p, err := parsePriority(v)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func priorityName(p int32) string {
	if p >= 0 && int(p) < len(priorityNames) {
		return priorityNames[p]
	}
	return strconv.Itoa(int(p))
}

// taskLine is one task in a human-readable list: priority and blockers only
// when there is something to say.
func taskLine(t *healthv1.Task) string {
	var extra []string
	if t.Priority != 0 {
		extra = append(extra, priorityName(t.Priority))
	}
	if t.BlockedByOpenCount > 0 {
		extra = append(extra, fmt.Sprintf("blocked by %d", t.BlockedByOpenCount))
	}
	suffix := ""
	if len(extra) > 0 {
		suffix = " {" + strings.Join(extra, ", ") + "}"
	}
	return fmt.Sprintf("%s [%s]: %s%s (id: %s)", t.DisplayId, t.Status, t.Title, suffix, t.Id)
}

var linkKinds = map[string]string{"blocked-by": "blocked_by", "discovered-from": "discovered_from"}

func linkKind(cmd *cobra.Command) (string, error) {
	v, _ := cmd.Flags().GetString("kind")
	if k, ok := linkKinds[v]; ok {
		return k, nil
	}
	return "", invalidArgf("invalid --kind %q - expected blocked-by or discovered-from", v)
}

var tasksLinkCmd = &cobra.Command{
	Use:   "link",
	Short: "Blocking and discovered-from links between tasks",
}

var tasksLinkAddCmd = &cobra.Command{
	Use:   "add [task_id] [linked_task_id]",
	Short: "Record that a task is blocked by (or was discovered from) another",
	Long: "With --kind blocked-by (the default), task_id cannot be claimed by claim-next until\n" +
		"linked_task_id is finished. With --kind discovered-from, task_id records the task whose\n" +
		"work turned it up. Adding an existing link succeeds.",
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		kind, err := linkKind(cmd)
		if err != nil {
			return err
		}
		res, err := backend.NewTaskServiceClient().AddTaskLink(context.Background(), connect.NewRequest(&healthv1.AddTaskLinkRequest{
			TaskId: args[0], LinkedTaskId: args[1], Kind: kind,
		}))
		if err != nil {
			return fmt.Errorf("failed to link tasks: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Linked %s %s %s\n", args[0], strings.ReplaceAll(kind, "_", " "), args[1])
		return nil
	},
}

var tasksLinkRemoveCmd = &cobra.Command{
	Use:   "remove [task_id] [linked_task_id]",
	Short: "Remove a blocking or discovered-from link",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		kind, err := linkKind(cmd)
		if err != nil {
			return err
		}
		res, err := backend.NewTaskServiceClient().RemoveTaskLink(context.Background(), connect.NewRequest(&healthv1.RemoveTaskLinkRequest{
			TaskId: args[0], LinkedTaskId: args[1], Kind: kind,
		}))
		if err != nil {
			return fmt.Errorf("failed to unlink tasks: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		cmd.Printf("Unlinked %s from %s\n", args[0], args[1])
		return nil
	},
}

// printRelations writes a task's relations, one section per kind that has
// any; it reports whether there were any at all.
func printRelations(cmd *cobra.Command, m *healthv1.ListTaskLinksResponse) bool {
	section := func(title string, refs []*healthv1.TaskRef) {
		if len(refs) == 0 {
			return
		}
		cmd.Printf("%s:\n", title)
		for _, r := range refs {
			state := r.Status
			if r.Terminal {
				state += ", finished"
			}
			cmd.Printf("  - %s [%s]: %s (id: %s)\n", r.DisplayId, state, r.Title, r.Id)
		}
	}
	one := func(r *healthv1.TaskRef) []*healthv1.TaskRef {
		if r == nil {
			return nil
		}
		return []*healthv1.TaskRef{r}
	}
	section("Parent", one(m.Parent))
	section("Blocked by", m.BlockedBy)
	section("Blocks", m.Blocks)
	section("Subtasks", m.Children)
	section("Discovered from", one(m.DiscoveredFrom))
	section("Discovered", m.Discovered)
	return m.Parent != nil || m.DiscoveredFrom != nil || len(m.BlockedBy)+len(m.Blocks)+len(m.Children)+len(m.Discovered) > 0
}

var tasksLinkListCmd = &cobra.Command{
	Use:   "list [task_id]",
	Short: "Show a task's blockers, dependents, parent, subtasks and origin",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		res, err := backend.NewTaskServiceClient().ListTaskLinks(context.Background(), connect.NewRequest(&healthv1.ListTaskLinksRequest{TaskId: args[0]}))
		if err != nil {
			return fmt.Errorf("failed to list task links: %w", err)
		}
		if wantsJSON(cmd) {
			return printJSON(cmd, res.Msg)
		}
		if !printRelations(cmd, res.Msg) {
			cmd.PrintErrln("No links.")
		}
		return nil
	},
}

func init() {
	tasksCmd.AddCommand(tasksLinkCmd)
	tasksLinkCmd.AddCommand(tasksLinkAddCmd, tasksLinkRemoveCmd, tasksLinkListCmd)
	for _, c := range []*cobra.Command{tasksLinkAddCmd, tasksLinkRemoveCmd} {
		c.Flags().String("kind", "blocked-by", "blocked-by or discovered-from")
	}
}

// optionalBool is nil for an unset flag.
func optionalBool(cmd *cobra.Command, name string) *bool {
	if !cmd.Flags().Changed(name) {
		return nil
	}
	v, _ := cmd.Flags().GetBool(name)
	return &v
}
