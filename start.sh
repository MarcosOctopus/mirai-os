#!/bin/bash
# Start Mirai App - production server
# TTS key is read directly from credentials file by the app
cd /opt/data/mirai-app
exec npx next start -p 3333
