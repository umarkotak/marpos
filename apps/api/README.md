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

Set `GOOGLE_CLIENT_ID` in `.env` to a Google web client ID. Add `http://localhost:6011` to its authorized JavaScript origins. The first sign-in asks the user to create a store. Invitations appear in the invited user's app after they sign in. The browser keeps a local product catalog and queues cash sales for sync for up to 30 days after sign-in.

`just run` starts both the API on port 6010 and the web app on port 6011. Press Ctrl+C to stop both. Product and store changes need the API online. Sales can be completed while offline after the first online sign-in.
