# Marpos

Marpos is a point-of-sale web app for one register per store. Each store works independently. The current app lets you manage products, set single-choice or multiple-choice add-ons, and complete cash sales in IDR. A store can set a tax percentage. The cashier can exclude tax from one sale.

The app can save sales when the internet or API is unavailable. The first Google sign-in and product setup need the API online. Offline checkout is available for 30 days after the last successful online sign-in. Sales saved offline sync when the API is available again.

## Project layout

- `apps/api`: Go API and PostgreSQL migrations.
- `apps/marpos-web`: Next.js web app. It stores the product catalog and pending sales in the browser.
- `justfile`: Commands for the database and API. Run these commands from the project root.
- `offline_first_pos_architecture.md`: Initial architecture notes.

## Prerequisites

- [Go](https://go.dev/doc/install) 1.26 or newer.
- [Node.js](https://nodejs.org/en/download) 20.9 or newer and [Bun](https://bun.sh/docs/installation). The web app uses Bun 1.3.14 in `package.json`.
- [PostgreSQL](https://www.postgresql.org/download/) running locally. Create the database manually and give your database user permission to apply migrations.
- [Just](https://github.com/casey/just#installation) to run the root `justfile`.
- [FFmpeg](https://ffmpeg.org/download.html) with the `libsvtav1` encoder to convert product images to AVIF. Check with `ffmpeg -encoders | grep libsvtav1`.
- A [Google OAuth client ID for a web application](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) to sign in.

## Set up the database and API

Run these commands from the project root:

```sh
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

- Set `DB_URL` to your PostgreSQL server and the database you want to create.
- Set `GOOGLE_CLIENT_ID` to your Google web client ID.
- Set `STORAGE_DIR` if the API does not run from `apps/api`. The default `storage` writes to `apps/api/storage` when you use `just run`.
- Set `IMAGE_CACHE_DAYS` to change the browser image cache period. The default is 7 days.

The example `DB_URL` uses the user and password `admin123` and port `5432`. Change it if your local PostgreSQL server uses different details. Add `http://localhost:6031` to the Google client's **Authorized JavaScript origins**. The API can start without `GOOGLE_CLIENT_ID`, but sign-in will not work.

Start PostgreSQL and create the database named in `DB_URL` manually. Then apply the migrations:

```sh
just migrate-up
```

Install the web app dependencies:

```sh
cd apps/marpos-web
bun install
cd ../..
```

## Run locally

```sh
just run
```

`just run` builds and starts the API on `http://localhost:6030` and the web app on `http://localhost:6031`. Press Ctrl+C to stop both. Check the API at `http://localhost:6030/marpos/api/ping`.

## Deploy the API on macOS

On the server, check out this repository at `/Users/umar/umar/personal_project/marpos` and set `apps/api/.env`. Run `just install-service` once. Run `just deploy` for later releases. The service starts at boot. See the [API deployment steps](apps/api/README.md#deploy-the-api-on-macos) for setup, logs, and backups.

Open `http://localhost:6031` and sign in with Google. Create a store on your first sign-in. Each store has one register. Set the store name and tax rate in **Store settings**. Invite other users from **Team** after they have signed in to Marpos once. Invitations appear in **Manage stores**. Users can accept or reject them there. A rejected invitation can be sent again. Create a product on the **Products** page, then use **Point of sale** to complete a cash sale. **Order history** shows sales and can print a receipt through the browser print dialog. Each synced sale has a reference in the form `MP-{year}-00001` with at least five digits. The number resets each year for each store. The year uses the sale completion date in WIB. Existing references stay unchanged. Offline sales show a temporary receipt ID until they sync. Apply migration `000008` with `just migrate-up` before you restart the API.

The store owner can invite and remove users. An admin can manage managers and cashiers. Managers can change products and store settings. Cashiers can complete sales. Owners, store admins, and superadmins can soft-delete orders. Only superadmins can restore deleted records. Deleted products and orders stay in the database and do not appear in the normal catalog or order history.

## Offline use

Sign in and load the product catalog while online first. Open Marpos at `http://localhost:6031` for local use. In production, serve it over HTTPS. You can install it from your browser's **Install app** or **Add to Home Screen** action. After the first load, the app can open from its cached files even when the web server is down.

You can complete cash sales in the same browser when the API, web server, or internet is unavailable. The browser saves sales on this device and shows a pending count. It retries sync when the API returns. Keep this device and browser until the pending count reaches zero. Do not clear browser site data while sales are pending.

Product and store changes need an online API connection. Offline checkout stops when the 30-day sign-in period expires; sign in online again to renew it.

## Product images

Apply migration `000007` with `just migrate-up` before you add product images. In **Products**, select up to 10 images per product. The first image appears in the catalog. The API accepts JPEG, PNG, GIF, WebP, and AVIF files up to 8 MB each. It converts each file to AVIF and saves it under `apps/api/storage`. The public image URL uses `/backend/images/{store_id}/{image_id}.avif` in the web app and `/marpos/api/images/{store_id}/{image_id}.avif` on the API. Uploaded files are ignored by Git. Back up this directory with the database, and use a persistent disk when you deploy the API.

The web app caches loaded images for the `IMAGE_CACHE_DAYS` period. It checks for a fresh image after that period when online. If the server is offline, it can still show the saved image. Product image uploads need the API online.

## Costs, income, expenses, and reports

Owners, admins, and managers can use **Income and expenses** and **Reports**. Cashiers can complete sales.

- Set each product's production cost per unit in **Products**. Add named items such as ingredients and packaging. An add-on can have a cost increase. An empty breakdown means zero cost after you save the product.
- Checkout saves the selected unit cost and breakdown with each sale item. Later product changes do not change old sale costs. Sales from before cost tracking show an incomplete net earnings amount.
- Use **Income and expenses** to record staff pay and other daily records. Each record has a type, category, description, date, time, and IDR amount. Records save on this device first and sync when the API returns. The user who created the record must sign in to sync it. An owner, admin, or superadmin can delete synced records. Only superadmins can restore them.
- **Reports** opens the **Overview** tab. It shows daily earnings, units sold, top products, average order value, gross margin, and peak sales times. Choose the last X days or a custom date range, up to 366 days.
- **Comparison** compares weekdays across four weeks, ending at the selected end date. Choose sales, net earnings, units, orders, or expenses. Dates after the end date are excluded.
- Select a date or chart bar to open its day report with hourly charts, the day summary, and products sold. Use the back button to return to the report. Today is a partial day.
- Reports use `Asia/Jakarta` (WIB). Net earnings = sales before tax − saved production cost + other income − expenses. Tax is shown separately. Deleted orders and financial records are excluded.
- Offline reports show a saved report and local records. The page shows when the report was saved. A period that has not been loaded online can show only the records on this device. Refresh the report online for the complete store figures.

Do not enter checkout sales again as other income. Avoid recording the same production cost again as an expense if you want the net earnings formula above to count it once.

## Page URLs

Each page keeps its path after refresh. Browser Back and Forward work between pages.

| Page | Path |
| --- | --- |
| Point of sale | `/pos` |
| Products | `/products` |
| Order history | `/orders` |
| Audit log | `/audit-log` |
| Income and expenses | `/finance` |
| Report overview | `/reports` |
| Report comparison | `/reports/comparison` |
| Day report | `/reports/day/YYYY-MM-DD` |
| Team | `/team` |
| Store settings | `/settings` |
| Manage stores | `/stores` |

Reports and finance use `from`, `to`, `period`, and `days` query parameters. Comparison uses `metric`. The day report keeps the source view and date range for its back link. Deleted lists use `status=deleted`. Product search uses `q` on `/pos`.

Example: `/reports/comparison?period=custom&from=2026-09-01&to=2026-09-20&metric=units`.

The PWA uses the same saved app shell for these paths. Load the app online before you use it offline. Report data still needs an online load for each date range.

## Superadmin access

`SUPERADMIN_EMAILS` in `apps/api/.env` is a comma-separated list of verified Google account emails. It defaults to `umarkotak@gmail.com` when unset. To add another user, keep the first email and add the next email to this list. Restart the API after a change.

Only superadmins can view deleted lists and restore orders, products, or financial records. The API checks this permission on every request. Owners, store admins, and superadmins can soft-delete orders. Product and financial deletion keeps the existing owner and admin access. Superadmins still need membership in the store. Restore actions need the server online. Refresh online to update the saved account permissions.

## Buyers, held orders, and corrections

Each new completed order needs at least one of `buyer_name`, `buyer_phone`, or `buyer_email`. Older orders keep their existing records. For an older pending sale with no buyer details, use **Add buyer details** in Order history before sync.

On Point of sale, choose **Hold and start new** to start another order. Select an open order to resume it. Items, buyer details, and the tax choice save in IndexedDB on this device. Drafts are separate for each store and signed-in user. They survive refresh and work offline. Drafts do not sync between devices. Checkout saves the sale, queues its sync, and removes its draft in one local transaction.

Owners and superadmins can use **Edit order** on a synced order while online. They can change buyer details, items, quantities, prices, and tax. Each edit needs a reason and saves the before and after values in correction history. The receipt reference stays the same. If the total changes, confirm the cash received or returned before saving. The original payment stays in the records; the correction history records the signed cash adjustment. Reports use the corrected order values. An outdated revision is rejected. Orders with returns cannot be edited.

Apply migration `000006` with `just migrate-up`, then restart `just run`.

## Audit log

Owners, admins, managers, and superadmins can open **Audit log** at `/audit-log`. Filter by action and date. The page shows who created, updated, deleted, or restored an order, and when. Select an order reference to open its details. Only superadmins can open deleted orders.

Order details include **Order history log**. Updates show the reason and the before and after values. Actor names and emails are saved with each event. Audit records and order changes save in the same database transaction. Sync retries do not create duplicate events. Offline sales receive their server audit event when they sync; the event also shows the sale completion time.

The audit page can show a previously loaded filter result offline. Order details need the server for their full history. Older orders keep any existing correction events; earlier actions are not reconstructed. This feature uses the existing `audit_logs` table and needs no new migration. Restart `just run` after updating the code.
