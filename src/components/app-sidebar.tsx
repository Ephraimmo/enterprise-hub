import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Store,
  UtensilsCrossed,
  Boxes,
  ReceiptText,
  Users,
  Bike,
  Radar,
  CreditCard,
  BadgePercent,
  BarChart3,
  Bell,
  LifeBuoy,
  Settings,
  ScrollText,
  ShieldCheck,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

type NavItem = { title: string; url: string; icon: typeof Store; permission?: string; soon?: boolean };

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Operations",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
      { title: "Orders", url: "/orders", icon: ReceiptText, permission: "orders.view", soon: true },
      { title: "Kitchen queue", url: "/kitchen", icon: UtensilsCrossed, permission: "orders.view" },
      { title: "Dispatch", url: "/dispatch", icon: Radar, permission: "dispatch.view" },
      { title: "Drivers", url: "/drivers", icon: Bike, permission: "drivers.view", soon: true },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { title: "Restaurants", url: "/restaurants", icon: Store, permission: "restaurants.view" },
      { title: "Menus", url: "/menus", icon: UtensilsCrossed, permission: "menus.view" },
      { title: "Inventory", url: "/inventory", icon: Boxes, permission: "inventory.view", soon: true },
    ],
  },
  {
    label: "Commerce",
    items: [
      { title: "Customers", url: "/customers", icon: Users, permission: "customers.view", soon: true },
      { title: "Payments", url: "/payments", icon: CreditCard, permission: "payments.view", soon: true },
      { title: "Promotions", url: "/promotions", icon: BadgePercent, permission: "promotions.view", soon: true },
      { title: "Reports", url: "/reports", icon: BarChart3, permission: "reports.view", soon: true },
    ],
  },
  {
    label: "Platform",
    items: [
      { title: "Access control", url: "/access", icon: ShieldCheck, permission: "users.view" },
      { title: "Notifications", url: "/notifications", icon: Bell, soon: true },
      { title: "Support", url: "/support", icon: LifeBuoy, permission: "support.view", soon: true },
      { title: "Audit logs", url: "/audit", icon: ScrollText, permission: "audit.view", soon: true },
      { title: "Settings", url: "/settings", icon: Settings, permission: "settings.view", soon: true },
    ],
  },
];

export function AppSidebar({ permissions }: { permissions: string[] }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const allow = (item: NavItem) => !item.permission || permissions.includes(item.permission);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <UtensilsCrossed className="size-4" />
          </span>
          {!collapsed && (
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold">ForkFleet</p>
              <p className="text-[11px] text-muted-foreground">Operations Console</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => {
          const items = group.items.filter(allow);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild={!item.soon}
                        isActive={pathname === item.url}
                        tooltip={item.title}
                        className={item.soon ? "cursor-not-allowed opacity-55" : undefined}
                      >
                        {item.soon ? (
                          <span className="flex w-full items-center gap-2">
                            <item.icon className="size-4" />
                            {!collapsed && (
                              <>
                                <span className="flex-1">{item.title}</span>
                                <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">
                                  next
                                </Badge>
                              </>
                            )}
                          </span>
                        ) : (
                          <Link to={item.url} className="flex items-center gap-2">
                            <item.icon className="size-4" />
                            {!collapsed && <span>{item.title}</span>}
                          </Link>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
