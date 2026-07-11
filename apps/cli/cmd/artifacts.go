package cmd

import (
	"connectrpc.com/connect"
	"context"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	healthv1connect "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
	"net/http"
)

var artifactsCmd = &cobra.Command{
	Use:   "artifacts",
	Short: "Manage project evidence, text files, and generated assets (mock - not yet wired to the backend)",
}

var artifactsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List nested artifacts and folders (mock)",
	Run: func(cmd *cobra.Command, args []string) {
		projectID, _ := cmd.Flags().GetString("project")
		isJson, _ := cmd.Flags().GetBool("json")

		if isJson {
			cmd.Printf(`[{"file": "env-vars.md", "type": "file", "project": "%s", "mock": true}]%s`, projectID, "\n")
		} else {
			cmd.Printf("Artifacts in project '%s': [mock data - not yet wired to the backend]\n", projectID)
			cmd.Println(" - env-vars.md")
			cmd.Println(" - (dir) deployments/")
		}
	},
}

var artifactsReadCmd = &cobra.Command{
	Use:   "read [path]",
	Short: "Read file artifact content (mock)",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		isJson, _ := cmd.Flags().GetBool("json")
		if isJson {
			cmd.Printf(`{"path": "%s", "content": "# Markdown Content\nGenerated via CLI", "mock": true}%s`, args[0], "\n")
		} else {
			cmd.Printf("# Content from file: %s\n", args[0])
			cmd.Println("[mock content - not yet wired to the backend]")
		}
	},
}

var artifactsDeleteCmd = &cobra.Command{
	Use:   "delete [artifact_id]",
	Short: "Move an artifact to the bin",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewArtifactServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.ArchiveArtifact(context.Background(), connect.NewRequest(&healthv1.ArchiveArtifactRequest{ArtifactId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to delete artifact: %v\n", err)
			return
		}
		cmd.Printf("Artifact %s moved to bin\n", args[0])
	},
}

var artifactsRestoreCmd = &cobra.Command{
	Use:   "restore [artifact_id]",
	Short: "Restore an artifact from the bin",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewArtifactServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.RestoreArtifact(context.Background(), connect.NewRequest(&healthv1.RestoreArtifactRequest{ArtifactId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to restore artifact: %v\n", err)
			return
		}
		cmd.Printf("Artifact %s restored\n", args[0])
	},
}

var foldersDeleteCmd = &cobra.Command{
	Use:   "delete-folder [folder_id]",
	Short: "Move a folder to the bin",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewArtifactServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.ArchiveFolder(context.Background(), connect.NewRequest(&healthv1.ArchiveFolderRequest{FolderId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to delete folder: %v\n", err)
			return
		}
		cmd.Printf("Folder %s moved to bin\n", args[0])
	},
}

var foldersRestoreCmd = &cobra.Command{
	Use:   "restore-folder [folder_id]",
	Short: "Restore a folder from the bin",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewArtifactServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.RestoreFolder(context.Background(), connect.NewRequest(&healthv1.RestoreFolderRequest{FolderId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to restore folder: %v\n", err)
			return
		}
		cmd.Printf("Folder %s restored\n", args[0])
	},
}

var artifactsPurgeCmd = &cobra.Command{
	Use:   "purge [artifact_id]",
	Short: "Permanently delete an already-binned, unlinked artifact",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewArtifactServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.PurgeArtifact(context.Background(), connect.NewRequest(&healthv1.PurgeArtifactRequest{ArtifactId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to purge artifact: %v\n", err)
			return
		}
		cmd.Printf("Artifact %s permanently deleted\n", args[0])
	},
}

var foldersPurgeCmd = &cobra.Command{
	Use:   "purge-folder [folder_id]",
	Short: "Permanently delete an already-binned, empty folder",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client := healthv1connect.NewArtifactServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		_, err := client.PurgeFolder(context.Background(), connect.NewRequest(&healthv1.PurgeFolderRequest{FolderId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to purge folder: %v\n", err)
			return
		}
		cmd.Printf("Folder %s permanently deleted\n", args[0])
	},
}

func init() {
	rootCmd.AddCommand(artifactsCmd)
	artifactsCmd.AddCommand(artifactsListCmd)
	artifactsCmd.AddCommand(artifactsReadCmd)
	artifactsCmd.AddCommand(artifactsDeleteCmd)
	artifactsCmd.AddCommand(artifactsRestoreCmd)
	artifactsCmd.AddCommand(artifactsPurgeCmd)
	artifactsCmd.AddCommand(foldersDeleteCmd)
	artifactsCmd.AddCommand(foldersRestoreCmd)
	artifactsCmd.AddCommand(foldersPurgeCmd)

	artifactsListCmd.Flags().String("project", "", "Project ID to list artifacts for")
}
