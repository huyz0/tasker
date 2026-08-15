// Package backend provides shared helpers for CLI commands that talk to the
// Tasker backend: the base URL, a structured logger, and an interceptor that
// stamps a request id on every outgoing RPC and logs failures with it, so a
// CLI-side failure can be correlated with the matching backend log line.
package backend

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"connectrpc.com/connect"
)

// URL returns the backend base URL, overridable via TASKER_BACKEND_URL for
// non-local environments.
func URL() string {
	if v := os.Getenv("TASKER_BACKEND_URL"); v != "" {
		return v
	}
	return "http://localhost:8080"
}

// DefaultOrgID returns the fallback organization id for commands that accept
// an --org flag, sourced from TASKER_ORG_ID when the flag is left empty.
func DefaultOrgID() string {
	return os.Getenv("TASKER_ORG_ID")
}

// DefaultProjectID returns the fallback project id for commands that accept
// a --project flag, sourced from TASKER_PROJECT_ID when the flag is left empty.
func DefaultProjectID() string {
	return os.Getenv("TASKER_PROJECT_ID")
}

// Logger is the CLI's structured (JSON) logger.
var Logger = slog.New(slog.NewJSONHandler(os.Stderr, nil))

func newRequestID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// RequestIDInterceptor stamps an X-Request-Id header on every outgoing RPC
// and logs failures with the id attached.
func RequestIDInterceptor() connect.Interceptor {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			requestID := newRequestID()
			req.Header().Set("X-Request-Id", requestID)

			res, err := next(ctx, req)
			if err != nil {
				Logger.Error("rpc failed",
					"requestId", requestID,
					"procedure", req.Spec().Procedure,
					"err", err,
				)
			}
			return res, err
		}
	})
}

// AuthInterceptor attaches the caller's credential as an Authorization: Bearer
// header on every outgoing RPC. That is an agent token from --token or
// TASKER_TOKEN, or the session saved by `tasker auth login` - see ResolveToken
// for the precedence and why it is that way round. Commands run with no
// credential at all simply send no header, and the backend rejects with
// Unauthenticated, same as an anonymous browser request.
func AuthInterceptor() connect.Interceptor {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			token, err := ResolveToken()
			if err != nil {
				Logger.Warn("failed to load saved credentials", "err", err)
			} else if token != "" {
				req.Header().Set("Authorization", "Bearer "+token)
			}
			return next(ctx, req)
		}
	})
}

// ClientOptions returns the connect.ClientOption set every CLI client should use.
func ClientOptions() []connect.ClientOption {
	return []connect.ClientOption{connect.WithInterceptors(RequestIDInterceptor(), AuthInterceptor())}
}

// DescribeHTTPError turns a raw HTTP response into a message worth printing.
//
// Only 429 gets special treatment, and only because ADR-0008 put the rate
// limiter ahead of the Connect adapter so the refusal could carry RFC 7807 and
// Retry-After. The cost, named in that ADR, is that generated Connect clients
// see a transport-level failure rather than a typed error - so without this the
// CLI prints something unhelpful at exactly the moment a caller needs to know
// to back off.
func DescribeHTTPError(res *http.Response) string {
	if res.StatusCode != http.StatusTooManyRequests {
		return fmt.Sprintf("request failed with status %d", res.StatusCode)
	}
	if retry := res.Header.Get("Retry-After"); retry != "" {
		return fmt.Sprintf("rate limit exceeded - retry after %s seconds", retry)
	}
	return "rate limit exceeded"
}

// DescribeRPCError renders an RPC failure for a human or an agent to act on.
//
// A throttle arrives as CodeUnavailable, because connect-go maps a non-Connect
// 429 that way, and "unavailable" tells an agent the backend is down when in
// fact it needs to slow down - the difference between retrying harder and
// retrying later. Matching on the message text is fragile, and is the price of
// answering 429 at the transport; the alternative was giving up RFC 7807.
func DescribeRPCError(err error) string {
	if err == nil {
		return ""
	}
	var connectErr *connect.Error
	if errors.As(err, &connectErr) {
		if connectErr.Code() == connect.CodeUnavailable &&
			strings.Contains(strings.ToLower(connectErr.Message()), "too many requests") {
			return "rate limit exceeded - wait before retrying"
		}
		return connectErr.Message()
	}
	return err.Error()
}
