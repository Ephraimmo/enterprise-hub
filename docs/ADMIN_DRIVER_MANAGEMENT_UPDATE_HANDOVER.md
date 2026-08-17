# ForkFleet — Admin Console ↔ Driver App Linking Prompt

## MASTER PROMPT — Update the Admin/Operations Console to link with the Driver App

> **How to use this document:** paste everything below the "BEGIN PROMPT" marker into your AI
> builder (Lovable, Claude, etc.) in a single message. The prompt is self-contained: it tells the
> builder exactly what exists, what to change, and how to verify the result. Do not paste the
> header or this "How to use" line.

---

### BEGIN PROMPT

## 1. ROLE AND OBJECTIVE

You are updating the **ForkFleet Admin / Operations Console** — the management portal of the
ForkFleet food ordering and delivery ecosystem — so that it is **linked to the existing ForkFleet
Driver App**.

The Driver App is **already built and already deployed as a separate application**. Its drivers
now **register themselves** (email + password) and sign in against Firebase project
`e-comm-bd997`.

Your job in this prompt is to update the **Admin Console only**. Specifically, the **Driver
Management** section must be upgraded so that:

1. Drivers who register in the Driver App appear in Driver Management **in real time**.
2. An admin can **approve or reject** each registered driver.
3. An admin can **assign** each approved driver to **restaurants and their branches**.
4. The **"Add driver" button and its form are removed** from Driver Management — drivers are no
   longer created manually in the admin.
5. All of this is read from and written to the **same Firebase Realtime Database** used by the
   Driver App. No second database, no duplicate records.

Do NOT rebuild the Driver App. Do NOT rebuild the Customer App. Do NOT change the Firebase project.
The Admin Console must integrate with the existing Driver App data model first, not invent a new
one.

## 2. CRITICAL EXISTING SYSTEM CONTEXT

The ForkFleet ecosystem is three apps sharing one backend:

```
CUSTOMER APP  ─┐
               ├──►  FIREBASE (e-comm-bd997)  ◄──┐
DRIVER APP   ──┤                                  │
               └──►  ADMIN / OPERATIONS CONSOLE ──┘
```

- Firebase project: `e-comm-bd997`
- Realtime Database: `https://e-comm-bd997-default-rtdb.firebaseio.com`
- The Driver App already writes to `/drivers/{driverId}` when a driver registers.
- The Admin Console must read that data **live** and write the approval and assignment fields.

Inspect the existing Firebase structure and the existing Admin Console code before writing new
code. Preserve every existing ID, field name, and relationship. Never rename existing fields.

## 3. THE DATA MODEL YOU MUST RESPECT (single source of truth)

### 3.1 Driver profile — `/drivers/{driverId}`

Written by the Driver App at registration:

