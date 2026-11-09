package backend

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
)

func TestRequestContextBoundsAndInheritsLifetime(t *testing.T) {
	t.Cleanup(func() { _ = SetRequestTimeout(DefaultRequestTimeout) })
	if err := SetRequestTimeout(DefaultRequestTimeout); err != nil {
		t.Fatal(err)
	}
	before := time.Now()
	ctx, cancel := RequestContext(context.Background())
	after := time.Now()
	defer cancel()
	deadline, ok := ctx.Deadline()
	if !ok || deadline.Before(before.Add(DefaultRequestTimeout)) || deadline.After(after.Add(DefaultRequestTimeout)) {
		t.Fatalf("default request deadline = %v, present=%v", deadline, ok)
	}
	parent, stopParent := context.WithTimeout(context.Background(), time.Second)
	defer stopParent()
	child, stopChild := RequestContext(parent)
	defer stopChild()
	parentDeadline, _ := parent.Deadline()
	childDeadline, _ := child.Deadline()
	if !childDeadline.Equal(parentDeadline) {
		t.Fatal("request extended its earlier parent deadline")
	}
	stopParent()
	select {
	case <-child.Done():
	case <-time.After(time.Second):
		t.Fatal("parent cancellation did not reach request")
	}
	for _, invalid := range []time.Duration{0, -time.Second} {
		if SetRequestTimeout(invalid) == nil {
			t.Errorf("accepted request timeout %v", invalid)
		}
	}
}

type lifetimeEventFeed struct{}

func (lifetimeEventFeed) SubscribeEvents(ctx context.Context, _ *connect.Request[healthv1.SubscribeEventsRequest], stream *connect.ServerStream[healthv1.DomainEventMessage]) error {
	if err := stream.Send(&healthv1.DomainEventMessage{Subject: "stream.ready"}); err != nil {
		return err
	}
	<-ctx.Done()
	return ctx.Err()
}

func TestUnaryDeadlineDoesNotCutOffAnEventSubscription(t *testing.T) {
	t.Cleanup(func() { _ = SetRequestTimeout(DefaultRequestTimeout) })
	if err := SetRequestTimeout(50 * time.Millisecond); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewEventServiceHandler(lifetimeEventFeed{}))
	server := httptest.NewServer(mux)
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	client := v1connect.NewEventServiceClient(server.Client(), server.URL, ClientOptions()...)
	stream, err := client.SubscribeEvents(ctx, connect.NewRequest(&healthv1.SubscribeEventsRequest{}))
	if err != nil {
		t.Fatal(err)
	}
	defer stream.Close()
	if !stream.Receive() || stream.Msg().Subject != "stream.ready" {
		t.Fatalf("subscription did not become ready: %v", stream.Err())
	}
	ended := make(chan error, 1)
	go func() { stream.Receive(); ended <- stream.Err() }()
	select {
	case err := <-ended:
		t.Fatalf("unary request timeout ended a subscription: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	cancel()
	select {
	case err := <-ended:
		if connect.CodeOf(err) != connect.CodeCanceled {
			t.Fatalf("subscription cancellation returned %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("subscription ignored caller cancellation")
	}
}
