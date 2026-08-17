# Driver App ↔ Admin Console — Linking & Driver Management Handover

**Document:** `docs/DRIVER_APP_ADMIN_LINKING_HANDOVER.md`
**Project:** ForkFleet ecosystem — Firebase project `e-comm-bd997`
**Audience:** Admin/Operations Console developer, Firebase owner, QA, and operations
**Prepared:** 16 August 2026
**Supersedes:** any earlier instruction that a driver must be *manually added* in the Admin console

---

## 1. Objective

Link the **Delivery/Driver App** to the **Admin (Operations) Console** so that:

1. Drivers **register themselves** in the Driver App (email + password).
2. Registered drivers appear in the Admin **Driver Management** section **in real time**.
3. An authorised admin **approves** the account.
4. An authorised admin **assigns the driver to restaurants and their branches**.
5. All of the above is captured and displayed **in real time** from the shared Firebase Realtime Database — no manual refresh, no duplicate records.

The Admin console is the **approval and authorisation layer**. The Driver App is the **registration and operations layer**. Firebase is the **single source of truth**.

---

## 2. Canonical data contract (shared source of truth)

Both applications read and write the **same Firebase Realtime Database** (`e-comm-bd997`). Do not create a second driver database or a second schema.

### 2.1 Driver profile — `/drivers/{driverId}`

```jsonc
{
  "id": "drv-<slug>",             // stable driver id, generated at registration
  "user_id": "<firebase auth uid>", // Auth UID — links the profile to Firebase Authentication
  "full_name": "Sipho Dube",
  "username": "sipho.dube",        // derived deterministically from the email local-part
  "email": "sipho.dube@example.com", // self-registered drivers sign in with email
  "phone": "+27 82 555 0100",
  "vehicle_type": "Motorcycle",
  "status": "pending",             // see §4 status machine
  "is_active": false,              // false until approved — blocks order eligibility
  "is_verified": false,            // false until admin approval
  "is_deleted": false,
  "must_change_password": false,   // admin-provisioned drivers only (temporary password)
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

- One driver = **one Auth UID** = **one `/drivers/{driverId}` profile**, regardless of how many restaurants/branches they serve.
- `username` is derived once via `deriveUsernameFromEmail(email)` (Driver App) and stored; it satisfies the shared `driver_username` claim contract.
- `email` is the driver-visible login credential for self-registered accounts. The internal Auth alias `@drivers.e-comm-bd997.invalid` is an implementation detail and must never be displayed or stored here.

### 2.2 Driver assignments — `/driverAssignments/{driverId}__{restaurantId}__{branchId}`

```jsonc
{
  "id": "drv-001__rst-burgerlab__brn-main",
  "driver_id": "drv-001",
  "restaurant_id": "rst-burgerlab",
  "branch_id": "brn-main",
  "restaurant_name": "Burger Lab",
  "branch_name": "Main",
  "is_active": true,
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "deactivated_at": null
}
```

- One row grants exactly one **(driver, restaurant, branch)** tuple.
- Restaurant access does **not** imply all branches — exact branch matching is mandatory.
- Removals set `is_active = false` and keep the row (history preserved, never hard-deleted).

### 2.3 Restaurants & branches — `/restaurants/{restaurantId}/branches`

```jsonc
{
  "rst-burgerlab": {
    "id": "rst-burgerlab",
    "name": "Burger Lab",
    "branches": {
      "main":    { "id": "main", "name": "Main", "address": "…" },
      "test1":   { "id": "test1", "name": "Branch Test1", "address": "…" }
    }
  }
}
```

Admin assignment reads the real branch list from here. **"All branches" is never stored as a wildcard** — it is expanded into one concrete assignment row per real branch.

### 2.4 Other shared nodes (unchanged)

- `/orders/{orderId}` — orders, with `driver_id`, `restaurant_id`, `branch_id`, `driver_status`.
- `/drivers/live/{orderId}` — live GPS for customer tracking.
- `/notifications/drivers/{driverId}` — driver notifications.

---

## 3. End-to-end flow

```
DRIVER APP                        FIREBASE (e-comm-bd997)             ADMIN CONSOLE
──────────                        ──────────────────────             ─────────────
1. Driver registers
   (name, email, phone,
    vehicle, password)
        │
        ▼
   registerDriverAccount           /drivers/{driverId}
   (trusted Function)              status: "pending"   ───────────────▶  3. Driver appears in
   creates Auth user +             is_verified: false                    Driver Management
   claims + profile                is_active: false                      IN REAL TIME
                                   /driverAssignments: none yet
        │                                                                     │
        ▼                                                                     ▼
