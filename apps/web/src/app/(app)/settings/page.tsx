/**
 * Settings — loads workspace settings from the API on mount,
 * saves via PATCH /workspaces/:id/settings with optimistic update.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Save, Bell, Clock, Cpu, RefreshCw, AlertCircle, MessageSquare, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAppContext } from "@/lib/app-context";
import { updateWorkspaceSettings, linkDiscordId, updateTimezone, getErrorMessage } from "@/lib/api";
import type { WorkspaceSettings } from "@aicrm/shared";

// ── Form state (strings for controlled inputs) ─────────────────────────────

interface SettingsForm {
  reminderCadenceHours: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  defaultModel: string;
}

interface FieldErrors {
  reminderCadenceHours?: string;
  workingHoursStart?: string;
  workingHoursEnd?: string;
}

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "America/Honolulu",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const MODEL_OPTIONS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (default)" },
  { value: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (fastest)" },
] as const;

function settingsToForm(s: WorkspaceSettings): SettingsForm {
  return {
    reminderCadenceHours: String(s.reminderCadenceHours),
    workingHoursStart: s.workingHoursStart,
    workingHoursEnd: s.workingHoursEnd,
    defaultModel: s.defaultModel,
  };
}

// ── Skeleton ──────────────────────────────────────────────────────────────

function SettingsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading settings">
      <div className="mb-8 space-y-2">
        <div className="skeleton h-8 w-28 rounded-md" />
        <div className="skeleton h-4 w-72 rounded-md" />
      </div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="mb-6 rounded-xl border border-border bg-card p-6"
        >
          <div className="skeleton mb-2 h-5 w-32 rounded" />
          <div className="skeleton mb-4 h-3 w-56 rounded" />
          <div className="skeleton h-10 w-40 rounded-md" />
        </div>
      ))}
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────

function SettingsError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-xl border border-danger/20 bg-danger/5 py-16 text-center"
      role="alert"
    >
      <AlertCircle
        className="h-8 w-8 text-danger/60"
        aria-hidden="true"
        strokeWidth={1.5}
      />
      <div>
        <p className="text-sm font-medium text-foreground">
          Failed to load settings
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.5} />
        Retry
      </Button>
    </div>
  );
}

// ── Settings Page ─────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { currentWorkspace, meResponse } = useAppContext();

  const [form, setForm] = useState<SettingsForm | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Discord identity state
  const currentDiscordId = (meResponse?.user as { discordId?: string | null } | undefined)?.discordId ?? null;
  const [discordInput, setDiscordInput] = useState<string>(currentDiscordId ?? "");
  const [savingDiscord, setSavingDiscord] = useState(false);

  // Timezone state
  const detectedTimezone = typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "UTC";
  const currentTimezone = meResponse?.user?.timezone ?? detectedTimezone;
  const [selectedTimezone, setSelectedTimezone] = useState<string>(currentTimezone);
  const [savingTimezone, setSavingTimezone] = useState(false);

  const timezoneOptions: string[] = (() => {
    try {
      // Use Intl.supportedValuesOf when available (Chrome 99+, Firefox 110+)
      return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? COMMON_TIMEZONES;
    } catch {
      return COMMON_TIMEZONES;
    }
  })();

  // Load settings from context (workspace already has settings embedded)
  const loadSettings = useCallback(() => {
    if (!currentWorkspace) return;
    setLoadError(null);
    try {
      setForm(settingsToForm(currentWorkspace.settings));
    } catch (err) {
      setLoadError(getErrorMessage(err, "Could not read settings."));
    }
  }, [currentWorkspace]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // ── Validation ──────────────────────────────────────────────────────────

  function validateForm(s: SettingsForm): FieldErrors {
    const errs: FieldErrors = {};
    const cadence = Number(s.reminderCadenceHours);
    if (
      !s.reminderCadenceHours ||
      isNaN(cadence) ||
      cadence < 1 ||
      cadence > 24
    ) {
      errs.reminderCadenceHours = "Enter a number between 1 and 24.";
    }
    if (!s.workingHoursStart) {
      errs.workingHoursStart = "Start time is required.";
    }
    if (!s.workingHoursEnd) {
      errs.workingHoursEnd = "End time is required.";
    }
    if (
      s.workingHoursStart &&
      s.workingHoursEnd &&
      s.workingHoursStart >= s.workingHoursEnd
    ) {
      errs.workingHoursEnd = "End time must be after start time.";
    }
    return errs;
  }

  function update(key: keyof SettingsForm, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (errors[key as keyof FieldErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  // ── Discord save handler ────────────────────────────────────────────────

  async function handleSaveDiscord() {
    setSavingDiscord(true);
    const value = discordInput.trim() || null;
    // Optimistic: no rollback needed (string field; original still in currentDiscordId)
    try {
      await linkDiscordId(value);
      toast.success(value ? "Discord ID linked." : "Discord ID removed.");
    } catch (err) {
      setDiscordInput(currentDiscordId ?? "");
      toast.error(getErrorMessage(err, "Failed to save Discord ID."));
    } finally {
      setSavingDiscord(false);
    }
  }

  // ── Timezone save handler ───────────────────────────────────────────────

  async function handleSaveTimezone() {
    setSavingTimezone(true);
    try {
      await updateTimezone(selectedTimezone);
      toast.success("Timezone updated.");
    } catch (err) {
      setSelectedTimezone(currentTimezone);
      toast.error(getErrorMessage(err, "Failed to save timezone."));
    } finally {
      setSavingTimezone(false);
    }
  }

  // ── Save handler ────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !currentWorkspace) return;

    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const firstErrorId = Object.keys(errs)[0];
      document.getElementById(firstErrorId)?.focus();
      return;
    }

    setSaving(true);

    const patch: WorkspaceSettings = {
      reminderCadenceHours: Number(form.reminderCadenceHours),
      workingHoursStart: form.workingHoursStart,
      workingHoursEnd: form.workingHoursEnd,
      defaultModel: form.defaultModel,
    };

    // Optimistic: settings are already in local form state — no rollback needed
    // for display (the workspace object in context isn't mutated here, but the
    // form reflects the user's intent immediately).

    try {
      await updateWorkspaceSettings(currentWorkspace.id, patch);
      toast.success("Settings saved.");
    } catch (err) {
      // Roll back form to the workspace's saved settings
      setForm(settingsToForm(currentWorkspace.settings));
      toast.error(getErrorMessage(err, "Failed to save settings."));
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (!currentWorkspace || !form) {
    if (loadError) return <SettingsError message={loadError} onRetry={loadSettings} />;
    return <SettingsSkeleton />;
  }

  return (
    <>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure how and when AI Sync Copilot works for you.
        </p>
      </div>

      <form onSubmit={handleSave} noValidate aria-label="Workspace settings">
        <div className="flex flex-col gap-6">

          {/* ── Reminders ─────────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
                <CardTitle className="text-base">Reminders</CardTitle>
              </div>
              <CardDescription>
                How often should the assistant nudge you about pending tasks?
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reminderCadenceHours">
                  Reminder cadence{" "}
                  <span aria-hidden="true" className="text-danger">*</span>
                  <span className="sr-only">(required)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="reminderCadenceHours"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="24"
                    value={form.reminderCadenceHours}
                    onChange={(e) =>
                      update("reminderCadenceHours", e.target.value)
                    }
                    onBlur={() => {
                      const errs = validateForm(form);
                      setErrors((prev) => ({
                        ...prev,
                        reminderCadenceHours: errs.reminderCadenceHours,
                      }));
                    }}
                    className={cn(
                      "w-24",
                      errors.reminderCadenceHours &&
                        "border-danger focus-visible:ring-danger",
                    )}
                    aria-required="true"
                    aria-describedby={
                      errors.reminderCadenceHours
                        ? "reminderCadenceHours-error"
                        : "reminderCadenceHours-hint"
                    }
                    aria-invalid={
                      errors.reminderCadenceHours ? "true" : undefined
                    }
                  />
                  <span className="text-sm text-muted-foreground">hours</span>
                </div>
                {!errors.reminderCadenceHours && (
                  <p
                    id="reminderCadenceHours-hint"
                    className="text-xs text-muted-foreground"
                  >
                    We&apos;ll batch and throttle — never spam. Min 1h, max 24h.
                  </p>
                )}
                {errors.reminderCadenceHours && (
                  <p
                    id="reminderCadenceHours-error"
                    role="alert"
                    className="text-xs text-danger"
                  >
                    {errors.reminderCadenceHours}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Working Hours ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
                <CardTitle className="text-base">Working Hours</CardTitle>
              </div>
              <CardDescription>
                Reminders and summaries only fire during these hours (your local
                time).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                {/* Start */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="workingHoursStart">
                    Start{" "}
                    <span aria-hidden="true" className="text-danger">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <Input
                    id="workingHoursStart"
                    type="time"
                    value={form.workingHoursStart}
                    onChange={(e) =>
                      update("workingHoursStart", e.target.value)
                    }
                    onBlur={() => {
                      const errs = validateForm(form);
                      setErrors((prev) => ({
                        ...prev,
                        workingHoursStart: errs.workingHoursStart,
                        workingHoursEnd: errs.workingHoursEnd,
                      }));
                    }}
                    className={cn(
                      "w-32",
                      errors.workingHoursStart &&
                        "border-danger focus-visible:ring-danger",
                    )}
                    aria-required="true"
                    aria-invalid={
                      errors.workingHoursStart ? "true" : undefined
                    }
                    aria-describedby={
                      errors.workingHoursStart
                        ? "workingHoursStart-error"
                        : undefined
                    }
                  />
                  {errors.workingHoursStart && (
                    <p
                      id="workingHoursStart-error"
                      role="alert"
                      className="text-xs text-danger"
                    >
                      {errors.workingHoursStart}
                    </p>
                  )}
                </div>

                <span
                  className="pb-2 text-sm text-muted-foreground"
                  aria-hidden="true"
                >
                  to
                </span>

                {/* End */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="workingHoursEnd">
                    End{" "}
                    <span aria-hidden="true" className="text-danger">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <Input
                    id="workingHoursEnd"
                    type="time"
                    value={form.workingHoursEnd}
                    onChange={(e) => update("workingHoursEnd", e.target.value)}
                    onBlur={() => {
                      const errs = validateForm(form);
                      setErrors((prev) => ({
                        ...prev,
                        workingHoursEnd: errs.workingHoursEnd,
                      }));
                    }}
                    className={cn(
                      "w-32",
                      errors.workingHoursEnd &&
                        "border-danger focus-visible:ring-danger",
                    )}
                    aria-required="true"
                    aria-invalid={errors.workingHoursEnd ? "true" : undefined}
                    aria-describedby={
                      errors.workingHoursEnd
                        ? "workingHoursEnd-error"
                        : undefined
                    }
                  />
                  {errors.workingHoursEnd && (
                    <p
                      id="workingHoursEnd-error"
                      role="alert"
                      className="text-xs text-danger"
                    >
                      {errors.workingHoursEnd}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Default AI Model ───────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Cpu
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
                <CardTitle className="text-base">AI Model</CardTitle>
              </div>
              <CardDescription>
                The model used for task extraction and &quot;Explain Task&quot;
                in the VS Code extension.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="defaultModel">Default model</Label>
                <select
                  id="defaultModel"
                  value={form.defaultModel}
                  onChange={(e) => update("defaultModel", e.target.value)}
                  className={cn(
                    "flex min-h-[2.75rem] w-full max-w-sm rounded-md border border-input",
                    "bg-transparent px-3 py-2 text-base text-foreground",
                    "transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                  aria-describedby="defaultModel-hint"
                >
                  {MODEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p
                  id="defaultModel-hint"
                  className="text-xs text-muted-foreground"
                >
                  All models route via OpenRouter. Gemini Flash is fastest and
                  cheapest.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ── Discord identity ────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
                <CardTitle className="text-base">Discord identity</CardTitle>
              </div>
              <CardDescription>
                Paste your Discord user ID so tasks @mentioned to you on Discord
                are auto-assigned to you in AI Sync Copilot.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Current status chip */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                {currentDiscordId ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <MessageSquare className="h-3 w-3" aria-hidden="true" strokeWidth={1.5} />
                    Linked
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                    Not linked
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discordUserId">Discord user ID</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="discordUserId"
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 123456789012345678"
                    value={discordInput}
                    onChange={(e) => setDiscordInput(e.target.value)}
                    className="max-w-xs font-mono"
                    aria-describedby="discordUserId-hint"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSaveDiscord}
                    loading={savingDiscord}
                    aria-label="Save Discord user ID"
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.5} />
                    Save
                  </Button>
                </div>
                <p id="discordUserId-hint" className="text-xs text-muted-foreground">
                  Numeric Discord user ID (18–19 digits). Leave blank to unlink.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ── Timezone ───────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
                <CardTitle className="text-base">Timezone</CardTitle>
              </div>
              <CardDescription>
                Used for daily standup scheduling and working-hours reminders.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <div className="flex items-end gap-2">
                  <select
                    id="timezone"
                    value={selectedTimezone}
                    onChange={(e) => setSelectedTimezone(e.target.value)}
                    className={cn(
                      "flex min-h-[2.75rem] w-full max-w-sm rounded-md border border-input",
                      "bg-transparent px-3 py-2 text-base text-foreground",
                      "transition-colors duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                    aria-describedby="timezone-hint"
                  >
                    {timezoneOptions.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSaveTimezone}
                    loading={savingTimezone}
                    aria-label="Save timezone"
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.5} />
                    Save
                  </Button>
                </div>
                <p id="timezone-hint" className="text-xs text-muted-foreground">
                  Detected: <span className="font-medium">{detectedTimezone}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Primary CTA */}
          <div className="flex justify-end">
            <Button
              type="submit"
              loading={saving}
              aria-label="Save all settings"
            >
              <Save
                className="h-4 w-4"
                aria-hidden="true"
                strokeWidth={1.5}
              />
              Save settings
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
