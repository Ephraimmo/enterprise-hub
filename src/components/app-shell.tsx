import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Moon, Search, Sun, Bell } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import type { StaffSession } from "@/lib/session.functions";

const roleLabel = (role: string) => role.replace(/_/g, " ");

export function AppShell({
  session,
  breadcrumb,
  title,
  description,
  actions,
  children,
}: {
  session?: StaffSession;
  breadcrumb: string[];
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const initials = (session?.fullName ?? session?.email ?? "OP")
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar permissions={session?.permissions ?? []} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-3 backdrop-blur">
            <SidebarTrigger />
            <div className="relative hidden max-w-sm flex-1 md:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search orders, restaurants, drivers…"
                className="h-9 pl-8"
                aria-label="Global search"
              />
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
                <Bell className="size-4" />
                <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary" />
              </Button>
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle colour theme">
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 gap-2 px-2">
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                        {initials || "OP"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm sm:inline">{session?.fullName ?? session?.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="space-y-1">
                    <p className="text-sm font-medium">{session?.fullName ?? "Staff member"}</p>
                    <p className="text-xs font-normal text-muted-foreground">{session?.email}</p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(session?.roles ?? []).map((role) => (
                        <Badge key={role} variant="secondary" className="text-[10px] capitalize">
                          {roleLabel(role)}
                        </Badge>
                      ))}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void signOut()}>
                    <LogOut className="mr-2 size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 md:px-6">
            <Breadcrumb className="mb-3">
              <BreadcrumbList>
                {breadcrumb.map((crumb, index) => (
                  <BreadcrumbItem key={crumb}>
                    <BreadcrumbPage
                      className={index === breadcrumb.length - 1 ? "text-foreground" : "text-muted-foreground"}
                    >
                      {crumb}
                    </BreadcrumbPage>
                    {index < breadcrumb.length - 1 && <BreadcrumbSeparator />}
                  </BreadcrumbItem>
                ))}
              </BreadcrumbList>
            </Breadcrumb>

            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
                {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
              </div>
              {actions}
            </div>

            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
