package backend

import (
	"context"
	"fmt"
	"sync/atomic"
	"time"

	"connectrpc.com/connect"
)

const DefaultRequestTimeout = 30 * time.Second

var requestTimeout atomic.Int64

func init() { requestTimeout.Store(int64(DefaultRequestTimeout)) }

// SetRequestTimeout configures individual requests, never the command/session.
func SetRequestTimeout(timeout time.Duration) error {
	if timeout <= 0 {
		return fmt.Errorf("timeout must be a positive duration")
	}
	requestTimeout.Store(int64(timeout))
	return nil
}

// RequestContext respects earlier parent deadlines and cancellation.
func RequestContext(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, time.Duration(requestTimeout.Load()))
}

func RequestDeadlineInterceptor() connect.Interceptor {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			bounded, cancel := RequestContext(ctx)
			defer cancel()
			return next(bounded, req)
		}
	})
}
