import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { PermissionGate } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { listRestaurants } from "@/lib/restaurants.functions";
import {
  deleteCategory,
  deleteMenuChild,
  deleteMenuItem,
  getMenu,
  saveAddon,
  saveCategory,
  saveMenuItem,
  saveVariant,
  toggleMenuItem,
} from "@/lib/menu.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/menus")({
  validateSearch: (search: Record<string, unknown>) => ({ restaurant: (search["restaurant"] as string) ?? "" }),
  head: () => ({
    meta: [
      { title: "Menu Management — ForkFleet Console" },
      { name: "description", content: "Manage menu categories, products, variants, add-ons, pricing, availability and imagery." },
      { property: "og:title", content: "Menu Management — ForkFleet Console" },
      { property: "og:description", content: "Categories, products, variants, add-ons, pricing and availability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MenusPage,
});

function MenusPage() {
  const search = Route.useSearch();
  const [restaurantId, setRestaurantId] = useState(search.restaurant);
  const queryClient = useQueryClient();

  const fetchRestaurants = useServerFn(listRestaurants);
  const fetchMenu = useServerFn(getMenu);
  const persistCategory = useServerFn(saveCategory);
  const removeCategory = useServerFn(deleteCategory);
  const persistItem = useServerFn(saveMenuItem);
  const removeItem = useServerFn(deleteMenuItem);
  const toggleItem = useServerFn(toggleMenuItem);
  const persistVariant = useServerFn(saveVariant);
  const persistAddon = useServerFn(saveAddon);
  const removeChild = useServerFn(deleteMenuChild);

  const restaurantsQuery = useQuery({
    queryKey: ["restaurants", "picker"],
    queryFn: () => fetchRestaurants({ data: {} }),
  });

  const menuQuery = useQuery({
    queryKey: ["menu", restaurantId],
    queryFn: () => fetchMenu({ data: { restaurantId } }),
    enabled: Boolean(restaurantId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["menu", restaurantId] });
  const notify = (message: string) => () => {
    toast.success(message);
    void invalidate();
  };
  const fail = (error: Error) => toast.error(error.message);

  const categoryMutation = useMutation({
    mutationFn: (payload: Parameters<typeof saveCategory>[0]["data"]) => persistCategory({ data: payload }),
    onSuccess: notify("Category saved"),
    onError: fail,
  });
  const categoryDelete = useMutation({
    mutationFn: (payload: { id: string }) => removeCategory({ data: payload }),
    onSuccess: notify("Category removed"),
    onError: fail,
  });
  const itemMutation = useMutation({
    mutationFn: (payload: Parameters<typeof saveMenuItem>[0]["data"]) => persistItem({ data: payload }),
    onSuccess: notify("Menu item saved"),
    onError: fail,
  });
  const itemDelete = useMutation({
    mutationFn: (payload: { id: string }) => removeItem({ data: payload }),
    onSuccess: notify("Menu item removed"),
    onError: fail,
  });
  const availabilityMutation = useMutation({
    mutationFn: (payload: { id: string; is_available: boolean }) => toggleItem({ data: payload }),
    onSuccess: notify("Availability updated"),
    onError: fail,
  });
  const variantMutation = useMutation({
    mutationFn: (payload: Parameters<typeof saveVariant>[0]["data"]) => persistVariant({ data: payload }),
    onSuccess: notify("Variant saved"),
    onError: fail,
  });
  const addonMutation = useMutation({
    mutationFn: (payload: Parameters<typeof saveAddon>[0]["data"]) => persistAddon({ data: payload }),
    onSuccess: notify("Add-on saved"),
    onError: fail,
  });
  const childDelete = useMutation({
    mutationFn: (payload: { id: string; kind: "variant" | "addon" }) => removeChild({ data: payload }),
    onSuccess: notify("Removed"),
    onError: fail,
  });

  async function uploadImage(file: File, itemId: string, item: { restaurant_id: string }) {
    const path = `${item.restaurant_id}/${itemId}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("menu-images").upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data: signed } = await supabase.storage.from("menu-images").createSignedUrl(path, 60 * 60 * 24 * 365);
    return signed?.signedUrl ?? null;
  }

  return (
    <PermissionGate
      required={["menus.view", "menus.manage"]}
      breadcrumb={["Catalogue", "Menus"]}
      title="Menu management"
      description="Categories, products, variants, add-ons, pricing, availability and imagery."
      actions={
        <Select value={restaurantId} onValueChange={setRestaurantId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Choose a restaurant" />
          </SelectTrigger>
          <SelectContent>
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
        const canManage = staff.hasPermission("menus.manage");
        if (!restaurantId) {
          return (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                Select a restaurant to load its menu.
              </CardContent>
            </Card>
          );
        }
        if (menuQuery.isLoading || !menuQuery.data) return <Skeleton className="h-96 w-full" />;
        const { categories, items, variants, addons } = menuQuery.data;

        return (
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-base">Categories</CardTitle>
                <CardDescription>{categories.length} groups</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {canManage && (
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      categoryMutation.mutate({
                        restaurant_id: restaurantId,
                        name: String(form.get("name")),
                        sort_order: categories.length,
                      });
                      event.currentTarget.reset();
                    }}
                  >
                    <Input name="name" placeholder="New category" required className="h-9" />
                    <Button type="submit" size="icon" aria-label="Add category">
                      <Plus className="size-4" />
                    </Button>
                  </form>
                )}
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{category.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {items.filter((i) => i.category_id === category.id).length} items
                      </p>
                    </div>
                    {canManage && (
                      <Button size="icon" variant="ghost" onClick={() => categoryDelete.mutate({ id: category.id })}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
                {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
              </CardContent>
            </Card>

            <div className="space-y-4">
              {canManage && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Add a product</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form
                      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        const categoryId = String(form.get("category_id") ?? "");
                        itemMutation.mutate({
                          restaurant_id: restaurantId,
                          category_id: categoryId || null,
                          category: categories.find((c) => c.id === categoryId)?.name ?? "General",
                          name: String(form.get("name")),
                          description: String(form.get("description") ?? ""),
                          price: Number(form.get("price")),
                          prep_time_minutes: Number(form.get("prep_time_minutes") ?? 15),
                          is_available: true,
                          is_featured: false,
                          allergens: [],
                        });
                        event.currentTarget.reset();
                      }}
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="name">Product name</Label>
                        <Input id="name" name="name" required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="category_id">Category</Label>
                        <select
                          id="category_id"
                          name="category_id"
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">Uncategorised</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="price">Price (R)</Label>
                        <Input id="price" name="price" type="number" step="0.01" required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="prep_time_minutes">Prep (min)</Label>
                        <Input id="prep_time_minutes" name="prep_time_minutes" type="number" defaultValue="15" />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                        <Label htmlFor="description">Description</Label>
                        <Input id="description" name="description" />
                      </div>
                      <div className="flex items-end">
                        <Button type="submit">Add product</Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Products</CardTitle>
                  <CardDescription>{items.length} items on this menu</CardDescription>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    {items.map((item) => (
                      <AccordionItem key={item.id} value={item.id}>
                        <AccordionTrigger>
                          <div className="flex flex-1 items-center gap-3 pr-3 text-left">
                            <span className="font-medium">{item.name}</span>
                            <Badge variant="outline">R {Number(item.price).toFixed(2)}</Badge>
                            {!item.is_available && <Badge variant="secondary">Unavailable</Badge>}
                            <span className="ml-auto text-xs text-muted-foreground">{item.category}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4">
                          <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">Available</Label>
                              <Switch
                                checked={item.is_available}
                                disabled={!canManage}
                                onCheckedChange={(checked) =>
                                  availabilityMutation.mutate({ id: item.id, is_available: checked })
                                }
                              />
                            </div>
                            {canManage && (
                              <>
                                <div className="flex items-center gap-2">
                                  <Label htmlFor={`img-${item.id}`} className="text-xs">
                                    Image
                                  </Label>
                                  <Input
                                    id={`img-${item.id}`}
                                    type="file"
                                    accept="image/*"
                                    className="h-9 w-56"
                                    onChange={async (event) => {
                                      const file = event.target.files?.[0];
                                      if (!file) return;
                                      const url = await uploadImage(file, item.id, item);
                                      if (url) {
                                        itemMutation.mutate({
                                          id: item.id,
                                          restaurant_id: item.restaurant_id,
                                          category_id: item.category_id,
                                          category: item.category,
                                          name: item.name,
                                          description: item.description ?? "",
                                          price: Number(item.price),
                                          prep_time_minutes: item.prep_time_minutes,
                                          is_available: item.is_available,
                                          is_featured: item.is_featured,
                                          image_url: url,
                                          allergens: item.allergens ?? [],
                                        });
                                      }
                                    }}
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => itemDelete.mutate({ id: item.id })}
                                >
                                  <Trash2 className="mr-1 size-3.5" /> Delete product
                                </Button>
                              </>
                            )}
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <p className="text-sm font-medium">Variants</p>
                              {variants
                                .filter((v) => v.menu_item_id === item.id)
                                .map((variant) => (
                                  <div key={variant.id} className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-sm">
                                    <span>{variant.name}</span>
                                    <span className="flex items-center gap-2 tabular-nums">
                                      +R {Number(variant.price_delta).toFixed(2)}
                                      {canManage && (
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          onClick={() => childDelete.mutate({ id: variant.id, kind: "variant" })}
                                        >
                                          <Trash2 className="size-3.5 text-destructive" />
                                        </Button>
                                      )}
                                    </span>
                                  </div>
                                ))}
                              {canManage && (
                                <form
                                  className="flex gap-2"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    const form = new FormData(event.currentTarget);
                                    variantMutation.mutate({
                                      menu_item_id: item.id,
                                      name: String(form.get("name")),
                                      price_delta: Number(form.get("price_delta") ?? 0),
                                    });
                                    event.currentTarget.reset();
                                  }}
                                >
                                  <Input name="name" placeholder="Large" className="h-9" required />
                                  <Input name="price_delta" type="number" step="0.5" placeholder="+R" className="h-9 w-24" />
                                  <Button type="submit" size="icon" aria-label="Add variant">
                                    <Plus className="size-4" />
                                  </Button>
                                </form>
                              )}
                            </div>

                            <div className="space-y-2">
                              <p className="text-sm font-medium">Add-ons</p>
                              {addons
                                .filter((a) => a.menu_item_id === item.id)
                                .map((addon) => (
                                  <div key={addon.id} className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-sm">
                                    <span>{addon.name}</span>
                                    <span className="flex items-center gap-2 tabular-nums">
                                      R {Number(addon.price).toFixed(2)}
                                      {canManage && (
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          onClick={() => childDelete.mutate({ id: addon.id, kind: "addon" })}
                                        >
                                          <Trash2 className="size-3.5 text-destructive" />
                                        </Button>
                                      )}
                                    </span>
                                  </div>
                                ))}
                              {canManage && (
                                <form
                                  className="flex gap-2"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    const form = new FormData(event.currentTarget);
                                    addonMutation.mutate({
                                      menu_item_id: item.id,
                                      name: String(form.get("name")),
                                      price: Number(form.get("price") ?? 0),
                                    });
                                    event.currentTarget.reset();
                                  }}
                                >
                                  <Input name="name" placeholder="Extra cheese" className="h-9" required />
                                  <Input name="price" type="number" step="0.5" placeholder="R" className="h-9 w-24" />
                                  <Button type="submit" size="icon" aria-label="Add add-on">
                                    <Plus className="size-4" />
                                  </Button>
                                </form>
                              )}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                  {items.length === 0 && (
                    <p className="py-10 text-center text-sm text-muted-foreground">No products on this menu yet.</p>
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
