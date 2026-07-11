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

var artifactsCmd = &cobra.Command{
	Use:   "artifacts",
	Short: "Manage project evidence, text files, and generated assets",
}

var artifactsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List folders (--project) or artifacts within a folder (--folder)",
	Run: func(cmd *cobra.Command, args []string) {
		projectID, _ := cmd.Flags().GetString("project")
		folderID, _ := cmd.Flags().GetString("folder")
		isJson, _ := cmd.Flags().GetBool("json")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}

		client := healthv1connect.NewArtifactServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)

		if folderID != "" {
			res, err := client.ListArtifacts(context.Background(), connect.NewRequest(&healthv1.ListArtifactsRequest{FolderId: folderID}))
			if err != nil {
				cmd.PrintErrf("Failed to list artifacts: %v\n", err)
				return
			}
			if isJson {
				jsonString, _ := json.Marshal(res.Msg.Artifacts)
				cmd.Println(string(jsonString))
			} else {
				cmd.Printf("Artifacts in folder '%s':\n", folderID)
				for _, a := range res.Msg.Artifacts {
					cmd.Printf(" - %s (id: %s)\n", a.Name, a.Id)
				}
			}
			return
		}

		if projectID == "" {
			cmd.Println("Error: --project or --folder is required (or set TASKER_PROJECT_ID).")
			return
		}
		res, err := client.ListFolders(context.Background(), connect.NewRequest(&healthv1.ListFoldersRequest{ProjectId: projectID}))
		if err != nil {
			cmd.PrintErrf("Failed to list folders: %v\n", err)
			return
		}
		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Folders)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Folders in project '%s':\n", projectID)
			for _, f := range res.Msg.Folders {
				cmd.Printf(" - (dir) %s/ (id: %s)\n", f.Name, f.Id)
			}
		}
	},
}

var artifactsReadCmd = &cobra.Command{
	Use:   "read [artifact_id]",
	Short: "Read artifact content",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		folderID, _ := cmd.Flags().GetString("folder")
		isJson, _ := cmd.Flags().GetBool("json")
		if folderID == "" {
			cmd.Println("Error: --folder is required (the folder containing the artifact).")
			return
		}

		client := healthv1connect.NewArtifactServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.ListArtifacts(context.Background(), connect.NewRequest(&healthv1.ListArtifactsRequest{FolderId: folderID}))
		if err != nil {
			cmd.PrintErrf("Failed to read artifact: %v\n", err)
			return
		}

		for _, a := range res.Msg.Artifacts {
			if a.Id == args[0] {
				if isJson {
					jsonString, _ := json.Marshal(a)
					cmd.Println(string(jsonString))
				} else {
					cmd.Printf("# %s\n%s\n", a.Name, a.Content)
				}
				return
			}
		}
		cmd.PrintErrf("Artifact %s not found in folder %s\n", args[0], folderID)
	},
}

var artifactsCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new artifact in a folder",
	Run: func(cmd *cobra.Command, args []string) {
		folderID, _ := cmd.Flags().GetString("folder")
		name, _ := cmd.Flags().GetString("name")
		description, _ := cmd.Flags().GetString("description")
		content, _ := cmd.Flags().GetString("content")
		isJson, _ := cmd.Flags().GetBool("json")
		if folderID == "" || name == "" {
			cmd.Println("Error: --folder and --name are required.")
			return
		}

		client := healthv1connect.NewArtifactServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.CreateArtifact(context.Background(), connect.NewRequest(&healthv1.CreateArtifactRequest{
			FolderId:    folderID,
			Name:        name,
			Description: description,
			Content:     content,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create artifact: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Artifact)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Artifact created: %s (id: %s)\n", res.Msg.Artifact.Name, res.Msg.Artifact.Id)
		}
	},
}

var foldersCreateCmd = &cobra.Command{
	Use:   "create-folder",
	Short: "Create a new folder in a project",
	Run: func(cmd *cobra.Command, args []string) {
		projectID, _ := cmd.Flags().GetString("project")
		parentID, _ := cmd.Flags().GetString("parent")
		name, _ := cmd.Flags().GetString("name")
		isJson, _ := cmd.Flags().GetBool("json")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if projectID == "" || name == "" {
			cmd.Println("Error: --project and --name are required.")
			return
		}

		client := healthv1connect.NewArtifactServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)
		res, err := client.CreateFolder(context.Background(), connect.NewRequest(&healthv1.CreateFolderRequest{
			ProjectId: projectID,
			ParentId:  parentID,
			Name:      name,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create folder: %v\n", err)
			return
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Folder)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Folder created: %s (id: %s)\n", res.Msg.Folder.Name, res.Msg.Folder.Id)
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
	artifactsCmd.AddCommand(artifactsCreateCmd)
	artifactsCmd.AddCommand(artifactsDeleteCmd)
	artifactsCmd.AddCommand(artifactsRestoreCmd)
	artifactsCmd.AddCommand(artifactsPurgeCmd)
	artifactsCmd.AddCommand(foldersCreateCmd)
	artifactsCmd.AddCommand(foldersDeleteCmd)
	artifactsCmd.AddCommand(foldersRestoreCmd)
	artifactsCmd.AddCommand(foldersPurgeCmd)

	artifactsListCmd.Flags().String("project", "", "Project ID to list folders for (or set TASKER_PROJECT_ID)")
	artifactsListCmd.Flags().String("folder", "", "Folder ID to list artifacts within")
	artifactsReadCmd.Flags().String("folder", "", "Folder ID containing the artifact")
	artifactsCreateCmd.Flags().String("folder", "", "Folder ID to create the artifact in")
	artifactsCreateCmd.Flags().String("name", "", "Artifact name")
	artifactsCreateCmd.Flags().String("description", "", "Artifact description")
	artifactsCreateCmd.Flags().String("content", "", "Artifact text content")
	foldersCreateCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
	foldersCreateCmd.Flags().String("parent", "", "Parent folder ID (optional, for nesting)")
	foldersCreateCmd.Flags().String("name", "", "Folder name")
}
