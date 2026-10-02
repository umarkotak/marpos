# Marpos API

Go API for Marpos. Requires PostgreSQL and Go 1.26 or newer.

```sh
cp apps/api/.env.example apps/api/.env
(cd apps/marpos-web && bun install)
just migrate-up
just run
```

`GET /marpos/api/ping` returns `{"data":{"ping":"pong"},"success":true,"error":{}}`.

Run these commands from the project root. Create the database named in `DB_URL` manually before you run `just migrate-up`. The command needs `just`, a running PostgreSQL server, and a database user that can apply migrations. Set `DB_URL` in `apps/api/.env` for your local server.

Set `GOOGLE_CLIENT_ID` in `.env` to a Google web client ID. Add `http://localhost:6031` to its authorized JavaScript origins. The first sign-in asks the user to create a store. Invitations appear in the invited user's app after they sign in. The browser keeps a local product catalog and queues cash sales for sync for up to 30 days after sign-in.

`just run` starts both the API on port 6030 and the web app on port 6031. Press Ctrl+C to stop both. Product and store changes need the API online. Sales can be completed while offline after the first online sign-in.

Set `ENABLE_DANGER_ZONE=true` in the API environment to show the Danger zone in Store settings. It is off by default. A store owner or superadmin can permanently clear that store's orders, or clear its products and orders together. The action also clears matching records on the current browser. Apply database migrations before enabling the flag.

## Deploy the API on macOS

Use a checkout at `/Users/umar/umar/personal_project/marpos` on the server. The service runs as `umar`. It starts at boot and restarts if it exits. These commands run from the project root on that server.

1. Install Go, Just, PostgreSQL, and FFmpeg with `libsvtav1`. Create the database and set `apps/api/.env` from `.env.example`. Set `APP_ENV=production`, `DB_URL`, `APP_HOST`, and `GOOGLE_CLIENT_ID` for the server. Keep `STORAGE_DIR=storage` unless you use another persistent path.
2. Run `just install-service`. This builds `apps/api/marpos-api`, applies migrations, installs the launchd plist, and starts the API. The service reads `.env` from `apps/api` and listens on `APP_PORT`.
3. For later releases, run `just deploy`. This pulls the tracked Git branch, builds a new binary, applies database migrations, replaces the binary, and restarts the service. If the build or migration fails, the running binary stays in place.

Use `just status-service` to inspect the service and `just logs` to read its error log. Use `just restart-service` after an `.env` change. Use `just uninstall-service` to stop and remove the service. Back up PostgreSQL and `apps/api/storage`. Keep the `.env` file and uploaded images on the server; Git does not track them.
