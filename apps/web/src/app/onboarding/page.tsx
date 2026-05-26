"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createWorkspace, getErrorMessage } from "@/lib/api";

/**
 * Flow 1 — Onboarding step 2: create workspace.
 * First-run only. Submits via POST /workspaces, then navigates to /dashboard.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [workspaceName, setWorkspaceName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validateName(value: string): string | null {
    if (!value.trim()) return "Workspace name is required.";
    if (value.trim().length < 2) return "Name must be at least 2 characters.";
    if (value.trim().length > 60) return "Name must be 60 characters or fewer.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const error = validateName(workspaceName);
    if (error) {
      setNameError(error);
      return;
    }
    setNameError(null);
    setLoading(true);

    try {
      const workspace = await createWorkspace(workspaceName.trim());
      toast.success("Workspace created!", {
        description: `"${workspace.name}" is ready.`,
      });
      // Navigate to dashboard — AppProvider will pick up the new workspace on
      // next /me fetch (triggered by the redirect).
      router.push("/dashboard");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create workspace. Please try again."));
      setLoading(false);
    }
  }

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-12"
      aria-label="Create your workspace"
    >
      {/* Step indicator */}
      <div
        className="mb-8 flex items-center gap-2"
        aria-label="Step 1 of 3: Create workspace"
      >
        {[1, 2, 3].map((step) => (
          <div
            key={step}
            className={cn(
              "h-1.5 w-12 rounded-full transition-colors duration-200",
              step === 1 ? "bg-primary" : "bg-border",
            )}
            aria-hidden="true"
          />
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-card">
        {/* Icon + heading */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Building2
              className="h-6 w-6 text-primary"
              aria-hidden="true"
              strokeWidth={1.5}
            />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Create your workspace
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A workspace holds your team&apos;s tasks and Discord integration.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-name">
              Workspace name{" "}
              <span aria-hidden="true" className="text-danger">
                *
              </span>
              <span className="sr-only">(required)</span>
            </Label>
            <Input
              id="workspace-name"
              type="text"
              autoComplete="organization"
              placeholder="Acme Engineering"
              value={workspaceName}
              onChange={(e) => {
                setWorkspaceName(e.target.value);
                if (nameError) setNameError(null);
              }}
              onBlur={() => setNameError(validateName(workspaceName))}
              aria-required="true"
              aria-describedby={
                nameError ? "workspace-name-error" : "workspace-name-hint"
              }
              aria-invalid={nameError ? "true" : undefined}
              className={
                nameError ? "border-danger focus-visible:ring-danger" : ""
              }
              maxLength={60}
            />
            {!nameError && (
              <p
                id="workspace-name-hint"
                className="text-xs text-muted-foreground"
              >
                Usually your team or company name.
              </p>
            )}
            {nameError && (
              <p
                id="workspace-name-error"
                role="alert"
                className="text-xs text-danger"
              >
                {nameError}
              </p>
            )}
          </div>

          {/* Primary CTA */}
          <Button
            type="submit"
            className="mt-6 w-full"
            loading={loading}
          >
            <Zap className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
            Create workspace
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          AI suggestions only — you always stay in control.
        </p>
      </div>
    </main>
  );
}
