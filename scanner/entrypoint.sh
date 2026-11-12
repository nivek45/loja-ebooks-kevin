#!/bin/sh
set -eu
freshclam
clamd
freshclam -d
exec su -s /bin/sh node -c 'exec node /app/server.mjs'
