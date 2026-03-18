-- Migration: research_saved_queries table
-- Session: cont.40 / Prompt 47A
-- Date: 2026-03-18

create table if not exists research_saved_queries (
  id               uuid        primary key default gen_random_uuid(),
  created_at       timestamptz default now(),
  label            text        not null,                        -- e.g. "READI prior art sweep"
  cpc_codes        text[],                                      -- e.g. ['G06Q', 'H04W']
  keywords         text[],                                      -- e.g. ['emergency alert', 'location aware']
  patent_id        uuid        references patents(id) on delete set null,
  is_active        boolean     default true,
  last_run_at      timestamptz,
  last_result_count int        default 0
);

-- RLS: admin only
alter table research_saved_queries enable row level security;

create policy "Admin only" on research_saved_queries
  using (auth.jwt() ->> 'email' = current_setting('app.admin_email', true));

-- Index for cron query
create index if not exists idx_rsq_active on research_saved_queries (is_active, last_run_at);
