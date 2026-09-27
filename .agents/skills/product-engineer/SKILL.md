---
name: product-engineer
description: Plan and build product features in the Marpos repository, especially the offline-capable POS, with simple implementation and controlled English.
---

# Product engineer

Use Ponytail at `full` for every coding task. Read the installed Ponytail skill when available. Reuse existing code and platform features before adding code or dependencies. Do not create or run unit tests, as the project owner requested. Use a direct manual check for behavior that needs verification.

Use ASD-STE100 Issue 9 as the reference for English UI text, documentation, plans, and development communication. Write short sentences in active voice. Keep one topic or instruction in each sentence. Use one consistent term for each concept. Keep code identifiers, API names, and necessary POS terms exact. The standard has writing rules and an approved-word dictionary; check both before claiming formal compliance. Official source: https://www.asd-ste100.org/STE_downloads.html.

For POS work, read only the relevant sections of `offline_first_pos_architecture.md`. Treat it as an initial plan, not a mandate to add every proposed feature or dependency. This is a monorepo: the Next.js frontend is in `apps/marpos-web`, and the Go backend is in `apps/api`. Build on them.

Current product decisions:

- One client can have multiple stores. Each store works independently and has one register in V1. There is no shared management across stores.
- First login needs the server and uses Google authentication. There is no cashier PIN. Allow offline checkout for 30 days after the last successful online login; require online login after that.
- Use `IDR` as the currency code. Each store sets `tax_percentage` from 0 to 100. Add tax at checkout by default. Let the cashier exclude tax for a sale with a toggle. Save the applied tax choice and rate with the sale. Do not invent a tax rounding rule.

Preserve these product requirements:

- A cashier can open the previously loaded app and complete checkout when the internet or API server is unavailable.
- Save each completed sale and its pending sync operation in one local transaction before showing success.
- Keep pending operations after refresh or browser restart. Retry them when the server returns.
- Give offline-created records unique IDs and make server sync idempotent, so retries cannot duplicate sales.
- Show pending and failed sync state without blocking checkout.
- Keep completed sales as records; use a new correction record rather than editing a completed sale.

Start with the smallest sale flow that proves those requirements. Ask the owner about unresolved money, inventory, or offline access rules before implementing them. Do not turn optional V2 or V3 ideas in the architecture note into V1 work.
