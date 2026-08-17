import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellRing, CheckCheck, Send } from "lucide-react";

import { PermissionGate } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useServerFn } from "@/lib/use-demo-fn";
import {
  listNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  sendTestAlert,
  updateNotificationPreference,
} from "@/lib/notifications.functions";
import type { NotificationChannel, NotificationSeverity } from "@/lib/demo-store";

const CHANNELS: { code: NotificationChannel; label: string }[] = [
  { code: "in_app", label: "In-app" },
  { code: "email", label: "Email" },
  { code: "sms", label: "SMS" },
  { code: "push", label: "Push" },
];
const SEVERITIES: NotificationSeverity[] = ["info", "success", "warning", "critical"];

const severityTone: Record<NotificationSeverity, string> = {
  info: "bg-sky-500/15 text-sky-400 border-sky-500/25",
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  critical: "bg-destructive/15 text-destructive border-destructive/40",
};

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Alerts & Notifications — ForkFleet Console" },
      {
        name: "description",
        content: "Configure operational alert channels and review every notification raised across the network.",
      },
      { property: "og:title", content: "Alerts & Notifications — ForkFleet Console" },
      { property: "og:description", content: "Alert channels, delivery preferences and the full notification feed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const queryClient = useQueryClient();
  const fetchPrefs = useServerFn(listNotificationPreferences);
  const fetchAlerts = useServerFn(listNotifications);
  const updatePref = useServerFn(updateNotificationPreference);
  const testAlert = useServerFn(sendTestAlert);
  const readOne = useServerFn(markNotificationRead);
  const readAll = useServerFn(markAllNotificationsRead);

  const prefsQuery = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => fetchPrefs(),
  });
  const alertsQuery = useQuery({
    queryKey: ["notifications", "page"],
    queryFn: () => fetchAlerts({ unreadOnly: false }),
  });
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const invalidatePrefs = () => queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) => updatePref(input),
    onSuccess: () => {
      toast.success("Trigger updated");
      void invalidatePrefs();
    },
  });
  const channelMutation = useMutation({
    mutationFn: (input: { id: string; channels: NotificationChannel[] }) => updatePref(input),
  });
  const severityMutation = useMutation({
    mutationFn: (input: { id: string; minSeverity: NotificationSeverity }) => updatePref(input),
  });
  const testMutation = useMutation({
    mutationFn: (trigger: string) => testAlert({ trigger }),
    onSuccess: () => {
      toast.success("Test alert added to your feed");
      void invalidate();
    },
  });

  const alerts = useMemo(() => {
    const data = alertsQuery.data ?? [];
    return filter === "unread" ? data.filter((a) => !a.read_at) : data;
  }, [alertsQuery.data, filter]);

  return (
    <PermissionGate
      required={["notifications.manage"]}
      breadcrumb={["Platform", "Notifications"]}
      title="In-app alerts & triggers"
      description="Configure which events raise alerts, which channels they travel over, and review your recent notification feed."
    >
      <Tabs defaultValue="triggers">
        <TabsList>
          <TabsTrigger value="triggers">Triggers</TabsTrigger>
          <TabsTrigger value="feed">Alert feed</TabsTrigger>
        </TabsList>

        <TabsContent value="triggers" className="mt-4 space-y-4">
          {(prefsQuery.data ?? []).map((pref) => {
            const toggleChannel = (code: NotificationChannel) => {
              const set = new Set(pref.channels);
              if (set.has(code)) set.delete(code);
              else set.add(code);
              const channels = Array.from(set);
              channelMutation.mutate(
                { id: pref.id, channels },
                {
                  onSuccess: () => {
                    void invalidatePrefs();
                  },
                },
              );
            };
            return (
              <Card key={pref.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <BellRing className="size-4" />
                        {pref.label}
                      </CardTitle>
                      <CardDescription>{pref.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={pref.enabled}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: pref.id, enabled: checked })}
                        id={`enable-${pref.id}`}
                      />
                      <Label htmlFor={`enable-${pref.id}`} className="text-xs">
                        {pref.enabled ? "Enabled" : "Muted"}
                      </Label>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Minimum severity</Label>
                      <Select
                        value={pref.minSeverity}
                        onValueChange={(value) =>
                          severityMutation.mutate(
                            { id: pref.id, minSeverity: value as NotificationSeverity },
                            { onSuccess: () => void invalidatePrefs() },
                          )
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SEVERITIES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Channels</Label>
                      <div className="flex flex-wrap gap-2">
                        {CHANNELS.map((ch) => {
                          const active = pref.channels.includes(ch.code);
                          return (
                            <Badge
                              key={ch.code}
                              variant={active ? "default" : "outline"}
                              className="cursor-pointer"
                              onClick={() => toggleChannel(ch.code)}
                            >
                              {ch.label}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-2">
                    <p className="text-xs text-muted-foreground">
                      Trigger key: <code className="text-[11px]">{pref.trigger}</code> · Applies to roles:{" "}
                      {pref.roles.map((r) => r.replace(/_/g, " ")).join(", ")}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => testMutation.mutate(pref.trigger)}>
                      <Send className="mr-1 size-3.5" /> Send test
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="feed" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="size-4" /> Recent alerts
                </CardTitle>
                <CardDescription>
                  {(alertsQuery.data ?? []).filter((a) => !a.read_at).length} unread
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border border-border">
                  <button
                    className={`px-3 py-1 text-xs ${filter === "all" ? "bg-accent" : ""}`}
                    onClick={() => setFilter("all")}
                  >
                    All
                  </button>
                  <button
                    className={`px-3 py-1 text-xs ${filter === "unread" ? "bg-accent" : ""}`}
                    onClick={() => setFilter("unread")}
                  >
                    Unread
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await readAll();
                    await invalidate();
                  }}
                >
                  <CheckCheck className="mr-1 size-3.5" /> Mark all read
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[520px] pr-3">
                <div className="space-y-2">
                  {alerts.length === 0 && (
                    <p className="py-16 text-center text-sm text-muted-foreground">
                      {filter === "unread" ? "You're all caught up 🎉" : "No alerts yet."}
                    </p>
                  )}
                  {alerts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={async () => {
                        await readOne({ id: a.id });
                        await invalidate();
                      }}
                      className={`flex w-full flex-col gap-1 rounded-md border border-border p-3 text-left hover:bg-accent/60 ${!a.read_at ? "bg-accent/30" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{a.title}</p>
                        <Badge variant="outline" className={`${severityTone[a.severity]} text-[9px] uppercase`}>
                          {a.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{a.body}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}
                        {!a.read_at && <span className="ml-2 text-primary">• unread</span>}
                      </p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PermissionGate>
  );
}
