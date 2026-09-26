# Offline-First POS Web App — Architecture & Implementation Blueprint

## 1. Project Goal

Build a simple, reliable Point of Sale (POS) web application that:

- Works online and offline.
- Uses a Go backend.
- Uses PostgreSQL as the server database.
- Uses Next.js for the frontend.
- Supports Google login and email/password authentication.
- Allows checkout even when the internet is unavailable.
- Synchronizes local transactions automatically when connectivity returns.
- Can later support inventory, multiple stores, multiple registers, receipts, refunds, reporting, and back-office administration.

The recommended architecture is **offline-first**, not merely a normal web application with an offline fallback.

The key principle is:

```text
UI
↓
Local Database
↓
Sync Engine
↓
Go Backend
↓
PostgreSQL
```

The frontend should behave consistently whether the internet connection is fast, slow, unstable, or unavailable.

---

# 2. Recommended Technology Stack

## Frontend

- Next.js
- React
- TypeScript recommended
- PWA / Service Worker
- IndexedDB
- Dexie.js as an IndexedDB wrapper
- TanStack Query optional for server-facing admin screens
- Zod optional for client-side validation

## Backend

- Go
- REST API initially
- PostgreSQL
- pgx or sqlc recommended
- chi, Echo, Fiber, or Gin for HTTP routing
- Argon2id for password hashing
- Google OAuth / OpenID Connect

## Infrastructure

Initial deployment can remain simple:

```text
Next.js
Go API
PostgreSQL
```

There is no need to introduce microservices initially.

A modular monolith is the recommended backend architecture.

---

# 3. High-Level Architecture

```text
┌──────────────────────────────────┐
│          POS Browser             │
│                                  │
│  Next.js / React                 │
│                                  │
│  ┌────────────────────────────┐  │
│  │ POS UI                     │  │
│  │                            │  │
│  │ Product Search             │  │
│  │ Cart                       │  │
│  │ Checkout                   │  │
│  │ Transaction History        │  │
│  │ Register Session           │  │
│  └─────────────┬──────────────┘  │
│                │                 │
│  ┌─────────────▼──────────────┐  │
│  │ IndexedDB                  │  │
│  │                            │  │
│  │ products                   │  │
│  │ customers                  │  │
│  │ sales                      │  │
│  │ sale_items                 │  │
│  │ payments                   │  │
│  │ sync_queue                 │  │
│  │ sync_metadata              │  │
│  │ settings                   │  │
│  └─────────────┬──────────────┘  │
│                │                 │
│  ┌─────────────▼──────────────┐  │
│  │ Sync Engine                │  │
│  │                            │  │
│  │ Push local changes         │  │
│  │ Pull server changes        │  │
│  │ Retry failed operations    │  │
│  │ Resolve known conflicts    │  │
│  └─────────────┬──────────────┘  │
└────────────────┼─────────────────┘
                 │ HTTPS
                 ▼
┌──────────────────────────────────┐
│            Go Backend            │
│                                  │
│ Authentication                   │
│ POS API                          │
│ Sync API                         │
│ Authorization                    │
│ Inventory                        │
│ Reporting                        │
│ Business Rules                   │
└────────────────┬─────────────────┘
                 │
                 ▼
          ┌──────────────┐
          │ PostgreSQL   │
          └──────────────┘
```

---

# 4. Core Architectural Principle

The POS should be designed as:

```text
Offline-first
```

rather than:

```text
Online-first + offline fallback
```

Do not build the primary checkout flow like this:

```text
UI
↓
POST /sales
↓
If request fails
↓
Save locally
```

Instead use:

```text
UI
↓
Save sale locally
↓
Return success to cashier
↓
Queue synchronization
↓
Send to backend when possible
```

This makes the POS fast and predictable.

The cashier should not care whether connectivity exists during checkout.

---

# 5. Frontend Architecture

## 5.1 Next.js

