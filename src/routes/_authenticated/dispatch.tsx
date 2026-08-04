import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bike, Clock, MapPin, PackageCheck, Radar, RotateCcw, ScrollText, Truck } from "lucide-react";

import { PermissionGate } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  advanceDelivery,
  assignDriver,
  getDispatchBoard,
  unassignDriver,
  type DispatchDriver,
  type DispatchOrder,
} from "@/lib/dispatch.functions";
import { listRestaurants } from "@/lib/restaurants.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dispatch")({
  head: () => ({
    meta: [
      { title: "Dispatch Control — ForkFleet Console" },
      {
        name: "description",
        content: "Assign ready orders to drivers, track pickups and ETAs live, and audit every delivery transition.",
      },
      { property: "og:title", content: "Dispatch Control — ForkFleet Console" },
      { property: "og:description", content: "Live driver assignment, pickup tracking and audited delivery status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DispatchPage,
});

const LANES: { key: string; label: string; next: string | null; nextLabel: string; icon: typeof Truck }[] = [
  { key: "ready", label: "Awaiting driver", next: null, nextLabel: "", icon: PackageCheck },
  { key: "assigned", label: "Assigned", next: "picked_up", nextLabel: "Mark picked up", icon: Bike },
  { key: "picked_up", label: "Picked up", next: "on_the_way", nextLabel: "On the way", icon: Truck },
  { key: "on_the_way", label: "On the way", next: "delivered", nextLabel: "Mark delivered", icon: MapPin },
];

function minutesSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function DispatchPage() {
  const [restaurantId, setRestaurantId] = useState("all");
  const queryClient = useQueryClient();
  const fetchBoard = useServerFn(getDispatchBoard);
  const fetchRestaurants = useServerFn(listRestaurants);
  const assign = useServerFn(assignDriver);
  const unassign = useServerFn(unassignDriver);
  const advance = useServerFn(advanceDelivery);

  const restaurantsQuery = useQuery({
    queryKey: ["restaurants", "picker"],
    queryFn: () => fetchRestaurants({ data: {} }),
  });

  const boardQuery = useQuery({
    queryKey: ["dispatch-board", restaurantId],
    queryFn: () => fetchBoard({ data: { restaurantId } }),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("dispatch-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["dispatch-board"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["dispatch-board"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["dispatch-board"] });

  const assignMutation = useMutation({
    mutationFn: (payload: { orderId: string; driverId: string; etaMinutes?: number | null }) =>
      assign({ data: payload }),
    onSuccess: () => {
      toast.success("Driver assigned");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unassignMutation = useMutation({
    mutationFn: (payload: { orderId: string }) => unassign({ data: payload }),
    onSuccess: () => {
      toast.success("Driver released");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const advanceMutation = useMutation({
    mutationFn: (payload: { orderId: string; nextStatus: string; etaMinutes?: number | null }) =>
      advance({ data: payload }),
    onSuccess: () => {
      toast.success("Delivery updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const board = boardQuery.data;
  const orders = useMemo(() => board?.orders ?? [], [board]);
  const drivers = useMemo(() => board?.drivers ?? [], [board]);

  return (
    <PermissionGate
      required={["dispatch.view", "dispatch.manage"]}
      breadcrumb={["Operations", "Dispatch"]}
      title="Dispatch control"
      description="Assign ready orders to available drivers, track pickups and ETAs live, and audit every transition."
      actions={
        <Select value={restaurantId} onValueChange={setRestaurantId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="All restaurants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All restaurants</SelectItem>
            {(restaurantsQuery.data ?? []).map((restaurant) => (
              <SelectItem key={restaurant.id} value={restaurant.id}>
                {restaurant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {(staff) => {
        const canManage = staff.hasPermission("dispatch.manage");
        if (boardQuery.isLoading) return <Skeleton className="h-96 w-full" />;

        const waiting = orders.filter((o) => o.status === "ready").length;
        const inFlight = orders.filter((o) => o.status !== "ready").length;
        const availableDrivers = drivers.filter((d) => d.status === "online" && d.active_orders === 0).length;
        const lateOrders = orders.filter((o) => minutesSince(o.placed_at) > 45).length;

        return (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={PackageCheck} label="Awaiting a driver" value={waiting} />
              <StatCard icon={Truck} label="Deliveries in flight" value={inFlight} />
              <StatCard icon={Bike} label="Free drivers" value={availableDrivers} />
              <StatCard icon={Clock} label="Running late (45m+)" value={lateOrders} tone={lateOrders > 0} />
            </div>

            <div className="grid gap-4 xl:grid-cols-4">
              {LANES.map((lane) => {
                const laneOrders = orders.filter((order) => order.status === lane.key);
                return (
                  <Card key={lane.key} className="flex flex-col">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <lane.icon className="size-4" /> {lane.label}
                      </CardTitle>
                      <CardDescription>{laneOrders.length} orders</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {laneOrders.map((order) => (
                        <DispatchTicket
                          key={order.id}
                          order={order}
                          drivers={drivers}
                          canManage={canManage}
                          nextStatus={lane.next}
                          nextLabel={lane.nextLabel}
                          onAssign={(driverId, etaMinutes) =>
                            assignMutation.mutate({ orderId: order.id, driverId, etaMinutes })
                          }
                          onUnassign={() => unassignMutation.mutate({ orderId: order.id })}
                          onAdvance={(nextStatus) => advanceMutation.mutate({ orderId: order.id, nextStatus })}
                        />
                      ))}
                      {laneOrders.length === 0 && (
                        <p className="py-8 text-center text-xs text-muted-foreground">Lane is clear.</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Radar className="size-4" /> Driver availability
                  </CardTitle>
                  <CardDescription>Live status and current workload</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-80 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Driver</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>City</TableHead>
                          <TableHead className="text-right">Active</TableHead>
                          <TableHead className="text-right">Rating</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {drivers.map((driver) => (
                          <TableRow key={driver.id}>
                            <TableCell className="font-medium">
                              {driver.full_name}
                              <span className="block text-[11px] text-muted-foreground">{driver.vehicle_type}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={driver.status === "online" ? "secondary" : "outline"}>
                                {driver.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{driver.city}</TableCell>
                            <TableCell className="text-right">{driver.active_orders}</TableCell>
                            <TableCell className="text-right">{driver.rating.toFixed(1)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ScrollText className="size-4" /> Dispatch audit trail
                  </CardTitle>
                  <CardDescription>Every assignment and delivery transition</CardDescription>
                </CardHeader>
                <CardContent className="max-h-80 space-y-2 overflow-auto">
                  {(board?.audit ?? []).map((entry) => (
                    <div key={entry.id} className="rounded-md border border-border p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{entry.action.replace("order.", "").replace(/\./g, " · ")}</span>
                        <span className="text-muted-foreground">
                          {new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {entry.before_value?.status ?? "—"} → {entry.after_value?.status ?? "—"}
                        {entry.actor_email ? ` · ${entry.actor_email}` : ""}
                      </p>
                    </div>
                  ))}
                  {(board?.audit ?? []).length === 0 && (
                    <p className="py-8 text-center text-xs text-muted-foreground">No dispatch activity yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        );
      }}
    </PermissionGate>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Truck;
  label: string;
  value: number;
  tone?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span className="flex size-9 items-center justify-center rounded-md bg-muted">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-xl font-semibold ${tone ? "text-destructive" : ""}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DispatchTicket({
  order,
  drivers,
  canManage,
  nextStatus,
  nextLabel,
  onAssign,
  onUnassign,
  onAdvance,
}: {
  order: DispatchOrder;
  drivers: DispatchDriver[];
  canManage: boolean;
  nextStatus: string | null;
  nextLabel: string;
  onAssign: (driverId: string, etaMinutes: number | null) => void;
  onUnassign: () => void;
  onAdvance: (nextStatus: string) => void;
}) {
  const [driverId, setDriverId] = useState("");
  const [eta, setEta] = useState("");
  const waited = minutesSince(order.placed_at);

  const candidates = drivers.filter(
    (d) => d.status === "online" || d.id === order.driver_id || (d.status === "busy" && d.active_orders < 3),
  );

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{order.order_number}</p>
        <Badge variant={waited > 45 ? "destructive" : "secondary"}>{waited}m</Badge>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {order.restaurant_name} • {order.customer_name}
      </p>
      {order.delivery_address && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
          <MapPin className="mt-0.5 size-3 shrink-0" /> {order.delivery_address}
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        ETA {order.eta_minutes ?? "—"} min · fee {order.delivery_fee.toFixed(2)}
      </p>

      {order.driver_name && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium">
          <Bike className="size-3.5" /> {order.driver_name}
        </p>
      )}

      {canManage && (
        <div className="mt-3 space-y-2">
          {order.status === "ready" && (
            <>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.full_name} · {driver.city} · {driver.active_orders} active
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  className="h-8 w-20 text-xs"
                  placeholder="ETA"
                  inputMode="numeric"
                  value={eta}
                  onChange={(event) => setEta(event.target.value)}
                />
                <Button
                  size="sm"
                  className="h-8 flex-1"
                  disabled={!driverId}
                  onClick={() => onAssign(driverId, eta ? Number(eta) : null)}
                >
                  Assign
                </Button>
              </div>
            </>
          )}

          {order.status === "assigned" && (
            <Button size="sm" variant="outline" className="h-8 w-full" onClick={onUnassign}>
              <RotateCcw className="mr-1 size-3.5" /> Release driver
            </Button>
          )}

          {nextStatus && (
            <Button size="sm" className="h-8 w-full" onClick={() => onAdvance(nextStatus)}>
              {nextLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
