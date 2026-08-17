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

var authTokenCmd = &cobra.Command{
	Use:   "token",
	Short: "Manage agent API tokens",
	Long: "Create, list and revoke the credentials an agent authenticates with.\n\n" +
		"A token is shown once, at creation, and stored only as a hash - there is\n" +
		"no way to retrieve it afterwards. Authenticate as the agent by exporting\n" +
		"TASKER_TOKEN, or by passing --token.",
}

var authTokenCreateCmd = &cobra.Command{
	Use:   "create [agent_id]",
	Short: "Issue a token for an agent (shown once)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		scopes, _ := cmd.Flags().GetStringSlice("scope")
		expiresInDays, _ := cmd.Flags().GetInt32("expires-in-days")
		isJSON, _ := cmd.Flags().GetBool("json")

		if name == "" || len(scopes) == 0 {
			cmd.Println("Error: --name and at least one --scope are required.")
			return fmt.Errorf("--name and --scope are required")
		}

		client := backend.NewAgentServiceClient()
		res, err := client.CreateAgentToken(context.Background(), connect.NewRequest(&healthv1.CreateAgentTokenRequest{
			AgentId:       args[0],
			Name:          name,
			Scopes:        scopes,
			ExpiresInDays: expiresInDays,
		}))
		if err != nil {
			cmd.PrintErrf("Failed to create token: %v\n", backend.DescribeRPCError(err))
			return err
		}

		if isJSON {
			// The plaintext is in this payload deliberately: a script has no
			// other chance to capture it.
			out, _ := json.Marshal(map[string]any{"token": res.Msg.Token, "plaintext": res.Msg.Plaintext})
			cmd.Println(string(out))
			return nil
		}

		cmd.Printf("Token created for agent %s\n\n", args[0])
		cmd.Printf("  %s\n\n", res.Msg.Plaintext)
		cmd.Println("This is the only time it will be shown. Store it now.")
		cmd.Printf("Expires %s. Scopes: %v\n", res.Msg.Token.ExpiresAt, res.Msg.Token.Scopes)
		return nil
	},
}

var authTokenListCmd = &cobra.Command{
	Use:   "list [agent_id]",
	Short: "List an agent's tokens (never shows the secret)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJSON, _ := cmd.Flags().GetBool("json")

		client := backend.NewAgentServiceClient()
		res, err := client.ListAgentTokens(context.Background(), connect.NewRequest(&healthv1.ListAgentTokensRequest{
			AgentId: args[0],
		}))
		if err != nil {
			cmd.PrintErrf("Failed to list tokens: %v\n", backend.DescribeRPCError(err))
			return err
		}

		if isJSON {
			out, _ := json.Marshal(res.Msg.Tokens)
			cmd.Println(string(out))
			return nil
		}

		if len(res.Msg.Tokens) == 0 {
			cmd.Printf("No tokens for agent %s.\n", args[0])
			return nil
		}
		for _, t := range res.Msg.Tokens {
			state := "active"
			if t.RevokedAt != "" {
				state = "revoked"
			} else if t.Expired {
				state = "expired"
			}
			lastUsed := t.LastUsedAt
			if lastUsed == "" {
				lastUsed = "never used"
			}
			cmd.Printf("%s  %s…  %-8s  %s  expires %s  last used %s\n",
				t.Id, t.TokenPrefix, state, t.Name, t.ExpiresAt, lastUsed)
		}
		return nil
	},
}

var authTokenRevokeCmd = &cobra.Command{
	Use:   "revoke [token_id]",
	Short: "Revoke a token, effective on its next request",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		isJSON, _ := cmd.Flags().GetBool("json")
		client := backend.NewAgentServiceClient()
		_, err := client.RevokeAgentToken(context.Background(), connect.NewRequest(&healthv1.RevokeAgentTokenRequest{
			TokenId: args[0],
		}))
		if err != nil {
			cmd.PrintErrf("Failed to revoke token: %v\n", backend.DescribeRPCError(err))
			return err
		}
		if isJSON {
			out, _ := json.Marshal(map[string]any{"success": true, "tokenId": args[0]})
			cmd.Println(string(out))
			return nil
		}
		cmd.Printf("Token %s revoked.\n", args[0])
		return nil
	},
}

func init() {
	authCmd.AddCommand(authTokenCmd)
	authTokenCmd.AddCommand(authTokenCreateCmd)
	authTokenCmd.AddCommand(authTokenListCmd)
	authTokenCmd.AddCommand(authTokenRevokeCmd)

	authTokenCreateCmd.Flags().String("name", "", "What this token is for (e.g. \"CI worker\")")
	authTokenCreateCmd.Flags().StringSlice("scope", nil, "Scope to grant; repeatable (e.g. --scope tasks:read --scope tasks:write)")
	authTokenCreateCmd.Flags().Int32("expires-in-days", 0, "Days until expiry (default 90, maximum 365)")
	// --json is already registered as a persistent flag on rootCmd (root.go);
	// these commands used to redeclare a local one of the same name, which
	// shadowed the persistent flag for no benefit.
}
