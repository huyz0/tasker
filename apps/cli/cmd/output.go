package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
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

// --page-all (M31-T04). Every list RPC takes a `page` request field and
// answers with a `page.nextCursor`; these helpers find both by reflection, so
// one implementation serves every list command instead of eighteen copies.

// pageAllRequested reports whether --page-all was passed.
func pageAllRequested(cmd *cobra.Command) bool {
	v, _ := cmd.Flags().GetBool("page-all")
	return v
}

// setPageCursor sets `page.cursor` on a list request, creating `page` if the
// request has none yet.
func setPageCursor(req proto.Message, cursor string) {
	msg := req.ProtoReflect()
	pageField := msg.Descriptor().Fields().ByName("page")
	if pageField == nil {
		return
	}
	page := msg.Mutable(pageField).Message()
	if cursorField := page.Descriptor().Fields().ByName("cursor"); cursorField != nil {
		page.Set(cursorField, protoreflect.ValueOfString(cursor))
	}
}

// pageItems returns a list response's items - its one repeated message field -
// and its next cursor ("" on the last page).
func pageItems(res proto.Message) ([]proto.Message, string) {
	msg := res.ProtoReflect()
	var items []proto.Message
	next := ""
	fields := msg.Descriptor().Fields()
	for i := 0; i < fields.Len(); i++ {
		f := fields.Get(i)
		switch {
		case f.IsList() && f.Kind() == protoreflect.MessageKind:
			list := msg.Get(f).List()
			for j := 0; j < list.Len(); j++ {
				items = append(items, list.Get(j).Message().Interface())
			}
		case f.Name() == "page" && f.Kind() == protoreflect.MessageKind && msg.Has(f):
			page := msg.Get(f).Message()
			if c := page.Descriptor().Fields().ByName("next_cursor"); c != nil {
				next = page.Get(c).String()
			}
		}
	}
	return items, next
}

// maxPages bounds --page-all against a server that never stops handing out
// cursors. At the backend's 100-item page cap it is a million items.
const maxPages = 10_000

// pageAll fetches page after page, starting from the --cursor the caller
// passed, and writes every item as one JSON object per line (NDJSON) - so a
// script can stream an unbounded list without holding it, and `jq -c`,
// `wc -l` and `head` all work on it.
func pageAll(cmd *cobra.Command, req proto.Message, fetch func() (proto.Message, error)) error {
	cursor, _ := cmd.Flags().GetString("cursor")
	seen := map[string]bool{}
	for page := 0; page < maxPages; page++ {
		setPageCursor(req, cursor)
		res, err := fetch()
		if err != nil {
			return fmt.Errorf("failed to fetch page %d: %w", page+1, err)
		}
		items, next := pageItems(res)
		for _, item := range items {
			line, err := encodeJSON(item)
			if err != nil {
				return err
			}
			cmd.Println(line)
		}
		if next == "" {
			return nil
		}
		if seen[next] {
			return fmt.Errorf("the server returned cursor %q twice; stopping rather than looping", next)
		}
		seen[next] = true
		cursor = next
	}
	return fmt.Errorf("stopped after %d pages", maxPages)
}

// printNextPageHint ends a text listing by naming the next page, which the
// text output never mentioned (M31-T03): a listing that silently stopped at
// its page size read as the whole list.
func printNextPageHint(cmd *cobra.Command, res proto.Message) {
	if wantsJSON(cmd) {
		return // the cursor is already in the JSON, and stdout must stay one document
	}
	if _, next := pageItems(res); next != "" {
		cmd.Printf("\nMore results: rerun with --cursor %s (or --page-all)\n", next)
	}
}
