import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RestaurantStatus = "pending" | "approved" | "suspended" | "rejected";

export interface RestaurantRow {
  id: string;
  name: string;
  slug: string;
  cuisine: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string;
  country: string;
  currency: string;
  status: RestaurantStatus;
  commission_rate: number;
  delivery_radius_km: number;
  rating: number;
  rating_count: number;
  prep_time_minutes: number;
  opens_at: string;
  closes_at: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface BranchRow {
  id: string;
  restaurant_id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  delivery_radius_km: number;
  status: RestaurantStatus;
  is_active: boolean;
}

export interface ZoneRow {
  id: string;
  restaurant_id: string;
  branch_id: string | null;
  name: string;
  radius_km: number;
  base_fee: number;
  min_order: number;
  surcharge: number;
  postal_codes: string[];
  is_active: boolean;
}

export interface HourRow {
  id?: string;
  restaurant_id?: string;
  day_of_week: number;
  opens_at: string;
  closes_at: string;
  is_closed: boolean;
}

export interface RestaurantDetail {
  restaurant: RestaurantRow;
  branches: BranchRow[];
  zones: ZoneRow[];
  hours: HourRow[];
  staff: { id: string; user_id: string; role: string; is_active: boolean; email: string | null; full_name: string | null }[];
  stats: { orders: number; revenue: number; menuItems: number };
}

export const listRestaurants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; status?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<RestaurantRow[]> => {
    const db = context.supabase as never as { from: (t: string) => any };
    let query = db.from("restaurants").select("*").order("created_at", { ascending: false }).limit(300);
    if (data.search) query = query.ilike("name", `%${data.search}%`);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getRestaurant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<RestaurantDetail> => {
    const db = context.supabase as never as { from: (t: string) => any };
    const [restRes, branchRes, zoneRes, hourRes, staffRes, itemRes, orderRes] = await Promise.all([
      db.from("restaurants").select("*").eq("id", data.id).maybeSingle(),
      db.from("restaurant_branches").select("*").eq("restaurant_id", data.id).order("name"),
      db.from("delivery_zones").select("*").eq("restaurant_id", data.id).order("name"),
      db.from("restaurant_hours").select("*").eq("restaurant_id", data.id).order("day_of_week"),
      db.from("restaurant_staff").select("id, user_id, role, is_active").eq("restaurant_id", data.id),
      db.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", data.id),
      db.from("orders").select("total, status").eq("restaurant_id", data.id).limit(2000),
    ]);
    if (!restRes.data) throw new Error("Restaurant not found");

    const staffRows = staffRes.data ?? [];
    let profiles: Record<string, { email: string; full_name: string | null }> = {};
    if (staffRows.length > 0) {
      const { data: profileRows } = await db
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", staffRows.map((s: { user_id: string }) => s.user_id));
      profiles = Object.fromEntries((profileRows ?? []).map((p: any) => [p.user_id, p]));
    }

    const orders = (orderRes.data ?? []) as { total: number; status: string }[];
    return {
      restaurant: restRes.data,
      branches: branchRes.data ?? [],
      zones: zoneRes.data ?? [],
      hours: hourRes.data ?? [],
      staff: staffRows.map((s: any) => ({
        ...s,
        email: profiles[s.user_id]?.email ?? null,
        full_name: profiles[s.user_id]?.full_name ?? null,
      })),
      stats: {
        orders: orders.length,
        revenue: orders.filter((o) => o.status === "delivered").reduce((sum, o) => sum + Number(o.total ?? 0), 0),
        menuItems: itemRes.count ?? 0,
      },
    };
  });

export const saveRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      name: string;
      cuisine: string;
      email?: string;
      phone?: string;
      address?: string;
      city: string;
      commission_rate: number;
      delivery_radius_km: number;
      prep_time_minutes: number;
      opens_at: string;
      closes_at: string;
      status?: RestaurantStatus;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as { from: (t: string) => any };
    const payload = {
      name: data.name,
      slug: data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      cuisine: data.cuisine,
      email: data.email ?? null,
      phone: data.phone ?? null,
      address: data.address ?? null,
      city: data.city,
      commission_rate: data.commission_rate,
      delivery_radius_km: data.delivery_radius_km,
      prep_time_minutes: data.prep_time_minutes,
      opens_at: data.opens_at,
      closes_at: data.closes_at,
      updated_by: context.userId,
    };

    if (data.id) {
      const { error } = await db.from("restaurants").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await db.from("audit_logs").insert({
        actor_id: context.userId,
        actor_email: (context.claims["email"] as string | undefined) ?? null,
        action: "restaurant.updated",
        entity_type: "restaurant",
        entity_id: data.id,
        after_value: payload,
      });
      return { id: data.id };
    }

    const { data: created, error } = await db
      .from("restaurants")
      .insert({ ...payload, status: data.status ?? "pending", created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const days = [0, 1, 2, 3, 4, 5, 6].map((day_of_week) => ({
      restaurant_id: created.id,
      day_of_week,
      opens_at: data.opens_at,
      closes_at: data.closes_at,
      is_closed: false,
    }));
    await db.from("restaurant_hours").insert(days);
    await db.from("audit_logs").insert({
      actor_id: context.userId,
      actor_email: (context.claims["email"] as string | undefined) ?? null,
      action: "restaurant.registered",
      entity_type: "restaurant",
      entity_id: created.id,
      after_value: payload,
    });
    return { id: created.id as string };
  });

export const setRestaurantStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: RestaurantStatus; reason?: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as { from: (t: string) => any };
    const { error } = await db
      .from("restaurants")
      .update({ status: data.status, updated_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await db.from("audit_logs").insert({
      actor_id: context.userId,
      actor_email: (context.claims["email"] as string | undefined) ?? null,
      action: `restaurant.${data.status}`,
      entity_type: "restaurant",
      entity_id: data.id,
      after_value: { status: data.status, reason: data.reason ?? null },
    });
    return { ok: true };
  });

export const saveBusinessHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; hours: HourRow[] }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as { from: (t: string) => any };
    await db.from("restaurant_hours").delete().eq("restaurant_id", data.restaurantId);
    const { error } = await db.from("restaurant_hours").insert(
      data.hours.map((h) => ({
        restaurant_id: data.restaurantId,
        day_of_week: h.day_of_week,
        opens_at: h.opens_at,
        closes_at: h.closes_at,
        is_closed: h.is_closed,
      })),
    );
    if (error) throw new Error(error.message);
    await db.from("audit_logs").insert({
      actor_id: context.userId,
      action: "restaurant.hours.updated",
      entity_type: "restaurant",
      entity_id: data.restaurantId,
      after_value: { hours: data.hours },
    });
    return { ok: true };
  });

export const saveBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<BranchRow> & { restaurant_id: string; name: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as { from: (t: string) => any };
    const { id, ...rest } = data;
    const query = id
      ? db.from("restaurant_branches").update({ ...rest, updated_by: context.userId }).eq("id", id)
      : db.from("restaurant_branches").insert({ ...rest, created_by: context.userId });
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as { from: (t: string) => any };
    const { error } = await db.from("restaurant_branches").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<ZoneRow> & { restaurant_id: string; name: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as { from: (t: string) => any };
    const { id, ...rest } = data;
    const query = id
      ? db.from("delivery_zones").update({ ...rest, updated_by: context.userId }).eq("id", id)
      : db.from("delivery_zones").insert({ ...rest, created_by: context.userId });
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as { from: (t: string) => any };
    const { error } = await db.from("delivery_zones").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
