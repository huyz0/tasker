package cmd

import (
	"connectrpc.com/connect"
	"context"
	"encoding/json"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	healthv1connect "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
	"net/http"
)

var repoCmd = &cobra.Command{
	Use:   "repo",
	Short: "Manage repository integrations and pull requests",
}

var repoListCmd = &cobra.Command{
	Use:   "list",
	Short: "List repository links for a project",
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		projectID, _ := cmd.Flags().GetString("project")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if projectID == "" {
			cmd.Println("Error: --project is required (or set TASKER_PROJECT_ID).")
			return
		}

		client := healthv1connect.NewRepositoryServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.ListRepositoryLinks(context.Background(), connect.NewRequest(&healthv1.ListRepositoryLinksRequest{ProjectId: projectID}))
		if err != nil {
			cmd.PrintErrf("Failed to list repository links: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Links)
			cmd.Println(string(jsonString))
		} else {
			cmd.Println("Repository Links:")
			for _, l := range res.Msg.Links {
				cmd.Printf(" - %s: %s (id: %s)\n", l.Provider, l.RemoteName, l.Id)
			}
		}
	},
}

var repoLinkCmd = &cobra.Command{
	Use:   "link",
	Short: "Link a new repository to a project (requires an OAuth authorization code from a browser-based flow)",
	Run: func(cmd *cobra.Command, args []string) {
		provider, _ := cmd.Flags().GetString("provider")
		remote, _ := cmd.Flags().GetString("remote")
		projectID, _ := cmd.Flags().GetString("project")
		oauthCode, _ := cmd.Flags().GetString("oauth-code")
		isJson, _ := cmd.Flags().GetBool("json")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if provider == "" || remote == "" || projectID == "" || oauthCode == "" {
			cmd.Println("Error: --project, --provider, --remote, and --oauth-code are all required.")
			return
		}

		client := healthv1connect.NewRepositoryServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.AddRepositoryLink(context.Background(), connect.NewRequest(&healthv1.AddRepositoryLinkRequest{
			ProjectId:  projectID,
			Provider:   provider,
			RemoteName: remote,
			OauthCode:  oauthCode,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to link repository: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Link)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Successfully linked %s repository: %s (id: %s)\n", res.Msg.Link.Provider, res.Msg.Link.RemoteName, res.Msg.Link.Id)
		}
	},
}

var repoSyncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Sync pull requests from linked repositories",
	Run: func(cmd *cobra.Command, args []string) {
		projectID, _ := cmd.Flags().GetString("project")
		isJson, _ := cmd.Flags().GetBool("json")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if projectID == "" {
			cmd.Println("Error: --project is required (or set TASKER_PROJECT_ID).")
			return
		}

		client := healthv1connect.NewRepositoryServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.SyncPullRequests(context.Background(), connect.NewRequest(&healthv1.SyncPullRequestsRequest{ProjectId: projectID}))
		if err != nil {
			cmd.PrintErrf("Failed to sync pull requests: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": res.Msg.Success})
			cmd.Println(string(jsonString))
		} else if res.Msg.Success {
			cmd.Println("Pull requests synchronized successfully.")
		} else {
			cmd.Println("Pull request sync completed with some provider failures; check backend logs.")
		}
	},
}

var repoPrsCmd = &cobra.Command{
	Use:   "prs",
	Short: "List synced pull requests for a project",
	Run: func(cmd *cobra.Command, args []string) {
		projectID, _ := cmd.Flags().GetString("project")
		isJson, _ := cmd.Flags().GetBool("json")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if projectID == "" {
			cmd.Println("Error: --project is required (or set TASKER_PROJECT_ID).")
			return
		}

		client := healthv1connect.NewRepositoryServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.ListPullRequests(context.Background(), connect.NewRequest(&healthv1.ListPullRequestsRequest{ProjectId: projectID}))
		if err != nil {
			cmd.PrintErrf("Failed to list pull requests: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.PullRequests)
			cmd.Println(string(jsonString))
		} else {
			cmd.Println("Pull Requests:")
			for _, pr := range res.Msg.PullRequests {
				cmd.Printf(" - #%s: %s (%s)\n", pr.RemotePrId, pr.Title, pr.Status)
			}
		}
	},
}

var repoBuildsCmd = &cobra.Command{
	Use:   "builds [repository_link_id]",
	Short: "List CI builds for a repository link",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")

		client := healthv1connect.NewRepositoryServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.ListBuilds(context.Background(), connect.NewRequest(&healthv1.ListBuildsRequest{RepositoryLinkId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to list builds: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Builds)
			cmd.Println(string(jsonString))
		} else {
			cmd.Println("Builds:")
			for _, b := range res.Msg.Builds {
				cmd.Printf(" - %s: %s\n", b.CommitSha, b.Status)
			}
		}
	},
}

var repoDeploymentsCmd = &cobra.Command{
	Use:   "deployments [build_id]",
	Short: "List deployments for a build",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")

		client := healthv1connect.NewRepositoryServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.ListDeployments(context.Background(), connect.NewRequest(&healthv1.ListDeploymentsRequest{BuildId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to list deployments: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Deployments)
			cmd.Println(string(jsonString))
		} else {
			cmd.Println("Deployments:")
			for _, d := range res.Msg.Deployments {
				cmd.Printf(" - %s: %s\n", d.Environment, d.Status)
			}
		}
	},
}

func init() {
	rootCmd.AddCommand(repoCmd)
	repoCmd.AddCommand(repoListCmd)
	repoCmd.AddCommand(repoLinkCmd)
	repoCmd.AddCommand(repoSyncCmd)
	repoCmd.AddCommand(repoPrsCmd)
	repoCmd.AddCommand(repoBuildsCmd)
	repoCmd.AddCommand(repoDeploymentsCmd)

	repoListCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")

	repoLinkCmd.Flags().String("provider", "github", "Provider (e.g. github, bitbucket)")
	repoLinkCmd.Flags().String("remote", "", "Remote repository name")
	repoLinkCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
	repoLinkCmd.Flags().String("oauth-code", "", "OAuth authorization code obtained from the provider's consent screen")

	repoSyncCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
	repoPrsCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
}
