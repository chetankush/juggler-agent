import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Base — always includes icon+text, not color-only (a11y rule)
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/15 text-primary",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-danger/15 text-danger",
        outline:
          "border-border text-foreground",
        // Status variants (mirror design-system tokens)
        active:
          "border-transparent bg-primary/15 text-primary",
        blocked:
          "border-transparent bg-warning/15 text-warning",
        completed:
          "border-transparent bg-success/15 text-success",
        // Priority variants
        high:
          "border-transparent bg-danger/15 text-danger",
        medium:
          "border-transparent bg-warning/15 text-warning",
        low:
          "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
