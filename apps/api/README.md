# Marpos API

Go API scaffold following the cabocil API layout. Requires PostgreSQL.

```sh
cp .env.example .env
make run
```

`GET /marpos/api/ping` returns `{"data":{"ping":"pong"},"success":true,"error":{}}`.

Add SQL migration pairs under `db/migrations` as `000001_name.up.sql` and `000001_name.down.sql`, then run `make migrate-up`. The migration command runs from `apps/api` and uses `DB_URL` from `.env`.