Next.js provides:

- Application shell.
- Routing.
- Admin/back-office pages.
- POS screens.
- Authentication pages.
- Server-rendered pages where appropriate.

The POS screen itself should rely primarily on local data.

Example routes:

```text
/login

/pos
/pos/cart
/pos/transactions
/pos/register

/admin
/admin/products
/admin/inventory
/admin/users
/admin/stores
/admin/reports
```

---

# 6. PWA and Service Worker

The POS should be installable as a Progressive Web App.

The Service Worker should cache:

- HTML application shell where appropriate.
- JavaScript bundles.
- CSS.
- Fonts.
- Icons.
- Static images.
- Offline page.

The Service Worker allows the POS application to launch while offline.

However:

> The Service Worker should not be the primary database for POS transactions.

Use IndexedDB for application data.

---

# 7. Local Database

Use IndexedDB.

Recommended wrapper:

```text
Dexie.js
```

Raw IndexedDB works, but the API becomes difficult to maintain as the application grows.

Suggested local tables:

```text
products
customers

sales
sale_items
payments

sync_queue
sync_metadata

settings
register_session
```

Possible additional tables later:

```text
categories
taxes
discount_rules
inventory_snapshot
cash_movements
receipts
```

---

# 8. Local Sale Flow

When the cashier presses **Pay**, the frontend should not require a successful API request.

Recommended flow:

```text
Cashier presses PAY

↓

Generate sale UUID

↓

Create local sale

↓

Create sale items

↓

Create payment

↓

Write everything to IndexedDB atomically

↓

Create sync queue entry

↓

Show successful transaction

↓

Print / display receipt

↓

Prepare POS for next customer
```

Example local sale:

```json
{
  "id": "01991dca-48c5-7abc-b815-19f2c3123456",
  "store_id": "store-1",
  "register_id": "register-1",
  "cashier_id": "user-1",
  "subtotal": 85000,
  "tax": 0,
  "discount": 5000,
  "total": 80000,
  "status": "completed",
  "sync_status": "pending",
  "created_at": "2026-09-14T07:00:00+07:00"
}
```

The sale is valid locally even if the internet is disconnected.

---

# 9. UUID Strategy

Use UUIDs generated on the client.

Do not rely on sequential server IDs for offline-created records.

Bad:

```text
sale_id = 12345
```

Better:

```text
sale_id = UUID
```

Reason:

```text
POS A offline
creates UUID A

POS B offline
creates UUID B

Internet returns

Both can synchronize
without primary key conflicts
```

UUIDv7 is particularly suitable because it is time-sortable.

Use UUIDs for:

- sale IDs
- sale item IDs
- payment IDs
- customer IDs created offline
- sync operation IDs
- inventory movement IDs

Human-readable receipt numbers should be separate from internal primary keys.

---

# 10. Sync Engine

The synchronization engine is the most important part of the offline architecture.

It must support:

```text
Local → Server
Server → Local
```

---

# 11. Push Synchronization

The frontend maintains a local outbox:

```text
sync_queue
```

Example:

```json
{
  "id": "operation-uuid",
  "type": "sale.created",
  "entity_id": "sale-uuid",
  "payload": {},
  "status": "pending",
  "retry_count": 0,
  "created_at": "..."
}
```

The client periodically sends pending operations:

```text
POST /api/v1/sync/push
```

Example request:

```json
{
  "device_id": "register-01",
  "operations": [
    {
      "id": "operation-uuid",
      "type": "sale.created",
      "entity_id": "sale-uuid",
      "data": {
        "sale": {},
        "items": [],
        "payments": []
      }
    }
  ]
}
```

Example response:

```json
{
  "processed": [
    "operation-uuid"
  ],
  "failed": []
}
```

After confirmation, the frontend updates:

```text
sync_status = synced
```

---

# 12. Idempotency

The backend must treat sync operations as idempotent.

This is critical.

