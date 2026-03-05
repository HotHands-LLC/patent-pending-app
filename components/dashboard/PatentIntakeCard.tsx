// patentpending.app — Patent Intake Card
// Drop into: components/dashboard/PatentIntakeCard.tsx
// Shows for any patent where intake fields are incomplete (phase 1)
// On submit: updates patents table + advances current_phase to 2

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────
interface Patent {
  id: string;
  title: string;
  status: string;
  provisional_number?: string | null;
  application_number?: string | null;
  filing_date?: string | null;
  provisional_deadline?: string | null;
  inventors?: string[];
  current_phase?: number;
}

interface IntakeFormData {
  provisional_number: string;
  filing_date: string;
  provisional_deadline: string;
  entity_status: "micro" | "small" | "large";
  inventors: string; // comma-separated
  uspto_account: string;
  invention_summary: string;
}

// ── Entity status info ────────────────────────────────────────────────────────
const ENTITY_STATUS_INFO = {
  micro:  { label: "Micro Entity",  fee: "~$320",   note: "≤$239k gross income, ≤4 prior patents" },
  small:  { label: "Small Entity",  fee: "~$640",   note: "Individual, small biz, or nonprofit" },
  large:  { label: "Large Entity",  fee: "~$1,600", note: "Corporation >500 employees" },
};

// ── Is intake complete? ───────────────────────────────────────────────────────
function intakeComplete(patent: Patent): boolean {
  return !!(
    patent.provisional_number &&
    patent.filing_date &&
    patent.provisional_deadline &&
    patent.inventors?.length
  );
}

// ── Auth helper (same pattern as ReviewQueue) ─────────────────────────────────
async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

