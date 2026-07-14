package cmd

import (
	"context"
	"net/http"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
)

var (
	entityId   string
	entityType string
	content    string
)

var commentCmd = &cobra.Command{
	Use:   "comment",
	Short: "Manage comments on tasks and artifacts",
}

var commentAddCmd = &cobra.Command{
	Use:   "add",
	Short: "Add a new comment",
	Run: func(cmd *cobra.Command, args []string) {
		client := v1connect.NewCommentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)

		req := connect.NewRequest(&healthv1.CreateCommentRequest{
			EntityId:   entityId,
			EntityType: entityType,
			Content:    content,
		})

		res, err := client.CreateComment(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("failed to add comment: %v\n", err)
			return
		}

		cmd.Printf("Comment added successfully! ID: %s\n", res.Msg.Comment.Id)
	},
}

var commentListCmd = &cobra.Command{
	Use:   "list",
	Short: "List comments for an entity",
	Run: func(cmd *cobra.Command, args []string) {
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		client := v1connect.NewCommentServiceClient(http.DefaultClient, backend.URL(), backend.ClientOptions()...)

		req := connect.NewRequest(&healthv1.ListCommentsRequest{
			EntityId:   entityId,
			EntityType: entityType,
			Page:       &healthv1.PageRequest{Limit: limit, Cursor: cursor},
		})

		res, err := client.ListComments(context.Background(), req)
		if err != nil {
			cmd.PrintErrf("failed to list comments: %v\n", err)
			return
		}

		if len(res.Msg.Comments) == 0 {
			cmd.Println("No comments found.")
			return
		}

		cmd.Printf("Comments for %s (%s):\n", entityId, entityType)
		for _, c := range res.Msg.Comments {
			cmd.Printf("- [%s] %s\n", c.Id, c.Content)
		}
	},
}

func init() {
	rootCmd.AddCommand(commentCmd)
	commentCmd.AddCommand(commentAddCmd)
	commentCmd.AddCommand(commentListCmd)

	commentAddCmd.Flags().StringVar(&entityId, "entity", "", "Entity ID (task or artifact ID)")
	commentAddCmd.MarkFlagRequired("entity")
	commentAddCmd.Flags().StringVar(&entityType, "type", "task", "Entity type (task or artifact)")
	commentAddCmd.Flags().StringVar(&content, "content", "", "Markdown content of the comment")
	commentAddCmd.MarkFlagRequired("content")

	commentListCmd.Flags().StringVar(&entityId, "entity", "", "Entity ID")
	commentListCmd.MarkFlagRequired("entity")
	commentListCmd.Flags().StringVar(&entityType, "type", "task", "Entity type")
	commentListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	commentListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
}
