#!/bin/bash
# Description: Runs local CI using gh act
# Usage: ./run.sh [event_name] [additional_act_args...]
EVENT=${1:-push}
shift

if [[ "$EVENT" != "push" && "$EVENT" != "pull_request" && "$EVENT" != *.* ]]; then
    # It might be a custom event or you just want to run push
    # We will pass it as is.
    :
fi

echo "---"
echo "Running local CI via gh act..."
echo "Event/Target: $EVENT"
if [ $# -gt 0 ]; then
    echo "Additional Args: $@"
fi
echo "---"

# Run it
gh act "$EVENT" "$@"
