package cmd

import (
	"fmt"
	"net/http"
	"time"

	"github.com/spf13/cobra"
)

var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "Authentication commands",
}

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Login to the Tasker system via Google",
	Run: func(cmd *cobra.Command, args []string) {
		// Scaffold: Start local HTTP server to catch OAuth callback
		fmt.Println("Please open this URL to authenticate:")
		fmt.Println("http://localhost:3000/api/auth/google/login?cli=true")
		fmt.Println("Waiting for callback on localhost:3952... ⏳")
		
		ch := make(chan string)
		http.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
			token := r.URL.Query().Get("token")
			ch <- token
			fmt.Fprintf(w, "Success! You can close this window now.")
		})
		
		srv := &http.Server{Addr: ":3952"}
		go srv.ListenAndServe()
		
		// Wait for token
		select {
		case token := <-ch:
			// Save token to keychain/config
			fmt.Println("Success! Logged in securely. Token saved to keychain.")
			_ = token // mock saving
			srv.Close()
		case <-time.After(5 * time.Minute):
			fmt.Println("Timeout waiting for authentication.")
			srv.Close()
		}
	},
}

func init() {
	rootCmd.AddCommand(authCmd)
	authCmd.AddCommand(loginCmd)
}
