import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChefHat, CheckCircle2, Flame, PackageCheck } from "lucide-react";

import { PermissionGate } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { advanceOrder, getKitchenQueue, type KitchenOrder } from "@/lib/kitchen.functions";
import { listRestaurants } from "@/lib/restaurants.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/kitchen")({
  head: () => ({
    meta: [
      { title: "Live Kitchen Queue — ForkFleet Console" },
      { name: "description", content: "Real-time cooking and ready queues with audited order status transitions." },
      { property: "og:title", content: "Live Kitchen Queue — ForkFleet Console" },
      { property: "og:description", content: "Real-time cooking and ready queues with audited status transitions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KitchenPage,
});

const COLUMNS: { key: string; label: string; next: string | null; icon: typeof Flame }[] = [
  { key: "pending", label: "Incoming", next: "accepted", icon: ChefHat },
  { key: "accepted", label: "Accepted", next: "preparing", icon: Flame },
  { key: "preparing", label: "Cooking", next: "ready", icon: Flame },
  { key: "ready", label: "Ready for pickup", next: null, icon: PackageCheck },
];

function KitchenPage() {
  const [restaurantId, setRestaurantId] = useState("all");
  const queryClient = useQueryClient();
  const fetchQueue = useServerFn(getKitchenQueue);
  const fetchRestaurants = useServerFn(listRestaurants);
  const advance = useServerFn(advanceOrder);

  const restaurantsQuery = useQuery({
    queryKey: ["restaurants", "picker"],
    queryFn: () => fetchRestaurants({ data: {} }),
  });

  const queueQuery = useQuery({
    queryKey: ["kitchen-queue", restaurantId],
    queryFn: () => fetchQueue({ data: { restaurantId } }),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("kitchen-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["kitchen-queue"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const advanceMutation = useMutation({
    mutationFn: (payload: { orderId: string; nextStatus: string }) => advance({ data: payload }),
    onSuccess: () => {
      toast.success("Order moved");
      void queryClient.invalidateQueries({ queryKey: ["kitchen-queue"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const orders = queueQuery.data ?? [];

  return (
    <PermissionGate
      required={["orders.view", "orders.manage"]}
      breadcrumb={["Operations", "Kitchen queue"]}
      title="Live kitchen queue"
      description="Accepted, cooking and ready lanes with realtime updates and audit logging."
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
        const canManage = staff.hasPermission("orders.manage");
        if (queueQuery.isLoading) return <Skeleton className="h-96 w-full" />;
        return (
          <div className="grid gap-4 xl:grid-cols-4">
            {COLUMNS.map((column) => {
              const lane = orders.filter((order) => order.status === column.key);
              return (
                <Card key={column.key} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <column.icon className="size-4" /> {column.label}
                    </CardTitle>
                    <CardDescription>{lane.length} orders</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {lane.map((order) => (
                      <OrderTicket
                        key={order.id}
                        order={order}
                        {...(column.next && canManage
                          ? {
                              onAdvance: () =>
                                advanceMutation.mutate({ orderId: order.id, nextStatus: column.next as string }),
                            }
                          : {})}
                      />
                    ))}
                    {lane.length === 0 && (
                      <p className="py-8 text-center text-xs text-muted-foreground">Lane is clear.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );
      }}
    </PermissionGate>
  );
}

function OrderTicket({ order, onAdvance }: { order: KitchenOrder; onAdvance?: () => void }) {
  const waited = Math.max(0, Math.round((Date.now() - new Date(order.placed_at).getTime()) / 60000));
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{order.order_number}</p>
        <Badge variant={waited > 25 ? "destructive" : "secondary"}>{waited}m</Badge>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {order.restaurant_name} • {order.customer_name}
      </p>
      <ul className="mt-2 space-y-0.5 text-xs">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-2">
            <span>
              {item.quantity}× {item.item_name}
            </span>
          </li>
        ))}
      </ul>
      {order.special_instructions && (
        <p className="mt-2 rounded bg-muted p-2 text-[11px] text-muted-foreground">{order.special_instructions}</p>
      )}
      {onAdvance && (
        <Button size="sm" className="mt-3 w-full" onClick={onAdvance}>
          <CheckCircle2 className="mr-1 size-3.5" /> Advance
        </Button>
      )}
    </div>
  );
}
