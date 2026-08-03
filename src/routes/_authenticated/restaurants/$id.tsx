import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Plus, Trash2, UtensilsCrossed } from "lucide-react";

import { PermissionGate } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  deleteBranch,
  deleteZone,
  getRestaurant,
  saveBranch,
  saveBusinessHours,
  saveRestaurant,
  saveZone,
  type HourRow,
} from "@/lib/restaurants.functions";

export const Route = createFileRoute("/_authenticated/restaurants/$id")({
  head: () => ({
    meta: [
      { title: "Restaurant profile — ForkFleet Console" },
      { name: "description", content: "Configure branches, delivery zones, trading hours and commission for a restaurant partner." },
      { property: "og:title", content: "Restaurant profile — ForkFleet Console" },
      { property: "og:description", content: "Branches, delivery zones, trading hours and commission settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RestaurantDetailPage,
});

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function RestaurantDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchRestaurant = useServerFn(getRestaurant);
  const updateRestaurant = useServerFn(saveRestaurant);
  const persistHours = useServerFn(saveBusinessHours);
  const persistBranch = useServerFn(saveBranch);
  const removeBranch = useServerFn(deleteBranch);
  const persistZone = useServerFn(saveZone);
  const removeZone = useServerFn(deleteZone);

  const query = useQuery({
    queryKey: ["restaurant", id],
    queryFn: () => fetchRestaurant({ data: { id } }),
  });

  const [hours, setHours] = useState<HourRow[]>([]);
  useEffect(() => {
    if (!query.data) return;
    const existing = query.data.hours;
    setHours(
      DAYS.map((_, day) => {
        const match = existing.find((h) => h.day_of_week === day);
        return (
          match ?? {
            day_of_week: day,
            opens_at: query.data.restaurant.opens_at,
            closes_at: query.data.restaurant.closes_at,
            is_closed: false,
          }
        );
      }),
    );
  }, [query.data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["restaurant", id] });
  const mutate = <T,>(fn: (input: T) => Promise<unknown>, message: string) =>
    useMutationLike(fn, message, invalidate);

  const profileMutation = mutate(
    (payload: Parameters<typeof saveRestaurant>[0]["data"]) => updateRestaurant({ data: payload }),
    "Profile saved",
  );
  const hoursMutation = mutate(
    (payload: { restaurantId: string; hours: HourRow[] }) => persistHours({ data: payload }),
    "Trading hours updated",
  );
  const branchMutation = mutate(
    (payload: Parameters<typeof saveBranch>[0]["data"]) => persistBranch({ data: payload }),
    "Branch saved",
  );
  const branchDelete = mutate((payload: { id: string }) => removeBranch({ data: payload }), "Branch removed");
  const zoneMutation = mutate((payload: Parameters<typeof saveZone>[0]["data"]) => persistZone({ data: payload }), "Zone saved");
  const zoneDelete = mutate((payload: { id: string }) => removeZone({ data: payload }), "Zone removed");

  return (
    <PermissionGate
      required={["restaurants.view", "restaurants.manage"]}
      breadcrumb={["Catalogue", "Restaurants", query.data?.restaurant.name ?? "Profile"]}
      title={query.data?.restaurant.name ?? "Restaurant"}
      description="Branches, operating zones, delivery radius, trading hours and commission."
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/restaurants">
              <ArrowLeft className="mr-2 size-4" /> Directory
            </Link>
          </Button>
          <Button asChild>
            <Link to="/menus" search={{ restaurant: id }}>
              <UtensilsCrossed className="mr-2 size-4" /> Manage menu
            </Link>
          </Button>
        </div>
      }
    >
      {(staff) => {
        const canManage = staff.hasPermission("restaurants.manage");
        if (query.isLoading || !query.data) return <Skeleton className="h-96 w-full" />;
        const { restaurant, branches, zones, stats, staff: team } = query.data;

        return (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Status" value={restaurant.status} capitalize />
              <Stat label="Lifetime orders" value={stats.orders.toLocaleString()} />
              <Stat label="Delivered revenue" value={`R ${Math.round(stats.revenue).toLocaleString()}`} />
              <Stat label="Menu items" value={String(stats.menuItems)} />
            </div>

            <Tabs defaultValue="profile">
              <TabsList>
                <TabsTrigger value="profile">Profile & commission</TabsTrigger>
                <TabsTrigger value="hours">Business hours</TabsTrigger>
                <TabsTrigger value="branches">Branches</TabsTrigger>
                <TabsTrigger value="zones">Delivery zones</TabsTrigger>
                <TabsTrigger value="team">Team</TabsTrigger>
              </TabsList>

              <TabsContent value="profile">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Commercial settings</CardTitle>
                    <CardDescription>Commission rate, delivery radius and default trading window.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form
                      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        profileMutation.mutate({
                          id: restaurant.id,
                          name: String(form.get("name")),
                          cuisine: String(form.get("cuisine")),
                          email: String(form.get("email") ?? ""),
                          phone: String(form.get("phone") ?? ""),
                          address: String(form.get("address") ?? ""),
                          city: String(form.get("city")),
                          commission_rate: Number(form.get("commission_rate")),
                          delivery_radius_km: Number(form.get("delivery_radius_km")),
                          prep_time_minutes: Number(form.get("prep_time_minutes")),
                          opens_at: String(form.get("opens_at")),
                          closes_at: String(form.get("closes_at")),
                        });
                      }}
                    >
                      <Field name="name" label="Trading name" defaultValue={restaurant.name} disabled={!canManage} />
                      <Field name="cuisine" label="Cuisine" defaultValue={restaurant.cuisine} disabled={!canManage} />
                      <Field name="city" label="City" defaultValue={restaurant.city} disabled={!canManage} />
                      <Field name="email" label="Email" defaultValue={restaurant.email ?? ""} disabled={!canManage} />
                      <Field name="phone" label="Phone" defaultValue={restaurant.phone ?? ""} disabled={!canManage} />
                      <Field name="address" label="Address" defaultValue={restaurant.address ?? ""} disabled={!canManage} />
                      <Field
                        name="commission_rate"
                        label="Commission %"
                        type="number"
                        step="0.1"
                        defaultValue={String(restaurant.commission_rate)}
                        disabled={!canManage}
                      />
                      <Field
                        name="delivery_radius_km"
                        label="Delivery radius (km)"
                        type="number"
                        step="0.5"
                        defaultValue={String(restaurant.delivery_radius_km)}
                        disabled={!canManage}
                      />
                      <Field
                        name="prep_time_minutes"
                        label="Prep time (min)"
                        type="number"
                        defaultValue={String(restaurant.prep_time_minutes)}
                        disabled={!canManage}
                      />
                      <Field name="opens_at" label="Opens" type="time" defaultValue={restaurant.opens_at.slice(0, 5)} disabled={!canManage} />
                      <Field name="closes_at" label="Closes" type="time" defaultValue={restaurant.closes_at.slice(0, 5)} disabled={!canManage} />
                      {canManage && (
                        <div className="flex items-end">
                          <Button type="submit" disabled={profileMutation.isPending}>
                            Save changes
                          </Button>
                        </div>
                      )}
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="hours">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Weekly trading hours</CardTitle>
                    <CardDescription>Per-day opening windows used by ordering and dispatch.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {hours.map((hour, index) => (
                      <div key={hour.day_of_week} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
                        <span className="w-24 text-sm font-medium">{DAYS[hour.day_of_week]}</span>
                        <Input
                          type="time"
                          className="h-9 w-32"
                          value={hour.opens_at.slice(0, 5)}
                          disabled={!canManage || hour.is_closed}
                          onChange={(event) =>
                            setHours((prev) => prev.map((h, i) => (i === index ? { ...h, opens_at: event.target.value } : h)))
                          }
                        />
                        <span className="text-muted-foreground">–</span>
                        <Input
                          type="time"
                          className="h-9 w-32"
                          value={hour.closes_at.slice(0, 5)}
                          disabled={!canManage || hour.is_closed}
                          onChange={(event) =>
                            setHours((prev) => prev.map((h, i) => (i === index ? { ...h, closes_at: event.target.value } : h)))
                          }
                        />
                        <div className="ml-auto flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Closed</Label>
                          <Switch
                            checked={hour.is_closed}
                            disabled={!canManage}
                            onCheckedChange={(checked) =>
                              setHours((prev) => prev.map((h, i) => (i === index ? { ...h, is_closed: checked } : h)))
                            }
                          />
                        </div>
                      </div>
                    ))}
                    {canManage && (
                      <Button
                        onClick={() => hoursMutation.mutate({ restaurantId: id, hours })}
                        disabled={hoursMutation.isPending}
                      >
                        Save trading hours
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="branches">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Branches</CardTitle>
                    <CardDescription>Physical locations operating under this partner.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {canManage && (
                      <form
                        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          branchMutation.mutate({
                            restaurant_id: id,
                            name: String(form.get("name")),
                            code: String(form.get("code") ?? ""),
                            address: String(form.get("address") ?? ""),
                            city: String(form.get("city") ?? restaurant.city),
                            delivery_radius_km: Number(form.get("delivery_radius_km") ?? 8),
                          });
                          event.currentTarget.reset();
                        }}
                      >
                        <Field name="name" label="Branch name" required />
                        <Field name="code" label="Code" placeholder="JHB-01" />
                        <Field name="address" label="Address" />
                        <Field name="city" label="City" defaultValue={restaurant.city} />
                        <div className="flex items-end gap-2">
                          <Field name="delivery_radius_km" label="Radius km" type="number" step="0.5" defaultValue="8" />
                          <Button type="submit" size="icon" aria-label="Add branch">
                            <Plus className="size-4" />
                          </Button>
                        </div>
                      </form>
                    )}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Branch</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>City</TableHead>
                          <TableHead className="text-right">Radius</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {branches.map((branch) => (
                          <TableRow key={branch.id}>
                            <TableCell className="font-medium">{branch.name}</TableCell>
                            <TableCell className="text-muted-foreground">{branch.code ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{branch.city}</TableCell>
                            <TableCell className="text-right tabular-nums">{Number(branch.delivery_radius_km)} km</TableCell>
                            <TableCell className="text-right">
                              {canManage && (
                                <Button size="icon" variant="ghost" onClick={() => branchDelete.mutate({ id: branch.id })}>
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {branches.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                              No branches configured yet.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="zones">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MapPin className="size-4" /> Operating zones
                    </CardTitle>
                    <CardDescription>Delivery radius, fees and minimum basket per zone.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {canManage && (
                      <form
                        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          zoneMutation.mutate({
                            restaurant_id: id,
                            name: String(form.get("name")),
                            radius_km: Number(form.get("radius_km") ?? 5),
                            base_fee: Number(form.get("base_fee") ?? 25),
                            min_order: Number(form.get("min_order") ?? 0),
                            postal_codes: String(form.get("postal_codes") ?? "")
                              .split(",")
                              .map((code) => code.trim())
                              .filter(Boolean),
                          });
                          event.currentTarget.reset();
                        }}
                      >
                        <Field name="name" label="Zone name" required />
                        <Field name="radius_km" label="Radius km" type="number" step="0.5" defaultValue="5" />
                        <Field name="base_fee" label="Base fee (R)" type="number" step="1" defaultValue="25" />
                        <Field name="min_order" label="Min order (R)" type="number" step="1" defaultValue="80" />
                        <div className="flex items-end gap-2">
                          <Field name="postal_codes" label="Postal codes" placeholder="2196, 2090" />
                          <Button type="submit" size="icon" aria-label="Add zone">
                            <Plus className="size-4" />
                          </Button>
                        </div>
                      </form>
                    )}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Zone</TableHead>
                          <TableHead className="text-right">Radius</TableHead>
                          <TableHead className="text-right">Fee</TableHead>
                          <TableHead className="text-right">Min order</TableHead>
                          <TableHead>Postal codes</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {zones.map((zone) => (
                          <TableRow key={zone.id}>
                            <TableCell className="font-medium">{zone.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{Number(zone.radius_km)} km</TableCell>
                            <TableCell className="text-right tabular-nums">R {Number(zone.base_fee)}</TableCell>
                            <TableCell className="text-right tabular-nums">R {Number(zone.min_order)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {(zone.postal_codes ?? []).join(", ") || "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {canManage && (
                                <Button size="icon" variant="ghost" onClick={() => zoneDelete.mutate({ id: zone.id })}>
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {zones.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                              No delivery zones yet — the restaurant radius applies.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="team">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Restaurant team</CardTitle>
                    <CardDescription>Owners, managers and kitchen staff attached to this partner.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {team.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Nobody assigned yet — invite staff from Access control.
                      </p>
                    )}
                    {team.map((member) => (
                      <div key={member.id} className="flex items-center justify-between rounded-md border border-border p-3">
                        <div>
                          <p className="text-sm font-medium">{member.full_name ?? member.email ?? member.user_id}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                        <Badge variant="secondary" className="capitalize">
                          {member.role.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    ))}
                    <Button asChild variant="outline">
                      <Link to="/access">Manage access & invitations</Link>
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        );
      }}
    </PermissionGate>
  );
}

function useMutationLike<T>(fn: (input: T) => Promise<unknown>, message: string, onDone: () => void) {
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(message);
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

function Stat({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-2xl ${capitalize ? "capitalize" : ""}`}>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Field({
  name,
  label,
  ...props
}: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <Input id={`f-${name}`} name={name} {...props} />
    </div>
  );
}
