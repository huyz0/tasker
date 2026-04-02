# Backend (Golang) Code Review Standards Index

When reviewing Go code, DO NOT check for basic formatting (`gofmt` or `goimports`) or issues typically caught by `golangci-lint` (unless explicit logic errors are present). Focus on idiomatic correctness, architecture, concurrency safety, and error handling.

Use progressive disclosure to read ONLY the relevant focus areas based on the code being reviewed:

- **Concurrency & Goroutines:** If the code changes involve `go` routines, `sync.Mutex`, `sync.WaitGroup`, or `chan`, read `.agents/skills/code-review-auto/references/golang/concurrency.md`
- **Error Handling:** If there are changes to how errors are returned, created, or wrapped, read `.agents/skills/code-review-auto/references/golang/error-handling.md`
- **Interfaces & Types:** If the PR defines new interfaces, structs, or modifies pointers/references, read `.agents/skills/code-review-auto/references/golang/interfaces.md`
- **Project & Package Layout:** If new packages are created, or there is restructuring of bounded contexts and dependencies, read `.agents/skills/code-review-auto/references/golang/project-layout.md`
