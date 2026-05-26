"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Plug,
  Settings,
  Users,
  Zap,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Tasks",
    href: "/tasks",
    icon: CheckSquare,
  },
  {
    label: "Team",
    href: "/team",
    icon: Users,
  },
  {
    label: "Integrations",
    href: "/integrations",
    icon: Plug,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
] as const;

interface AppSidebarProps {
  /** Mobile: controlled open state */
  open?: boolean;
  /** Mobile: close callback */
  onClose?: () => void;
}

export function AppSidebar({ open, onClose }: AppSidebarProps) {
  const pathname = usePathname();

  const SidebarContent = (
    <nav
      aria-label="Main navigation"
      className="flex h-full flex-col"
    >
      {/* Logo / wordmark */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <Zap
          className="h-5 w-5 text-primary"
          aria-hidden="true"
          strokeWidth={1.5}
        />
        <span className="text-base font-semibold tracking-tight text-foreground">
          AI Sync Copilot
        </span>
        {/* Mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            className={cn(
              "ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "lg:hidden",
            )}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Nav links */}
      <ul className="flex flex-1 flex-col gap-1 p-3" role="list">
        {navItems.map(({ label, href, icon: Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(href + "/");

          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onClose}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  // Base
                  "group flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium",
                  "transition-colors duration-150",
                  // Focus ring — never remove
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  // States
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors duration-150",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
                {label}
                {/* Active indicator line */}
                {isActive && (
                  <span
                    className="ml-auto h-1.5 w-1.5 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Footer hint */}
      <div className="border-t border-border p-4">
        <p className="text-xs text-muted-foreground">
          AI suggestions only — you decide.
        </p>
      </div>
    </nav>
  );

  // This component is used in two modes from the layout:
  //  - no props  → the persistent desktop sidebar
  //  - open/onClose → the mobile drawer
  // Render only the relevant one so desktop doesn't get two sidebars.
  const isDrawer = open !== undefined;

  return (
    <>
      {/* ── Desktop sidebar (≥1024px) ──────────────────────────────────── */}
      {!isDrawer && (
        <aside
          className={cn(
            "hidden lg:flex lg:w-56 lg:flex-col",
            "h-full border-r border-border bg-card",
          )}
          aria-label="Sidebar"
        >
          {SidebarContent}
        </aside>
      )}

      {/* ── Mobile drawer overlay ───────────────────────────────────────── */}
      {isDrawer && (
        <>
          {/* Scrim */}
          <div
            className={cn(
              "fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm lg:hidden",
              "transition-opacity duration-200",
              open ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-[200] w-64 flex-col border-r border-border bg-card",
              "flex lg:hidden",
              "transition-transform duration-250 ease-out",
              open ? "translate-x-0" : "-translate-x-full",
            )}
            aria-label="Mobile navigation"
            aria-modal={open}
            role="dialog"
          >
            {SidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
