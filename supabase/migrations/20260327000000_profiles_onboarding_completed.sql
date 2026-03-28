-- Migration: add onboarding_completed to profiles
-- P16: Inventor Onboarding — First 10 Minutes
-- Date: 2026-03-27

alter table profiles
  add column if not exists onboarding_completed boolean not null default false;
