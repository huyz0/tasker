package cmd

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"connectrpc.com/connect"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
)

type fakeWebhooks struct {
	v1connect.UnimplementedWebhookServiceHandler
	create *healthv1.CreateWebhookRequest
	update *healthv1.UpdateWebhookRequest
	calls  int
}

var sampleHook = &healthv1.Webhook{Id: "wh1", OrgId: "o1", Url: "https://hooks.example.com/in", Events: []string{"task.*"}, Active: true, Description: "runner"}

func (f *fakeWebhooks) CreateWebhook(_ context.Context, r *connect.Request[healthv1.CreateWebhookRequest]) (*connect.Response[healthv1.CreateWebhookResponse], error) {
	f.calls++
	f.create = r.Msg
	return connect.NewResponse(&healthv1.CreateWebhookResponse{Webhook: sampleHook, Secret: "whsec_abc"}), nil
}
func (f *fakeWebhooks) ListWebhooks(context.Context, *connect.Request[healthv1.ListWebhooksRequest]) (*connect.Response[healthv1.ListWebhooksResponse], error) {
	f.calls++
	disabled := &healthv1.Webhook{Id: "wh2", Url: "https://x.example.com", Events: []string{"*"}, ProjectId: strPtr("p9"), DisabledReason: strPtr("20 failures")}
	return connect.NewResponse(&healthv1.ListWebhooksResponse{Webhooks: []*healthv1.Webhook{sampleHook, disabled}}), nil
}
func (f *fakeWebhooks) UpdateWebhook(_ context.Context, r *connect.Request[healthv1.UpdateWebhookRequest]) (*connect.Response[healthv1.UpdateWebhookResponse], error) {
	f.calls++
	f.update = r.Msg
	return connect.NewResponse(&healthv1.UpdateWebhookResponse{Webhook: sampleHook}), nil
}
func (f *fakeWebhooks) DeleteWebhook(context.Context, *connect.Request[healthv1.DeleteWebhookRequest]) (*connect.Response[healthv1.DeleteWebhookResponse], error) {
	f.calls++
	return connect.NewResponse(&healthv1.DeleteWebhookResponse{Success: true}), nil
}
func (f *fakeWebhooks) RotateWebhookSecret(context.Context, *connect.Request[healthv1.RotateWebhookSecretRequest]) (*connect.Response[healthv1.RotateWebhookSecretResponse], error) {
	f.calls++
	return connect.NewResponse(&healthv1.RotateWebhookSecretResponse{Secret: "whsec_new"}), nil
}
func (f *fakeWebhooks) PingWebhook(context.Context, *connect.Request[healthv1.PingWebhookRequest]) (*connect.Response[healthv1.PingWebhookResponse], error) {
	f.calls++
	return connect.NewResponse(&healthv1.PingWebhookResponse{Delivery: &healthv1.WebhookDelivery{Id: "whd1", EventType: "ping", Status: "pending"}}), nil
}
func (f *fakeWebhooks) ListWebhookDeliveries(context.Context, *connect.Request[healthv1.ListWebhookDeliveriesRequest]) (*connect.Response[healthv1.ListWebhookDeliveriesResponse], error) {
	f.calls++
	code := int32(503)
	return connect.NewResponse(&healthv1.ListWebhookDeliveriesResponse{
		Deliveries: []*healthv1.WebhookDelivery{{Id: "whd1", EventType: "task.created", Status: "pending", Attempts: 2, LastStatusCode: &code, LastError: strPtr("receiver answered HTTP 503"), CreatedAt: "2026-10-02T10:00:00Z"}},
		Page:       &healthv1.PageResponse{},
	}), nil
}

func strPtr(s string) *string { return &s }

func serveWebhooks(t *testing.T) *fakeWebhooks {
	t.Helper()
	resetAllFlags(t)
	f := &fakeWebhooks{}
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewWebhookServiceHandler(f))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Setenv("TASKER_BACKEND_URL", srv.URL)
	t.Setenv("TASKER_ORG_ID", "")
	return f
}

