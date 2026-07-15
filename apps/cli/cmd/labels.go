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

var labelsCmd = &cobra.Command{
	Use:   "labels",
	Short: "Manage labels and attach them to tasks or artifacts",
}

var labelsCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new label in an organization",
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		color, _ := cmd.Flags().GetString("color")
		orgID, _ := cmd.Flags().GetString("org")
		isJson, _ := cmd.Flags().GetBool("json")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if name == "" || orgID == "" {
			cmd.Println("Error: --org and --name are required.")
			return fmt.Errorf("--org and --name are required")
		}

		client := backend.NewLabelServiceClient()
		res, err := client.CreateLabel(context.Background(), connect.NewRequest(&healthv1.CreateLabelRequest{
			OrgId: orgID,
			Name:  name,
			Color: color,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create label: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Label)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Label created: %s (id: %s)\n", res.Msg.Label.Name, res.Msg.Label.Id)
		}
		return nil
	},
}

var labelsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List labels defined in an organization",
	RunE: func(cmd *cobra.Command, args []string) error {
		orgID, _ := cmd.Flags().GetString("org")
		isJson, _ := cmd.Flags().GetBool("json")
		filter, _ := cmd.Flags().GetString("filter")
		sort, _ := cmd.Flags().GetString("sort")
		limit, _ := cmd.Flags().GetInt32("limit")
		cursor, _ := cmd.Flags().GetString("cursor")
		if orgID == "" {
			orgID = backend.DefaultOrgID()
		}
		if orgID == "" {
			cmd.Println("Error: --org is required (or set TASKER_ORG_ID).")
			return fmt.Errorf("--org is required (or set TASKER_ORG_ID)")
		}

		client := backend.NewLabelServiceClient()
		res, err := client.ListLabels(context.Background(), connect.NewRequest(&healthv1.ListLabelsRequest{
			OrgId: orgID,
			Page:  &healthv1.PageRequest{Limit: limit, Cursor: cursor, Filter: filter, Sort: sort},
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list labels: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Labels)
			cmd.Println(string(jsonString))
		} else {
			cmd.Println("Labels:")
			for _, l := range res.Msg.Labels {
				cmd.Printf(" - %s (id: %s)\n", l.Name, l.Id)
			}
		}
		return nil
	},
}

var labelsAttachCmd = &cobra.Command{
	Use:   "attach [entity_id]",
	Short: "Attach a label to a task or artifact",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		entityType, _ := cmd.Flags().GetString("entity-type")
		labelID, _ := cmd.Flags().GetString("label")
		isJson, _ := cmd.Flags().GetBool("json")
		if entityType == "" || labelID == "" {
			cmd.Println("Error: --entity-type and --label are required.")
			return fmt.Errorf("--entity-type and --label are required")
		}

		client := backend.NewLabelServiceClient()
		res, err := client.AttachLabel(context.Background(), connect.NewRequest(&healthv1.AttachLabelRequest{
			EntityId:   args[0],
			EntityType: entityType,
			LabelId:    labelID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to attach label: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": res.Msg.Success})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Label %s attached to %s %s\n", labelID, entityType, args[0])
		}
		return nil
	},
}

var labelsDetachCmd = &cobra.Command{
	Use:   "detach [entity_id]",
	Short: "Detach a label from a task or artifact",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		entityType, _ := cmd.Flags().GetString("entity-type")
		labelID, _ := cmd.Flags().GetString("label")
		isJson, _ := cmd.Flags().GetBool("json")
		if entityType == "" || labelID == "" {
			cmd.Println("Error: --entity-type and --label are required.")
			return fmt.Errorf("--entity-type and --label are required")
		}

		client := backend.NewLabelServiceClient()
		res, err := client.DetachLabel(context.Background(), connect.NewRequest(&healthv1.DetachLabelRequest{
			EntityId:   args[0],
			EntityType: entityType,
			LabelId:    labelID,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to detach label: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(map[string]any{"success": res.Msg.Success})
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Label %s detached from %s %s\n", labelID, entityType, args[0])
		}
		return nil
	},
}

var labelsOnCmd = &cobra.Command{
	Use:   "on [entity_id]",
	Short: "List labels attached to a task or artifact",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		entityType, _ := cmd.Flags().GetString("entity-type")
		isJson, _ := cmd.Flags().GetBool("json")
		if entityType == "" {
			cmd.Println("Error: --entity-type is required.")
			return fmt.Errorf("--entity-type is required")
		}

		client := backend.NewLabelServiceClient()
		res, err := client.ListEntityLabels(context.Background(), connect.NewRequest(&healthv1.ListEntityLabelsRequest{
			EntityId:   args[0],
			EntityType: entityType,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list labels: %v\n", err)
			return err
		}

		if isJson {
			jsonString, _ := json.Marshal(res.Msg.Labels)
			cmd.Println(string(jsonString))
		} else {
			cmd.Printf("Labels on %s %s:\n", entityType, args[0])
			for _, l := range res.Msg.Labels {
				cmd.Printf(" - %s (id: %s)\n", l.Name, l.Id)
			}
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(labelsCmd)
	labelsCmd.AddCommand(labelsCreateCmd)
	labelsCmd.AddCommand(labelsListCmd)
	labelsCmd.AddCommand(labelsAttachCmd)
	labelsCmd.AddCommand(labelsDetachCmd)
	labelsCmd.AddCommand(labelsOnCmd)

	labelsCreateCmd.Flags().String("name", "", "Label name")
	labelsCreateCmd.Flags().String("color", "", "Label color (e.g. hex code)")
	labelsCreateCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	labelsListCmd.Flags().String("org", "", "Organization ID (or set TASKER_ORG_ID)")
	labelsListCmd.Flags().StringP("filter", "f", "", "Substring match against label name")
	labelsListCmd.Flags().StringP("sort", "s", "", "Sort as \"name\" or \"name:desc\" (works with --cursor for paging)")
	labelsListCmd.Flags().Int32P("limit", "l", 50, "Maximum number of items to return")
	labelsListCmd.Flags().StringP("cursor", "c", "", "Pagination cursor to fetch the next set")
	labelsAttachCmd.Flags().String("entity-type", "", "Entity type: task or artifact")
	labelsAttachCmd.Flags().String("label", "", "Label ID to attach")
	labelsDetachCmd.Flags().String("entity-type", "", "Entity type: task or artifact")
	labelsDetachCmd.Flags().String("label", "", "Label ID to detach")
	labelsOnCmd.Flags().String("entity-type", "", "Entity type: task or artifact")
}
