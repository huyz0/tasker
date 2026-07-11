package cmd

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"connectrpc.com/connect"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
)

type fakeLabelHandler struct {
	v1connect.UnimplementedLabelServiceHandler
}

func (f *fakeLabelHandler) CreateLabel(
	_ context.Context,
	req *connect.Request[healthv1.CreateLabelRequest],
) (*connect.Response[healthv1.CreateLabelResponse], error) {
	return connect.NewResponse(&healthv1.CreateLabelResponse{
		Label: &healthv1.Label{Id: "lbl_1", OrgId: req.Msg.OrgId, Name: req.Msg.Name, Color: req.Msg.Color},
	}), nil
}

func TestLabelsCreateCommand(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle(v1connect.NewLabelServiceHandler(&fakeLabelHandler{}))
	srv := httptest.NewServer(mux)
	defer srv.Close()
	t.Setenv("TASKER_BACKEND_URL", srv.URL)

	rootCmd.AddCommand(labelsCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"labels", "create", "--org", "org-123", "--name", "bug", "--json"})
	_ = rootCmd.Execute()

	output := b.String()
	if !strings.Contains(output, "lbl_1") {
		t.Errorf("Expected label output to contain the new label id, got %s", output)
	}
}
