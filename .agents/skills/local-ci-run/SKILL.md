---
name: local-ci-run
description: Checking for gh cli and act plugin, handle user installation prompt, and automatically run act on relevant pipelines locally to test changes gracefully. Keeps token efficiency high by using encapsulated scripts.
---

# Role
Local CI validation using `gh act`. It ensures that modified GitHub workflows or relevant project code are tested locally safely and interactively without needing to commit or push.

# Goal
Provide an optional layer of quality testing by verifying CI tasks passing locally. If the machine does not have the prerequisites, cleanly fail or install them based on user consent without wasting LLM reasoning on manual setup.

# Constraints
- ALWAYS script the check, execution, and installation. Avoid using reasoning capacity to figure out `gh` or `act` flags directly unless modifying the run script.
- NEVER force installation. You must ask the user for permission. If they say no, accept it gracefully.
- ALWAYS use the provided scripts instead of manual bash commands to manipulate these tools.

# Instructions
1. **Check Dependencies:** Run `.agents/skills/local-ci-run/scripts/check.sh`
   - If it exits with `0`, both `gh` and the `act` plugin are installed. Proceed to **Step 4**.
   - If it exits with `1`, proceed to **Step 2**.

2. **Ask User:** Ask the user if they want to install `gh` CLI and the `act` plugin automatically to run CI pipelines locally. "Do you want to install the \`gh\` CLI and the \`act\` plugin to run CI locally? (yes/no)". Stop here and wait for their response.

3. **Handle Response:**
   - If "no": Accept it gracefully, note that the local CI check is skipped, and move on.
   - If "yes": Run `.agents/skills/local-ci-run/scripts/install.sh`. Wait for it to complete. 

4. **Run Local CI:** 
   - Ensure the relevant tool dependencies are installed.
   - Run `.agents/skills/local-ci-run/scripts/run.sh [event_name] [options...]`
   - By default, use `push` as the event (e.g. `.agents/skills/local-ci-run/scripts/run.sh push`). 
   - If testing a specific workflow, you can pass `-W .github/workflows/specific.yml` to the script. Example: `.agents/skills/local-ci-run/scripts/run.sh push -W .github/workflows/ci.yml`.

5. **Report Results:** 
   - Evaluate the output of the local CI run. 
   - Provide a brief summary of what passed or failed.
