import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, PauseCircle, Plus, Search, Store, XCircle } from "lucide-react";

import { PermissionGate } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listRestaurants, saveRestaurant, setRestaurantStatus, type RestaurantStatus } from "@/lib/restaurants.functions";

export const Route = createFileRoute("/_authenticated/restaurants/")({
  head: () => ({
    meta: [
      { title: "Restaurant Management — ForkFleet Console" },
      { name: "description", content: "Register, approve, suspend and configure restaurant partners across the delivery network." },
      { property: "og:title", content: "Restaurant Management — ForkFleet Console" },
      { property: "og:description", content: "Register, approve, suspend and configure restaurant partners." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RestaurantsPage,
});

const statusTone: Record<RestaurantStatus, string> = {
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  suspended: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  rejected: "bg-destructive/15 text-destructive border-destructive/25",
};

const money = (value: number) => `R ${value.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;

function RestaurantsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const fetchRestaurants = useServerFn(listRestaurants);
  const createRestaurant = useServerFn(saveRestaurant);
  const updateStatus = useServerFn(setRestaurantStatus);

  const query = useQuery({
    queryKey: ["restaurants", search, status],
    queryFn: () => fetchRestaurants({ data: { search, status } }),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: RestaurantStatus }) => updateStatus({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(`Restaurant ${vars.status}`);
      void queryClient.invalidateQueries({ queryKey: ["restaurants"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof saveRestaurant>[0]["data"]) => createRestaurant({ data: payload }),
    onSuccess: () => {
      toast.success("Restaurant registered and awaiting approval");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["restaurants"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = query.data ?? [];
  const counts = useMemo(() => {
    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [rows]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createMutation.mutate({
      name: String(form.get("name")),
      cuisine: String(form.get("cuisine")),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      address: String(form.get("address") ?? ""),
      city: String(form.get("city") ?? "Johannesburg"),
      commission_rate: Number(form.get("commission_rate") ?? 15),
      delivery_radius_km: Number(form.get("delivery_radius_km") ?? 8),
      prep_time_minutes: Number(form.get("prep_time_minutes") ?? 20),
      opens_at: String(form.get("opens_at") ?? "08:00"),
      closes_at: String(form.get("closes_at") ?? "22:00"),
    });
  }

  return (
    <PermissionGate
      required={["restaurants.view", "restaurants.manage"]}
      breadcrumb={["Catalogue", "Restaurants"]}
      title="Restaurant management"
      description="Register partners, run the approval pipeline and tune commercial settings."
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" /> Register restaurant
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Register a restaurant partner</DialogTitle>
              <DialogDescription>New partners start in the pending queue until approved.</DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
              <Field name="name" label="Trading name" required />
              <Field name="cuisine" label="Cuisine" required defaultValue="Contemporary" />
              <Field name="email" label="Contact email" type="email" />
              <Field name="phone" label="Phone" />
              <div className="sm:col-span-2">
                <Field name="address" label="Street address" />
              </div>
              <Field name="city" label="City" defaultValue="Johannesburg" />
              <Field name="commission_rate" label="Commission %" type="number" step="0.1" defaultValue="15" />
              <Field name="delivery_radius_km" label="Delivery radius (km)" type="number" step="0.5" defaultValue="8" />
              <Field name="prep_time_minutes" label="Prep time (min)" type="number" defaultValue="20" />
              <Field name="opens_at" label="Opens" type="time" defaultValue="08:00" />
              <Field name="closes_at" label="Closes" type="time" defaultValue="22:00" />
              <DialogFooter className="sm:col-span-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Saving…" : "Register partner"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {(staff) => {
        const canManage = staff.hasPermission("restaurants.manage");
        return (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(["approved", "pending", "suspended", "rejected"] as RestaurantStatus[]).map((key) => (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardDescription className="capitalize">{key}</CardDescription>
                    <CardTitle className="text-2xl">{counts[key] ?? 0}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Store className="size-4" /> Partner directory
                  </CardTitle>
                  <CardDescription>{rows.length} restaurants matching your filters</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search by name"
                      className="h-9 w-56 pl-8"
                    />
                  </div>
                  <Tabs value={status} onValueChange={setStatus}>
                    <TabsList>
                      <TabsTrigger value="all">All</TabsTrigger>
                      <TabsTrigger value="pending">Pending</TabsTrigger>
                      <TabsTrigger value="approved">Live</TabsTrigger>
                      <TabsTrigger value="suspended">Suspended</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent>
                {query.isLoading ? (
                  <Skeleton className="h-72 w-full" />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Restaurant</TableHead>
                          <TableHead>City</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Commission</TableHead>
                          <TableHead className="text-right">Radius</TableHead>
                          <TableHead className="text-right">Hours</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((restaurant) => (
                          <TableRow key={restaurant.id}>
                            <TableCell>
                              <Link
                                to="/restaurants/$id"
                                params={{ id: restaurant.id }}
                                className="font-medium hover:underline"
                              >
                                {restaurant.name}
                              </Link>
                              <p className="text-xs text-muted-foreground">{restaurant.cuisine}</p>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{restaurant.city}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`capitalize ${statusTone[restaurant.status]}`}>
                                {restaurant.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{Number(restaurant.commission_rate)}%</TableCell>
                            <TableCell className="text-right tabular-nums">{Number(restaurant.delivery_radius_km)} km</TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                              {restaurant.opens_at.slice(0, 5)}–{restaurant.closes_at.slice(0, 5)}
                            </TableCell>
                            <TableCell className="text-right">
                              {canManage && (
                                <div className="flex justify-end gap-1">
                                  {restaurant.status !== "approved" && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => statusMutation.mutate({ id: restaurant.id, status: "approved" })}
                                    >
                                      <CheckCircle2 className="mr-1 size-3.5" /> Approve
                                    </Button>
                                  )}
                                  {restaurant.status === "approved" && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => statusMutation.mutate({ id: restaurant.id, status: "suspended" })}
                                    >
                                      <PauseCircle className="mr-1 size-3.5" /> Suspend
                                    </Button>
                                  )}
                                  {restaurant.status === "pending" && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive"
                                      onClick={() => statusMutation.mutate({ id: restaurant.id, status: "rejected" })}
                                    >
                                      <XCircle className="mr-1 size-3.5" /> Reject
                                    </Button>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {rows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                              No restaurants match this filter.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">
              Network commission at {money(rows.reduce((sum, r) => sum + Number(r.commission_rate), 0) / (rows.length || 1))
                .replace("R ", "")}
              % average across listed partners.
            </p>
          </div>
        );
      }}
    </PermissionGate>
  );
}

function Field({
  name,
  label,
  ...props
}: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}
