package cmd

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
)

var artifactsCmd = &cobra.Command{
	Use:   "artifacts",
	Short: "Manage project evidence, text files, and generated assets",
}

// isBinaryContentType mirrors the GUI's identically-named function
// (ArtifactUpload.tsx, M18-T04): whether a content type can only be
// represented as bytes, not as text. `create --file` used to base64-encode
// every upload regardless of type, and content's own docstring in the
// contract names the resulting hazard directly - "the content type does not
// reliably say which" encoding a given artifact uses. Kept in sync with the
// GUI's list rather than guessing independently, since a CLI upload and a
// browser upload have to agree on what "binary" means for the same field.
func isBinaryContentType(contentType string) bool {
	return strings.HasPrefix(contentType, "image/") || contentType == "application/pdf" || contentType == "application/octet-stream"
}

var artifactsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List folders (--project) or artifacts within a folder (--folder)",
	RunE: func(cmd *cobra.Command, args []string) error {
		projectID, _ := cmd.Flags().GetString("project")
		folderID, _ := cmd.Flags().GetString("folder")
		isJson, _ := cmd.Flags().GetBool("json")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		onlyDeleted, _ := cmd.Flags().GetBool("only-deleted")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}

		client := backend.NewArtifactServiceClient()

		if folderID != "" {
			res, err := client.ListArtifacts(context.Background(), connect.NewRequest(&healthv1.ListArtifactsRequest{
				FolderId:    folderID,
				Page:        &healthv1.PageRequest{Limit: limit, Cursor: cursor},
				OnlyDeleted: onlyDeleted,
			}))
			if err != nil {
				cmd.PrintErrf("Failed to list artifacts: %v\n", err)
				return err
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
			return nil
		}

		if projectID == "" {
			cmd.Println("Error: --project or --folder is required (or set TASKER_PROJECT_ID).")
			return errors.New("Error: --project or --folder is required (or set TASKER_PROJECT_ID).")
		}
		res, err := client.ListFolders(context.Background(), connect.NewRequest(&healthv1.ListFoldersRequest{
			ProjectId:   projectID,
			Page:        &healthv1.PageRequest{Limit: limit, Cursor: cursor},
			OnlyDeleted: onlyDeleted,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list folders: %v\n", err)
			return err
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
		return nil
	},
}

// M18-T07: content is empty on ListArtifacts by design (artifacts.handler.ts:
// the body can hold ~15MB of base64, and a listing needs the name, not the
// bytes). This command printed exactly that empty field for every artifact,
// always - the fake handler backing its test populated Content on
// ListArtifacts itself, a divergence from the real backend's contract that
// fully hid the bug. GetArtifact (metadata) + GetArtifactContent (body) is
// the pair the backend actually built for this - a deep link carries an
// artifact id and nothing else - so --folder and the folder-pagination walk
// it existed to avoid are both gone too.
var artifactsReadCmd = &cobra.Command{
	Use:   "read [artifact_id]",
	Short: "Read artifact content",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		client := backend.NewArtifactServiceClient()

		meta, err := client.GetArtifact(context.Background(), connect.NewRequest(&healthv1.GetArtifactRequest{ArtifactId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to read artifact: %v\n", err)
			return err
		}
		body, err := client.GetArtifactContent(context.Background(), connect.NewRequest(&healthv1.GetArtifactContentRequest{ArtifactId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to read artifact: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{
				"id":          meta.Msg.Artifact.Id,
				"folderId":    meta.Msg.Artifact.FolderId,
				"name":        meta.Msg.Artifact.Name,
				"description": meta.Msg.Artifact.Description,
				"contentType": body.Msg.ContentType,
				"content":     body.Msg.Content,
				"sizeBytes":   body.Msg.SizeBytes,
			})
			cmd.Println(string(jsonString))
			return nil
		}

		if isBinaryContentType(body.Msg.ContentType) {
			// Base64 dumped to a terminal is unreadable and, for an actual
			// image or PDF, is not text at all - --json is where the bytes
			// belong until this command grows a --output flag to decode
			// them to a local file.
			cmd.Printf("# %s\n(binary content, %s, %d bytes - use --json to get the base64 body)\n", meta.Msg.Artifact.Name, body.Msg.ContentType, body.Msg.SizeBytes)
			return nil
		}
		cmd.Printf("# %s\n%s\n", meta.Msg.Artifact.Name, body.Msg.Content)
		return nil
	},
}

var artifactsCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new artifact in a folder",
	RunE: func(cmd *cobra.Command, args []string) error {
		folderID, _ := cmd.Flags().GetString("folder")
		name, _ := cmd.Flags().GetString("name")
		description, _ := cmd.Flags().GetString("description")
		content, _ := cmd.Flags().GetString("content")
		contentType, _ := cmd.Flags().GetString("content-type")
		filePath, _ := cmd.Flags().GetString("file")
		isJson, _ := cmd.Flags().GetBool("json")
		if folderID == "" || name == "" {
			cmd.Println("Error: --folder and --name are required.")
			return errors.New("Error: --folder and --name are required.")
		}

		if filePath != "" {
			data, err := os.ReadFile(filePath)
			if err != nil {
				cmd.PrintErrf("Failed to read %s: %v\n", filePath, err)
				return err
			}
			if contentType == "" {
				contentType = http.DetectContentType(data)
			}
			// M18-T07: this used to base64-encode every --file upload
			// regardless of type, same bug as the GUI's upload path before
			// M18-T04 fixed it there - a decoded body of the source's actual
			// bytes was required to keep faith with what the GUI (and this
			// same content type) now promises. See isBinaryContentType.
			if isBinaryContentType(contentType) {
				content = base64.StdEncoding.EncodeToString(data)
			} else {
				content = string(data)
			}
		}
		if contentType == "" {
			contentType = "text/markdown"
		}

		client := backend.NewArtifactServiceClient()
		res, err := client.CreateArtifact(context.Background(), connect.NewRequest(&healthv1.CreateArtifactRequest{
			FolderId:    folderID,
			Name:        name,
			Description: description,
			Content:     content,
			ContentType: contentType,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create artifact: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Artifact)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Artifact created: %s (id: %s)\n", res.Msg.Artifact.Name, res.Msg.Artifact.Id)
		}
		return nil
	},
}

var foldersCreateCmd = &cobra.Command{
	Use:   "create-folder",
	Short: "Create a new folder in a project",
	RunE: func(cmd *cobra.Command, args []string) error {
		projectID, _ := cmd.Flags().GetString("project")
		parentID, _ := cmd.Flags().GetString("parent")
		name, _ := cmd.Flags().GetString("name")
		isJson, _ := cmd.Flags().GetBool("json")
		if projectID == "" {
			projectID = backend.DefaultProjectID()
		}
		if projectID == "" || name == "" {
			cmd.Println("Error: --project and --name are required.")
			return errors.New("Error: --project and --name are required.")
		}

		client := backend.NewArtifactServiceClient()
		res, err := client.CreateFolder(context.Background(), connect.NewRequest(&healthv1.CreateFolderRequest{
			ProjectId: projectID,
			ParentId:  parentID,
			Name:      name,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create folder: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Folder)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Folder created: %s (id: %s)\n", res.Msg.Folder.Name, res.Msg.Folder.Id)
		}
		return nil
	},
}

// M18-T08: updateArtifactContent has existed as an RPC since M05 (the GUI's
// artifact editor calls it) but had no CLI command - the only way to change
// an artifact's content from the CLI was delete-and-recreate, which loses
// the artifact id and any task links already made against it.
var artifactsUpdateContentCmd = &cobra.Command{
	Use:   "update-content [artifact_id]",
	Short: "Replace an artifact's content (and optionally its content type)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		content, _ := cmd.Flags().GetString("content")
		contentType, _ := cmd.Flags().GetString("content-type")
		filePath, _ := cmd.Flags().GetString("file")
		isJson, _ := cmd.Flags().GetBool("json")
		if content == "" && filePath == "" {
			cmd.Println("Error: --content or --file is required.")
			return errors.New("Error: --content or --file is required.")
		}

		if filePath != "" {
			data, err := os.ReadFile(filePath)
			if err != nil {
				cmd.PrintErrf("Failed to read %s: %v\n", filePath, err)
				return err
			}
			if contentType == "" {
				contentType = http.DetectContentType(data)
			}
			if isBinaryContentType(contentType) {
				content = base64.StdEncoding.EncodeToString(data)
			} else {
				content = string(data)
			}
		}

		req := &healthv1.UpdateArtifactContentRequest{ArtifactId: args[0], Content: content}
		if contentType != "" {
			req.ContentType = &contentType
		}

		client := backend.NewArtifactServiceClient()
		res, err := client.UpdateArtifactContent(context.Background(), connect.NewRequest(req))
		if err != nil {
			cmd.PrintErrf("Failed to update artifact content: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Artifact)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Artifact %s content updated\n", res.Msg.Artifact.Id)
		}
		return nil
	},
}

// M18-T08: updateFolder has existed as an RPC since M05 (the GUI's rename
// control calls it) but had no CLI command - a folder created with a typo
// had no way to be fixed short of deleting and recreating it, which orphans
// anything already filed under the old id.
var artifactsUpdateFolderCmd = &cobra.Command{
	Use:   "update-folder [folder_id]",
	Short: "Rename a folder",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		isJson, _ := cmd.Flags().GetBool("json")
		if name == "" {
			cmd.Println("Error: --name is required.")
			return errors.New("Error: --name is required.")
		}

		client := backend.NewArtifactServiceClient()
		res, err := client.UpdateFolder(context.Background(), connect.NewRequest(&healthv1.UpdateFolderRequest{
			FolderId: args[0],
			Name:     name,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to update folder: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Folder)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Folder %s renamed to '%s'\n", res.Msg.Folder.Id, res.Msg.Folder.Name)
		}
		return nil
	},
}

// M18-T08: link-task/unlink-task (M14-T08) let an agent attach or detach its
// own output blind - there was no way to see what was currently linked to a
// task or artifact without going to the GUI.
var artifactsListTaskLinksCmd = &cobra.Command{
	Use:   "list-task-links",
	Short: "List task-artifact links for a task (--task) or an artifact (--artifact)",
	RunE: func(cmd *cobra.Command, args []string) error {
		taskID, _ := cmd.Flags().GetString("task")
		artifactID, _ := cmd.Flags().GetString("artifact")
		isJson, _ := cmd.Flags().GetBool("json")
		if (taskID == "") == (artifactID == "") {
			cmd.Println("Error: exactly one of --task or --artifact is required.")
			return errors.New("Error: exactly one of --task or --artifact is required.")
		}

		req := &healthv1.ListTaskArtifactLinksRequest{}
		if taskID != "" {
			req.TaskId = &taskID
		} else {
			req.ArtifactId = &artifactID
		}

		client := backend.NewArtifactServiceClient()
		res, err := client.ListTaskArtifactLinks(context.Background(), connect.NewRequest(req))
		if err != nil {
			cmd.PrintErrf("Failed to list task-artifact links: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Links)
			cmd.Println(string(jsonString))
		} else if len(res.Msg.Links) == 0 {
			cmd.Println("No links found.")
		} else {
			for _, l := range res.Msg.Links {
				cmd.Printf(" - %s <-> %s (link id: %s)\n", l.TaskTitle, l.ArtifactName, l.Id)
			}
		}
		return nil
	},
}

var artifactsDeleteCmd = &cobra.Command{
	Use:   "delete [artifact_id]",
	Short: "Move an artifact to the bin",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		client := backend.NewArtifactServiceClient()
		_, err := client.ArchiveArtifact(context.Background(), connect.NewRequest(&healthv1.ArchiveArtifactRequest{ArtifactId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to delete artifact: %v\n", err)
			return err
		}
		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "artifactId": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Artifact %s moved to bin\n", args[0])
		}
		return nil
	},
}

var artifactsRestoreCmd = &cobra.Command{
	Use:   "restore [artifact_id]",
	Short: "Restore an artifact from the bin",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		client := backend.NewArtifactServiceClient()
		_, err := client.RestoreArtifact(context.Background(), connect.NewRequest(&healthv1.RestoreArtifactRequest{ArtifactId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to restore artifact: %v\n", err)
			return err
		}
		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "artifactId": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Artifact %s restored\n", args[0])
		}
		return nil
	},
}

var foldersDeleteCmd = &cobra.Command{
	Use:   "delete-folder [folder_id]",
	Short: "Move a folder to the bin",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		client := backend.NewArtifactServiceClient()
		_, err := client.ArchiveFolder(context.Background(), connect.NewRequest(&healthv1.ArchiveFolderRequest{FolderId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to delete folder: %v\n", err)
			return err
		}
		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "folderId": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Folder %s moved to bin\n", args[0])
		}
		return nil
	},
}

var foldersRestoreCmd = &cobra.Command{
	Use:   "restore-folder [folder_id]",
	Short: "Restore a folder from the bin",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		client := backend.NewArtifactServiceClient()
		_, err := client.RestoreFolder(context.Background(), connect.NewRequest(&healthv1.RestoreFolderRequest{FolderId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to restore folder: %v\n", err)
			return err
		}
		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "folderId": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Folder %s restored\n", args[0])
		}
		return nil
	},
}

var artifactsPurgeCmd = &cobra.Command{
	Use:   "purge [artifact_id]",
	Short: "Permanently delete an already-binned, unlinked artifact",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		client := backend.NewArtifactServiceClient()
		_, err := client.PurgeArtifact(context.Background(), connect.NewRequest(&healthv1.PurgeArtifactRequest{ArtifactId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to purge artifact: %v\n", err)
			return err
		}
		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "artifactId": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Artifact %s permanently deleted\n", args[0])
		}
		return nil
	},
}

// M14-T08: LinkTaskArtifact/UnlinkTaskArtifact have existed since M05 but
// were only ever reachable from the GUI - an agent working entirely through
// the CLI had no way to attach its own output to the task it was given.
var artifactsLinkTaskCmd = &cobra.Command{
	Use:   "link-task",
	Short: "Link an artifact to a task, so the task detail view shows it as evidence",
	RunE: func(cmd *cobra.Command, args []string) error {
		taskID, _ := cmd.Flags().GetString("task")
		artifactID, _ := cmd.Flags().GetString("artifact")
		isJson, _ := cmd.Flags().GetBool("json")
		if taskID == "" || artifactID == "" {
			cmd.Println("Error: --task and --artifact are required.")
			return errors.New("Error: --task and --artifact are required.")
		}

		client := backend.NewArtifactServiceClient()
		res, err := client.LinkTaskArtifact(context.Background(), connect.NewRequest(&healthv1.LinkTaskArtifactRequest{
			TaskId:     taskID,
			ArtifactId: artifactID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to link artifact to task: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Link)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Linked artifact '%s' to task '%s'\n", res.Msg.Link.ArtifactName, res.Msg.Link.TaskTitle)
		}
		return nil
	},
}

var artifactsUnlinkTaskCmd = &cobra.Command{
	Use:   "unlink-task",
	Short: "Remove a task-artifact link (the artifact itself is untouched)",
	RunE: func(cmd *cobra.Command, args []string) error {
		taskID, _ := cmd.Flags().GetString("task")
		artifactID, _ := cmd.Flags().GetString("artifact")
		isJson, _ := cmd.Flags().GetBool("json")
		if taskID == "" || artifactID == "" {
			cmd.Println("Error: --task and --artifact are required.")
			return errors.New("Error: --task and --artifact are required.")
		}

		client := backend.NewArtifactServiceClient()
		_, err := client.UnlinkTaskArtifact(context.Background(), connect.NewRequest(&healthv1.UnlinkTaskArtifactRequest{
			TaskId:     taskID,
			ArtifactId: artifactID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to unlink artifact from task: %v\n", err)
			return err
		}
		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "taskId": taskID, "artifactId": artifactID})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Unlinked artifact %s from task %s\n", artifactID, taskID)
		}
		return nil
	},
}

var foldersPurgeCmd = &cobra.Command{
	Use:   "purge-folder [folder_id]",
	Short: "Permanently delete an already-binned, empty folder",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")
		client := backend.NewArtifactServiceClient()
		_, err := client.PurgeFolder(context.Background(), connect.NewRequest(&healthv1.PurgeFolderRequest{FolderId: args[0]}))
		if err != nil {
			cmd.PrintErrf("Failed to purge folder: %v\n", err)
			return err
		}
		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": true, "folderId": args[0]})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Folder %s permanently deleted\n", args[0])
		}
		return nil
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
	artifactsCmd.AddCommand(artifactsLinkTaskCmd)
	artifactsCmd.AddCommand(artifactsUnlinkTaskCmd)
	artifactsCmd.AddCommand(artifactsListTaskLinksCmd)
	artifactsCmd.AddCommand(artifactsUpdateContentCmd)
	artifactsCmd.AddCommand(artifactsUpdateFolderCmd)
	artifactsCmd.AddCommand(foldersCreateCmd)
	artifactsCmd.AddCommand(foldersDeleteCmd)
	artifactsCmd.AddCommand(foldersRestoreCmd)
	artifactsCmd.AddCommand(foldersPurgeCmd)

	artifactsListCmd.Flags().String("project", "", "Project ID to list folders for (or set TASKER_PROJECT_ID)")
	artifactsListCmd.Flags().String("folder", "", "Folder ID to list artifacts within")
	artifactsListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	artifactsListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	artifactsListCmd.Flags().Bool("only-deleted", false, "List only archived (binned) folders/artifacts, instead of active ones")
	artifactsCreateCmd.Flags().String("folder", "", "Folder ID to create the artifact in")
	artifactsCreateCmd.Flags().String("name", "", "Artifact name")
	artifactsCreateCmd.Flags().String("description", "", "Artifact description")
	artifactsCreateCmd.Flags().String("content", "", "Artifact text content")
	artifactsCreateCmd.Flags().String("content-type", "", "MIME type of the content (default text/markdown, or auto-detected with --file)")
	artifactsCreateCmd.Flags().String("file", "", "Path to a local file to upload as the artifact's content (e.g. an image); base64-encoded automatically")
	artifactsUpdateContentCmd.Flags().String("content", "", "New artifact text content")
	artifactsUpdateContentCmd.Flags().String("content-type", "", "New MIME type of the content (auto-detected with --file, unchanged otherwise)")
	artifactsUpdateContentCmd.Flags().String("file", "", "Path to a local file whose contents replace the artifact's; base64-encoded automatically for binary types")
	artifactsUpdateFolderCmd.Flags().String("name", "", "New folder name")
	foldersCreateCmd.Flags().String("project", "", "Project ID (or set TASKER_PROJECT_ID)")
	foldersCreateCmd.Flags().String("parent", "", "Parent folder ID (optional, for nesting)")
	foldersCreateCmd.Flags().String("name", "", "Folder name")
	artifactsLinkTaskCmd.Flags().String("task", "", "Task ID to link the artifact to")
	artifactsLinkTaskCmd.Flags().String("artifact", "", "Artifact ID to link")
	artifactsUnlinkTaskCmd.Flags().String("task", "", "Task ID to unlink the artifact from")
	artifactsUnlinkTaskCmd.Flags().String("artifact", "", "Artifact ID to unlink")
	artifactsListTaskLinksCmd.Flags().String("task", "", "List links for this task")
	artifactsListTaskLinksCmd.Flags().String("artifact", "", "List links for this artifact")
}
