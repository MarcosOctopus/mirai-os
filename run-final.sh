#!/bin/bash
set -e
cd /opt/data/mirai-app
echo "🔨 Building Mirai App..."
npx next build
echo "🚀 Starting Mirai App..."
KEY=$(cat /opt/data/mirai-app/.mirai_key)
export MIRAI_LLM_API_KEY="
exec node node_modules/.bin/next start -p 3333
