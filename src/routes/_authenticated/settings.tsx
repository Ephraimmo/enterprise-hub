import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  Building2,
  Palette,
  Bell,
  Lock,
  Globe,
  Key,
  Save,
  Check,
} from "lucide-react";

import { PermissionGate } from "@/components/permission-gate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ForkFleet Console" },
      { name: "description", content: "Organisation, branding, security, notification and API settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [saved, setSaved] = useState<string | null>(null);

  function save(section: string) {
    toast.success(`${section} settings saved`);
    setSaved(section);
    setTimeout(() => setSaved(null), 2500);
  }

  return (
    <PermissionGate
      required={["settings.manage", "users.view"]}
      breadcrumb={["Platform", "Settings"]}
      title="Settings"
      description="Configure your organisation profile, branding, security, notifications and API integrations."
      actions={
        saved && (
          <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
            <Check className="size-3" /> {saved} saved
          </Badge>
        )
      }
    >
      {() => (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardContent className="p-2">
              <Tabs defaultValue="organisation" orientation="vertical" className="w-full">
                <TabsList className="flex h-auto w-full flex-col items-stretch gap-1 bg-transparent p-0">
                  {[
                    { v: "organisation", label: "Organisation", icon: Building2 },
                    { v: "branding", label: "Branding", icon: Palette },
                    { v: "notifications", label: "Notifications", icon: Bell },
                    { v: "security", label: "Security", icon: Lock },
                    { v: "localisation", label: "Localisation", icon: Globe },
                    { v: "api", label: "API & webhooks", icon: Key },
                  ].map((t) => (
                    <TabsTrigger
                      key={t.v}
                      value={t.v}
                      className="justify-start gap-2 rounded-md px-3 py-2 data-[state=active]:bg-muted"
                    >
                      <t.icon className="size-4" />
                      <span className="text-sm">{t.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Tabs defaultValue="organisation" orientation="vertical">
              <TabsContent value="organisation">
                <SettingsCard title="Organisation profile" desc="How your business appears across the console, receipts and invoices.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Organisation name"><Input defaultValue="ForkFleet Foods (Pty) Ltd" /></Field>
                    <Field label="Trading name"><Input defaultValue="ForkFleet" /></Field>
                    <Field label="Support email"><Input defaultValue="support@forkfleet.demo" type="email" /></Field>
                    <Field label="Support phone"><Input defaultValue="+27 21 555 0100" /></Field>
                    <Field label="Registration number"><Input defaultValue="2024/123456/07" /></Field>
                    <Field label="VAT number"><Input defaultValue="4123456789" /></Field>
                    <div className="md:col-span-2">
                      <Field label="Registered address">
                        <Input defaultValue="1 Dock Road, V&A Waterfront, Cape Town, 8001, South Africa" />
                      </Field>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button onClick={() => save("Organisation")}><Save className="mr-1.5 size-3.5" /> Save changes</Button>
                  </div>
                </SettingsCard>

                <SettingsCard title="Billing" desc="Subscription plan and billing contact." className="mt-4">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
                    <div>
                      <p className="text-sm font-medium">Enterprise plan</p>
                      <p className="text-xs text-muted-foreground">Unlimited restaurants, drivers and orders. Demo billing cycle renews 1st of each month.</p>
                    </div>
                    <Badge>Active</Badge>
                  </div>
                </SettingsCard>
              </TabsContent>

              <TabsContent value="branding">
                <SettingsCard title="Customer app branding" desc="Colours, logos and messaging shown to diners on emails and apps.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Primary brand colour">
                      <div className="flex gap-2">
                        <Input type="color" defaultValue="#f2a93b" className="h-10 w-16 p-1" />
                        <Input defaultValue="#F2A93B" />
                      </div>
                    </Field>
                    <Field label="Accent colour">
                      <div className="flex gap-2">
                        <Input type="color" defaultValue="#2b7df2" className="h-10 w-16 p-1" />
                        <Input defaultValue="#2B7DF2" />
                      </div>
                    </Field>
                    <Field label="App display name"><Input defaultValue="ForkFleet" /></Field>
                    <Field label="Support URL"><Input defaultValue="https://forkfleet.demo/support" /></Field>
                  </div>
                  <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
                    <div>
                      <p className="text-sm font-medium">Custom domain</p>
                      <p className="text-xs text-muted-foreground">Point your own domain at the customer ordering site.</p>
                    </div>
                    <Button variant="outline">Configure</Button>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button onClick={() => save("Branding")}><Save className="mr-1.5 size-3.5" /> Save changes</Button>
                  </div>
                </SettingsCard>
              </TabsContent>

              <TabsContent value="notifications">
                <SettingsCard title="Default notifications" desc="System-wide defaults for staff notification routing. Triggers can be customised on the Notifications page.">
                  <div className="space-y-4">
                    {[
                      { label: "Order status emails to customers", desc: "Customers get an email at each stage (confirmed, out-for-delivery, delivered).", on: true },
                      { label: "Dispatch alerts to managers", desc: "Late orders, driver offline and other critical events.", on: true },
                      { label: "Weekly digest email", desc: "KPI summary delivered every Monday at 07:00.", on: false },
                      { label: "Slack integration", desc: "Post dispatch alerts to your #ops Slack channel.", on: false },
                      { label: "SMS OTP for admin logins", desc: "Require 2FA via SMS for super admins.", on: true },
                    ].map((n) => (
                      <div key={n.label} className="flex items-start justify-between gap-4 border-b border-border/60 pb-3 last:border-0 last:pb-0">
                        <div>
                          <p className="text-sm font-medium">{n.label}</p>
                          <p className="text-xs text-muted-foreground">{n.desc}</p>
                        </div>
                        <Switch defaultChecked={n.on} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button onClick={() => save("Notifications")}><Save className="mr-1.5 size-3.5" /> Save changes</Button>
                  </div>
                </SettingsCard>
              </TabsContent>

              <TabsContent value="security">
                <SettingsCard title="Authentication & access" desc="Password policy, SSO and session controls.">
                  <div className="space-y-4">
                    <ToggleField label="Require two-factor authentication for all admins" desc="Enforces an authenticator app for every platform admin." defaultOn />
                    <ToggleField label="Enforce SSO via SAML" desc="Restrict access to your identity provider (Okta, Azure AD, Google Workspace)." />
                    <ToggleField label="Auto-logout after inactivity" desc="Sessions expire after 30 minutes of no activity." defaultOn />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Minimum password length"><Input defaultValue="12" type="number" /></Field>
                      <Field label="Session timeout (minutes)"><Input defaultValue="30" type="number" /></Field>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button onClick={() => save("Security")}><Save className="mr-1.5 size-3.5" /> Save changes</Button>
                  </div>
                </SettingsCard>

                <SettingsCard title="Audit & compliance" desc="Tamper-evident logging and retention." className="mt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Log retention">
                      <Select defaultValue="365">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="90">90 days</SelectItem>
                          <SelectItem value="180">180 days</SelectItem>
                          <SelectItem value="365">1 year</SelectItem>
                          <SelectItem value="2555">7 years</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Data residency region">
                      <Select defaultValue="af-south-1">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="af-south-1">Africa (Cape Town)</SelectItem>
                          <SelectItem value="eu-west-1">EU (Ireland)</SelectItem>
                          <SelectItem value="us-east-1">US East (Virginia)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </SettingsCard>
              </TabsContent>

              <TabsContent value="localisation">
                <SettingsCard title="Locale" desc="Default language, currency, timezone and unit preferences.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Default language">
                      <Select defaultValue="en-ZA">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en-ZA">English (South Africa)</SelectItem>
                          <SelectItem value="en-GB">English (UK)</SelectItem>
                          <SelectItem value="af-ZA">Afrikaans</SelectItem>
                          <SelectItem value="zu-ZA">isiZulu</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Default currency">
                      <Select defaultValue="ZAR">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ZAR">South African Rand (ZAR)</SelectItem>
                          <SelectItem value="USD">US Dollar (USD)</SelectItem>
                          <SelectItem value="EUR">Euro (EUR)</SelectItem>
                          <SelectItem value="GBP">British Pound (GBP)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Timezone">
                      <Select defaultValue="Africa/Johannesburg">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Africa/Johannesburg">Africa/Johannesburg (SAST, UTC+2)</SelectItem>
                          <SelectItem value="UTC">UTC</SelectItem>
                          <SelectItem value="Europe/London">Europe/London</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Distance unit">
                      <Select defaultValue="km">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="km">Kilometres</SelectItem>
                          <SelectItem value="mi">Miles</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button onClick={() => save("Localisation")}><Save className="mr-1.5 size-3.5" /> Save changes</Button>
                  </div>
                </SettingsCard>
              </TabsContent>

              <TabsContent value="api">
                <SettingsCard title="API keys & webhooks" desc="Rotate keys and subscribe your services to platform events." className="mb-4">
                  <div className="space-y-3">
                    {[
                      { label: "Production key", key: "ff_live_••••••••••••••a9c2", created: "Created 12 Jun 2026" },
                      { label: "Test key", key: "ff_test_••••••••••••••7d14", created: "Created 12 Jun 2026" },
                    ].map((k) => (
                      <div key={k.label} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                        <div>
                          <p className="text-sm font-medium">{k.label}</p>
                          <code className="mt-0.5 block font-mono text-xs text-muted-foreground">{k.key}</code>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{k.created}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm">Reveal</Button>
                          <Button variant="outline" size="sm" className="text-destructive">Rotate</Button>
                        </div>
                      </div>
                    ))}
                    <Button variant="outline"><Key className="mr-1.5 size-3.5" /> Generate new key</Button>
                  </div>
                </SettingsCard>

                <SettingsCard title="Webhook endpoints" desc="Receive HTTP callbacks when orders, drivers, payments and restaurants change.">
                  <div className="space-y-2">
                    {[
                      { url: "https://api.example-diner.com/hooks/forkfleet", events: "order.*, driver.*", status: "Delivering" },
                      { url: "https://erp.nonnas.co.za/forkfleet", events: "payment.*, settlement.*", status: "Delivering" },
                    ].map((w) => (
                      <div key={w.url} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                        <div>
                          <code className="text-xs">{w.url}</code>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{w.events}</p>
                        </div>
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">{w.status}</Badge>
                      </div>
                    ))}
                    <Button variant="outline">+ Add endpoint</Button>
                  </div>
                </SettingsCard>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </PermissionGate>
  );
}

function SettingsCard({
  title,
  desc,
  children,
  className,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <SettingsIcon className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ToggleField({
  label,
  desc,
  defaultOn = false,
}: {
  label: string;
  desc: string;
  defaultOn?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-3 last:border-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch defaultChecked={defaultOn} />
    </div>
  );
}
