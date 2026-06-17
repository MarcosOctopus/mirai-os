#!/bin/bash
# Start Mirai App 2.0 with proper API key
set -e
cd /opt/data/mirai-app
MIRAI_LLM_API_KEY=*** node node_modules/.bin/next start -p 3333
