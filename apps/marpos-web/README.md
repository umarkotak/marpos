# Marpos web app

See the [project README](../../README.md) for prerequisites and local setup.

Copy the environment example before you start the frontend:

```sh
cp apps/marpos-web/.env.example apps/marpos-web/.env.local
```

Set `API_ORIGIN` in `.env.local` to the backend server origin, such as `http://localhost:6030` or `https://api.example.com`. Do not include `/marpos/api` or a trailing slash. The Next.js server forwards `/backend/*` requests to this origin under `/marpos/api/*`.

Restart the development server after changing this value. For production, set it before `bun run build`, then restart the frontend with `bun run start`. Rebuild when you change the backend origin.

## Frontend structure

- `pages/`: Next.js Pages Router routes. Product editing and day reports use dynamic routes.
- `components/`: UI grouped by feature, such as `pos`, `products`, `orders`, and `reports`. `components/ui` contains shared UI controls.
- `components/layout/`: Shared register layout and sidebar.
- `components/register-provider.jsx`: Shared session, active store, catalog, and held orders. `_app.js` keeps this provider mounted across page changes.
- `hooks/`: Held orders, sync queue, offline shell caching, and report date ranges.
- `lib/api.js`: The single backend request function. Import `api` here for every backend request. Pass an object as `body` for JSON or `FormData` for uploads. The function handles credentials, timeouts, response data, and API errors.
- `lib/local-db.js`: IndexedDB records and local transactions.
- `lib/navigation.js`: Next.js navigation and URL query state.
- `public/sw.js`: Page, bundle, and image caching for offline use.

```js
import { api } from "@/lib/api";

const products = await api(`/stores/${storeID}/products`);
await api(`/stores/${storeID}/products`, { method: "POST", body: product });
```

The service worker saves route HTML and its scripts and styles after an online load. It also saves templates for dynamic product and report routes. Backend JSON requests go through `lib/api.js` and do not use the service worker cache. Pending sales and financial records stay in IndexedDB.