Network scenario:

```text
Client sends sale
↓
Server saves sale
↓
Connection drops before response
↓
Client assumes failure
↓
Client retries
```

Without idempotency, the sale could be duplicated.

Each synchronization operation therefore has a unique:

```text
operation_id
```

The backend stores processed operation IDs.

If the same operation arrives again:

```text
Return success
Do not create duplicate data
```

This principle should apply to every offline mutation.

---

# 13. Pull Synchronization

The client must also receive updates from the server.

Example:

```text
GET /api/v1/sync/pull?cursor=123456
```

Response:

```json
{
  "changes": [
    {
      "type": "product.updated",
      "entity_id": "product-uuid",
      "data": {}
    }
  ],
  "next_cursor": "123500"
}
```

The client stores:

```text
next_cursor
```

and uses it for the next synchronization.

This prevents downloading the complete database repeatedly.

---

# 14. Synchronization Direction by Entity

Not every entity should synchronize using identical rules.

## Mostly Server → POS

```text
products
categories
prices
discount rules
tax rules
store settings
employees
permissions
```

## Mostly POS → Server

```text
sales
payments
cash register actions
cash movements
```

## Bidirectional

```text
customers
orders
inventory adjustments
```

Defining ownership per entity avoids unnecessary conflict-resolution complexity.

---

# 15. Conflict Strategy

You should define conflict rules before implementing advanced synchronization.

Examples:

## Product

Server wins.

```text
Admin modifies product price
↓
POS receives new version
```

POS should generally not modify the master product record.

## Sale

Immutable after completion.

Once a sale is completed:

```text
sale
sale_items
payments
```

should generally not be rewritten.

Corrections should use explicit transactions such as:

```text
refund
void
return
adjustment
```

## Customer

Can use:

```text
latest updated_at wins
```

for a simple implementation.

Later this can evolve into field-level conflict handling.

---

# 16. Inventory Design

Do not represent inventory only as:

```text
products.stock = 10
```

That design becomes problematic with multiple offline registers.

Example:

```text
POS A sees stock = 10
POS B sees stock = 10

POS A sells 1
POS B sells 1

Both locally calculate stock = 9
```

Instead use an inventory movement ledger.

Suggested table:

```text
inventory_movements

id
product_id
store_id
quantity_delta
movement_type
reference_type
reference_id
created_at
created_by
```

Examples:

```text
+100 purchase
-2 sale
+1 return
-3 manual adjustment
```

Actual stock:

```text
SUM(quantity_delta)
```

Conceptually:

```text
Purchases
+ Returns
+ Positive adjustments
- Sales
- Negative adjustments
= Stock
```

This event-like model works much better with offline synchronization.

---

# 17. Inventory While Offline

Inventory displayed on an offline register is necessarily an estimate.

For example:

```text
Register A
offline sale: -2

Register B
offline sale: -1
```

Neither register can know about the other's sale until synchronization occurs.

Therefore the application should distinguish between:

```text
Local available quantity
```

and:

```text
Authoritative server stock
```

Depending on the business, you can choose:

### Option A — Allow overselling

Simple and appropriate for many retail POS systems.

### Option B — Warn but allow

Example:

```text
Stock may be outdated because this device is offline.
```

### Option C — Block low-stock offline sales

More restrictive and often frustrating.

For V1, **warn but allow** is a reasonable default.

---

# 18. Authentication

Support:

```text
Google OAuth
Email + Password
```

The Go backend should own authentication and authorization.

---

# 19. Email / Password Login

Recommended flow:

```text
Next.js Login Form
↓
POST /auth/login
↓
Go Backend
↓
Verify password
↓
Create authenticated session
```

Passwords should be hashed using:

```text
Argon2id
```

Never store plaintext passwords.

---

# 20. Google Authentication

Recommended flow:

