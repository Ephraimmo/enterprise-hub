import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-demo-fn";
import { toast } from "sonner";
import { Mail, ShieldCheck, X } from "lucide-react";

import { PermissionGate } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAccessOverview, inviteStaff, revokeInvitation, setPlatformRole } from "@/lib/access.functions";
import type { StaffRole } from "@/lib/session.functions";

export const Route = createFileRoute("/_authenticated/access")({
  head: () => ({
    meta: [
      { title: "Access Control — ForkFleet Console" },
      { name: "description", content: "Role-based access control, permission matrix and staff invitation flows for the operations console." },
      { property: "og:title", content: "Access Control — ForkFleet Console" },
      { property: "og:description", content: "Roles, permissions and staff invitations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccessPage,
});

const ROLES: StaffRole[] = [
  "super_admin",
  "platform_admin",
  "operations_manager",
  "restaurant_owner",
  "restaurant_manager",
  "kitchen_manager",
  "kitchen_staff",
  "cashier",
  "dispatcher",
  "finance_manager",
  "customer_support",
  "marketing_manager",
  "inventory_manager",
  "branch_manager",
  "auditor",
];

function AccessPage() {
  const queryClient = useQueryClient();
  const fetchAccess = useServerFn(getAccessOverview);
  const invite = useServerFn(inviteStaff);
  const revoke = useServerFn(revokeInvitation);
  const setRole = useServerFn(setPlatformRole);

  const query = useQuery({ queryKey: ["access"], queryFn: () => fetchAccess() });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["access"] });
  const fail = (error: Error) => toast.error(error.message);

  const inviteMutation = useMutation({
    mutationFn: (_payload: Parameters<typeof invite>[0]) => invite(_payload),
    onSuccess: () => {
      toast.success("Invitation created — the role applies on first sign-in");
      void invalidate();
    },
    onError: fail,
  });
  const revokeMutation = useMutation({
    mutationFn: (payload: { id: string }) => revoke(payload),
    onSuccess: () => {
      toast.success("Invitation revoked");
      void invalidate();
    },
    onError: fail,
  });
  const roleMutation = useMutation({
    mutationFn: (payload: { userId: string; role: StaffRole; grant: boolean }) => setRole(payload),
    onSuccess: () => {
      toast.success("Roles updated");
      void invalidate();
    },
    onError: fail,
  });

  return (
    <PermissionGate
      required={["users.view", "users.manage"]}
      breadcrumb={["Platform", "Access control"]}
      title="Access control"
      description="Roles, permission matrix and staff invitation flows."
    >
      {(staff) => {
        const canManage = staff.hasPermission("users.manage");
        if (query.isLoading || !query.data) return <Skeleton className="h-96 w-full" />;
        const { staff: members, invitations, permissions, rolePermissions, restaurants } = query.data;

        return (
          <Tabs defaultValue="team">
            <TabsList>
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="invites">Invitations</TabsTrigger>
              <TabsTrigger value="matrix">Permission matrix</TabsTrigger>
            </TabsList>

            <TabsContent value="team">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="size-4" /> Staff & roles
                  </CardTitle>
                  <CardDescription>{members.length} console users</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {members.map((member) => (
                    <div key={member.user_id} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{member.full_name ?? member.email}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {member.roles.map((role) => (
                            <Badge key={role} variant="secondary" className="capitalize">
                              {role.replace(/_/g, " ")}
                              {canManage && (
                                <button
                                  type="button"
                                  aria-label={`Revoke ${role}`}
                                  className="ml-1"
                                  onClick={() => roleMutation.mutate({ userId: member.user_id, role, grant: false })}
                                >
                                  <X className="size-3" />
                                </button>
                              )}
                            </Badge>
                          ))}
                          {member.roles.length === 0 && <Badge variant="outline">No role</Badge>}
                        </div>
                      </div>
                      {canManage && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {ROLES.filter((role) => !member.roles.includes(role))
                            .slice(0, 8)
                            .map((role) => (
                              <Button
                                key={role}
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] capitalize"
                                onClick={() => roleMutation.mutate({ userId: member.user_id, role, grant: true })}
                              >
                                + {role.replace(/_/g, " ")}
                              </Button>
                            ))}
                        </div>
                      )}
                      {member.restaurants.length > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Assigned to {member.restaurants.map((r) => `${r.name} (${r.role.replace(/_/g, " ")})`).join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="invites">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Mail className="size-4" /> Staff invitations
                  </CardTitle>
                  <CardDescription>Invited staff receive their role automatically on first sign-in.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {canManage && (
                    <form
                      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        inviteMutation.mutate({
                          email: String(form.get("email")),
                          role: String(form.get("role")) as StaffRole,
                          restaurantId: String(form.get("restaurantId") ?? "") || null,
                          message: String(form.get("message") ?? ""),
                        });
                        event.currentTarget.reset();
                      }}
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" name="email" type="email" required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="role">Role</Label>
                        <select id="role" name="role" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role.replace(/_/g, " ")}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="restaurantId">Restaurant (optional)</Label>
                        <select
                          id="restaurantId"
                          name="restaurantId"
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">Platform-wide</option>
                          {restaurants.map((restaurant) => (
                            <option key={restaurant.id} value={restaurant.id}>
                              {restaurant.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <Button type="submit" disabled={inviteMutation.isPending}>
                          Send invitation
                        </Button>
                      </div>
                    </form>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitations.map((invitation) => (
                        <TableRow key={invitation.id}>
                          <TableCell>{invitation.email}</TableCell>
                          <TableCell className="capitalize">{invitation.role.replace(/_/g, " ")}</TableCell>
                          <TableCell className="text-muted-foreground">{invitation.restaurant_name ?? "Platform"}</TableCell>
                          <TableCell>
                            <Badge variant={invitation.status === "pending" ? "secondary" : "outline"} className="capitalize">
                              {invitation.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {canManage && invitation.status === "pending" && (
                              <Button size="sm" variant="ghost" onClick={() => revokeMutation.mutate({ id: invitation.id })}>
                                Revoke
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {invitations.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                            No invitations yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="matrix">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Permission matrix</CardTitle>
                  <CardDescription>{permissions.length} permissions across the platform</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Permission</TableHead>
                        <TableHead>Module</TableHead>
                        <TableHead>Roles</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {permissions.map((permission) => (
                        <TableRow key={permission.code}>
                          <TableCell className="font-mono text-xs">{permission.code}</TableCell>
                          <TableCell className="capitalize text-muted-foreground">{permission.module}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {rolePermissions
                                .filter((rp) => rp.permission_code === permission.code)
                                .map((rp) => (
                                  <Badge key={rp.role} variant="outline" className="text-[10px] capitalize">
                                    {rp.role.replace(/_/g, " ")}
                                  </Badge>
                                ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        );
      }}
    </PermissionGate>
  );
}
