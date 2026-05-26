/**
 * Drizzle schema — mirrors docs/DATABASE.md exactly.
 * Vector column uses drizzle-orm/pg-core's `vector` type (requires pgvector).
 */
import { pgTable, text, timestamp, uuid, jsonb, index, primaryKey } from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS, DEFAULT_WORKSPACE_SETTINGS, type WorkspaceSettings } from "@aicrm/shared";

// ── users ──────────────────────────────────────────────────────────────────────
// The `id` mirrors the Supabase Auth user id — inserted by the web app after
// sign-up, not auto-generated here.
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  // Discord user id — when set, lets the bot map @mentions to this app user
  // and auto-assign captured tasks.
  discordId: text("discord_id").unique(),
  // IANA timezone (e.g. "America/Los_Angeles"). Used for per-user EOD scheduling.
  timezone: text("timezone").notNull().default("UTC"),
});

// ── workspace_members ──────────────────────────────────────────────────────────
// Multi-user workspace membership. The owner has role='owner' (auto-added);
// invitees become role='member' on first /me after their invite is accepted.
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // owner | member
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_members_user_idx").on(table.userId),
  ],
);

// ── workspace_invites ─────────────────────────────────────────────────────────
// Pending email invites. On /me, any invite matching the auth user's email is
// auto-accepted: a workspace_members row is inserted and the invite marked accepted.
export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    status: text("status").notNull().default("pending"), // pending | accepted | cancelled
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("workspace_invites_email_idx").on(table.email),
    index("workspace_invites_ws_idx").on(table.workspaceId),
  ],
);

// ── workspaces ─────────────────────────────────────────────────────────────────
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Per-workspace configurable settings (JSONB, NOT NULL, defaults to shared constant).
    settings: jsonb("settings")
      .notNull()
      .default(DEFAULT_WORKSPACE_SETTINGS)
      .$type<WorkspaceSettings>(),
    // Discord integration columns (nullable).
    discordGuildId: text("discord_guild_id"),
    discordGuildName: text("discord_guild_name"),
    discordChannelName: text("discord_channel_name"),
    // Last time the auto-EOD standup was posted (used for dedup across restarts).
    lastStandupAt: timestamp("last_standup_at", { withTimezone: true }),
  },
  (table) => [
    // Index for per-owner workspace lookups (GET /workspaces).
    index("workspaces_owner_id_idx").on(table.ownerId),
  ]
);

// ── tasks ──────────────────────────────────────────────────────────────────────
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    // Stored as text with the union values; Zod enforces the enum at the app layer.
    priority: text("priority").notNull().default("medium"), // low | medium | high
    deadline: text("deadline"), // natural language allowed
    status: text("status").notNull().default("active"), // active | blocked | completed
    sourceMessage: text("source_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Composite index for sidebar/dashboard grouping (GET /tasks?grouped=true).
    index("tasks_workspace_id_status_idx").on(table.workspaceId, table.status),
    // Index for per-developer task queries.
    index("tasks_assigned_user_id_idx").on(table.assignedUserId),
  ]
);

// ── reminders ─────────────────────────────────────────────────────────────────
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"), // pending | sent | cancelled
    type: text("type").notNull(), // inactive_task | approaching_deadline | stale_work
  },
  (table) => [
    // Index for due-reminder scans (reminders worker polls this).
    index("reminders_status_remind_at_idx").on(table.status, table.remindAt),
  ]
);

// ── repo_embeddings ───────────────────────────────────────────────────────────
// NOTE: The pgvector HNSW ANN index on `embedding` cannot be expressed with the
// Drizzle `index()` API (it requires custom access method + operator class).
// The raw DDL is in apps/api/drizzle/0001_indexes.sql — apply it manually.
export const repoEmbeddings = pgTable("repo_embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  chunkText: text("chunk_text").notNull(),
  // Dimension matches EMBEDDING_DIMENSIONS (1536 for text-embedding-3-small).
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
});
