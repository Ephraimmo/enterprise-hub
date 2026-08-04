import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DispatchStatus = "ready" | "assigned" | "picked_up" | "on_the_way" | "delivered" | "cancelled";

export interface DispatchOrder {
  id: string;
  order_number: string;
  status: string;
  placed_at: string;
  eta_minutes: number | null;
  total: number;
  delivery_fee: number;
  delivery_address: string | null;
  special_instructions: string | null;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_city: string;
  customer_name: string;
  driver_id: string | null;
  driver_name: string | null;
}

export interface DispatchDriver {
  id: string;
  full_name: string;
  status: string;
  city: string;
  vehicle_type: string;
  phone: string | null;
  rating: number;
  total_deliveries: number;
  is_verified: boolean;
  active_orders: number;
}

export interface DispatchAuditEntry {
  id: string;
  action: string;
  entity_id: string | null;
  created_at: string;
  actor_email: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
}

export interface DispatchBoard {
  orders: DispatchOrder[];
  drivers: DispatchDriver[];
  audit: DispatchAuditEntry[];
}

const LIVE_STATUSES = ["ready", "assigned", "picked_up", "on_the_way"];

export const getDispatchBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<DispatchBoard> => {
    const db = context.supabase as never as { from: (t: string) => any };

    let query = db
      .from("orders")
      .select(
        "id, order_number, status, placed_at, eta_minutes, total, delivery_fee, delivery_address, special_instructions, restaurant_id, customer_id, driver_id",
      )
      .in("status", LIVE_STATUSES)
      .order("placed_at", { ascending: true })
      .limit(150);
    if (data.restaurantId && data.restaurantId !== "all") query = query.eq("restaurant_id", data.restaurantId);

    const [orderRes, driverRes, auditRes] = await Promise.all([
      query,
      db
        .from("drivers")
        .select("id, full_name, status, city, vehicle_type, phone, rating, total_deliveries, is_verified")
        .eq("is_active", true)
        .order("full_name", { ascending: true })
        .limit(200),
      db
        .from("audit_logs")
        .select("id, action, entity_id, created_at, actor_email, before_value, after_value")
        .or("action.like.order.dispatch.%,action.like.order.delivery.%")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    if (orderRes.error) throw new Error(orderRes.error.message);
    if (driverRes.error) throw new Error(driverRes.error.message);

    const rows = orderRes.data ?? [];
    const driverRows = driverRes.data ?? [];

    let restaurants: Record<string, { name: string; city: string }> = {};
    let customers: Record<string, string> = {};
    if (rows.length > 0) {
      const [restRes, custRes] = await Promise.all([
        db
          .from("restaurants")
          .select("id, name, city")
          .in("id", Array.from(new Set(rows.map((o: any) => o.restaurant_id)))),
        db
          .from("customers")
          .select("id, full_name")
          .in("id", Array.from(new Set(rows.map((o: any) => o.customer_id)))),
      ]);
      restaurants = Object.fromEntries((restRes.data ?? []).map((r: any) => [r.id, { name: r.name, city: r.city }]));
      customers = Object.fromEntries((custRes.data ?? []).map((c: any) => [c.id, c.full_name]));
    }

    const driverNames = Object.fromEntries(driverRows.map((d: any) => [d.id, d.full_name]));

    const orders: DispatchOrder[] = rows.map((o: any) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      placed_at: o.placed_at,
      eta_minutes: o.eta_minutes,
      total: Number(o.total ?? 0),
      delivery_fee: Number(o.delivery_fee ?? 0),
      delivery_address: o.delivery_address,
      special_instructions: o.special_instructions,
      restaurant_id: o.restaurant_id,
      restaurant_name: restaurants[o.restaurant_id]?.name ?? "—",
      restaurant_city: restaurants[o.restaurant_id]?.city ?? "—",
      customer_name: customers[o.customer_id] ?? "—",
      driver_id: o.driver_id,
      driver_name: o.driver_id ? (driverNames[o.driver_id] ?? "Unknown driver") : null,
    }));

    const activeByDriver = orders.reduce<Record<string, number>>((acc, order) => {
      if (order.driver_id && order.status !== "ready") acc[order.driver_id] = (acc[order.driver_id] ?? 0) + 1;
      return acc;
    }, {});

    const drivers: DispatchDriver[] = driverRows.map((d: any) => ({
      id: d.id,
      full_name: d.full_name,
      status: d.status,
      city: d.city,
      vehicle_type: d.vehicle_type,
      phone: d.phone,
      rating: Number(d.rating ?? 0),
      total_deliveries: d.total_deliveries ?? 0,
      is_verified: !!d.is_verified,
      active_orders: activeByDriver[d.id] ?? 0,
    }));

    const audit: DispatchAuditEntry[] = (auditRes?.data ?? []).map((a: any) => ({
      id: a.id,
      action: a.action,
      entity_id: a.entity_id,
      created_at: a.created_at,
      actor_email: a.actor_email,
      before_value: a.before_value,
      after_value: a.after_value,
    }));

    return { orders, drivers, audit };
  });

export const assignDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; driverId: string; etaMinutes?: number | null }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as {
      rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
    };
    const { error } = await db.rpc("assign_order_driver", {
      _order_id: data.orderId,
      _driver_id: data.driverId,
      _eta_minutes: data.etaMinutes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unassignDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as {
      rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
    };
    const { error } = await db.rpc("unassign_order_driver", { _order_id: data.orderId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const advanceDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; nextStatus: string; etaMinutes?: number | null }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as {
      rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
    };
    const { error } = await db.rpc("advance_delivery_status", {
      _order_id: data.orderId,
      _next: data.nextStatus,
      _eta_minutes: data.etaMinutes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