// ── Single intake form ────────────────────────────────────────────────────────
function IntakeForm({
  patent,
  onComplete,
}: {
  patent: Patent;
  onComplete: (id: string) => void;
}) {
  const [form, setForm] = useState<IntakeFormData>({
    provisional_number: patent.provisional_number || "",
    filing_date: patent.filing_date || "",
    provisional_deadline: patent.provisional_deadline || "",
    entity_status: "micro",
    inventors: patent.inventors?.join(", ") || "",
    uspto_account: "",
    invention_summary: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!intakeComplete(patent));

  const set = (k: keyof IntakeFormData, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Auto-calculate deadline (12 months from filing)
  const handleFilingDate = (v: string) => {
    set("filing_date", v);
    if (v && !form.provisional_deadline) {
      const d = new Date(v);
      d.setFullYear(d.getFullYear() + 1);
      set("provisional_deadline", d.toISOString().split("T")[0]);
    }
  };

  const handleSubmit = async () => {
    if (!form.provisional_number || !form.filing_date || !form.provisional_deadline) {
      setError("Provisional number, filing date, and deadline are required.");
      return;
    }
    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Session expired — please refresh."); setSaving(false); return; }

    const inventors = form.inventors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const { error: err } = await supabase
      .from("patents")
      .update({
        provisional_number: form.provisional_number,
        filing_date: form.filing_date,
        provisional_deadline: form.provisional_deadline,
        inventors,
        current_phase: 2, // advance to Spec Gap Analysis
        updated_at: new Date().toISOString(),
      })
      .eq("id", patent.id);

    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

    // Log intake completion to review queue (non-blocking)
    const authHeader = await getAuthHeader();
    fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({
        patent_id: patent.id,
        owner_id: user.id,
        draft_type: "misc",
        title: `${patent.title} — Intake Complete`,
        content: `Entity status: ${form.entity_status}\nUSPTO account: ${form.uspto_account || "not yet created"}\nInventors: ${form.inventors}\nSummary: ${form.invention_summary || "not provided"}`,
        version: 1,
      }),
    }).catch(() => {}); // non-blocking

    setSaving(false);
    onComplete(patent.id);
  };

  const complete = intakeComplete(patent);

  return (
    <div style={{
      borderRadius: 12,
      border: complete ? "1px solid rgba(5,150,105,0.3)" : "1px solid rgba(251,191,36,0.4)",
      background: complete ? "rgba(2,44,34,0.2)" : "rgba(69,26,3,0.2)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ width: "100%", textAlign: "left", padding: "14px 18px", background: "none", border: "none", cursor: "pointer" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 12, fontWeight: 700,
              background: complete ? "#059669" : "#92400e",
              color: "#fff",
            }}>
              {complete ? "✓" : "1"}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f4f4f5" }}>{patent.title}</div>
              <div style={{ fontSize: 10, color: complete ? "#34d399" : "#fbbf24", marginTop: 1, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {complete ? "Intake complete — Phase 2 unlocked" : "Phase 1: Intake required"}
              </div>
            </div>
          </div>
          <span style={{ color: "#52525b", fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Form */}
      {expanded && !complete && (
        <div style={{ borderTop: "1px solid rgba(39,39,42,0.8)", padding: "18px 18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>

            {/* Provisional number */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Provisional Application Number *</label>
              <input
                value={form.provisional_number}
                onChange={e => set("provisional_number", e.target.value)}
                placeholder="63/XXX,XXX"
                style={inputStyle}
              />
              <div style={hintStyle}>Found on your USPTO filing receipt email</div>
            </div>

            {/* Filing date */}
            <div>
              <label style={labelStyle}>Filing Date *</label>
              <input
                type="date"
                value={form.filing_date}
                onChange={e => handleFilingDate(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Deadline — auto-calculated */}
            <div>
              <label style={labelStyle}>12-Month Deadline *</label>
              <input
                type="date"
                value={form.provisional_deadline}
                onChange={e => set("provisional_deadline", e.target.value)}
                style={{ ...inputStyle, color: form.provisional_deadline ? "#fbbf24" : "#52525b" }}
              />
              <div style={hintStyle}>Auto-calculated from filing date</div>
            </div>

            {/* Entity status */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Entity Status *</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(Object.entries(ENTITY_STATUS_INFO) as [keyof typeof ENTITY_STATUS_INFO, typeof ENTITY_STATUS_INFO.micro][]).map(([key, info]) => (
                  <button
                    key={key}
                    onClick={() => set("entity_status", key)}
                    style={{
                      flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer",
                      background: form.entity_status === key ? "rgba(146,64,14,0.6)" : "#18181b",
                      border: form.entity_status === key ? "1px solid rgba(251,191,36,0.5)" : "1px solid #27272a",
                      transition: "all 0.15s",
                    } as React.CSSProperties}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: form.entity_status === key ? "#fbbf24" : "#a1a1aa" }}>{info.label}</div>
                    <div style={{ fontSize: 10, color: form.entity_status === key ? "#fcd34d" : "#52525b", marginTop: 2 }}>{info.fee} filing fee</div>
                    <div style={{ fontSize: 9, color: "#3f3f46", marginTop: 1 }}>{info.note}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Inventors */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Inventors (comma-separated) *</label>
              <input
                value={form.inventors}
                onChange={e => set("inventors", e.target.value)}
                placeholder="Chad Bostwick, Steven McCain"
                style={inputStyle}
              />
            </div>

            {/* USPTO account */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>USPTO Customer Number / myID</label>
              <input
                value={form.uspto_account}
                onChange={e => set("uspto_account", e.target.value)}
                placeholder="Optional — create at account.uspto.gov if needed"
                style={inputStyle}
              />
              <div style={hintStyle}>Required to file non-provisional. BoClaw will guide setup if missing.</div>
            </div>

            {/* Invention summary */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Invention Summary (1–2 sentences)</label>
              <textarea
                value={form.invention_summary}
                onChange={e => set("invention_summary", e.target.value)}
                placeholder="Briefly describe what the invention does and what makes it novel..."
                rows={3}
                style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
              />
            </div>
          </div>

          {error && (
            <div style={{ background: "rgba(69,10,10,0.5)", border: "1px solid rgba(153,27,27,0.5)", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              width: "100%", padding: "11px", borderRadius: 8, border: "none", cursor: saving ? "not-allowed" : "pointer",
              background: saving ? "#065f46" : "#059669",
              color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: "0.03em",
              transition: "all 0.15s",
            }}
          >
            {saving ? "Saving…" : "✓ Complete Intake — Unlock Phase 2"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Shared input styles ───────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%", background: "rgba(9,9,11,0.8)", border: "1px solid #27272a",
  borderRadius: 8, padding: "9px 12px", color: "#f4f4f5", fontSize: 12,
  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.1em", color: "#71717a", marginBottom: 5,
};
const hintStyle: React.CSSProperties = {
  fontSize: 10, color: "#3f3f46", marginTop: 4,
};

// ── Main widget ───────────────────────────────────────────────────────────────
export default function PatentIntakeCard({ patents }: { patents: Patent[] }) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const needsIntake = patents.filter(
    (p) => !intakeComplete(p) && !completed.has(p.id) && p.status !== "abandoned"
  );

  if (needsIntake.length === 0) return null; // hide widget when all complete

  return (
    <div style={{ width: "100%", marginBottom: 24 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#d4d4d8" }}>
            Intake Required
          </span>
          <span style={{
            fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 20,
            background: "#92400e", color: "#fcd34d", border: "1px solid rgba(251,191,36,0.3)",
          }}>
            {needsIntake.length} patent{needsIntake.length > 1 ? "s" : ""}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#52525b", marginTop: 2 }}>
          Enter once — BoClaw never asks again. Unlocks Phase 2 automatically.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {needsIntake.map((patent) => (
          <IntakeForm
            key={patent.id}
            patent={patent}
            onComplete={(id) => setCompleted((prev) => new Set([...prev, id]))}
          />
        ))}
      </div>
    </div>
  );
}
