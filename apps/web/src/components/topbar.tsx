"use client";

import React from "react";
import { useTheme } from "next-themes";
import { Menu, Sun, Moon, Monitor, ChevronDown, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface TopbarProps {
  /** Mobile: open sidebar drawer callback */
  onMenuOpen?: () => void;
  /** Current workspace name (placeholder until API is wired) */
  workspaceName?: string;
  /** Current user display name */
  userName?: string | null;
  /** Current user email */
  userEmail?: string | null;
  /** Current user avatar URL */
  userAvatarUrl?: string | null;
}

function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "transition-colors duration-150",
          )}
          aria-label="Toggle color theme"
        >
          <Sun
            className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
            aria-hidden="true"
            strokeWidth={1.5}
          />
          <Moon
            className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
            aria-hidden="true"
            strokeWidth={1.5}
          />
          <span className="sr-only">Toggle theme</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar({
  onMenuOpen,
  workspaceName = "My Workspace",
  userName,
  userEmail,
  userAvatarUrl,
}: TopbarProps) {
  const router = useRouter();

  const initials = userName
    ? userName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : userEmail
    ? userEmail[0].toUpperCase()
    : "U";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header
      className={cn(
        "flex h-14 items-center gap-3 border-b border-border bg-card px-4",
        "sticky top-0 z-[40]",
      )}
    >
      {/* Mobile menu button */}
      <button
        onClick={onMenuOpen}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "transition-colors duration-150 lg:hidden",
        )}
        aria-label="Open navigation menu"
        aria-expanded={false}
      >
        <Menu className="h-5 w-5" aria-hidden="true" strokeWidth={1.5} />
      </button>

      {/* Workspace switcher placeholder */}
      {/* TODO: wire to real workspaces from API */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground",
              "hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "transition-colors duration-150",
            )}
            aria-label={`Workspace: ${workspaceName}. Click to switch.`}
          >
            <span className="max-w-[160px] truncate">{workspaceName}</span>
            <ChevronDown
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
              strokeWidth={1.5}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem aria-current="true">
            {workspaceName}
          </DropdownMenuItem>
          {/* TODO: list additional workspaces */}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <ThemeToggle />

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-2 rounded-md p-1",
              "hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "transition-colors duration-150",
            )}
            aria-label={`User menu for ${userName ?? userEmail ?? "user"}`}
          >
            <Avatar className="h-7 w-7">
              {userAvatarUrl && (
                <AvatarImage src={userAvatarUrl} alt={userName ?? "User avatar"} />
              )}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              {userName && (
                <span className="text-sm font-medium text-foreground">
                  {userName}
                </span>
              )}
              {userEmail && (
                <span className="text-xs text-muted-foreground truncate">
                  {userEmail}
                </span>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/settings">
              <User className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
              Settings
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSignOut}
            className="text-danger focus:text-danger"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
