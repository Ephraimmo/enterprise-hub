import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DashboardMetrics {
  today_orders: number;
  today_revenue: number;
  week_revenue: number;
  month_revenue: number;
  total_revenue: number;
  commission_earned: number;
  avg_order_value: number;
  status_counts: Record<string, number>;
  restaurants_total: number;
  restaurants_pending: number;
  drivers_total: number;
  drivers_online: number;
  customers_total: number;
  customers_new_30d: number;
}

export interface TrendPoint {
  day: string;
  revenue: number;
  orders: number;
}

export interface TopRestaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  orders: number;
  revenue: number;
}

export interface TopMenuItem {
  name: string;
  units: number;
  revenue: number;
}

export interface BestCustomer {
  id: string;
  full_name: string;
  email: string;
  orders: number;
  spend: number;
}

export interface DriverPerformance {
  id: string;
  full_name: string;
  status: string;
  rating: number;
  deliveries: number;
  earnings: number;
}

export interface LiveOrder {
  id: string;
  order_number: string;
  status: string;
  total: number;
  placed_at: string;
  eta_minutes: number | null;
  restaurant: string;
  customer: string;
  driver: string | null;
}

export interface ActivityEntry {
  id: string;
  action: string;
  entity_type: string;
  actor_email: string | null;
  created_at: string;
}

export interface DashboardPayload {
  metrics: DashboardMetrics;
  trend: TrendPoint[];
  topRestaurants: TopRestaurant[];
  topItems: TopMenuItem[];
  bestCustomers: BestCustomer[];
  driverPerformance: DriverPerformance[];
  liveOrders: LiveOrder[];
  activity: ActivityEntry[];
}

const num = (value: unknown) => Number(value ?? 0);

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardPayload> => {
    const db = context.supabase as never as {
      from: (t: string) => any;
      rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
    };

    const [metricsRes, trendRes, restRes, itemRes, custRes, drvRes, liveRes, auditRes] = await Promise.all([
      db.rpc("dashboard_metrics"),
      db.rpc("revenue_trend", { _days: 14 }),
      db.rpc("top_restaurants", { _limit: 6 }),
      db.rpc("top_menu_items", { _limit: 6 }),
      db.rpc("best_customers", { _limit: 6 }),
      db.rpc("driver_performance", { _limit: 6 }),
      db
        .from("orders")
        .select(
          "id, order_number, status, total, placed_at, eta_minutes, restaurants(name), customers(full_name), drivers(full_name)",
        )
        .in("status", ["pending", "accepted", "preparing", "ready", "assigned", "picked_up", "on_the_way"])
        .order("placed_at", { ascending: false })
        .limit(12),
      db.from("audit_logs").select("id, action, entity_type, actor_email, created_at").order("created_at", { ascending: false }).limit(8),
    ]);

    const raw = (metricsRes.data ?? {}) as Record<string, unknown>;
    const metrics: DashboardMetrics = {
      today_orders: num(raw["today_orders"]),
      today_revenue: num(raw["today_revenue"]),
      week_revenue: num(raw["week_revenue"]),
      month_revenue: num(raw["month_revenue"]),
      total_revenue: num(raw["total_revenue"]),
      commission_earned: num(raw["commission_earned"]),
      avg_order_value: num(raw["avg_order_value"]),
      status_counts: (raw["status_counts"] ?? {}) as Record<string, number>,
      restaurants_total: num(raw["restaurants_total"]),
      restaurants_pending: num(raw["restaurants_pending"]),
      drivers_total: num(raw["drivers_total"]),
      drivers_online: num(raw["drivers_online"]),
      customers_total: num(raw["customers_total"]),
      customers_new_30d: num(raw["customers_new_30d"]),
    };

    return {
      metrics,
      trend: (trendRes.data ?? []).map((r: any) => ({
        day: String(r.day),
        revenue: num(r.revenue),
        orders: num(r.orders),
      })),
      topRestaurants: (restRes.data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        cuisine: r.cuisine,
        rating: num(r.rating),
        orders: num(r.orders),
        revenue: num(r.revenue),
      })),
      topItems: (itemRes.data ?? []).map((r: any) => ({
        name: r.name,
        units: num(r.units),
        revenue: num(r.revenue),
      })),
      bestCustomers: (custRes.data ?? []).map((r: any) => ({
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        orders: num(r.orders),
        spend: num(r.spend),
      })),
      driverPerformance: (drvRes.data ?? []).map((r: any) => ({
        id: r.id,
        full_name: r.full_name,
        status: r.status,
        rating: num(r.rating),
        deliveries: num(r.deliveries),
        earnings: num(r.earnings),
      })),
      liveOrders: (liveRes.data ?? []).map((r: any) => ({
        id: r.id,
        order_number: r.order_number,
        status: r.status,
        total: num(r.total),
        placed_at: r.placed_at,
        eta_minutes: r.eta_minutes,
        restaurant: r.restaurants?.name ?? "—",
        customer: r.customers?.full_name ?? "—",
        driver: r.drivers?.full_name ?? null,
      })),
      activity: (auditRes.data ?? []).map((r: any) => ({
        id: r.id,
        action: r.action,
        entity_type: r.entity_type,
        actor_email: r.actor_email,
        created_at: r.created_at,
      })),
    };
  });
