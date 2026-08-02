import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

/**
 * Resolves the signed-in staff member: creates the profile row on first sign-in,
 * bootstraps the very first user as super admin, then returns roles + permissions.
 */
export const getStaffSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StaffSession> => {
    const db = context.supabase as never as {
      from: (t: string) => any;
      rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
    };
    const email = (context.claims["email"] as string | undefined) ?? "";
    const metadata = (context.claims["user_metadata"] ?? {}) as Record<string, unknown>;
    const fullNameFromAuth =
      (metadata["full_name"] as string | undefined) ?? (metadata["name"] as string | undefined) ?? null;

    const { data: existing } = await db
      .from("profiles")
      .select("id, full_name, job_title")
      .eq("user_id", context.userId)
      .maybeSingle();

    let fullName: string | null = existing?.full_name ?? fullNameFromAuth;
    let jobTitle: string | null = existing?.job_title ?? null;

    if (!existing) {
      await db.from("profiles").insert({
        user_id: context.userId,
        email,
        full_name: fullNameFromAuth,
        last_login_at: new Date().toISOString(),
      });
      fullName = fullNameFromAuth;
    } else {
      await db
        .from("profiles")
        .update({ last_login_at: new Date().toISOString() })
        .eq("user_id", context.userId);
    }

    await db.rpc("bootstrap_super_admin");

    const { data: roleRows } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("is_active", true);

    const roles: StaffRole[] = (roleRows ?? []).map((r: { role: StaffRole }) => r.role);

    let permissions: string[] = [];
    if (roles.length > 0) {
      const { data: permRows } = await db
        .from("role_permissions")
        .select("permission_code")
        .in("role", roles);
      permissions = Array.from(new Set((permRows ?? []).map((p: { permission_code: string }) => p.permission_code)));
    }

    return { userId: context.userId, email, fullName, jobTitle, roles, permissions };
  });

export const recordAuditEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { action: string; entityType: string; entityId?: string; after?: unknown }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as { from: (t: string) => any };
    await db.from("audit_logs").insert({
      actor_id: context.userId,
      actor_email: (context.claims["email"] as string | undefined) ?? null,
      action: data.action,
      entity_type: data.entityType,
      entity_id: data.entityId ?? null,
      after_value: data.after ?? null,
    });
    return { ok: true };
  });