```text
Next.js
↓
Google OAuth / OpenID Connect
↓
Google returns identity
↓
Go backend verifies identity
↓
Find or create local user
↓
Create application session
```

The backend should maintain the application's own user record regardless of authentication method.

Example:

```text
users

id
email
name
password_hash nullable
google_subject nullable
status
created_at
updated_at
```

---

# 21. Browser Session

Prefer:

```text
HttpOnly
Secure
SameSite
cookie
```

for authenticated browser sessions.

Avoid storing long-lived authentication tokens in:

```text
localStorage
```

because JavaScript-accessible tokens increase exposure during XSS attacks.

---

# 22. Offline Authentication

Google authentication requires internet connectivity.

Therefore a POS device cannot perform a fresh Google login while offline.

A practical approach:

```text
Device authenticated while online
↓
Device becomes trusted/registered
↓
Offline POS can continue using cached authorization
```

Optionally require a cashier PIN for offline unlock.

Example:

```text
Trusted POS Device
+
Cashier PIN
+
Offline session expiration
```

This can be added after the initial version.

For V1, requiring an initial online login is acceptable.

---

# 23. Users, Organizations, Stores, and Registers

Even if the first version supports only one store, it is worth modeling these entities.

Suggested hierarchy:

```text
Organization
└── Store
    ├── Register 1
    ├── Register 2
    └── Register 3
```

Example:

```text
organizations
stores
registers
users
user_store_roles
```

This prevents major restructuring later.

---

# 24. Recommended PostgreSQL Tables

Initial core tables:

```text
users

organizations
stores
registers

products
product_categories
product_prices

customers

sales
sale_items
payments

inventory_movements

sync_devices
sync_operations
sync_changes

register_sessions
cash_movements
```

Later:

```text
discount_rules
tax_rules
suppliers
purchase_orders
goods_receipts
refunds
returns
receipts
audit_logs
```

---

# 25. Sale Data Model

## sales

```text
id UUID PK
organization_id UUID
store_id UUID
register_id UUID
cashier_id UUID

receipt_number VARCHAR

subtotal BIGINT
discount_total BIGINT
tax_total BIGINT
grand_total BIGINT

status VARCHAR

created_at TIMESTAMPTZ
completed_at TIMESTAMPTZ
synced_at TIMESTAMPTZ
```

For money, use integer minor units.

Example:

```text
Rp 50,000
```

store as:

```text
50000
```

Avoid floating point values for currency.

---

# 26. Sale Items

## sale_items

```text
id UUID PK
sale_id UUID FK
product_id UUID

product_name VARCHAR
sku VARCHAR

quantity NUMERIC
unit_price BIGINT
discount_total BIGINT
tax_total BIGINT
line_total BIGINT

created_at TIMESTAMPTZ
```

Snapshot important product information.

Do not rely exclusively on joining the current product table.

If product name changes tomorrow, yesterday's receipt should still display the original item description.

---

# 27. Payments

## payments

```text
id UUID PK
sale_id UUID FK

payment_method VARCHAR

amount BIGINT

reference VARCHAR NULL

created_at TIMESTAMPTZ
```

Possible payment methods:

```text
cash
card
bank_transfer
qris
other
```

Later you can add payment-provider integrations.

---

# 28. Register Sessions

A POS register usually operates within a cashier session.

Example:

```text
OPEN REGISTER

opening_cash = 500000

↓

sales
cash movements

↓

CLOSE REGISTER

expected_cash
actual_cash
difference
```

Suggested table:

```text
register_sessions

id
register_id
cashier_id

opening_cash
expected_cash
closing_cash

opened_at
closed_at
status
```

This can be part of V2 if you want to keep V1 minimal.

---

# 29. Backend Architecture

A modular monolith is recommended.

Example project:

