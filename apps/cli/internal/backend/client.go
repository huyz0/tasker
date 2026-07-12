// Package backend provides shared helpers for CLI commands that talk to the
// Tasker backend: the base URL, a structured logger, and an interceptor that
// stamps a request id on every outgoing RPC and logs failures with it, so a
// CLI-side failure can be correlated with the matching backend log line.
package backend

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"os"

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

// AuthInterceptor attaches the CLI's saved session token (from `tasker auth
// login`) as an Authorization: Bearer header on every outgoing RPC. Commands
// run with no saved credentials simply send no header - the backend then
// rejects with Unauthenticated, same as an anonymous browser request.
func AuthInterceptor() connect.Interceptor {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			token, err := LoadCredentials()
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
