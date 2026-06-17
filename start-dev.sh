#!/bin/bash
# Start Mirai App 2.0
set -e
KEY_VAR=$(head -1 /tmp/mirai_key.txt)
export MIRAI_LLM_API_KEY=*** /opt/data/mirai-app

echo "Starting Mirai App 2.0 on port 3333..."
echo "Model: claude-opus-4-8 via MyAPI"

exec node node_modules/.bin/next start -p 3333
