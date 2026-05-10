-- Migration 006: RLS policies for reference, fact, and aggregate tables.
--
-- Access model (per DESIGN_DECISIONS.md):
--   * Reference tables — authenticated users read; only admins manage.
--   * Fact tables       — authenticated users read; ONLY service role writes
--                         (Edge Functions bypass RLS via the service-role key).
--   * Aggregate tables  — authenticated users read; ONLY service role writes
--                         (refreshed by ingest functions at end of each run).
--
-- Every policy is scoped `to authenticated` so the anon role gets nothing —
-- an unauthenticated client cannot read or write anything in this database.
--
-- The admin/editor/viewer split applies to write paths on tables that humans
-- mutate (reference data, alert resolution in migration 007). Read paths are
-- uniformly `authenticated` — viewer/editor/admin all see everything in scope.
-- That mirrors the brief: "Viewer: read-only" means read EVERYTHING, not read
-- a subset. Per-row data hiding is not a requirement on this dashboard.
--
-- One open item to flag (NOT solved by this migration): if Supabase Auth allows
-- public signup, anyone with the project URL + anon key can self-register and
-- get viewer access to financial data. The supervisor needs to disable public
-- signup in the Supabase dashboard (Auth → Sign-up disabled, or use invite-only)
-- before this dashboard goes live with real data. Logged in PROGRESS.md.


-- ============================================================================
-- Reference tables — authenticated read, admin manage.
-- ============================================================================

-- brands
create policy "authenticated read"
  on public.brands for select to authenticated using (true);
create policy "admins manage"
  on public.brands for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- locations
create policy "authenticated read"
  on public.locations for select to authenticated using (true);
create policy "admins manage"
  on public.locations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- location_aliases
create policy "authenticated read"
  on public.location_aliases for select to authenticated using (true);
create policy "admins manage"
  on public.location_aliases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- purposes
create policy "authenticated read"
  on public.purposes for select to authenticated using (true);
create policy "admins manage"
  on public.purposes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- purpose_aliases
create policy "authenticated read"
  on public.purpose_aliases for select to authenticated using (true);
create policy "admins manage"
  on public.purpose_aliases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- expense_categories
create policy "authenticated read"
  on public.expense_categories for select to authenticated using (true);
create policy "admins manage"
  on public.expense_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- plot_types — admin-managed even though the canonical list is fixed; an admin
-- might still need to update display_order or description.
create policy "authenticated read"
  on public.plot_types for select to authenticated using (true);
create policy "admins manage"
  on public.plot_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- realtor_managers
create policy "authenticated read"
  on public.realtor_managers for select to authenticated using (true);
create policy "admins manage"
  on public.realtor_managers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- customer_service_reps
create policy "authenticated read"
  on public.customer_service_reps for select to authenticated using (true);
create policy "admins manage"
  on public.customer_service_reps for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- complaint_categories
create policy "authenticated read"
  on public.complaint_categories for select to authenticated using (true);
create policy "admins manage"
  on public.complaint_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- complaint_aliases
create policy "authenticated read"
  on public.complaint_aliases for select to authenticated using (true);
create policy "admins manage"
  on public.complaint_aliases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- Fact tables — authenticated read only. Writes are service-role only.
-- ============================================================================

create policy "authenticated read"
  on public.marketing_expenses for select to authenticated using (true);

create policy "authenticated read"
  on public.bank_deposits for select to authenticated using (true);

create policy "authenticated read"
  on public.weekly_sales for select to authenticated using (true);

create policy "authenticated read"
  on public.customer_files for select to authenticated using (true);

create policy "authenticated read"
  on public.customer_support_logs for select to authenticated using (true);

create policy "authenticated read"
  on public.realtor_manager_weekly for select to authenticated using (true);


-- ============================================================================
-- Aggregate tables — authenticated read only. Writes are service-role only.
-- ============================================================================

create policy "authenticated read"
  on public.marketing_monthly for select to authenticated using (true);

create policy "authenticated read"
  on public.customer_support_monthly for select to authenticated using (true);

create policy "authenticated read"
  on public.sales_by_location_monthly for select to authenticated using (true);
