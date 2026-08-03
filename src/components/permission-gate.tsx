import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useStaffSession } from "@/hooks/use-staff-session";

/**
 * Wraps a management screen with the shell, a loading state and a
 * permission check. Renders an access-denied panel when the signed-in
 * staff member lacks any of the required permission codes.
 */
export function PermissionGate({
  required,
  breadcrumb,
  title,
  description,
  actions,
  children,
}: {
  required: string[];
  breadcrumb: string[];
  title: string;
  description?: string;
  actions?: ReactNode;
  children: (session: ReturnType<typeof useStaffSession>) => ReactNode;
}) {
  const staff = useStaffSession();

  if (staff.isLoading) {
    return (
      <AppShell breadcrumb={breadcrumb} title={title} {...(description ? { description } : {})}>
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  const allowed = required.length === 0 || staff.hasAnyPermission(required);

  return (
    <AppShell
      session={staff.session}
      breadcrumb={breadcrumb}
      title={title}
      {...(description ? { description } : {})}
      {...(allowed && actions ? { actions } : {})}
    >
      {allowed ? (
        children(staff)
      ) : (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ShieldAlert className="size-8 text-destructive" />
            <div>
              <p className="font-medium">You don't have access to this area</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Required permission: {required.join(" or ")}. Ask a platform administrator to grant it.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
