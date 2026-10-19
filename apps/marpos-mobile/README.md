# marpos-mobile

Native Android app in Kotlin for the Marpos Go API. It uses Android views and
SQLite. It does not load the web app in a WebView.

## Build and run

Use Android Studio, JDK 17 or newer, Android SDK Platform 36, and Build Tools
36.0.0. The minimum device version is Android 8.0 (API 26).

Open this directory in Android Studio and let Gradle sync. Select a device or
emulator, then select **Run**. For a terminal build, set `JAVA_HOME` and
`ANDROID_HOME`, then run these commands from this directory:

```sh
./gradlew assembleDebug
./gradlew installDebug
```

The debug APK is `app/build/outputs/apk/debug/app-debug.apk`.
Use `./gradlew lintDebug` for static Android checks. Do not run unit tests.
`./gradlew assembleRelease` creates an unsigned release APK. Configure your
release signing key before distribution.

The project uses Gradle 9.3.1 and Android Gradle plugin 9.0.1 with built-in Kotlin.
Google ID 1.1.1 remains pinned because 1.2.1 needs Kotlin 2.4 metadata.

## Server and Google sign-in

Start the existing Go API and apply its migrations as described in the root
README. The app calls `/marpos/api` directly. It does not need the Next.js server.

On the sign-in screen, set **API URL** and select **Save server**. For the Android
emulator and a local API, use `http://10.0.2.2:6030/marpos/api`. A debug build also
allows `localhost` and `127.0.0.1` for `adb reverse tcp:6030 tcp:6030`. Other hosts
and release builds require HTTPS with a valid system-trusted certificate.
Use your HTTPS API URL on a physical device.

Set `GOOGLE_CLIENT_ID` on the API server to the web OAuth client ID. In the same
Google Cloud project, create an Android OAuth client for `com.marpos.mobile` and
the signing certificate SHA-1. Use `./gradlew signingReport` to get the debug
certificate SHA-1. Register the release certificate separately. Credential
Manager returns a Google ID token for the web client ID, and the existing API
validates it and creates its normal session cookie. No Firebase configuration
file is needed. The device needs Google Play services and a Google account.

See the [Android Google sign-in guide](https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation).
Google sign-in needs your OAuth setup and account for end-to-end verification.

## Screens

Use the **Marpos** menu to navigate. Permissions follow the current store role.
The API also checks each request.

| Screen | Native functionality |
| --- | --- |
| Point of sale | Search and category filter, required single or multiple add-ons, quantities, prices, line or per-unit discounts, buyer details, tax toggle, cash/QRIS/Piutang notes, review, receipt, checkout, and held orders. |
| Ad hoc products | Save a product offline and add it to the order. Sync the product before its sales. Use the catalog picker to reuse an existing product. |
| Products | View products, create and edit products, categories, descriptions, production cost items, add-on groups and options, and up to 10 images. Delete and restore with the required role. |
| Order history | Paginated orders, local pending sales, details, receipts, buyer repair for older pending sales, corrections, deletion, restoration, and audit history with before/after values. |
| Income and expenses | Date filters, offline entry creation in WIB, cached records, pending entries, deletion, and restoration. |
| Reports | Date range or last X days, gross and net earnings, units, orders, tax, costs, income, expenses, margin, average order value, daily chart, hourly day details, peak hour, product sales, and four-week weekday comparison. |
| Audit log | Date and action filters, pagination, saved results, and order links. |
| Team | View members, create invitations, change roles, and remove members. |
| Manage stores | Create and select stores; accept or reject invitations. Superadmins can view stores without membership. |
| Store settings | Store identity, address, tax, map and social links, receipt printer, and server-enabled owner danger zone. |
| Sync queue | Inspect pending operations and their last errors; retry sync. |

English and Indonesian labels reuse a snapshot of the web dictionaries with
native labels added. Some server error messages remain in the language returned
by the API.

## Offline storage and sync

