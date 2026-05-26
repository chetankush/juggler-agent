"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Mail, Github, Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Flow 1 — Login screen.
 * Primary: email + password (sign in / sign up). Secondary: magic link + OAuth.
 * Visible labels, password show/hide, errors below field with role="alert".
 */
type Mode = "signin" | "signup";
type Info = { title: string; body: string } | null;

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"github" | null>(null);
  const [info, setInfo] = useState<Info>(null);

  // Carry an extension sign-in `redirect_uri` (vscode://…) through the flow.
  function getRedirectUri(): string | null {
    return new URLSearchParams(window.location.search).get("redirect_uri");
  }
  function buildCallbackUrl(): string {
    const redirectUri = getRedirectUri();
    const base = `${window.location.origin}/auth/callback`;
    return redirectUri
      ? `${base}?redirect_uri=${encodeURIComponent(redirectUri)}`
      : base;
  }

  function validateEmail(value: string): string | null {
    if (!value.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      return "Enter a valid email address.";
    return null;
  }
  function validatePassword(value: string): string | null {
    if (!value) return "Password is required.";
    if (value.length < 6) return "Password must be at least 6 characters.";
    return null;
  }

  // After a password sign-in, send the session into VS Code if this was an
  // extension handshake; otherwise go to the dashboard.
  async function completeSignIn() {
    const redirectUri = getRedirectUri();
    if (redirectUri?.startsWith("vscode://")) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      window.location.href = `${redirectUri}?token=${encodeURIComponent(token)}`;
      return;
    }
    // Full navigation so the new auth cookies reach the server middleware.
    window.location.href = "/dashboard";
  }

  async function handlePasswordAuth(e: React.FormEvent) {
    e.preventDefault();
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) {
      document.getElementById(eErr ? "email" : "password")?.focus();
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          toast.error("Sign-in failed.", { description: error.message });
          return;
        }
        await completeSignIn();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: buildCallbackUrl() },
        });
        if (error) {
          toast.error("Sign-up failed.", { description: error.message });
          return;
        }
        if (data.session) {
          await completeSignIn();
        } else {
          setInfo({
            title: "Confirm your email",
            body: `We sent a confirmation link to ${email}. Click it to finish creating your account.`,
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    const eErr = validateEmail(email);
    if (eErr) {
      setEmailError(eErr);
      document.getElementById("email")?.focus();
      return;
    }
    setMagicLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: buildCallbackUrl() },
    });
    setMagicLoading(false);
    if (error) {
      toast.error("Could not send link.", { description: error.message });
    } else {
      setInfo({
        title: "Check your inbox",
        body: `We sent a magic link to ${email}.`,
      });
    }
  }

  async function handleGitHubOAuth() {
    setOauthLoading("github");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: buildCallbackUrl() },
    });
    if (error) {
      toast.error("GitHub sign-in failed.", { description: error.message });
      setOauthLoading(null);
    }
  }

  const isSignup = mode === "signup";

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-12"
      aria-label="Sign in"
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-card">
        {/* Wordmark */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Zap className="h-6 w-6 text-primary" aria-hidden="true" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">AI Sync Copilot</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isSignup ? "Create your account" : "Sign in to your workspace"}
            </p>
          </div>
        </div>

        {info ? (
          // ── Info / success state (magic link or signup confirmation) ──
          <div
            className="rounded-lg border border-success/30 bg-success/10 px-4 py-5 text-center"
            role="status"
            aria-live="polite"
          >
            <Mail className="mx-auto mb-2 h-8 w-8 text-success" aria-hidden="true" strokeWidth={1.5} />
            <p className="text-sm font-medium text-foreground">{info.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{info.body}</p>
            <button
              onClick={() => setInfo(null)}
              className="mt-4 text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            {/* ── Primary: email + password ──────────────────────────── */}
            <form onSubmit={handlePasswordAuth} noValidate className="flex flex-col gap-4">
              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">
                  Email address{" "}
                  <span aria-hidden="true" className="text-danger">*</span>
                  <span className="sr-only">(required)</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  onBlur={() => setEmailError(validateEmail(email))}
                  aria-required="true"
                  aria-describedby={emailError ? "email-error" : undefined}
                  aria-invalid={emailError ? "true" : undefined}
                  className={emailError ? "border-danger focus-visible:ring-danger" : ""}
                />
                {emailError && (
                  <p id="email-error" role="alert" className="text-xs text-danger">
                    {emailError}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">
                  Password{" "}
                  <span aria-hidden="true" className="text-danger">*</span>
                  <span className="sr-only">(required)</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError(null);
                    }}
                    onBlur={() => setPasswordError(validatePassword(password))}
                    aria-required="true"
                    aria-describedby={passwordError ? "password-error" : undefined}
                    aria-invalid={passwordError ? "true" : undefined}
                    className={cn(
                      "pr-10",
                      passwordError ? "border-danger focus-visible:ring-danger" : "",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                    )}
                  </button>
                </div>
                {passwordError && (
                  <p id="password-error" role="alert" className="text-xs text-danger">
                    {passwordError}
                  </p>
                )}
              </div>

              {/* Primary CTA */}
              <Button type="submit" className="w-full" loading={loading}>
                {isSignup ? (
                  <UserPlus className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                ) : (
                  <LogIn className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                )}
                {isSignup ? "Create account" : "Sign in"}
              </Button>
            </form>

            {/* Sign in / up toggle */}
            <p className="mt-4 text-center text-xs text-muted-foreground">
              {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(isSignup ? "signin" : "signup");
                  setEmailError(null);
                  setPasswordError(null);
                }}
                className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {isSignup ? "Sign in" : "Sign up"}
              </button>
            </p>

            {/* ── Divider ────────────────────────────────────────────── */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>

            {/* ── Secondary: magic link + OAuth ──────────────────────── */}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleMagicLink}
                loading={magicLoading}
              >
                <Mail className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                Email me a magic link
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGitHubOAuth}
                loading={oauthLoading === "github"}
              >
                <Github className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                Continue with GitHub
              </Button>
            </div>
          </>
        )}

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
          <a href="#" className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Terms
          </a>{" "}
          &amp;{" "}
          <a href="#" className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Privacy
          </a>
          .
        </p>
      </div>
    </main>
  );
}
