// patentpending.app — "What's Next" Phase Progress Widget
// Drop into: components/dashboard/PatentPhaseWidget.tsx
// Requires: Tailwind CSS (already in stack)
// Usage: <PatentPhaseWidget patents={patents} />

"use client";

import { useState } from "react";

// ── Types (matches your lib/supabase.ts) ────────────────────────────────────
type PatentStatus =
  | "provisional"
  | "provisional_draft"
  | "non_provisional"
  | "published"
  | "granted"
  | "abandoned"
  | "research_import";

interface Patent {
  id: string;
  title: string;
  status: PatentStatus;
  provisional_number?: string | null;
  application_number?: string | null;
  filing_date?: string | null;
  provisional_deadline?: string | null;
  non_provisional_deadline?: string | null;
  current_phase?: number | null; // 1–7
  filing_status?: string | null;
  claims_status?: string | null;
  claims_draft?: string | null;
  abstract_draft?: string | null;
  intake_session_id?: string | null;
  payment_confirmed_at?: string | null;
  stripe_checkout_session_id?: string | null;
  tags?: string[];
  is_listed?: boolean;
  asking_price?: number | null;
  uspto_status?: string | null;
  last_uspto_check?: string | null;
  description?: string | null;
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
  // Post-filing fields
  provisional_app_number?: string | null;
  provisional_filed_at?: string | null;
  nonprov_deadline_at?: string | null;
}

// ── Phase definitions ────────────────────────────────────────────────────────
const PHASES = [
  {
    number: 1,
    name: "Intake",
    short: "Intake",
    description: "Summarize invention, confirm deadline, entity status, key claims",
    icon: "⬡",
  },
  {
    number: 2,
    name: "Spec Gap Analysis",
    short: "Gap Analysis",
    description: "Structured gap report before any spec edits",
    icon: "⬡",
  },
  {
    number: 3,
    name: "Claims Development",
    short: "Claims",
    description: "Independent claims first, then dependent, check types throughout",
    icon: "⬡",
  },
  {
    number: 4,
    name: "Drawings",
    short: "Drawings",
    description: "Figure briefs first, one figure at a time, inventor approves each",
    icon: "⬡",
  },
  {
    number: 5,
    name: "Forms Package",
    short: "Forms",
    description: "ADS (PTO/AIA/14), Oath (PTO/AIA/01), Cover Sheet (SB/16)",
    icon: "⬡",
  },
  {
    number: 6,
    name: "Filing Assembly",
    short: "Assembly",
    description: "Filing package assembly + index",
    icon: "⬡",
  },
  {
    number: 7,
    name: "Filing Day",
    short: "File",
    description: "Filing day checklist + post-filing confirmation",
    icon: "⬡",
  },
];

// ── Next action map (phase → action prompt) ──────────────────────────────────
const NEXT_ACTIONS: Record<number, string> = {
  1: "Complete patent intake card — enter provisional number, filing date, entity status",
  2: "Run spec gap analysis — Pattie will generate structured gap report",
  3: "Draft independent claims — Pattie drafts, you review and approve",
  4: "Generate figure briefs — describe each drawing, approve one at a time",
  5: "Complete forms package — ADS, Inventor Oath, Cover Sheet",
  6: "Assemble filing package — index all docs, validate PDF versions",
  7: "Execute filing day checklist — upload to Patent Center, confirm receipt",
};

// ── Urgency helpers ───────────────────────────────────────────────────────────
function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function urgencyColor(days: number | null): string {
  if (days === null) return "text-zinc-500";
  if (days <= 30) return "text-red-400";
  if (days <= 90) return "text-amber-400";
  return "text-emerald-400";
}

function urgencyBg(days: number | null): string {
  if (days === null) return "bg-zinc-800/50 border-zinc-700/50";
  if (days <= 30) return "bg-red-950/40 border-red-800/50";
  if (days <= 90) return "bg-amber-950/40 border-amber-800/50";
  return "bg-emerald-950/30 border-emerald-800/40";
}