```jsonc
{
  "id": "drv-<slug>",                // stable driver id
  "user_id": "<firebase auth uid>",  // links profile to Firebase Authentication
  "full_name": "Sipho Dube",
  "username": "sipho.dube",          // derived from email local-part, lowercase
  "email": "sipho.dube@example.com", // driver's login credential
  "phone": "+27 82 555 0100",
  "vehicle_type": "Motorcycle",
  "status": "pending",               // see status machine in section 4
  "is_verified": false,              // false until admin approves
  "is_active": false,                // false until admin approves
  "is_deleted": false,
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

One driver = **one Auth UID** = **one `/drivers/{driverId}` profile**, regardless of how many
restaurants or branches they serve.

### 3.2 Driver assignments — `/driverAssignments/{driverId}__{restaurantId}__{branchId}`

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
- Restaurant access does **not** imply all branches. Exact branch matching is mandatory.
- Removing a driver from a branch sets `is_active: false` and keeps the row. **Never hard-delete**
  assignment history.

### 3.3 Restaurants and branches — `/restaurants/{restaurantId}/branches`

```jsonc
{
  "rst-burgerlab": {
    "id": "rst-burgerlab",
    "name": "Burger Lab",
    "branches": {
      "main":  { "id": "main",  "name": "Main",         "address": "…" },
      "test1": { "id": "test1", "name": "Branch Test1", "address": "…" }
    }
  }
}
```

The Admin Console reads the real branch list from here. Selecting **"All branches"** must expand
to one concrete assignment per real branch — never store `"all"` or `"*"`.

## 4. DRIVER STATUS MACHINE

| status      | meaning                                     | can receive orders |
|-------------|---------------------------------------------|--------------------|
| `pending`   | self-registered, awaiting admin approval    | no                 |
| `offline`   | approved, not on shift                      | no (must go online)|
| `online`    | available, on shift                         | yes                |
| `busy`      | on an active delivery                       | no (automatic)     |
| `suspended` | blocked by admin                            | no                 |
| `rejected`  | registration declined                       | no                 |

- Registration → `pending`.
- **Approve** → `status: "offline"`, `is_verified: true`, `is_active: true`.
- **Reject** → `status: "rejected"`, `is_active: false`.
- **Suspend** → `status: "suspended"`, `is_active: false`.
- **Reactivate** → `status: "offline"`, `is_active: true`.

## 5. REQUIRED ADMIN CONSOLE CHANGES

Implement these in the Driver Management section of the Admin Console.

### 5.1 REMOVE the "Add driver" button (mandatory, do this first)

- Delete the **"Add driver"** button and its create-driver dialog/form from Driver Management.
- Search the codebase for `Add driver`, `addDriver`, `createDriver`, `new driver`, `add-driver`
  and remove every driver-creation path from the admin UI and server functions.
- Do NOT create `/drivers/{driverId}` records from the admin. Drivers are created **only** by
  self-registration in the Driver App.
- Keep the existing **admin-provisioned temporary-password** flow (trusted Function) if it exists —
  it is the only admin-created account path and is out of scope of this UI change.

### 5.2 Real-time driver list

- Subscribe to `/drivers` with a realtime listener (Firebase RTDB `onValue`).
- A newly registered driver must appear **immediately** with status `pending`. No manual refresh,
  no polling.
- Clean up the listener when leaving the screen. Never create duplicate subscriptions.
- Show these columns: **Driver** (full_name + username/email), **Phone**, **Vehicle**
  (type + plate), **City**, **Status**, **Verified**, **Registered** (created_at).
- Empty state: "No drivers yet — drivers register from the Driver App."

### 5.3 Approve / Reject / Suspend / Reactivate

Add actions that write to `/drivers/{driverId}`:

```text
Approve    → { status: "offline", is_verified: true, is_active: true, updated_at: now }
Reject     → { status: "rejected", is_active: false, rejection_reason: reason, updated_at: now }
Suspend    → { status: "suspended", is_active: false, updated_at: now }
Reactivate → { status: "offline", is_active: true, updated_at: now }
```

Every action must be recorded in the existing audit log (acting admin, before/after, timestamp).

### 5.4 Assign restaurants & branches

For each approved driver, add an **Assign** action that:

1. Lists restaurants from `/restaurants` and their real `/restaurants/{id}/branches`.
2. Lets the admin select a restaurant and **one branch**, or **"All branches"**.
3. Writes one `/driverAssignments/{driverId}__{restaurantId}__{branchId}` row per selection:
   ```jsonc
   {
     "id": "{driverId}__{restaurantId}__{branchId}",
     "driver_id": "{driverId}",
     "restaurant_id": "{restaurantId}",
     "branch_id": "{branchId}",
     "restaurant_name": "…", "branch_name": "…",
     "is_active": true,
     "created_at": "ISO-8601", "updated_at": "ISO-8601", "deactivated_at": null
   }
   ```
4. For **"All branches"**, expands to one concrete row per real branch. **Never store `"all"` or `"*"`.**
5. Prevents duplicate tuples (the key is `{driverId}__{restaurantId}__{branchId}`).
6. Shows the driver's current **active** assignments (read `/driverAssignments` where
   `driver_id === id` and `is_active === true`).
7. Removing a branch sets `is_active: false` and `deactivated_at` — **never deletes the row.**

### 5.5 Reusable functions to create

Create `src/lib/driver-admin.functions.ts` with at least these functions (adapt to the existing
Firebase helpers — the codebase already has `rtdbSubscribe`, `rtdbUpdate`, `rtdbSet`, `rtdbGet`):

```ts
subscribeAllDrivers(cb)                     // onValue("drivers") → sorted AdminDriver[]
approveDriver(driverId)                     // section 5.3
rejectDriver(driverId, reason?)             // section 5.3
suspendDriver(driverId)                     // section 5.3
reactivateDriver(driverId)                  // section 5.3
subscribeRestaurants(cb)                    // onValue("restaurants")
assignDriverToBranch(driverId, restaurantId, branchId, names?)
assignDriverToAllBranches(driverId, restaurant)   // expands branches
removeDriverBranch(assignmentKey)           // is_active=false
subscribeDriverAssignments(driverId, cb)    // active tuples only
```

## 6. REAL-TIME REQUIREMENTS

| Surface                            | Mechanism                          |
|------------------------------------|------------------------------------|
| Driver list (admin)                | `onValue("/drivers")`              |
| Driver detail (admin)              | `onValue("/drivers/{driverId}")`   |
| Driver assignments (admin)         | `onValue("/driverAssignments")`    |
| Driver status / location (dispatch)| `onValue("/drivers")` + `/drivers/live/{orderId}` |
| Order status (dispatch/customer)   | `onValue("/orders/{orderId}")`     |

Clean up listeners on unmount. Optimistic UI is allowed only when the Firebase write is the
source of truth.

## 7. SECURITY REQUIREMENTS

- Firebase Security Rules must enforce that an admin (staff) identity may read `/drivers` and
  write the approval/assignment fields; a driver identity may only read/write their **own**
  `/drivers/{driverId}` and read assignments where `driver_id === auth.token.driver_id`.
- The Driver App must never be able to write `/driverAssignments`, set its own `is_active` /
  `is_verified`, or change `user_id` / `username`.
- Approval, rejection, and assignment mutations must be validated server-side (Security Rules
  and/or trusted Functions). Hiding a button in the UI is not security.

## 8. STRICT RULES

- Do NOT create a new Firebase project, a second driver database, or duplicate
  `/drivers`, `/driverAssignments`, `/restaurants`, or `/orders` records.
- Do NOT create fake demo drivers, orders, or assignments to make the screen look full. If
  Firebase is empty, show the empty state.
- Do NOT break the existing Orders, Dispatch, Kitchen, or Restaurants sections.
- Preserve existing IDs and field names. Reuse the existing audit log, not a new one.
- Never let the admin UI create a driver without an Auth UID → `user_id` link.

## 9. BUILD ORDER

Build in this sequence and verify each step before moving on:

1. Remove the "Add driver" button and driver-creation path.
2. Add the real-time `/drivers` subscription and render the live driver list.
3. Add Approve / Reject actions with audit logging.
4. Add Suspend / Reactivate actions with audit logging.
5. Add the Assign restaurant & branch UI (single branch + "All branches" expansion).
6. Show active assignments per driver and implement branch removal (soft delete).
7. Verify the security rules for the new writes.

## 10. CRITICAL ACCEPTANCE TEST

Create/execute an end-to-end test equivalent to this scenario:

1. Register a new driver in the Driver App with an email + password.
2. Open Admin Console → Driver Management.
3. Verify the new driver appears **immediately** with `status: pending`, `is_verified: false`,
   `is_active: false`.
4. Verify there is **no "Add driver" button** in Driver Management.
5. Approve the driver → verify `status: offline`, `is_verified: true`, `is_active: true`.
6. Assign the driver to Restaurant A → "All Branches" → verify one concrete assignment row per
   real branch exists (no `"all"` / `"*"`).
7. Assign the driver to Restaurant B → single branch → verify the exact tuple exists.
8. Verify no duplicate assignment tuples exist.
9. Remove one branch → verify the assignment becomes `is_active: false` and the row is preserved.
10. Suspend the driver → verify they stop receiving offers immediately.
11. Confirm the Driver App cannot self-approve or self-assign (attempt it and confirm rejection).
12. Confirm every admin action appears in the audit log.
13. Confirm a driver is offered an order only when an active assignment matches the order's exact
    restaurant **and** branch.

## 11. DEFINITION OF DONE

The task is NOT complete until:

- [ ] "Add driver" button and form are removed from Driver Management.
- [ ] Driver list updates in real time from `/drivers`.
- [ ] New registrations appear instantly with status `pending`.
- [ ] Approve / Reject / Suspend / Reactivate write the correct fields and are audited.
- [ ] Assign writes exact `{driverId}__{restaurantId}__{branchId}` tuples.
- [ ] "All branches" expands to concrete branch IDs.
- [ ] Duplicate assignment tuples are prevented.
- [ ] Branch removal sets `is_active: false` and preserves history.
- [ ] Suspend blocks new offers immediately.
- [ ] Driver App cannot self-approve or self-assign.
- [ ] No duplicate driver profiles are created.
- [ ] Existing Orders / Dispatch / Kitchen / Restaurants sections still work.
- [ ] Production build succeeds and all automated tests pass.

## 12. FINAL COMMAND

Inspect the existing Admin Console code, the existing Firebase Realtime Database structure, the
Driver App data contract, and the existing Driver Management implementation. Preserve all existing
working functionality. Then implement the Driver Management upgrade feature-by-feature in the
order specified above, verifying each feature against the real Firebase database before
proceeding. Do not break the Dispatch, Orders, or Restaurants sections. Do not create a second
database. Do not duplicate driver records. Do not re-add a manual "Add driver" flow.

### END PROMPT

---

## Notes for the operator (not part of the prompt)

- Related documents in this repository:
  - `docs/DRIVER_APP_ADMIN_LINKING_HANDOVER.md` — the linking contract (data model, status machine, flow).
  - `forkfleet-driver-hub` — the Driver App (registration + login already implemented).
- The prompt above is intentionally self-contained so it can be pasted into Lovable/Claude with no
  other context and still produce the correct Admin Console update.
- Before running it in a live environment, run it against the Firebase emulator and verify the
  acceptance test in section 10.
