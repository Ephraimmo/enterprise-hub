import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StaffRole } from "@/lib/session.functions";

export interface StaffMember {
  user_id: string;
  email: string;
  full_name: string | null;
  job_title: string | null;
  last_login_at: string | null;
  roles: StaffRole[];
  restaurants: { restaurant_id: string; name: string; role: string }[];
}

export interface Invitation {
  id: string;
  email: string;
  role: StaffRole;
  restaurant_id: string | null;
  restaurant_name: string | null;
  status: string;
  message: string | null;
  expires_at: string;
  created_at: string;
}

export interface AccessPayload {
  staff: StaffMember[];
  invitations: Invitation[];
  permissions: { code: string; module: string; description: string }[];
  rolePermissions: { role: StaffRole; permission_code: string }[];
  restaurants: { id: string; name: string }[];
}

export const getAccessOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessPayload> => {
    const db = context.supabase as never as { from: (t: string) => any };
    const [profileRes, roleRes, inviteRes, permRes, rolePermRes, restRes, rsRes] = await Promise.all([
      db.from("profiles").select("user_id, email, full_name, job_title, last_login_at").order("created_at"),
      db.from("user_roles").select("user_id, role").eq("is_active", true),
      db.from("staff_invitations").select("*").order("created_at", { ascending: false }).limit(100),
      db.from("permissions").select("code, module, description").order("module"),
      db.from("role_permissions").select("role, permission_code").eq("is_active", true),
      db.from("restaurants").select("id, name").order("name"),
      db.from("restaurant_staff").select("user_id, restaurant_id, role").eq("is_active", true),
    ]);

    const restaurantNames = Object.fromEntries((restRes.data ?? []).map((r: any) => [r.id, r.name]));

    return {
      staff: (profileRes.data ?? []).map((p: any) => ({
        user_id: p.user_id,
        email: p.email,
        full_name: p.full_name,
        job_title: p.job_title,
        last_login_at: p.last_login_at,
        roles: (roleRes.data ?? []).filter((r: any) => r.user_id === p.user_id).map((r: any) => r.role),
        restaurants: (rsRes.data ?? [])
          .filter((r: any) => r.user_id === p.user_id)
          .map((r: any) => ({ restaurant_id: r.restaurant_id, name: restaurantNames[r.restaurant_id] ?? "—", role: r.role })),
      })),
      invitations: (inviteRes.data ?? []).map((i: any) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        restaurant_id: i.restaurant_id,
        restaurant_name: i.restaurant_id ? (restaurantNames[i.restaurant_id] ?? null) : null,
        status: i.status,
        message: i.message,
        expires_at: i.expires_at,
        created_at: i.created_at,
      })),
      permissions: permRes.data ?? [],
      rolePermissions: rolePermRes.data ?? [],
      restaurants: restRes.data ?? [],
    };
  });

export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; role: StaffRole; restaurantId?: string | null; message?: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as { from: (t: string) => any };
    const { error } = await db.from("staff_invitations").insert({
      email: data.email.trim().toLowerCase(),
      role: data.role,
      restaurant_id: data.restaurantId ?? null,
      message: data.message ?? null,
      invited_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await db.from("audit_logs").insert({
      actor_id: context.userId,
      actor_email: (context.claims["email"] as string | undefined) ?? null,
      action: "staff.invited",
      entity_type: "staff_invitation",
      after_value: { email: data.email, role: data.role, restaurant_id: data.restaurantId ?? null },
    });
    return { ok: true };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as { from: (t: string) => any };
    const { error } = await db.from("staff_invitations").update({ status: "revoked", is_active: false }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setRestaurantStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; userId: string; role: StaffRole; remove?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as { from: (t: string) => any };
    if (data.remove) {
      const { error } = await db
        .from("restaurant_staff")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await db
      .from("restaurant_staff")
      .upsert(
        { restaurant_id: data.restaurantId, user_id: data.userId, role: data.role, created_by: context.userId },
        { onConflict: "restaurant_id,user_id,role" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPlatformRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: StaffRole; grant: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await (context.supabase as never as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any }>;
    }).rpc("is_platform_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as never as { from: (t: string) => any };
    if (data.grant) {
      const { error } = await admin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role, created_by: context.userId, is_active: true }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    await admin.from("audit_logs").insert({
      actor_id: context.userId,
      actor_email: (context.claims["email"] as string | undefined) ?? null,
      action: data.grant ? "role.granted" : "role.revoked",
      entity_type: "user_role",
      entity_id: data.userId,
      after_value: { role: data.role },
    });
    return { ok: true };
  });

/** Redeems any pending invitations matching the signed-in user's email. */
export const claimInvitations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = ((context.claims["email"] as string | undefined) ?? "").toLowerCase();
    if (!email) return { claimed: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as never as { from: (t: string) => any };
    const { data: invites } = await admin
      .from("staff_invitations")
      .select("id, role, restaurant_id, expires_at")
      .eq("email", email)
      .eq("status", "pending");

    const live = (invites ?? []).filter((i: any) => new Date(i.expires_at) > new Date());
    for (const invite of live) {
      if (invite.restaurant_id) {
        await admin
          .from("restaurant_staff")
          .upsert(
            { restaurant_id: invite.restaurant_id, user_id: context.userId, role: invite.role },
            { onConflict: "restaurant_id,user_id,role" },
          );
      }
      await admin
        .from("user_roles")
        .upsert({ user_id: context.userId, role: invite.role, is_active: true }, { onConflict: "user_id,role" });
      await admin
        .from("staff_invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: context.userId })
        .eq("id", invite.id);
    }
    return { claimed: live.length };
  });
