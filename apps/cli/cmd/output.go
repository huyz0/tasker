package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// jsonOut is the one JSON shape every command emits (M31-T02).
//
// `encoding/json` on generated protobuf structs produced whatever the struct
// tags said - `project_id` beside `deletedAt` - and its `omitempty` dropped
// `false` and `0`, so a field's presence depended on its value. protojson
// gives the canonical proto3 JSON mapping: lowerCamelCase names, every
// non-optional field present, 64-bit integers as strings. It is the same
// shape the backend speaks on the wire, so a script can read a CLI response
// and an RPC response with the same code.
var jsonOut = protojson.MarshalOptions{EmitUnpopulated: true}

// printJSON writes a whole RPC response. Whole, not one field of it: a list
// response carries `page.nextCursor` beside its items, and printing only the
// items is what used to strand every agent on page one.
func printJSON(cmd *cobra.Command, m proto.Message) error {
	line, err := encodeJSON(m)
	if err != nil {
		return err
	}
	cmd.Println(line)
	return nil
}

// encodeJSON renders a message as one compact line. protojson randomizes its
// whitespace on purpose, so nobody byte-compares its output; a CLI's output is
// compared, diffed and grepped, so it is compacted to one stable line.
func encodeJSON(m proto.Message) (string, error) {
	b, err := jsonOut.Marshal(m)
	if err != nil {
		return "", fmt.Errorf("failed to encode response: %w", err)
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, b); err != nil {
		return "", fmt.Errorf("failed to encode response: %w", err)
	}
	return compact.String(), nil
}

// printJSONValue writes a value that is not a protobuf message - the small
// `{"success": true, "taskId": …}` acknowledgements some mutations print.
// Keys are lowerCamelCase to match printJSON.
func printJSONValue(cmd *cobra.Command, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("failed to encode response: %w", err)
	}
	cmd.Println(string(b))
	return nil
}

// wantsJSON reports whether --json was passed. Read through the command, not
// a package variable, because --json is a persistent flag on the root.
func wantsJSON(cmd *cobra.Command) bool {
	v, _ := cmd.Flags().GetBool("json")
	return v
}
