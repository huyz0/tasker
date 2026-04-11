package cmd

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"

	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1/v1connect"
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
		client := v1connect.NewCommentServiceClient(http.DefaultClient, "http://localhost:8080")

		req := connect.NewRequest(&healthv1.CreateCommentRequest{
			EntityId:   entityId,
			EntityType: entityType,
			Content:    content,
		})

		res, err := client.CreateComment(context.Background(), req)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to add comment: %v\n", err)
			os.Exit(1)
		}

		cmd.Printf("Comment added successfully! ID: %s\n", res.Msg.Comment.Id)
	},
}

var commentListCmd = &cobra.Command{
	Use:   "list",
	Short: "List comments for an entity",
	Run: func(cmd *cobra.Command, args []string) {
		client := v1connect.NewCommentServiceClient(http.DefaultClient, "http://localhost:8080")

		req := connect.NewRequest(&healthv1.ListCommentsRequest{
			EntityId:   entityId,
			EntityType: entityType,
		})

		res, err := client.ListComments(context.Background(), req)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to list comments: %v\n", err)
			os.Exit(1)
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
}
