# Go Concurrency Code Review Standards

When reviewing concurrent Go code, prioritize safety, deterministic execution, and lack of leaks.

## 1. Goroutine Leaks
Every goroutine MUST have a clear, guaranteed termination point. Look for:
- Goroutines blocking indefinitely on a channel read/write with no timeouts or context cancellation.
- Inadequate use of `context.Context` to propagate cancellations.
- **Review Action:** Reject the PR if a goroutine is spawned without a clear exit strategy.

## 2. Channels vs Mutexes
Use the right tool for the job.
- **Channels** are for coordinating passing ownership of data or signals between goroutines.
- **`sync.Mutex`** is for protecting shared state.
- **Channel Size is One or None:** Channels should usually have a size of one or be unbuffered (`make(chan int)`). Any other size must be subject to a high level of scrutiny to ensure it doesn't just defer deadlocks.

## 3. Data Races
Ensure shared variables read/written across multiple goroutines are synchronized.
- Variables captured in closures spawned in a `for` loop (prior to Go 1.22) must be locally shadowed inside the loop.
- Slices/maps are not thread-safe. Concurrent map writes will crash the program.

## 4. Fire-and-Forget
Avoid fire-and-forget goroutines (e.g. `go func() {}()`).
- Always use a `sync.WaitGroup` or errgroup to wait for goroutines to exit cleanly before shutting down the application or returning a critical response.