```text
backend/

cmd/
  api/
    main.go

internal/

  auth/
    handler.go
    service.go
    repository.go
    model.go

  product/
    handler.go
    service.go
    repository.go
    model.go

  sale/
    handler.go
    service.go
    repository.go
    model.go

  inventory/
    handler.go
    service.go
    repository.go
    model.go

  customer/
    handler.go
    service.go
    repository.go
    model.go

  sync/
    handler.go
    service.go
    repository.go
    model.go

  store/
  user/
  register/

  platform/
    database/
    http/
    logging/
    config/
```

Logical flow:

```text
HTTP Handler
↓
Service / Use Case
↓
Repository
↓
PostgreSQL
```

Keep business rules inside services rather than HTTP handlers.

---

# 30. Frontend Project Structure

Example:

```text
frontend/

app/
  login/

  pos/
    page.tsx
    transactions/
    register/

  admin/
    products/
    inventory/
    stores/
    users/
    reports/

components/

features/
  auth/
  cart/
  products/
  checkout/
  sales/
  customers/
  sync/

lib/
  api/
  db/
  auth/
  sync/

workers/
  service-worker.ts
```

Suggested feature structure:

```text
features/checkout/

components/
hooks/
services/
types/
```

---

# 31. Separate POS and Back Office Conceptually

The application really contains two different experiences.

## POS

Optimized for:

- Speed.
- Touch.
- Large buttons.
- Barcode scanning.
- Checkout.
- Offline operation.
- Receipt printing.
- Cash register workflows.

## Back Office

Optimized for:

- Product management.
- Price management.
- Inventory.
- Users.
- Store configuration.
- Reports.
- Transaction search.

The back office usually does not need comprehensive offline support.

Possible deployment:

```text
pos.example.com
admin.example.com
```

or simply:

```text
example.com/pos
example.com/admin
```

They can remain inside a single Next.js project initially.

---

# 32. API Overview

Recommended initial API:

```text
/api/v1/auth/login
/api/v1/auth/logout
/api/v1/auth/google
/api/v1/auth/me

/api/v1/products
/api/v1/products/:id

/api/v1/customers
/api/v1/customers/:id

/api/v1/sales
/api/v1/sales/:id

/api/v1/inventory

/api/v1/registers
/api/v1/register-sessions

/api/v1/sync/push
/api/v1/sync/pull
```

The normal REST endpoints remain useful for admin functionality.

The POS should rely heavily on the sync endpoints.

---

# 33. Sync Change Log

The backend needs a way to identify changes made since a device's previous synchronization.

One option:

```text
sync_changes

sequence BIGSERIAL
entity_type
entity_id
operation
payload
created_at
```

Every important server-side mutation creates a synchronization change.

Example:

```text
sequence 1001 product.updated
sequence 1002 product.created
sequence 1003 price.updated
```

Client stores:

```text
last_sync_cursor = 1003
```

Next request:

```text
GET /sync/pull?cursor=1003
```

Backend responds with:

```text
1004+
```

This is easier and more reliable than querying every table using timestamps.

---

# 34. Connectivity Detection

Do not depend only on:

```javascript
navigator.onLine
```

It merely indicates whether the browser believes some network connectivity exists.

A device can be technically online while the backend is unreachable.

Use:

```text
navigator.onLine
+
health check
+
actual sync request status
```

Example health endpoint:

```text
GET /health
```

The UI can display:

```text
Online
Syncing
Offline
Sync Error
```

---

# 35. Sync Status in the UI

Make synchronization visible but non-disruptive.

Example status:

```text
● Online
Last synced: just now
```

Offline:

```text
○ Offline
3 transactions waiting to sync
```

Error:

```text
! Sync problem
3 transactions waiting
```

Do not prevent checkout because synchronization is delayed.

---

# 36. Retry Strategy

Failed sync operations should automatically retry.

Recommended approach:

```text
1st retry: quickly
2nd retry: several seconds
3rd retry: longer
...
```

Use exponential backoff with a maximum delay.

Store:

```text
retry_count
last_error
last_attempt_at
next_attempt_at
```

