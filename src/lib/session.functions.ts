import {
  delay,
  logAudit,
  permissions as allPermissions,
  profiles,
  rolePermissions,
  userRoles,
} from "@/lib/demo-store";

export type StaffRole =
  | "super_admin"
  | "platform_admin"
  | "restaurant_owner"
  | "restaurant_manager"
  | "kitchen_manager"
  | "kitchen_staff"
  | "cashier"
  | "dispatcher"
  | "finance_manager"
  | "customer_support"
  | "marketing_manager"
  | "inventory_manager"
  | "branch_manager"
  | "operations_manager"
  | "auditor";

export interface StaffSession {
  userId: string;
  email: string;
  fullName: string | null;
  jobTitle: string | null;
  roles: StaffRole[];
  permissions: string[];
}

const DEMO_KEY = "forkfleet.demo.session";
const DEMO_USER_ID_KEY = `${DEMO_KEY}.user_id`;
const DEMO_EMAIL_KEY = `${DEMO_KEY}.email`;
const DEFAULT_DEMO_USER_ID = "usr-1";

/** Pre-seeded static credentials used by the /auth screen. Passwords are demo-only. */
export interface DemoCredential {
  email: string;
  password: string;
  label: string;
  rolePreview: string;
}

export const DEMO_CREDENTIALS: DemoCredential[] = [
  {
    email: "avery.cole@forkfleet.demo",
    password: "demo12345",
    label: "Avery Cole",
    rolePreview: "Super Admin",
  },
  {
    email: "dispatch.lead@forkfleet.demo",
    password: "demo12345",
    label: "Sipho Dlamini",
    rolePreview: "Dispatcher",
  },
  {
    email: "kitchen.lead@forkfleet.demo",
    password: "demo12345",
    label: "Nadia Petersen",
    rolePreview: "Kitchen Manager",
  },
  {
    email: "finance@forkfleet.demo",
    password: "demo12345",
    label: "Ravi Naidoo",
    rolePreview: "Finance Manager",
  },
  {
    email: "support@forkfleet.demo",
    password: "demo12345",
    label: "Zanele Nkosi",
    rolePreview: "Customer Support",
  },
  {
    email: "owner.nonnas@forkfleet.demo",
    password: "demo12345",
    label: "Chloe Meyer",
    rolePreview: "Restaurant Owner",
  },
];

function readLS(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function writeLS(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
}

/** True when the demo operator has "signed in" during this browser session. */
export function isDemoSignedIn(): boolean {
  return readLS(DEMO_KEY) === "1";
}

/** Return the signed-in demo user id (or the default Super Admin id if none set). */
export function getDemoUserId(): string {
  return readLS(DEMO_USER_ID_KEY) ?? DEFAULT_DEMO_USER_ID;
}

/** Return the signed-in demo email override (or null). */
export function getDemoEmailOverride(): string | null {
  return readLS(DEMO_EMAIL_KEY);
}

export interface DemoSignInResult {
  ok: boolean;
  error?: "invalid_credentials";
  session?: StaffSession;
}

export async function signInDemoWithCredentials(input: {
  email: string;
  password: string;
}): Promise<DemoSignInResult> {
  await delay(250);
  const normalizedEmail = input.email.trim().toLowerCase();
  const match = DEMO_CREDENTIALS.find((c) => c.email.toLowerCase() === normalizedEmail);
  if (!match || input.password !== match.password) {
    return { ok: false, error: "invalid_credentials" };
  }
  const profile = profiles.find((p) => p.email.toLowerCase() === normalizedEmail);
  if (!profile) return { ok: false, error: "invalid_credentials" };

  writeLS(DEMO_KEY, "1");
  writeLS(DEMO_USER_ID_KEY, profile.user_id);
  writeLS(DEMO_EMAIL_KEY, profile.email);

  logAudit({
    action: "auth.sign_in",
    entityType: "staff",
    entityId: profile.user_id,
    after: { email: profile.email },
  });

  return { ok: true, session: buildSessionForProfile(profile) };
}

export function signInDemoAs(userId: string) {
  const profile = profiles.find((p) => p.user_id === userId);
  if (!profile) return;
  writeLS(DEMO_KEY, "1");
  writeLS(DEMO_USER_ID_KEY, profile.user_id);
  writeLS(DEMO_EMAIL_KEY, profile.email);
}

export function signOutDemo() {
  writeLS(DEMO_KEY, null);
  writeLS(DEMO_USER_ID_KEY, null);
  writeLS(DEMO_EMAIL_KEY, null);
}

function buildSessionForProfile(profile: (typeof profiles)[number]): StaffSession {
  const roles = userRoles.filter((r) => r.user_id === profile.user_id).map((r) => r.role as StaffRole);
  const codes = new Set(
    rolePermissions
      .filter((rp) => roles.includes(rp.role as StaffRole))
      .map((rp) => rp.permission_code),
  );
  return {
    userId: profile.user_id,
    email: profile.email,
    fullName: profile.full_name,
    jobTitle: profile.job_title,
    roles,
    permissions: codes.size > 0 ? Array.from(codes) : allPermissions.map((p) => p.code),
  };
}

/** Synchronous session used for the initial React render (no await) so that
 *  the sidebar already has permissions on first paint — avoids the "empty
 *  menu" flash while the async query resolves. */
export function buildDemoSessionSync(): StaffSession | null {
  if (!isDemoSignedIn()) return null;
  const userId = getDemoUserId();
  const emailOverride = getDemoEmailOverride();
  const profile =
    profiles.find((p) => p.user_id === userId) ??
    (emailOverride ? profiles.find((p) => p.email === emailOverride) : undefined) ??
    profiles.find((p) => p.user_id === DEFAULT_DEMO_USER_ID);
  if (!profile) return null;
  return buildSessionForProfile(profile);
}

/** Resolves the currently signed-in demo staff session. */
export async function getStaffSession(): Promise<StaffSession | null> {
  await delay(40);
  if (!isDemoSignedIn()) return null;
  const userId = getDemoUserId();
  const emailOverride = getDemoEmailOverride();
  const profile =
    profiles.find((p) => p.user_id === userId) ??
    (emailOverride ? profiles.find((p) => p.email === emailOverride) : undefined) ??
    profiles.find((p) => p.user_id === DEFAULT_DEMO_USER_ID)!;
  return buildSessionForProfile(profile);
}

export async function recordAuditEvent(input: {
  action: string;
  entityType: string;
  entityId?: string;
  after?: unknown;
}) {
  logAudit({
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    after: (input.after ?? null) as Record<string, string | number | boolean | null> | null,
  });
  return { ok: true };
}