2. Driver signs in                                                      4. Admin reviews + APPROVES
   (email + password)                                                        /drivers/{driverId}:
   sees "verification                                                         status: "offline"
   incomplete"                                                               is_verified: true
   (no orders yet)                                                           is_active: true
                                                                             │
                                                                             ▼
                                                                      5. Admin ASSIGNS restaurants
                                                                         & branches (concrete tuples)
                                                                         /driverAssignments/…
                                                                             │
                                                                             ▼
        ┌─────────────────────────────────────────────────────────────┐
        │ 6. Driver goes ONLINE and receives orders only for the     │
        │    exact (restaurant, branch) tuples they are assigned to. │
        └─────────────────────────────────────────────────────────────┘
```

All four systems — Customer App, Admin Console, Driver App, Dispatch — observe the same Firebase nodes via realtime listeners.

---

## 4. Driver status machine

| status       | meaning                                      | can receive orders |
|--------------|----------------------------------------------|--------------------|
| `pending`    | self-registered, awaiting admin approval     | no                 |
| `approved`   | admin approved, not yet online               | no (must go online)|
| `online`     | available, on shift                          | yes                |
| `busy`       | on an active delivery                        | no (auto)          |
| `offline`    | approved but off shift                       | no                 |
| `suspended`  | blocked by admin                             | no                 |
| `rejected`   | registration declined by admin               | no                 |

**Registration → `pending`.** **Approval → `approved`/`offline`** (and `is_verified: true`, `is_active: true`). **Rejection → `rejected`.**

The Driver App already enforces eligibility: a driver may only accept an order when their profile is active **and** an active `(driver, restaurant, branch)` assignment matches the order exactly.

---

## 5. Required changes to the Admin "Driver Management" section

### 5.1 Remove the "Add driver" button (mandatory)

- **Delete the "Add driver" / "Create driver" button and its dialog/form from the Driver Management section.**
- Rationale: drivers are now created **only** via Driver App self-registration. A manual "Add driver" path would produce duplicate profiles and bypass the Auth UID → `user_id` link.
- The Admin console must **not** create `/drivers/{driverId}` records or Auth users. The only admin-created driver flow that remains is **admin-provisioned temporary-password accounts** (see `docs/DRIVER_ACCOUNT_PROVISIONING_DEPLOYMENT.md`), which is a separate, trusted Function.

### 5.2 Real-time driver list (replace polling)

- Subscribe to `/drivers` with `onValue` (RTDB) and render the list live — the same `subscribe()` pattern the Driver App uses in `src/lib/repo.ts`.
- A newly registered driver appears **immediately** (status `pending`), with no manual refresh.
- Show: `full_name`, `username`, `email`, `phone`, `vehicle_type`, `status`, `is_verified`, `created_at`.
- Empty state: "No drivers yet — drivers register from the Driver App."

### 5.3 Approve / reject actions

- **Approve** → write `/drivers/{driverId}`:
  ```jsonc
  { "status": "offline", "is_verified": true, "is_active": true, "updated_at": "…" }
  ```
- **Reject** → write `{ "status": "rejected", "is_active": false, "updated_at": "…" }` (optionally with a `rejection_reason`).
- Both actions must be audited (acting admin, before/after, timestamp) — reuse the existing audit pattern.

### 5.4 Assign restaurants & branches

For an approved driver, provide an **Assign** action that:

1. Lists restaurants from `/restaurants` with their real branches.
2. Lets the admin select a restaurant and one branch, **or "All branches"**.
3. On "All branches", **expands** to one concrete `/driverAssignments/{driverId}__{restaurantId}__{branchId}` row per real branch. Never store `"all"` or `"*"`.
4. Writes each assignment with `is_active: true`, plus `restaurant_name` / `branch_name` (denormalised for display).
5. Prevents duplicate tuples (key is `{driverId}__{restaurantId}__{branchId}`).

Removing a driver from a restaurant/branch sets `is_active = false` and `deactivated_at` — **never deletes** the row.

### 5.5 Suspend / reactivate

- **Suspend** → `{ "status": "suspended", "is_active": false }` (revokes new order offers immediately).
- **Reactivate** → `{ "status": "offline", "is_active": true }` (driver must go online again).

---

## 6. Real-time requirements (summary)

| Surface                              | Mechanism                                  |
|--------------------------------------|--------------------------------------------|
| Driver list (admin)                  | `onValue("/drivers")`                      |
| Driver detail (admin)                | `onValue("/drivers/{driverId}")`           |
| Driver assignments (admin)           | `onValue("/driverAssignments")`            |
| Driver status / location (dispatch)  | `onValue("/drivers")` + `/drivers/live/{orderId}` |
| Order status (both)                  | `onValue("/orders/{orderId}")`             |

- Clean up listeners on unmount; never create duplicate subscriptions.
- Optimistic UI for admin actions is allowed, but the source of truth is the Firebase write.

---

## 7. Security

- Firebase **Security Rules** must enforce: an admin (staff) identity may read `/drivers` and write approval/assignment fields; a driver identity may only read/write their **own** `/drivers/{driverId}` and read assignments where `driver_id === auth.token.driver_id`.
- The Driver App must never be able to write `/driverAssignments`, set its own `is_active`/`is_verified`, or change `user_id`/`username`.
- Approval, rejection, and assignment mutations must be validated server-side (Security Rules and/or trusted Functions), never by client-side UI hiding alone.

---

## 8. Acceptance checklist

- [ ] "Add driver" button and form removed from Driver Management.
- [ ] Driver registers in the Driver App → appears in Admin Driver Management **immediately** (real time).
- [ ] New registration shows `status: pending`, `is_verified: false`, `is_active: false`.
- [ ] Admin can **approve** → driver becomes `offline`/`approved`, `is_verified: true`, `is_active: true`.
- [ ] Admin can **reject** → `status: rejected`.
- [ ] Admin can **assign** a restaurant + single branch → exact tuple written.
- [ ] "All branches" expands to one concrete assignment per real branch.
- [ ] Duplicate assignment tuples are prevented.
- [ ] Removing an assignment sets `is_active: false` and preserves history.
- [ ] Suspended drivers stop receiving orders immediately.
- [ ] Eligible driver (exact restaurant **and** branch) receives the order; ineligible driver does not.
- [ ] No duplicate driver profiles are created.
- [ ] All admin actions are audited.
- [ ] Driver App cannot self-approve or self-assign.

---

## 9. Deployment dependencies

The Firebase owner must:

1. Deploy `registerDriverAccount` (creates Auth user + claims + `/drivers/{driverId}` with `status: "pending"`).
2. Keep the `changeDriverTemporaryPassword` Function for admin-provisioned accounts.
3. Merge `docs/firebase-driver-rules.fragment.json` into the complete RTDB rules (driver + admin access).
4. Deploy the Driver App **after** its registration and approval flow passes §8.
5. Update the Admin Console Driver Management section per §5.

---

## 10. Handover boundary

This document defines the contract and the required Admin-side changes. The Driver App registration + login flow (email/password and username/password) is implemented in `forkfleet-driver-hub`. The Admin Console Driver Management section update — removing the "Add driver" button and wiring the real-time approval + restaurant/branch assignment workflow — is to be implemented by the Admin/Operations Console team against this contract.