Do not retry permanently invalid operations forever.

Separate errors into:

```text
retryable
non-retryable
```

Examples:

Retryable:

```text
network unavailable
HTTP 500
timeout
```

Non-retryable:

```text
invalid payload
missing required field
permission denied
```

---

# 37. Transactions and Database Consistency

When the backend processes a sale synchronization, it should use a PostgreSQL transaction.

Example:

```text
BEGIN

insert sale
insert sale items
insert payments
insert inventory movements
mark sync operation processed

COMMIT
```

If any operation fails:

```text
ROLLBACK
```

This avoids partially stored sales.

---

# 38. Offline Atomicity

The browser should use an IndexedDB transaction as well.

When creating a sale:

```text
sales
sale_items
payments
sync_queue
```

should be written atomically if possible.

Either everything succeeds or nothing is committed.

Dexie makes this substantially easier.

---

# 39. Product Synchronization

Do not download the entire product catalog every time.

Initial sync:

```text
Download all active products
```

Subsequent sync:

```text
Download only changes after cursor
```

Possible changes:

```text
product.created
product.updated
product.deleted
price.updated
```

For deleted products, use either:

```text
soft delete
```

or tombstone sync events.

Example:

```json
{
  "type": "product.deleted",
  "entity_id": "..."
}
```

---

# 40. Soft Deletes

Offline synchronization becomes much easier when important synchronized records use soft deletion.

Instead of physically removing:

```text
products
```

use:

```text
deleted_at
```

or:

```text
active = false
```

Otherwise devices that were offline during deletion may never know the entity was removed.

---

# 41. Receipt Number Design

Internal ID:

```text
UUID
```

Human receipt:

```text
DEP-01-20260914-000123
```

Do not use the human receipt number as the database primary key.

Offline receipt numbering has special considerations.

For a simple version, allocate a register-specific prefix:

```text
STORE01-R01-000001
STORE01-R02-000001
```

This prevents two offline registers from producing the same receipt number.

---

# 42. Barcode Scanner

Most USB barcode scanners behave like keyboards.

Therefore the browser can support them without a special hardware integration.

Typical behavior:

```text
Scanner reads barcode

↓

Types:
8991234567890

↓

Sends Enter
```

The POS can listen for this rapid key sequence and search:

```text
products.barcode
```

Because products exist locally in IndexedDB, barcode search works offline.

---

# 43. Receipt Printing

Browser printing is sufficient for V1.

Example:

```text
window.print()
```

Use print-specific CSS.

For deeper thermal-printer integration later, possible options include:

- Local print bridge.
- Vendor-specific browser integration.
- Native wrapper.
- Electron/Tauri.
- Network printer API if available.

Do not introduce these complexities for the first version unless required.

---

# 44. Security Basics

At minimum implement:

- HTTPS.
- Secure cookies.
- CSRF protection where appropriate.
- Strong password hashing.
- Rate limiting.
- Role-based authorization.
- Input validation.
- SQL parameterization.
- Audit logs for sensitive admin actions.
- Device/session revocation.
- Short-lived sessions or refresh strategy.
- Content Security Policy.

Never trust data simply because it comes from a registered POS.

Validate every synchronized mutation on the backend.

---

# 45. Authorization

Possible roles:

```text
owner
admin
manager
cashier
```

Example permissions:

## Owner

Everything.

## Admin

Products, users, inventory, reports.

## Manager

Inventory, reports, sales review.

## Cashier

POS checkout and limited transaction history.

Authorization must be enforced by the backend.

Do not rely on hiding buttons in the frontend.

---

# 46. Observability

Add structured logging from the beginning.

Useful fields:

```text
request_id
user_id
organization_id
store_id
register_id
device_id
operation_id
sale_id
```

Log synchronization failures carefully.

Metrics worth adding later:

```text
sync queue length
sync failure rate
API latency
checkout count
database errors
```

