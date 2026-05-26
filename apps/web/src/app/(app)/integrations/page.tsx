/**
 * Integrations — fetches real Discord status from the API.
 * "Connect Discord" opens the inviteUrl in a new tab.
 * "Disconnect" calls DELETE /integrations/discord.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  MessageSquare,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Unplug,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAppContext } from "@/lib/app-context";
import {
  getDiscordStatus,
  disconnectDiscord,
  getErrorMessage,
} from "@/lib/api";
import type { DiscordIntegrationStatus } from "@aicrm/shared";

// ── Skeleton ────────────────────────────────────────────────────────────────

function IntegrationsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading integrations">
      <div className="mb-8 space-y-2">
        <div className="skeleton h-8 w-36 rounded-md" />
        <div className="skeleton h-4 w-72 rounded-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-start justify-between">
            <div className="skeleton h-10 w-10 rounded-lg" />
            <div className="skeleton h-5 w-20 rounded-full" />
          </div>
          <div className="skeleton mb-2 h-5 w-20 rounded" />
          <div className="skeleton mb-6 h-3 w-full rounded" />
          <div className="skeleton h-10 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

// ── Error state ─────────────────────────────────────────────────────────────

function IntegrationsError({
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
          Failed to load integration status
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw
          className="h-3.5 w-3.5"
          aria-hidden="true"
          strokeWidth={1.5}
        />
        Retry
      </Button>
    </div>
  );
}

// ── Integrations Page ───────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { currentWorkspace } = useAppContext();

  const [status, setStatus] = useState<DiscordIntegrationStatus | null>(null);
  const [loadingState, setLoadingState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoadingState("loading");
    setLoadError(null);
    try {
      const data = await getDiscordStatus(currentWorkspace.id);
      setStatus(data);
      setLoadingState("ready");
    } catch (err) {
      setLoadError(getErrorMessage(err, "Could not load Discord status."));
      setLoadingState("error");
    }
  }, [currentWorkspace]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ── Connect: open invite URL in new tab ───────────────────────────────────

  function handleConnect() {
    if (!status?.inviteUrl) {
      toast.error("Discord is not configured. Contact your workspace admin.");
      return;
    }
    window.open(status.inviteUrl, "_blank", "noopener,noreferrer");
    toast.info("Discord invite opened in a new tab.", {
      description: "After adding the bot, refresh this page to see the status.",
    });
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  async function handleDisconnect() {
    if (!currentWorkspace) return;
    setDisconnecting(true);

    // Optimistic: mark as disconnected immediately
    const previous = status;
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            connected: false,
            guildName: null,
            channelName: null,
          }
        : prev,
    );

    try {
      await disconnectDiscord(currentWorkspace.id);
      toast.success("Discord disconnected.", {
        description: "No new tasks will be captured from Discord.",
      });
    } catch (err) {
      // Roll back
      setStatus(previous);
      toast.error(getErrorMessage(err, "Failed to disconnect. Please try again."));
    } finally {
      setDisconnecting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!currentWorkspace || loadingState === "loading") {
    return (
      <>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">
            Integrations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your tools so tasks flow in automatically.
          </p>
        </div>
        <IntegrationsSkeleton />
      </>
    );
  }

  if (loadingState === "error") {
    return (
      <>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">
            Integrations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your tools so tasks flow in automatically.
          </p>
        </div>
        <IntegrationsError
          message={loadError ?? "Unknown error."}
          onRetry={fetchStatus}
        />
      </>
    );
  }

  const isConnected = status?.connected ?? false;

  return (
    <>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your tools so tasks flow in automatically.
        </p>
      </div>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Discord card */}
        <Card
          className={cn(
            "flex flex-col transition-all duration-200",
            isConnected && "border-success/40",
          )}
          aria-label="Discord integration"
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              {/* Discord icon */}
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  isConnected ? "bg-success/10" : "bg-muted",
                )}
              >
                <MessageSquare
                  className={cn(
                    "h-5 w-5",
                    isConnected ? "text-success" : "text-muted-foreground",
                  )}
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
              </div>

              {/* Status badge */}
              {isConnected ? (
                <Badge variant="completed">
                  <CheckCircle2
                    className="h-3 w-3"
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Not connected
                </Badge>
              )}
            </div>

            <CardTitle className="text-base">Discord</CardTitle>
            <CardDescription>
              {isConnected
                ? "Discord is connected. Mentions in your watched channels become tasks automatically."
                : "Connect your Discord server so @mentions become tasks. The bot watches your chosen channel."}
            </CardDescription>
          </CardHeader>

          {/* Connected details */}
          {isConnected && (status?.guildName || status?.channelName) && (
            <CardContent className="pb-3">
              <div className="rounded-md border border-border bg-surface-muted px-3 py-2">
                {status.channelName && (
                  <p className="text-xs text-muted-foreground">
                    Watching{" "}
                    <span className="mono font-medium text-foreground">
                      #{status.channelName}
                    </span>
                  </p>
                )}
                {status.guildName && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Server:{" "}
                    <span className="font-medium text-foreground">
                      {status.guildName}
                    </span>
                  </p>
                )}
              </div>
            </CardContent>
          )}

          <CardFooter className={cn("flex gap-2 mt-auto", !isConnected && "pt-0")}>
            {isConnected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() =>
                    toast.info("Channel settings coming soon.")
                  }
                >
                  <RefreshCw
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                  Configure
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  loading={disconnecting}
                  className="text-danger hover:text-danger hover:bg-danger/10"
                  aria-label="Disconnect Discord integration"
                >
                  <Unplug
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                className="w-full"
                onClick={handleConnect}
                aria-label="Connect your Discord server"
                disabled={!status?.inviteUrl}
              >
                <ExternalLink
                  className="h-4 w-4"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
                Connect Discord
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Placeholder for future integrations */}
        <div
          className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-center"
          aria-label="More integrations coming soon"
        >
          <p className="text-sm font-medium text-muted-foreground">
            More integrations coming soon
          </p>
          <p className="text-xs text-muted-foreground">
            Slack, Teams, Jira — let us know what you need.
          </p>
        </div>
      </div>

      {/* AI note */}
      <p className="mt-8 text-xs text-muted-foreground">
        AI suggestion only — you review and confirm tasks before they affect
        your workflow.
      </p>
    </>
  );
}
