#!/bin/sh
# Run the f5deadtown Go server (game + editor + shared API) from this
# project folder. Any args are forwarded to the server, e.g.:
#   ./run.sh -game-port 9001 -editor-port 9002
#   ./run.sh -reseed
set -e
cd "$(dirname "$0")/server"
exec go run . "$@"
