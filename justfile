set dotenv-load := true
set dotenv-path := "apps/api/.env"

default:
    @just --list

migrate-up:
    cd apps/api && go run . migrate up

run: bin
    #!/bin/sh
    set -eu
    if [ ! -x apps/marpos-web/node_modules/.bin/next ]; then
        echo "Run bun install in apps/marpos-web first." >&2
        exit 1
    fi
    (cd apps/api && APP_PORT=6010 APP_HOST=http://localhost:6010 exec ./marpos-api) &
    api_pid=$!
    (cd apps/marpos-web && exec ./node_modules/.bin/next dev --port 6011) &
    web_pid=$!
    stop() {
        trap - INT TERM EXIT
        kill "$api_pid" "$web_pid" 2>/dev/null || true
        wait "$api_pid" "$web_pid" 2>/dev/null || true
    }
    trap stop INT TERM EXIT
    wait "$api_pid" "$web_pid"

bin:
    cd apps/api && go build -o marpos-api .