---

# 47. Audit Log

POS systems benefit from an immutable audit trail.

Possible events:

```text
user.login
product.created
product.updated
price.changed

sale.created
sale.refunded
sale.voided

inventory.adjusted

register.opened
register.closed

user.permission.changed
```

Suggested table:

```text
audit_logs

id
organization_id
user_id
action
entity_type
entity_id
metadata
created_at
```

---

# 48. Recommended V1 Scope

Avoid building a huge POS immediately.

V1 should include:

## Authentication

- Email/password login.
- Google login optionally shortly after.

## Product

- Product list.
- SKU.
- Barcode.
- Name.
- Price.
- Active/inactive status.

## POS

- Product search.
- Barcode search.
- Add to cart.
- Change quantity.
- Remove item.
- Basic discount.
- Checkout.
- Cash payment initially.

## Offline

- Load application offline.
- Product catalog stored locally.
- Sales stored locally.
- Sync queue.
- Automatic sync after reconnection.

## Transactions

- Transaction list.
- Transaction detail.
- Reprint receipt.

## Admin

- Manage products.
- View transactions.

That is enough to validate the architecture.

---

# 49. V2 Features

After V1 is stable:

- Inventory movement management.
- Stock adjustments.
- Register sessions.
- Cash opening/closing.
- Multiple payment methods.
- Customers.
- Refunds.
- Returns.
- Role permissions.
- Multiple registers.
- Multiple stores.
- Basic reports.

---

# 50. V3 Features

Later:

- Purchase orders.
- Suppliers.
- Goods receiving.
- Advanced discounts.
- Promotions.
- Tax configuration.
- Employee shifts.
- Loyalty program.
- QRIS integration.
- Card terminal integration.
- Advanced reporting.
- Accounting export.
- Multi-device real-time updates.
- Native printer integration.

---

# 51. Recommended Build Order

## Phase 1 — Backend Foundation

Create:

```text
Go project
PostgreSQL
migrations
configuration
logging
HTTP server
```

Implement:

```text
users
organizations
stores
registers
products
```

---

## Phase 2 — Authentication

Implement:

```text
email/password
session cookies
authorization middleware
```

Then add Google login.

---

## Phase 3 — Basic Online POS

Create:

```text
product search
cart
checkout
sale creation
payment
receipt
```

Initially this can work online only.

The purpose is to validate the sale domain model.

---

## Phase 4 — Local Database

Introduce:

```text
IndexedDB
Dexie
```

Move POS product access to:

```text
IndexedDB
```

instead of querying the backend directly on every interaction.

---

## Phase 5 — Offline Sale Creation

Change checkout to:

```text
UI
↓
IndexedDB
```

and create:

```text
sync_queue
```

The POS should now work without a backend connection.

---

## Phase 6 — Push Sync

Implement:

```text
POST /sync/push
```

Requirements:

```text
idempotent
transactional
retry safe
```

---

## Phase 7 — Pull Sync

Implement:

```text
GET /sync/pull
```

and server change tracking.

Synchronize:

```text
products
prices
settings
```

---

## Phase 8 — PWA

Add:

```text
service worker
manifest
offline application shell
installability
```

Test:

```text
internet disconnected
browser restarted
POS reopened
sale performed
browser refreshed
internet restored
sale synchronized
```

---

## Phase 9 — Inventory

Implement:

```text
inventory_movements
```

Sales produce negative movements automatically.

---

## Phase 10 — Operational Features

Add:

```text
register sessions
refunds
returns
reporting
cash movements
multiple payment methods
```

---

# 52. Critical Test Scenarios

Offline POS applications require different testing from ordinary web apps.

Test all of these.

## Scenario 1

```text
Online
↓
Create sale
↓
Sync succeeds
```

## Scenario 2

```text
Offline
↓
Create sale
↓
Close browser
↓
Open browser
↓
Sale still exists
```

