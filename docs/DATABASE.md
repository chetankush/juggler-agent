# Database

PostgreSQL on Supabase, with the `pgvector` extension enabled. Schema is managed with **Drizzle** (`apps/api/src/db/schema.ts`).

## Extensions

```sql
create extension if not exists vector;
```

## Tables

### users

| Column | Type | Notes |
|--------|------|-------|
| id     | uuid | PK (Supabase Auth user id) |
| email  | text | unique |
| name   | text | |

### workspaces

| Column   | Type | Notes |
|----------|------|-------|
| id       | uuid | PK |
| owner_id | uuid | FK → users.id |
| name     | text | |

### tasks

| Column           | Type    | Notes |
|------------------|---------|-------|
| id               | uuid    | PK |
| workspace_id     | uuid    | FK → workspaces.id |
| assigned_user_id | uuid    | FK → users.id (nullable) |
| title            | text    | |
| description      | text    | |
| priority         | text    | `low` \| `medium` \| `high` |
| deadline         | text    | natural language allowed (e.g. "before deployment") |
| status           | text    | `active` \| `blocked` \| `completed` |
| source_message   | text    | original Discord message |

### reminders

| Column    | Type      | Notes |
|-----------|-----------|-------|
| id        | uuid      | PK |
| task_id   | uuid      | FK → tasks.id |
| remind_at | timestamp | |
| status    | text      | `pending` \| `sent` \| `cancelled` |

### repo_embeddings

| Column       | Type         | Notes |
|--------------|--------------|-------|
| id           | uuid         | PK |
| workspace_id | uuid         | FK → workspaces.id |
| file_path    | text         | |
| chunk_text   | text         | |
| embedding    | vector(1536) | pgvector; dimension matches the embedding model |

> **Note:** `embedding` dimension must match the OpenRouter embedding model output. Adjust `vector(N)` if the chosen model differs from 1536.

## Relationships

```
users 1──* workspaces (owner_id)
workspaces 1──* tasks
users 1──* tasks (assigned_user_id)
tasks 1──* reminders
workspaces 1──* repo_embeddings
```
