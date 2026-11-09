//go:build linux

package cmd

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"
	"unsafe"

	"golang.org/x/term"
)

func TestNativeCLIRecoveryJourneys(t *testing.T) {
	_, source, _, _ := runtime.Caller(0)
	cliRoot := filepath.Dir(filepath.Dir(source))
	binary := filepath.Join(t.TempDir(), "tasker")
	buildContext, stopBuild := context.WithTimeout(context.Background(), 30*time.Second)
	defer stopBuild()
	build := exec.CommandContext(buildContext, "go", "build", "-buildvcs=false", "-o", binary, ".")
	build.Dir = cliRoot
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build native CLI: %v\n%s", err, output)
	}
	t.Setenv("TASKER_CREDENTIALS_PATH", filepath.Join(t.TempDir(), "credentials.json"))
	t.Setenv("TASKER_TOKEN", "")

	t.Run("stalled unary request exits with timeout", func(t *testing.T) {
		server, _ := nativeStalledServer(t)
		t.Setenv("TASKER_BACKEND_URL", server.URL)
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		command := exec.CommandContext(ctx, binary, "ping", "--timeout", "100ms")
		var stdout, stderr bytes.Buffer
		command.Stdout, command.Stderr = &stdout, &stderr
		if code := nativeExitCode(command.Run()); code != exitUnavailable {
			t.Fatalf("timeout exit=%d: %s", code, stderr.String())
		}
		if stdout.Len() != 0 || strings.Count(stderr.String(), "\n") != 1 {
			t.Fatalf("timeout output/lifetime: stdout=%q stderr=%q", stdout.String(), stderr.String())
		}
	})

	t.Run("interrupt cancels an accepted request", func(t *testing.T) {
		server, accepted := nativeStalledServer(t)
		t.Setenv("TASKER_BACKEND_URL", server.URL)
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		command := exec.CommandContext(ctx, binary, "ping")
		var stdout, stderr bytes.Buffer
		command.Stdout, command.Stderr = &stdout, &stderr
		process := startNativeProcess(t, command, cancel)
		select {
		case <-accepted:
		case <-ctx.Done():
			t.Fatal("request was never accepted")
		}
		if err := command.Process.Signal(os.Interrupt); err != nil {
			t.Fatal(err)
		}
		if code := nativeExitCode(process.wait()); code != exitCanceled {
			t.Fatalf("interrupt exit=%d: %s", code, stderr.String())
		}
		if stdout.Len() != 0 || strings.Count(stderr.String(), "\n") != 1 {
			t.Fatalf("interrupt output: stdout=%q stderr=%q", stdout.String(), stderr.String())
		}
	})

	t.Run("MCP remains idle beyond its request budget and terminates", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, _ = io.Copy(io.Discard, r.Body)
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"jsonrpc":"2.0","id":1,"result":{"ok":true}}`)
		}))
		defer server.Close()
		t.Setenv("TASKER_BACKEND_URL", server.URL)
		t.Setenv("TASKER_TOKEN", "fixture-token")
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		command := exec.CommandContext(ctx, binary, "mcp", "--timeout", "100ms")
		input, err := command.StdinPipe()
		if err != nil {
			t.Fatal(err)
		}
		defer input.Close()
		output, err := command.StdoutPipe()
		if err != nil {
			t.Fatal(err)
		}
		var stderr bytes.Buffer
		command.Stderr = &stderr
		process := startNativeProcess(t, command, cancel)
		_, _ = io.WriteString(input, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}\n")
		line, err := bufio.NewReader(output).ReadString('\n')
		if err != nil || !strings.Contains(line, `"ok":true`) {
			t.Fatalf("MCP handshake: %s / %v", line, err)
		}
		select {
		case <-process.done:
			t.Fatalf("MCP idle ended early: %v", process.err)
		case <-time.After(150 * time.Millisecond):
		}
		if err := command.Process.Signal(syscall.SIGTERM); err != nil {
			t.Fatal(err)
		}
		if code := nativeExitCode(process.wait()); code != exitCanceled {
			t.Fatalf("MCP termination exit=%d: %s", code, stderr.String())
		}
	})

	t.Run("cancelled masked input restores the terminal", func(t *testing.T) {
		master, slave := nativePTY(t)
		defer master.Close()
		defer slave.Close()
		original, err := term.GetState(int(slave.Fd()))
		if err != nil {
			t.Fatal(err)
		}
		defer term.Restore(int(slave.Fd()), original)
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		command := exec.CommandContext(ctx, binary, "auth", "login", "--username", "fixture")
		command.Stdin, command.Stdout, command.Stderr = slave, slave, slave
		command.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		process := startNativeProcess(t, command, cancel)
		prompt := make(chan error, 1)
		go func() {
			data := make([]byte, len("Password: "))
			_, err := io.ReadFull(master, data)
			if err == nil && string(data) != "Password: " {
				err = fmt.Errorf("unexpected prompt %q", data)
			}
			prompt <- err
		}()
		select {
		case err := <-prompt:
			if err != nil {
				t.Fatal(err)
			}
		case <-ctx.Done():
			t.Fatal("password prompt did not appear")
		}
		for {
			var state syscall.Termios
			if _, _, errno := syscall.Syscall(syscall.SYS_IOCTL, slave.Fd(), syscall.TCGETS, uintptr(unsafe.Pointer(&state))); errno != 0 {
				t.Fatal(errno)
			}
			if state.Lflag&syscall.ECHO == 0 {
				break
			}
			select {
			case <-ctx.Done():
				t.Fatal("password input never disabled echo")
			case <-time.After(time.Millisecond):
			}
		}
		if err := command.Process.Signal(syscall.SIGTERM); err != nil {
			t.Fatal(err)
		}
		if code := nativeExitCode(process.wait()); code != exitCanceled {
			t.Fatalf("terminal cancellation exit=%d", code)
		}
		restored, err := term.GetState(int(slave.Fd()))
		if err != nil || !reflect.DeepEqual(original, restored) {
			t.Fatalf("cancelled password input did not restore terminal: %v", err)
		}
	})
}

type nativeProcess struct {
	done chan struct{}
	err  error
}

func (p *nativeProcess) wait() error { <-p.done; return p.err }

func startNativeProcess(t *testing.T, command *exec.Cmd, cancel context.CancelFunc) *nativeProcess {
	t.Helper()
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	process := &nativeProcess{done: make(chan struct{})}
	go func() { process.err = command.Wait(); close(process.done) }()
	t.Cleanup(func() {
		cancel()
		select {
		case <-process.done:
		case <-time.After(time.Second):
			_ = command.Process.Kill()
			select {
			case <-process.done:
			case <-time.After(time.Second):
				t.Error("native child did not reap after cleanup")
			}
		}
	})
	return process
}

func nativeExitCode(err error) int {
	if err == nil {
		return 0
	}
	var exited *exec.ExitError
	if errors.As(err, &exited) {
		return exited.ExitCode()
	}
	return -1
}

func nativeStalledServer(t *testing.T) (*httptest.Server, <-chan struct{}) {
	t.Helper()
	accepted := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		accepted <- struct{}{}
		<-r.Context().Done()
	}))
	t.Cleanup(server.Close)
	return server, accepted
}

// Linux's PTY ioctls keep the terminal fixture private to this child process.
// No extra runtime or third-party PTY library is needed.
func nativePTY(t *testing.T) (*os.File, *os.File) {
	t.Helper()
	master, err := os.OpenFile("/dev/ptmx", os.O_RDWR|syscall.O_NOCTTY, 0)
	if err != nil {
		t.Fatal(err)
	}
	var unlock int32
	if _, _, errno := syscall.Syscall(syscall.SYS_IOCTL, master.Fd(), syscall.TIOCSPTLCK, uintptr(unsafe.Pointer(&unlock))); errno != 0 {
		master.Close()
		t.Fatal(errno)
	}
	var number uint32
	if _, _, errno := syscall.Syscall(syscall.SYS_IOCTL, master.Fd(), syscall.TIOCGPTN, uintptr(unsafe.Pointer(&number))); errno != 0 {
		master.Close()
		t.Fatal(errno)
	}
	slave, err := os.OpenFile(fmt.Sprintf("/dev/pts/%d", number), os.O_RDWR|syscall.O_NOCTTY, 0)
	if err != nil {
		master.Close()
		t.Fatal(err)
	}
	return master, slave
}
