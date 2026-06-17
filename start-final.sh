#!/bin/bash
set -e
cd /opt/data/mirai-app
echo "Starting Mirai App 2.0..."
exec node node_modules/.bin/next start -p 3333
