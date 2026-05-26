-- Row-Level Security policies (Supabase). The API uses the service role and
-- bypasses RLS; these protect direct anon-key access (defense-in-depth).
-- Re-runnable: each policy is dropped first.

DROP POLICY IF EXISTS users_self_select ON users;
CREATE POLICY users_self_select ON users
  FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS users_self_update ON users;
CREATE POLICY users_self_update ON users
  FOR UPDATE TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS workspaces_owner_all ON workspaces;
CREATE POLICY workspaces_owner_all ON workspaces
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS tasks_workspace_owner_all ON tasks;
CREATE POLICY tasks_workspace_owner_all ON tasks
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS reminders_owner_all ON reminders;
CREATE POLICY reminders_owner_all ON reminders
  FOR ALL TO authenticated
  USING (task_id IN (
    SELECT t.id FROM tasks t JOIN workspaces w ON t.workspace_id = w.id
    WHERE w.owner_id = auth.uid()
  ))
  WITH CHECK (task_id IN (
    SELECT t.id FROM tasks t JOIN workspaces w ON t.workspace_id = w.id
    WHERE w.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS repo_embeddings_owner_all ON repo_embeddings;
CREATE POLICY repo_embeddings_owner_all ON repo_embeddings
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));
