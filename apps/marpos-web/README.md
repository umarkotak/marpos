# Marpos web app

See the [project README](../../README.md) for prerequisites and local setup.

Copy the environment example before you start the frontend:

```sh
cp apps/marpos-web/.env.example apps/marpos-web/.env.local
```

Set `API_ORIGIN` in `.env.local` to the backend server origin, such as `http://localhost:6030` or `https://api.example.com`. Do not include `/marpos/api` or a trailing slash. The Next.js server forwards `/backend/*` requests to this origin under `/marpos/api/*`.

Restart the development server after changing this value. For production, set it before `bun run build`, then restart the frontend with `bun run start`. Rebuild when you change the backend origin.
