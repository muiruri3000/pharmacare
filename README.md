# PharmaCare — multi-tenant pharmacy management system

A multi-tenant, multi-user pharmacy platform: each tenant is a **wholesale**
or **retail** pharmacy business, with three user roles per tenant — **admin**,
**sales**, and **pharmacy technician**.

- **Backend:** Django + Django REST Framework, JWT auth, PostgreSQL
- **Frontend:** React 19 + TanStack Router/Query + shadcn/ui + Tailwind

Built by adapting a proven multi-tenant SaaS pattern (thread-local tenant
scoping, a queryset manager that refuses unscoped queries, role-based DRF
permissions) onto a fresh pharmacy domain model.

## Multi-tenancy

Every business record (`Product`, `Sale`, `Batch`, ...) carries a `tenant`
foreign key. `Model.objects` is scoped **automatically** to the logged-in
user's tenant and **raises an error** rather than silently returning
unscoped data — see `backend/core/managers.py` and
`backend/core/context.py`. This is a shared-database design (one Postgres
DB, `tenant_type` = `wholesale` or `retail`, row-level scoping) — simplest
to build and operate, and what we discussed for the MVP.

## Roles

| Resource            | Admin | Sales           | Technician       |
|----------------------|:-----:|:---------------:|:----------------:|
| Products / Batches   | full  | view only       | full (no delete) |
| Stock movements      | full  | —               | create + view    |
| Sales (POS)          | full  | create + view   | view only        |
| Customers            | full  | full (no delete)| view only        |
| Prescriptions        | full  | view + create   | full (dispense)  |
| Suppliers / Purchase orders | full | view only | full (no delete) |
| Users                | full  | —               | —                |
| Reports / Activity log | full | —             | —                |

Enforced on the backend (`backend/core/permissions.py`) — the frontend nav
and buttons (`frontend/src/lib/auth/permissions.ts`) just hide what a role
can't do; the API is the real boundary.

## Getting started

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # edit DB credentials, or switch to SQLite (see settings.py)
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser   # optional, for /admin/
python manage.py seed_demo         # creates demo tenants + logins, see below
python manage.py runserver
```

Quickest possible start with zero DB setup: open `pharmacore/settings.py`
and uncomment the SQLite `DATABASES["default"]` line.

`seed_demo` creates two tenants with three logins each (password
`Passw0rd!` for all):

- **GreenLeaf Retail Pharmacy** — `retail_admin`, `retail_sales`, `retail_tech`
- **BlueCross Wholesale Distributors** — `wholesale_admin`, `wholesale_sales`, `wholesale_tech`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env    # points at http://127.0.0.1:8000/api by default
npm run dev
```

`src/routeTree.gen.ts` is generated automatically by the TanStack Router
Vite plugin the first time you run `npm run dev` or `npm run build` — don't
create it by hand, and don't worry that it's missing before your first run.

Open the printed local URL and sign in with one of the seeded accounts.

### Running the tests

```bash
cd backend
python manage.py test
```

77 tests, covering tenant isolation, every role's permissions, FEFO stock
math, the reporting aggregations (including a real row-fan-out bug that
was caught and fixed while building them), barcode lookup, and activity
log recording.

## What's built vs. what's next

Done: tenant/user models, JWT auth, all core domain models (products,
batches with FEFO stock deduction, stock movements, sales/POS, customers,
suppliers, purchase orders with receiving, prescriptions with dispensing),
role-based permissions front and back, full CRUD UI for every module, a
green/white/blue themed dashboard, **reporting/analytics** (sales trend
charts, payment-method mix, top products, inventory valuation with
expired-stock cost breakdown — `/reports`, admin-only), **printable
receipts** (`/sales/$saleId`, with print-friendly CSS that hides the app
chrome), **barcode scanning at POS** (works with any USB/Bluetooth
keyboard-wedge scanner — scan or type a code, Enter adds the line item;
falls back to SKU if no barcode is set), and an **activity log**
(`/admin/activity-log`) recording who did what across sales, purchasing,
prescriptions, and user management — separate from the existing
`StockMovement` inventory-only audit trail so it stays a readable feed of
business events, not a firehose of every quantity change.

Reasonable next additions: SMS/email receipts, tenant self-signup
(currently tenants are provisioned via `seed_demo` or Django admin), and
background jobs for low-stock/expiry email digests (`core/context.py`
already has a `tenant_context()` helper written for exactly this).
# pharmacare
