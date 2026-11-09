package cmd

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/huyz0/tasker/apps/cli/internal/backend"
)

func TestMCPTimeoutDoesNotEndTheSessionOrIdleInput(t *testing.T) {
	resetAllFlags(t)
	if err := backend.SetRequestTimeout(50 * time.Millisecond); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var message struct{ ID int }
		_ = json.NewDecoder(r.Body).Decode(&message)
		if message.ID == 1 {
			<-r.Context().Done()
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"jsonrpc":"2.0","id":2,"result":{"ok":true}}`)
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	input, send := io.Pipe()
	output, receive := io.Pipe()
	defer input.Close()
	defer send.Close()
	defer output.Close()
	finished := make(chan error, 1)
	go func() {
		finished <- relayMCP(ctx, input, receive, server.URL, "fixture-token", server.Client())
		_ = receive.Close()
	}()
	reader := bufio.NewReader(output)
	_, _ = io.WriteString(send, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}\n")
	first, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("timed-out request did not produce a protocol reply: %v", err)
	}
	var failure map[string]any
	if json.Unmarshal([]byte(first), &failure) != nil || failure["id"] != float64(1) || failure["error"] == nil {
		t.Fatalf("timeout reply = %s", first)
	}
	select {
	case err := <-finished:
		t.Fatalf("request timeout ended the session: %v", err)
	case <-time.After(80 * time.Millisecond):
	}
	_, _ = io.WriteString(send, "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"ping\"}\n")
	second, err := reader.ReadString('\n')
	if err != nil || !strings.Contains(second, `"ok":true`) {
		t.Fatalf("request after idle timeout window: %s / %v", second, err)
	}
	_ = send.Close()
	if err := <-finished; err != nil {
		t.Fatalf("session EOF returned %v", err)
	}
}

func TestMCPIdleCancellationUnblocksClosableInput(t *testing.T) {
	resetAllFlags(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	input, send := io.Pipe()
	defer input.Close()
	defer send.Close()
	finished := make(chan error, 1)
	go func() {
		finished <- relayMCP(ctx, input, io.Discard, "http://unused.invalid", "fixture-token", http.DefaultClient)
	}()
	cancel()
	select {
	case err := <-finished:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("idle cancellation returned %v", err)
		}
	case <-time.After(time.Second):
		_ = send.Close()
		t.Fatal("idle input prevented session cancellation")
	}
}

func TestMCPParentCancellationInterruptsAnAcceptedRequest(t *testing.T) {
	resetAllFlags(t)
	accepted := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		accepted <- struct{}{}
		<-r.Context().Done()
	}))
	defer server.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var out bytes.Buffer
	finished := make(chan error, 1)
	go func() {
		finished <- relayMCP(ctx, strings.NewReader("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}\n"), &out, server.URL, "fixture-token", server.Client())
	}()
	select {
	case <-accepted:
	case <-time.After(time.Second):
		t.Fatal("MCP request never reached the server")
	}
	cancel()
	select {
	case err := <-finished:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("active cancellation returned %v", err)
		}
	case <-time.After(time.Second):
		server.CloseClientConnections()
		t.Fatal("parent cancellation did not interrupt MCP HTTP")
	}
	if out.Len() != 0 {
		t.Errorf("session cancellation emitted a reply: %q", out.String())
	}
}