// ── Phase bar sub-component ───────────────────────────────────────────────────
function PhaseBar({
  currentPhase,
  compact = false,
}: {
  currentPhase: number;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-0 w-full">
      {PHASES.map((phase, idx) => {
        const done = phase.number < currentPhase;
        const active = phase.number === currentPhase;
        const upcoming = phase.number > currentPhase;

        return (
          <div key={phase.number} className="flex items-center flex-1 min-w-0">
            {/* Node */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                title={phase.name}
                className={`
                  relative flex items-center justify-center rounded-full text-xs font-bold
                  transition-all duration-300
                  ${compact ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs"}
                  ${
                    done
                      ? "bg-amber-500 text-black"
                      : active
                      ? "bg-amber-400 text-black ring-2 ring-amber-300/50 ring-offset-1 ring-offset-zinc-950 shadow-[0_0_12px_rgba(251,191,36,0.4)]"
                      : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                  }
                `}
              >
                {done ? "✓" : phase.number}
              </div>
              {!compact && (
                <span
                  className={`mt-1 text-[9px] font-medium tracking-wide uppercase truncate max-w-[52px] text-center
                  ${active ? "text-amber-300" : done ? "text-zinc-400" : "text-zinc-600"}`}
                >
                  {phase.short}
                </span>
              )}
            </div>

            {/* Connector line */}
            {idx < PHASES.length - 1 && (
              <div
                className={`flex-1 h-px mx-1 transition-all duration-500
                ${done ? "bg-amber-500" : "bg-zinc-700"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Single patent card ────────────────────────────────────────────────────────
function PatentCard({ patent }: { patent: Patent }) {
  const [expanded, setExpanded] = useState(false);
  const phase = patent.current_phase ?? 1;
  const phaseInfo = PHASES[phase - 1];
  const nextAction = NEXT_ACTIONS[phase];

  const isProvisionalFiled = patent.filing_status === 'provisional_filed'
  const deadline = isProvisionalFiled
    ? patent.nonprov_deadline_at  // post-filing: show NP countdown
    : patent.provisional_deadline || patent.non_provisional_deadline
  const days = daysUntil(deadline);

  return (
    <div
      className={`
        rounded-xl border transition-all duration-200 overflow-hidden
        ${isProvisionalFiled ? 'bg-emerald-950/20 border-emerald-800/40' : urgencyBg(days)}
        hover:border-amber-700/50 hover:shadow-lg hover:shadow-amber-950/20
      `}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-zinc-100 truncate leading-snug">
              {patent.title}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5 font-mono">
              {isProvisionalFiled && patent.provisional_app_number
                ? patent.provisional_app_number
                : patent.provisional_number || patent.application_number || "No number on file"}
            </p>
            {isProvisionalFiled && days !== null && (
              <p className={`text-xs mt-0.5 font-medium ${
                days <= 30 ? 'text-red-400' : days <= 90 ? 'text-amber-400' : days <= 180 ? 'text-yellow-400' : 'text-emerald-400'
              }`}>
                Non-provisional due in {days}d
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isProvisionalFiled ? (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 rounded-full">
                Filed ✓
              </span>
            ) : days !== null && (
              <span className={`text-xs font-bold tabular-nums ${urgencyColor(days)}`}>
                {days <= 0 ? "OVERDUE" : `${days}d`}
              </span>
            )}
            <span
              className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border
              ${
                patent.status === "provisional"
                  ? "text-amber-400 border-amber-800/60 bg-amber-950/40"
                  : patent.status === "non_provisional"
                  ? "text-blue-400 border-blue-800/60 bg-blue-950/40"
                  : patent.status === "granted"
                  ? "text-emerald-400 border-emerald-800/60 bg-emerald-950/40"
                  : "text-zinc-400 border-zinc-700/60 bg-zinc-900/40"
              }`}
            >
              {patent.status.replace("_", " ")}
            </span>
          </div>
        </div>

        {/* Compact phase bar */}
        <PhaseBar currentPhase={phase} compact />

        {/* Next action teaser */}
        <div className="mt-3 flex items-start gap-2">
          <span className="text-amber-400 text-xs mt-px">→</span>
          <p className="text-xs text-zinc-300 leading-relaxed">
            <span className="text-amber-400 font-semibold">Phase {phase}: {phaseInfo.name} — </span>
            {nextAction}
          </p>
        </div>
      </button>

      {/* Expanded phase detail */}
      {expanded && (
        <div className="border-t border-zinc-800/80 px-5 py-4 bg-zinc-950/40">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-4">
            All Phases
          </p>
          <div className="space-y-2">
            {PHASES.map((p) => {
              const done = p.number < phase;
              const active = p.number === phase;
              return (
                <div
                  key={p.number}
                  className={`flex items-start gap-3 py-2 px-3 rounded-lg transition-colors
                  ${active ? "bg-amber-950/30 border border-amber-800/40" : "border border-transparent"}`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-px
                    ${done ? "bg-amber-500 text-black" : active ? "bg-amber-400 text-black" : "bg-zinc-800 text-zinc-500"}`}
                  >
                    {done ? "✓" : p.number}
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${active ? "text-amber-300" : done ? "text-zinc-400" : "text-zinc-500"}`}>
                      {p.name}
                    </p>
                    <p className="text-[11px] text-zinc-500 leading-relaxed mt-0.5">
                      {p.description}
                    </p>
                    {active && (
                      <p className="text-[11px] text-amber-400/90 mt-1 font-medium">
                        ↳ {nextAction}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────
export default function PatentPhaseWidget({ patents }: { patents: Patent[] }) {
  const activePatents = patents.filter((p) => p.status !== "abandoned" && p.status !== "granted");

  return (
    <div className="w-full">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold tracking-widest uppercase text-zinc-300">
            What's Next
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {activePatents.length} active patent{activePatents.length !== 1 ? "s" : ""} in progress
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-medium">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />≤30d</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />≤90d</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />&gt;90d</span>
        </div>
      </div>

      {/* Patent cards */}
      {activePatents.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-500 text-sm">No active patents. Register your first patent to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activePatents
            .sort((a, b) => {
              const da = daysUntil(a.filing_status === 'provisional_filed' ? a.nonprov_deadline_at : (a.provisional_deadline || a.non_provisional_deadline)) ?? 999;
              const db = daysUntil(b.filing_status === 'provisional_filed' ? b.nonprov_deadline_at : (b.provisional_deadline || b.non_provisional_deadline)) ?? 999;
              return da - db; // most urgent first
            })
            .map((patent) => (
              <PatentCard key={patent.id} patent={patent} />
            ))}
        </div>
      )}
    </div>
  );
}

// ── Dashboard page usage example ─────────────────────────────────────────────
//
// In app/dashboard/page.tsx:
//
// import PatentPhaseWidget from "@/components/dashboard/PatentPhaseWidget";
//
// const { data: patents } = await supabase
//   .from("patents")
//   .select("*")
//   .eq("owner_id", session.user.id);
//
// <PatentPhaseWidget patents={patents ?? []} />
//
// ── DB note ──────────────────────────────────────────────────────────────────
//
// Add `current_phase` column to patents table:
//
// ALTER TABLE patents ADD COLUMN current_phase smallint DEFAULT 1 CHECK (current_phase BETWEEN 1 AND 7);
//
// BoClaw updates this as each phase completes.
