"use client";

/**
 * CreateTaskModal — extracted shared component.
 * Used by both /dashboard and /tasks pages.
 */

import React, { useEffect, useRef, useState } from "react";
import type { Task } from "@aicrm/shared";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createTask, getErrorMessage } from "@/lib/api";

export interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  onCreated: (task: Task) => void;
}

export function CreateTaskModal({
  open,
  onClose,
  workspaceId,
  onCreated,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [deadline, setDeadline] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset + focus when modal opens
  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setPriority("medium");
      setDeadline("");
      setTitleError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("Title is required.");
      inputRef.current?.focus();
      return;
    }
    setTitleError(null);
    setLoading(true);

    try {
      const task = await createTask({
        workspaceId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        deadline: deadline.trim() || null,
        status: "active",
      });
      toast.success("Task created.", { description: task.title });
      onCreated(task);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create task."));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Scrim */}
      <div
        className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-modal-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[300] w-full max-w-md -translate-x-1/2 -translate-y-1/2",
          "rounded-xl border border-border bg-card p-6 shadow-xl",
          "transition-all duration-200 ease-out",
        )}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="create-task-modal-title"
            className="text-base font-semibold text-foreground"
          >
            New task
          </h2>
          <button
            onClick={onClose}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "transition-colors duration-150",
            )}
            aria-label="Close create task dialog"
          >
            <X className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-task-title">
              Title{" "}
              <span aria-hidden="true" className="text-danger">*</span>
              <span className="sr-only">(required)</span>
            </Label>
            <Input
              id="new-task-title"
              ref={inputRef}
              type="text"
              placeholder="e.g. Fix auth refresh issue"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(null);
              }}
              aria-required="true"
              aria-invalid={titleError ? "true" : undefined}
              aria-describedby={titleError ? "new-task-title-error" : undefined}
              className={titleError ? "border-danger focus-visible:ring-danger" : ""}
              maxLength={200}
            />
            {titleError && (
              <p
                id="new-task-title-error"
                role="alert"
                className="text-xs text-danger"
              >
                {titleError}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-task-description">Description</Label>
            <textarea
              id="new-task-description"
              rows={2}
              placeholder="Optional details…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={cn(
                "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base",
                "placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "resize-none text-foreground transition-colors duration-150",
              )}
              maxLength={1000}
            />
          </div>

          {/* Priority + Deadline */}
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="new-task-priority">Priority</Label>
              <select
                id="new-task-priority"
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as "low" | "medium" | "high")
                }
                className={cn(
                  "flex min-h-[2.75rem] w-full rounded-md border border-input",
                  "bg-transparent px-3 py-2 text-base text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "transition-colors duration-150",
                )}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="new-task-deadline">Deadline</Label>
              <Input
                id="new-task-deadline"
                type="text"
                placeholder="before deployment, Fri…"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={loading}>
              <Plus className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
              Create task
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
