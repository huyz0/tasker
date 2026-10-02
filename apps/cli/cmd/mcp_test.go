package cmd

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// fakeMCP answers like the backend's /mcp: JSON-RPC for requests, 202 for
// notifications, a JSON-RPC 401 for a bad token, and HTML for "/broken".
func fakeMCP(t *testing.T) (*httptest.Server, *[]string) {
	t.Helper()
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		seen = append(seen, r.Header.Get("Authorization")+" "+string(body))
		switch {
		case r.Header.Get("Authorization") != "Bearer tk_good":
			w.WriteHeader(http.StatusUnauthorized)
			io.WriteString(w, `{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"a valid Bearer token is required"}}`)
		case strings.Contains(string(body), `"notifications/`):
			w.WriteHeader(http.StatusAccepted)
		case strings.Contains(string(body), `"boom"`):
			w.WriteHeader(http.StatusBadGateway)
			io.WriteString(w, "<html>bad gateway</html>")
		default:
			io.WriteString(w, "{\n  \"jsonrpc\": \"2.0\", \"id\": 7, \"result\": {}\n}")
		}
	}))
	t.Cleanup(srv.Close)
	return srv, &seen
}

func TestRelayForwardsEachMessageAndWritesOneLinePerReply(t *testing.T) {
	srv, seen := fakeMCP(t)
	in := strings.NewReader(`{"jsonrpc":"2.0","id":7,"method":"ping"}` + "\n\n" + `{"jsonrpc":"2.0","method":"notifications/initialized"}` + "\n")
	var out bytes.Buffer
	if err := relayMCP(in, &out, srv.URL+"/mcp", "tk_good", srv.Client()); err != nil {
		t.Fatal(err)
	}
	if out.String() != `{"jsonrpc":"2.0","id":7,"result":{}}`+"\n" {
		t.Errorf("expected one compact reply and nothing for the notification, got %q", out.String())
	}
	if len(*seen) != 2 || !strings.HasPrefix((*seen)[0], "Bearer tk_good ") {
		t.Errorf("expected two forwarded messages with the token, got %q", *seen)
	}
}

func TestRelayGivesARefusalTheRequestsOwnID(t *testing.T) {
	srv, _ := fakeMCP(t)
	var out bytes.Buffer
	relayMCP(strings.NewReader(`{"jsonrpc":"2.0","id":"abc","method":"ping"}`+"\n"), &out, srv.URL+"/mcp", "tk_bad", srv.Client())
	if !strings.Contains(out.String(), `"id":"abc"`) || !strings.Contains(out.String(), "Bearer token is required") {
		t.Errorf("unexpected reply %q", out.String())
	}
}

func TestRelayAnswersAMessageTheServerCouldNot(t *testing.T) {
	srv, _ := fakeMCP(t)
	var out bytes.Buffer
	in := `{"jsonrpc":"2.0","id":3,"method":"boom"}` + "\n" + `{"jsonrpc":"2.0","method":"boom"}` + "\n"
	relayMCP(strings.NewReader(in), &out, srv.URL+"/mcp", "tk_good", srv.Client())
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 1 || !strings.Contains(lines[0], `"id":3`) || !strings.Contains(lines[0], "HTTP 502 without a JSON-RPC body") {
		t.Errorf("expected one synthesized error for the request and none for the notification, got %q", out.String())
	}

	out.Reset()
	relayMCP(strings.NewReader(`{"jsonrpc":"2.0","id":4,"method":"ping"}`+"\n"), &out, "http://127.0.0.1:1/mcp", "tk_good", http.DefaultClient)
	if !strings.Contains(out.String(), `"id":4`) || !strings.Contains(out.String(), "unreachable") {
		t.Errorf("expected an unreachable error, got %q", out.String())
	}
}

func TestMCPCommandNeedsACredential(t *testing.T) {
	resetAllFlags(t)
	t.Setenv("TASKER_TOKEN", "")
	t.Setenv("TASKER_CREDENTIALS_PATH", t.TempDir()+"/none.json")
	var out, errw bytes.Buffer
	if code := runCLI([]string{"mcp"}, &out, &errw); code != exitAuth {
		t.Errorf("expected exit %d, got %d (%s)", exitAuth, code, errw.String())
	}
	if out.Len() != 0 {
		t.Errorf("stdout must stay clean for the protocol, got %q", out.String())
	}
}

func TestMCPCommandRelaysStdinWithTheResolvedToken(t *testing.T) {
	resetAllFlags(t)
	srv, seen := fakeMCP(t)
	t.Setenv("TASKER_BACKEND_URL", srv.URL+"/")
	t.Setenv("TASKER_TOKEN", "tk_good")
	var out, errw bytes.Buffer
	rootCmd.SetIn(strings.NewReader(`{"jsonrpc":"2.0","id":7,"method":"ping"}` + "\n"))
	t.Cleanup(func() { rootCmd.SetIn(nil) })
	if code := runCLI([]string{"mcp"}, &out, &errw); code != exitOK {
		t.Fatalf("exit %d: %s", code, errw.String())
	}
	if out.String() != `{"jsonrpc":"2.0","id":7,"result":{}}`+"\n" || len(*seen) != 1 {
		t.Errorf("unexpected relay: %q / %q", out.String(), *seen)
	}
}
