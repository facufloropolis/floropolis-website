# Floropolis Checkout + Dispatch System — Mockup Hub
v1 | 2026-05-13 | Job_PM

All mockups are live Next.js pages. Run `npm run dev` in the floropolis-upgrade folder and open:

## Screens

| # | Screen | URL | Who uses it |
|---|---|---|---|
| 1 | Checkout (card save) | http://localhost:3000/mockups/checkout | Customer |
| 2 | Admin — Order Queue | http://localhost:3000/mockups/admin-orders | Facu + Rose |
| 3 | Admin — Order Detail | http://localhost:3000/mockups/admin-order-detail | Facu + Rose |
| 4 | Admin — Dispatch Manifest | http://localhost:3000/mockups/admin-dispatch | Facu + Rose |
| 5 | Account — Order History | http://localhost:3000/mockups/account-orders | Customer |
| 6 | Vendor Portal | http://localhost:3000/mockups/vendor-portal | Farm / Vendor |

Index of all screens: http://localhost:3000/mockups

## Folder structure

```
checkout-system/          ← this folder
  README.md               ← you are here
  plan.md                 ← full 9-week implementation plan
  research.md             ← stripe/fedex/customs research notes

app/mockups/              ← all screen code (served by Next.js dev server)
  layout.tsx
  page.tsx                ← clickable index
  checkout/page.tsx
  admin-orders/page.tsx
  admin-order-detail/page.tsx
  admin-dispatch/page.tsx
  account-orders/page.tsx
  vendor-portal/page.tsx
```

## How to review

1. `cd /Users/facu/Desktop/floropolis-upgrade && npm run dev`
2. Open http://localhost:3000/mockups in browser
3. Click through each screen
4. Use the green "APPROVED" / red "NEEDS CHANGE" banner at the top of each screen
   to mark your decision (not wired — just communicate to Job_PM in session)

All data is hardcoded. No Supabase or Stripe calls. Safe to open in any environment.
