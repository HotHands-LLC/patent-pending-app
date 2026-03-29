-- Migration: add utm_source attribution to patent_profiles
-- P22: Homepage UTM Routing + Landing Page Intelligence
-- Date: 2026-03-27

alter table patent_profiles
  add column if not exists utm_source text;

comment on column patent_profiles.utm_source is
  'First-touch UTM source captured at signup (e.g. reddit, linkedin, email). Used for channel attribution.';
