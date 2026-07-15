package cmd

import (
	"context"
	"encoding/json"
	"errors"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
)

var repoCmd = &cobra.Command{
	Use:   "repo",
	Short: "Manage repository integrations and pull requests",
}

var repoListCmd = &cobra.Command{
	Use:   "list",
	Short: "List repository links for a project",
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		projectID, _ := cmd.Flags().GetString("project")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if projectID == "" {
			cmd.Println("Error: --project is required (or set TASKER_PROJECT_ID).")
			return errors.New("Error: --project is required (or set TASKER_PROJECT_ID).")
		}

		client := backend.NewRepositoryServiceClient()
		res, err := client.ListRepositoryLinks(context.Background(), connect.NewRequest(&healthv1.ListRepositoryLinksRequest{
			ProjectId: projectID,
			Page:      &healthv1.PageRequest{Limit: limit, Cursor: cursor},
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list repository links: %v\n", err)
			return err
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
		return nil
	},
}

var repoLinkCmd = &cobra.Command{
	Use:   "link",
	Short: "Link a new repository to a project, via an OAuth authorization code or a direct API token",
	RunE: func(cmd *cobra.Command, args []string) error {
		provider, _ := cmd.Flags().GetString("provider")
		remote, _ := cmd.Flags().GetString("remote")
		projectID, _ := cmd.Flags().GetString("project")
		oauthCode, _ := cmd.Flags().GetString("oauth-code")
		apiToken, _ := cmd.Flags().GetString("api-token")
		email, _ := cmd.Flags().GetString("email")
		isJson, _ := cmd.Flags().GetBool("json")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if provider == "" || remote == "" || projectID == "" {
			cmd.Println("Error: --project, --provider, and --remote are all required.")
			return errors.New("Error: --project, --provider, and --remote are all required.")
		}
		if oauthCode == "" && apiToken == "" {
			cmd.Println("Error: provide either --oauth-code, or --api-token (add --email too for Bitbucket).")
			return errors.New("Error: provide either --oauth-code, or --api-token (add --email too for Bitbucket).")
		}
		if oauthCode == "" && provider == "bitbucket" && email == "" {
			cmd.Println("Error: --email is required alongside --api-token for Bitbucket.")
			return errors.New("Error: --email is required alongside --api-token for Bitbucket.")
		}

		client := backend.NewRepositoryServiceClient()
		res, err := client.AddRepositoryLink(context.Background(), connect.NewRequest(&healthv1.AddRepositoryLinkRequest{
			ProjectId:  projectID,
			Provider:   provider,
			RemoteName: remote,
			OauthCode:  oauthCode,
			ApiToken:   apiToken,
			Email:      email,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to link repository: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Link)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Successfully linked %s repository: %s (id: %s)\n", res.Msg.Link.Provider, res.Msg.Link.RemoteName, res.Msg.Link.Id)
		}
		return nil
	},
}

var repoSyncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Sync pull requests from linked repositories",
	RunE: func(cmd *cobra.Command, args []string) error {
		projectID, _ := cmd.Flags().GetString("project")
		isJson, _ := cmd.Flags().GetBool("json")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if projectID == "" {
			cmd.Println("Error: --project is required (or set TASKER_PROJECT_ID).")
			return errors.New("Error: --project is required (or set TASKER_PROJECT_ID).")
		}

		client := backend.NewRepositoryServiceClient()
		res, err := client.SyncPullRequests(context.Background(), connect.NewRequest(&healthv1.SyncPullRequestsRequest{ProjectId: projectID}))
		if err != nil {
			cmd.PrintErrf("Failed to sync pull requests: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": res.Msg.Success})
			cmd.Println(string(jsonString))
		} else if res.Msg.Success {
			cmd.Println("Pull requests synchronized successfully.")
		} else {
			cmd.Println("Pull request sync completed with some provider failures; check backend logs.")
		}
		return nil
	},
}

var repoPrsCmd = &cobra.Command{
	Use:   "prs",
	Short: "List synced pull requests for a project",
	RunE: func(cmd *cobra.Command, args []string) error {
		projectID, _ := cmd.Flags().GetString("project")
		isJson, _ := cmd.Flags().GetBool("json")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if projectID == "" {
			cmd.Println("Error: --project is required (or set TASKER_PROJECT_ID).")
			return errors.New("Error: --project is required (or set TASKER_PROJECT_ID).")
		}

		client := backend.NewRepositoryServiceClient()
		res, err := client.ListPullRequests(context.Background(), connect.NewRequest(&healthv1.ListPullRequestsRequest{ProjectId: projectID}))
		if err != nil {
			cmd.PrintErrf("Failed to list pull requests: %v\n", err)
			return err
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
		return nil
	},
}

var repoBuildsCmd = &cobra.Command{
	Use:   "builds [repository_link_id]",
	Short: "List CI builds for a repository link",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")

		client := backend.NewRepositoryServiceClient()
		res, err := client.ListBuilds(context.Background(), connect.NewRequest(&healthv1.ListBuildsRequest{
			RepositoryLinkId: args[0],
			Page:             &healthv1.PageRequest{Limit: limit, Cursor: cursor},
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list builds: %v\n", err)
			return err
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
		return nil
	},
}

var repoDeploymentsCmd = &cobra.Command{
	Use:   "deployments [build_id]",
	Short: "List deployments for a build's commit (GitHub deployments are keyed by commit sha, not by CI run)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		repositoryLinkID, _ := cmd.Flags().GetString("link")
		commitSha, _ := cmd.Flags().GetString("commit")
		if repositoryLinkID == "" || commitSha == "" {
			cmd.Println("Error: --link and --commit are both required (run `repo builds` first to find a build's commit sha).")
			return errors.New("Error: --link and --commit are both required (run `repo builds` first to find a build's commit sha).")
		}

		client := backend.NewRepositoryServiceClient()
		res, err := client.ListDeployments(context.Background(), connect.NewRequest(&healthv1.ListDeploymentsRequest{
			BuildId:          args[0],
			RepositoryLinkId: repositoryLinkID,
			CommitSha:        commitSha,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list deployments: %v\n", err)
			return err
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
		return nil
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
	repoListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	repoListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")

	repoLinkCmd.Flags().String("provider", "github", "Provider (e.g. github, bitbucket)")
	repoLinkCmd.Flags().String("remote", "", "Remote repository name")
	repoLinkCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
	repoLinkCmd.Flags().String("oauth-code", "", "OAuth authorization code obtained from the provider's consent screen")
	repoLinkCmd.Flags().String("api-token", "", "A direct API token, as an alternative to --oauth-code (a GitHub personal access token, or a Bitbucket Atlassian API token)")
	repoLinkCmd.Flags().String("email", "", "Bitbucket only: the Atlassian account email paired with --api-token")

	repoSyncCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
	repoPrsCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")

	repoDeploymentsCmd.Flags().String("link", "", "Repository link ID (from `repo list`)")
	repoDeploymentsCmd.Flags().String("commit", "", "Commit SHA to look up deployments for (from `repo builds`)")

	repoBuildsCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	repoBuildsCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
}
