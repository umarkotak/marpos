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
    (cd apps/api && APP_PORT=6030 APP_HOST=http://localhost:6030 exec ./marpos-api) &
    api_pid=$!
    (cd apps/marpos-web && exec ./node_modules/.bin/next dev --port 6031) &
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

# Run these service recipes from the checkout at /Users/umar/umar/personal_project/marpos.
install-service: bin
    test "$(pwd)" = "/Users/umar/umar/personal_project/marpos"
    test -f apps/api/.env
    cd apps/api && ./marpos-api migrate up
    sudo install -o root -g wheel -m 644 apps/api/com.marpos-api.plist /Library/LaunchDaemons/com.marpos-api.plist
    sudo launchctl bootstrap system /Library/LaunchDaemons/com.marpos-api.plist

uninstall-service:
    sudo launchctl bootout system/com.marpos-api
    sudo rm /Library/LaunchDaemons/com.marpos-api.plist

restart-service:
    sudo launchctl kickstart -k system/com.marpos-api

status-service:
    sudo launchctl print system/com.marpos-api

logs:
    tail -f apps/api/marpos-api.error.log

deploy:
    #!/bin/sh
    set -eu
    test "$(pwd)" = "/Users/umar/umar/personal_project/marpos"
    test -f apps/api/.env
    git pull --ff-only
    cd apps/api
    trap 'rm -f marpos-api.next' EXIT
    go build -o marpos-api.next .
    ./marpos-api.next migrate up
    mv marpos-api.next marpos-api
    sudo launchctl kickstart -k system/com.marpos-api
