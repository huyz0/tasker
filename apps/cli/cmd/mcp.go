package cmd

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"

	"github.com/huyz0/tasker/apps/cli/internal/backend"
)

// M36-T04 (ADR-0029). The MCP tools live on the backend at POST /mcp. Some MCP
// clients only launch a command and speak JSON-RPC over its stdin/stdout; this
// relays each message to the endpoint with the CLI's own credential, so the
// tool catalogue exists once, on the server.

const maxMCPMessage = 4 << 20

var mcpCmd = &cobra.Command{
	Use:   "mcp",
	Short: "Serve Tasker's MCP tools over stdio, for MCP clients that launch a command",
	Long: "Relays Model Context Protocol messages between stdin/stdout (newline-delimited JSON-RPC)\n" +
		"and the backend's /mcp endpoint, authenticated as TASKER_TOKEN or the saved login. Point an\n" +
		"MCP client at the command `tasker mcp`; clients that speak HTTP can use <backend>/mcp\n" +
		"directly. Nothing but protocol messages is written to stdout.",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		token, err := backend.ResolveToken()
		if err != nil {
			return fmt.Errorf("failed to load credentials: %w", err)
		}
		if token == "" {
			return connect.NewError(connect.CodeUnauthenticated, errors.New("not logged in - set TASKER_TOKEN to an agent token, or run `tasker auth login`"))
		}
		return relayMCP(cmd.Context(), cmd.InOrStdin(), cmd.OutOrStdout(), strings.TrimRight(backend.URL(), "/")+"/mcp", token, http.DefaultClient)
	},
}

// relayMCP forwards each line of in to endpoint and writes each JSON-RPC
// response to out as one line. A message the server cannot answer with
// JSON-RPC (an unreachable server, a proxy's HTML page) still gets an error
// response when it carried an id, so the client is never left waiting.
func relayMCP(ctx context.Context, in io.Reader, out io.Writer, endpoint, token string, client *http.Client) error {
	if closer, ok := in.(io.ReadCloser); ok {
		stop := context.AfterFunc(ctx, func() { _ = closer.Close() })
		defer stop()
	}
	scanner := bufio.NewScanner(in)
	scanner.Buffer(make([]byte, 64*1024), maxMCPMessage)
	for scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return err
		}
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		var envelope struct {
			ID json.RawMessage `json:"id"`
		}
		_ = json.Unmarshal(line, &envelope)
		hasID := len(envelope.ID) > 0 && string(envelope.ID) != "null"

		reply, err := postMCP(ctx, client, endpoint, token, line)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err != nil {
			if hasID {
				reply = rpcErrorLine(envelope.ID, err.Error())
			} else {
				continue
			}
		}
		if reply == nil {
			continue // a notification: the server had nothing to say
		}
		// The server answers some refusals (401, 413...) before it has read the
		// id; give the client its own id back so it can match the reply.
		if hasID {
			reply = withID(reply, envelope.ID)
		}
		if _, err := out.Write(append(reply, '\n')); err != nil {
			return err
		}
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("failed to read MCP input: %w", err)
	}
	return nil
}

// postMCP returns the compacted JSON-RPC reply, nil for 202 Accepted, or an
// error when the response is not JSON-RPC at all.
func postMCP(ctx context.Context, client *http.Client, endpoint, token string, body []byte) ([]byte, error) {
	ctx, cancel := backend.RequestContext(ctx)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("tasker backend unreachable: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusAccepted {
		return nil, nil
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, maxMCPMessage))
	if err != nil {
		return nil, err
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, raw); err != nil || !bytes.Contains(raw, []byte(`"jsonrpc"`)) {
		return nil, fmt.Errorf("tasker backend answered HTTP %d without a JSON-RPC body", res.StatusCode)
	}
	return compact.Bytes(), nil
}

func withID(reply []byte, id json.RawMessage) []byte {
	var msg map[string]json.RawMessage
	if json.Unmarshal(reply, &msg) != nil {
		return reply
	}
	if existing, ok := msg["id"]; ok && string(existing) != "null" {
		return reply
	}
	msg["id"] = id
	out, err := json.Marshal(msg)
	if err != nil {
		return reply
	}
	return out
}

func rpcErrorLine(id json.RawMessage, message string) []byte {
	out, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"error":   map[string]any{"code": -32603, "message": message},
	})
	return out
}

func init() {
	rootCmd.AddCommand(mcpCmd)
}
