import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type KitchenStatus = "accepted" | "preparing" | "ready" | "assigned" | "picked_up";

export interface KitchenOrder {
  id: string;
  order_number: string;
  status: string;
  placed_at: string;
  eta_minutes: number | null;
  total: number;
  special_instructions: string | null;
  restaurant_id: string;
  restaurant_name: string;
  customer_name: string;
  items: { id: string; item_name: string; quantity: number; notes: string | null }[];
}

export const getKitchenQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<KitchenOrder[]> => {
    const db = context.supabase as never as { from: (t: string) => any };
    let query = db
      .from("orders")
      .select("id, order_number, status, placed_at, eta_minutes, total, special_instructions, restaurant_id, customer_id")
      .in("status", ["pending", "accepted", "preparing", "ready"])
      .order("placed_at", { ascending: true })
      .limit(120);
    if (data.restaurantId && data.restaurantId !== "all") query = query.eq("restaurant_id", data.restaurantId);
    const { data: orders, error } = await query;
    if (error) throw new Error(error.message);
    const rows = orders ?? [];
    if (rows.length === 0) return [];

    const [itemRes, restRes, custRes] = await Promise.all([
      db.from("order_items").select("id, order_id, item_name, quantity, notes").in("order_id", rows.map((o: any) => o.id)),
      db.from("restaurants").select("id, name").in("id", Array.from(new Set(rows.map((o: any) => o.restaurant_id)))),
      db.from("customers").select("id, full_name").in("id", Array.from(new Set(rows.map((o: any) => o.customer_id)))),
    ]);
    const restaurants = Object.fromEntries((restRes.data ?? []).map((r: any) => [r.id, r.name]));
    const customers = Object.fromEntries((custRes.data ?? []).map((c: any) => [c.id, c.full_name]));

    return rows.map((o: any) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      placed_at: o.placed_at,
      eta_minutes: o.eta_minutes,
      total: Number(o.total ?? 0),
      special_instructions: o.special_instructions,
      restaurant_id: o.restaurant_id,
      restaurant_name: restaurants[o.restaurant_id] ?? "—",
      customer_name: customers[o.customer_id] ?? "—",
      items: (itemRes.data ?? [])
        .filter((i: any) => i.order_id === o.id)
        .map((i: any) => ({ id: i.id, item_name: i.item_name, quantity: i.quantity, notes: i.notes })),
    }));
  });

export const advanceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; nextStatus: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as never as {
      rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
    };
    const { error } = await db.rpc("advance_order_status", {
      _order_id: data.orderId,
      _next_status: data.nextStatus,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
