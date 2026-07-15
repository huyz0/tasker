package backend

import (
	"net/http"

	v1connect "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
)

// The constructors below wrap the repeated
// `xv1connect.NewXServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)`
// call-site pattern that used to be duplicated across cmd/*.go, one per
// ConnectRPC service the CLI talks to.

func NewAgentServiceClient() v1connect.AgentServiceClient {
	return v1connect.NewAgentServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}

func NewArtifactServiceClient() v1connect.ArtifactServiceClient {
	return v1connect.NewArtifactServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}

func NewAuthServiceClient() v1connect.AuthServiceClient {
	return v1connect.NewAuthServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}

func NewCommentServiceClient() v1connect.CommentServiceClient {
	return v1connect.NewCommentServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}

func NewHealthServiceClient() v1connect.HealthServiceClient {
	return v1connect.NewHealthServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}

func NewLabelServiceClient() v1connect.LabelServiceClient {
	return v1connect.NewLabelServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}

func NewOrgServiceClient() v1connect.OrgServiceClient {
	return v1connect.NewOrgServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}

func NewProjectServiceClient() v1connect.ProjectServiceClient {
	return v1connect.NewProjectServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}

func NewProjectTemplateServiceClient() v1connect.ProjectTemplateServiceClient {
	return v1connect.NewProjectTemplateServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}

func NewRepositoryServiceClient() v1connect.RepositoryServiceClient {
	return v1connect.NewRepositoryServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}

func NewSearchServiceClient() v1connect.SearchServiceClient {
	return v1connect.NewSearchServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}

func NewTaskServiceClient() v1connect.TaskServiceClient {
	return v1connect.NewTaskServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}

func NewTaskNoteServiceClient() v1connect.TaskNoteServiceClient {
	return v1connect.NewTaskNoteServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}

func NewTaskTypeServiceClient() v1connect.TaskTypeServiceClient {
	return v1connect.NewTaskTypeServiceClient(http.DefaultClient, URL(), ClientOptions()...)
}