func TestWebhooksCreateSendsTheFilterAndShowsTheSecretOnce(t *testing.T) {
	f := serveWebhooks(t)
	out, errw, code := run(t, "webhooks", "create", "--org", "o1", "--url", "https://hooks.example.com/in", "--event", "task.*,tasknote.created", "--project", "p1")
	if code != exitOK {
		t.Fatalf("exit %d: %s", code, errw)
	}
	if f.create.OrgId != "o1" || strings.Join(f.create.Events, ",") != "task.*,tasknote.created" || f.create.GetProjectId() != "p1" || f.create.Description != nil {
		t.Errorf("unexpected request %+v", f.create)
	}
	if !strings.Contains(out, "Signing secret (shown once): whsec_abc") || !strings.Contains(out, "whole organization") {
		t.Errorf("unexpected output %q", out)
	}
}

func TestWebhooksCreateValidatesBeforeCalling(t *testing.T) {
	f := serveWebhooks(t)
	if _, _, code := run(t, "webhooks", "create", "--url", "https://x"); code != exitInvalid {
		t.Errorf("missing --org: exit %d", code)
	}
	if _, _, code := run(t, "webhooks", "create", "--org", "o1", "--url", "https://x"); code != exitInvalid {
		t.Errorf("missing --event: exit %d", code)
	}
	if f.calls != 0 {
		t.Errorf("expected no request, got %d", f.calls)
	}
}

func TestWebhooksListShowsScopeAndState(t *testing.T) {
	serveWebhooks(t)
	out, _, _ := run(t, "webhooks", "list", "--org", "o1")
	if !strings.Contains(out, "[active]") || !strings.Contains(out, "project p9  [disabled: 20 failures]") {
		t.Errorf("unexpected output %q", out)
	}
}

func TestWebhooksUpdateSendsOnlyWhatWasGiven(t *testing.T) {
	f := serveWebhooks(t)
	run(t, "webhooks", "update", "wh1", "--enable")
	if f.update.GetActive() != true || f.update.Active == nil || f.update.Url != nil || len(f.update.Events) != 0 {
		t.Errorf("unexpected request %+v", f.update)
	}
	f = serveWebhooks(t)
	run(t, "webhooks", "update", "wh1", "--disable", "--event", "*")
	if f.update.GetActive() != false || f.update.Active == nil || strings.Join(f.update.Events, ",") != "*" {
		t.Errorf("unexpected request %+v", f.update)
	}
	f = serveWebhooks(t)
	if _, _, code := run(t, "webhooks", "update", "wh1", "--enable", "--disable"); code != exitInvalid || f.calls != 0 {
		t.Errorf("expected exit %d without a request, got %d / %d", exitInvalid, code, f.calls)
	}
}

func TestWebhooksDeleteRotatePingAndDeliveries(t *testing.T) {
	serveWebhooks(t)
	if out, _, _ := run(t, "webhooks", "delete", "wh1"); !strings.Contains(out, "Webhook wh1 deleted") {
		t.Errorf("delete: %q", out)
	}
	if out, _, _ := run(t, "webhooks", "rotate-secret", "wh1"); !strings.Contains(out, "whsec_new") {
		t.Errorf("rotate: %q", out)
	}
	if out, _, _ := run(t, "webhooks", "ping", "wh1"); !strings.Contains(out, "Ping queued (delivery whd1)") {
		t.Errorf("ping: %q", out)
	}
	out, _, _ := run(t, "webhooks", "deliveries", "wh1")
	if !strings.Contains(out, "task.created  pending after 2 attempt(s) HTTP 503 - receiver answered HTTP 503") {
		t.Errorf("deliveries: %q", out)
	}
	if out, _, _ := run(t, "webhooks", "deliveries", "wh1", "--json"); !strings.HasPrefix(out, `{"deliveries":[`) {
		t.Errorf("--json: %q", out)
	}
}