## Scenario 3

```text
Offline
↓
Create 20 sales
↓
Reconnect
↓
All sales synchronize
```

## Scenario 4

```text
Send sale
↓
Backend saves sale
↓
Connection drops before response
↓
Client retries
↓
No duplicate sale
```

## Scenario 5

```text
Two registers offline
↓
Both sell same product
↓
Reconnect
↓
Inventory movements are merged correctly
```

## Scenario 6

```text
Product price changes on server
↓
Offline POS still has old price
↓
Reconnect
↓
New price synchronizes
```

## Scenario 7

```text
Browser refresh while offline
↓
POS still loads
```

## Scenario 8

```text
Backend unavailable
↓
Internet itself remains available
↓
POS recognizes sync failure
↓
Checkout still works
```

---

# 53. Important Design Rules

These rules should remain true throughout development.

## Rule 1

Checkout must not depend on network availability.

## Rule 2

Every offline-created mutation needs a globally unique ID.

## Rule 3

Every sync operation must be idempotent.

## Rule 4

Sales should become effectively immutable after completion.

Use refunds and adjustments instead of rewriting history.

## Rule 5

Inventory should use movements rather than only mutable stock counters.

## Rule 6

The backend remains authoritative for master data.

## Rule 7

The local database is authoritative for pending offline operations.

## Rule 8

Synchronization state must survive refreshes and browser restarts.

## Rule 9

Do not hide synchronization errors.

Display them without blocking normal cashier operation.

## Rule 10

Design multi-store and multi-register IDs early even if V1 uses only one store.

---

# 54. Final Recommended Architecture

```text
                         INTERNET
                            │
                            │
                 ┌──────────▼───────────┐
                 │      Go Backend      │
                 │                      │
                 │ Auth                 │
                 │ POS API              │
                 │ Sync Engine          │
                 │ Inventory            │
                 │ Authorization        │
                 │ Reporting            │
                 └──────────┬───────────┘
                            │
                     PostgreSQL
                            │
                  authoritative data
                            │
                            │
────────────────────────────┼─────────────────────────────
                            │
                       synchronization
                            │
                 ┌──────────▼───────────┐
                 │     Next.js POS      │
                 │                      │
                 │ React UI             │
                 │                      │
                 │ ┌──────────────────┐ │
                 │ │ IndexedDB        │ │
                 │ │                  │ │
                 │ │ products         │ │
                 │ │ customers        │ │
                 │ │ sales            │ │
                 │ │ payments         │ │
                 │ │ sync queue       │ │
                 │ └──────────────────┘ │
                 │                      │
                 │ Service Worker       │
                 │ PWA                  │
                 └──────────────────────┘
```

The most important architectural flow is:

```text
Cashier
↓
POS UI
↓
IndexedDB
↓
Sale completed immediately
↓
Sync Queue
↓
Go Backend
↓
PostgreSQL
```

rather than:

```text
Cashier
↓
POS UI
↓
Backend
↓
Wait
↓
Database
```

This architecture gives the POS the behavior expected from real point-of-sale software:

- Fast checkout.
- Reliable operation during unstable internet.
- Safe synchronization.
- Easy multi-register expansion.
- Clear inventory history.
- Simple backend architecture.
- A clean upgrade path as the product grows.

---

# 55. Recommended Starting Stack Summary

```text
Frontend
--------
Next.js
React
TypeScript
Dexie.js
IndexedDB
PWA / Service Worker

Backend
-------
Go
REST
pgx or sqlc
PostgreSQL

Authentication
--------------
Email + Password
Google OAuth / OIDC
HttpOnly session cookie

Identifiers
-----------
UUIDv7

Architecture
------------
Modular monolith
Offline-first POS
Local-first checkout
Outbox-based synchronization
Cursor-based server synchronization
Inventory movement ledger
```

This should be the baseline architecture before implementation begins.