- First sign-in and catalog load need the API online. The Android app stores its
  own data. It does not import browser data or pending web sales.
- Drafts are separate for each account and store. Each edit saves in SQLite.
  A completed sale, its pending operation, and the new draft workspace save in
  one SQLite transaction before success is shown.
- Sale and operation UUIDs remain the same on retry. Server idempotency prevents
  duplicate sales after a lost acknowledgement.
- Ad hoc products sync before sales. A sale stays pending if its product fails.
  Failed operations keep their payload and last error. A server rejection does
  not delete a record.
- The app retries on network availability and once per minute while open. Use
  **Retry sync** to retry manually. Background sync does not disable checkout.
  There is no scheduled worker when the app process is stopped.
- Offline recording expires at the session's `offline_expires_at`. Sign in
  online again after the 30-day period. A server 401 clears the active sign-in;
  it keeps drafts and pending operations.
- A store member can sync pending sales and ad hoc products for their stores.
  Financial records need the account that created them. The queue keeps entries
  that need another account and shows the reason. Local store records remain
  available to accounts with the required role on this device.
- Catalog data and loaded reports, finance lists, audit results, and order
  details remain available offline. Unloaded data needs the server. Offline
  reports label saved or partial data and merge local records without counting
  server-included IDs twice. Dates use Asia/Jakarta.
- Product images cache on disk for seven days and keep their saved copy when
  the server is unavailable. Android 12 or newer is needed for platform AVIF
  image decoding; older supported devices can use the catalog without images.
- Each API URL uses a separate database and session. Sign-out keeps local
  records. App backup and device transfer exclude sessions and store data.
  Do not uninstall or clear app storage while records are pending.

## Printing

Store settings support **Android print dialog** and **Android Bluetooth (RawBT)**
with 58 mm or 80 mm paper. Settings stay on this device for the selected store.
The Android dialog generates a paginated PDF receipt and supports Save as PDF
or an installed print service. Select the matching paper size in that service.

For Bluetooth, pair the printer in Android settings. Install RawBT and configure
the same paper width and 32 columns for 58 mm or 48 columns for 80 mm. RawBT
handles Bluetooth permissions and the connection. Check the paper before
retrying; Marpos cannot confirm the printer result. Use **Print test receipt**
without creating a sale. A physical printer still needs a hardware check.

## Source layout

- `Api.kt`: JSON API requests, uploads, and the private session cookie.
- `Data.kt`: SQLite records, atomic outbox transactions, and money validation.
- `Repository.kt`: Sessions, store selection, catalog, drafts, checkout, and sync.
- `MainActivity.kt`: Navigation, native view helpers, Credential Manager, and retry triggers.
- `PosScreen.kt`, `ProductScreens.kt`, `OrderScreens.kt`, `FinanceScreens.kt`,
  `ReportScreens.kt`, and `ManagementScreens.kt`: Native screens and forms.
- `Receipt.kt`: Receipt text, Android PDF printing, and RawBT intents.

The native UI follows the web workflows. It uses Android dialogs, navigation,
and charts; the layout is not a pixel copy of the website.

## Verification

Checked on an Android emulator with isolated sample data and a local API fixture:

- The first cart edit retained its required add-on.
- Offline checkout saved one sale and one pending operation, then removed its
  draft in the same local transaction. The record survived a forced app restart.
- The fixture accepted a sale and dropped its acknowledgement. The app kept it
  pending. Retry sent the same sale and operation IDs, kept one server sale, and
  saved the server receipt reference before removing the pending operation.
- A store member synced another cashier's sale. That cashier's financial entry
  stayed pending with a message to sign in as its creator.
- Reports, order history, store settings, and Android receipt print preview opened
  without a runtime crash.

Debug and unsigned release builds pass. Android lint reports no errors and two
version notices for the pinned Gradle and Google ID versions. No unit tests were
created or run. Real Google sign-in, the live Go API workflows, physical printing,
and older Android hardware still need end-to-end acceptance checks.
