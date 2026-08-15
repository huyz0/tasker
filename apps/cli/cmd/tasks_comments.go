package cmd

import (
	"context"
	"encoding/json"
	"fmt"

	"connectrpc.com/connect"
	healthv1 "github.com/huyz0/tasker/apps/cli/gen/tasker/health/v1"
	"github.com/huyz0/tasker/apps/cli/internal/backend"
	"github.com/spf13/cobra"
)

var tasksCommentAddCmd = &cobra.Command{
	Use:   "comment-add [task_id]",
	Short: "Add a comment to a task",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		content, _ := cmd.Flags().GetString("content")
		isJson, _ := cmd.Flags().GetBool("json")
		if content == "" {
			cmd.Println("Error: --content is required.")
			return fmt.Errorf("--content is required")
		}

		client := backend.NewCommentServiceClient()
		res, err := client.CreateComment(context.Background(), connect.NewRequest(&healthv1.CreateCommentRequest{
			EntityId:   args[0],
			EntityType: "task",
			Content:    content,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to add comment: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Comment)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Comment added to task %s (id: %s)\n", args[0], res.Msg.Comment.Id)
		}
		return nil
	},
}

var tasksCommentsCmd = &cobra.Command{
	Use:   "comments [task_id]",
	Short: "List comments on a task",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJson, _ := cmd.Flags().GetBool("json")

		client := backend.NewCommentServiceClient()
		res, err := client.ListComments(context.Background(), connect.NewRequest(&healthv1.ListCommentsRequest{
			EntityId:   args[0],
			EntityType: "task",
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list comments: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Comments)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Comments on task %s:\n", args[0])
			for _, c := range res.Msg.Comments {
				cmd.Printf(" - [%s] %s\n", c.CreatedAt, c.Content)
			}
		}
		return nil
	},
}

func init() {
	tasksCmd.AddCommand(tasksCommentAddCmd)
	tasksCmd.AddCommand(tasksCommentsCmd)

	tasksCommentAddCmd.Flags().String("content", "", "Comment text")
	// --user and --agent are gone (M04-T06): the author is whoever the
	// credential belongs to. Naming an author in the request let any member
	// attribute a comment to any agent.
}
