#!/bin/bash
# Test server starter
export MIRAI_LLM_API_KEY=$(cat /tmp/mirai_key.txt | tr -d '\n')
cd /opt/data/mirai-app
exec node node_modules/.bin/next start -p 3333
