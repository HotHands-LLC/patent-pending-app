// patentpending.app — Review Queue Component
// Drop into: components/dashboard/ReviewQueue.tsx
// Place in /dashboard ABOVE PatentPhaseWidget

"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────
type DraftStatus = "pending" | "approved" | "rejected" | "revision_requested";
type DraftType = "claims" | "spec_section" | "abstract" | "drawing_brief" | "forms" | "misc";

interface ReviewItem {
  id: string;
  patent_id: string;
  patent_title?: string;
  draft_type: DraftType;
  title: string;
  content: string;
  version: number;
  status: DraftStatus;
  reviewer_notes?: string | null;
  submitted_by: string;
  created_at: string;
  reviewed_at?: string | null;
}

// ── Draft type labels ─────────────────────────────────────────────────────────
const DRAFT_TYPE_LABELS: Record<DraftType, string> = {
  claims: "Claims",
  spec_section: "Spec Section",
  abstract: "Abstract",
  drawing_brief: "Drawing Brief",
  forms: "Forms",
  misc: "Misc",
};

const DRAFT_TYPE_COLORS: Record<DraftType, { text: string; bg: string; border: string }> = {
  claims:        { text: "#a78bfa", bg: "rgba(76,29,149,0.3)",  border: "rgba(109,40,217,0.4)" },
  spec_section:  { text: "#60a5fa", bg: "rgba(30,27,75,0.3)",   border: "rgba(37,99,235,0.4)" },
  abstract:      { text: "#34d399", bg: "rgba(2,44,34,0.3)",    border: "rgba(5,150,105,0.4)" },
  drawing_brief: { text: "#f9a8d4", bg: "rgba(131,24,67,0.3)",  border: "rgba(190,24,93,0.4)" },
  forms:         { text: "#fbbf24", bg: "rgba(120,53,15,0.3)",  border: "rgba(180,83,9,0.4)" },
  misc:          { text: "#a1a1aa", bg: "rgba(39,39,42,0.3)",   border: "rgba(63,63,70,0.4)" },
};

// ── Time ago helper ───────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Auth helper ───────────────────────────────────────────────────────────────
async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

// ── Single review card ────────────────────────────────────────────────────────
function ReviewCard({
  item,
  onDecision,
}: {
  item: ReviewItem;
  onDecision: (id: string, status: DraftStatus, notes?: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState<DraftStatus | null>(null);
  const tc = DRAFT_TYPE_COLORS[item.draft_type];

  const decide = async (status: DraftStatus) => {
    setLoading(status);
    await onDecision(item.id, status, notes || undefined);
    setLoading(null);
  };

  const isPending = item.status === "pending";

  return (
    <div style={{
      borderRadius: 12,
      border: isPending ? "1px solid rgba(146,64,14,0.5)" : "1px solid rgba(39,39,42,0.8)",
      background: isPending ? "rgba(69,26,3,0.25)" : "rgba(24,24,27,0.6)",
      overflow: "hidden",
      transition: "all 0.2s",
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ width: "100%", textAlign: "left", padding: "14px 18px", background: "none", border: "none", cursor: "pointer" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              {/* Draft type badge */}
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em",
                padding: "2px 7px", borderRadius: 20,
                color: tc.text, background: tc.bg, border: `1px solid ${tc.border}`,
              }}>
                {DRAFT_TYPE_LABELS[item.draft_type]}
              </span>
              {/* Version */}
              <span style={{ fontSize: 9, color: "#52525b", fontWeight: 600 }}>v{item.version}</span>
              {/* Pending pulse dot */}
              {isPending && (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", background: "#fbbf24",
                    boxShadow: "0 0 6px rgba(251,191,36,0.6)",
                    display: "inline-block",
                  }} />
                  <span style={{ fontSize: 9, color: "#fbbf24", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Needs Review
                  </span>
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f4f4f5", lineHeight: 1.3 }}>
              {item.title}
            </div>
            {item.patent_title && (
              <div style={{ fontSize: 11, color: "#52525b", marginTop: 2 }}>{item.patent_title}</div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
            {/* Status badge */}
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
              padding: "2px 8px", borderRadius: 20,
              ...(item.status === "pending"             ? { color: "#fbbf24", background: "rgba(120,53,15,0.5)", border: "1px solid rgba(180,83,9,0.5)" } :
                  item.status === "approved"            ? { color: "#34d399", background: "rgba(2,44,34,0.5)", border: "1px solid rgba(5,150,105,0.5)" } :
                  item.status === "rejected"            ? { color: "#f87171", background: "rgba(69,10,10,0.5)", border: "1px solid rgba(153,27,27,0.5)" } :
                                                         { color: "#a78bfa", background: "rgba(46,16,101,0.5)", border: "1px solid rgba(109,40,217,0.5)" }),
            }}>
              {item.status.replace("_", " ")}
            </span>
            <span style={{ fontSize: 10, color: "#3f3f46" }}>{timeAgo(item.created_at)}</span>
          </div>
        </div>

        {/* Content preview */}
        {!expanded && (
          <div style={{
            marginTop: 10, fontSize: 11, color: "#71717a", lineHeight: 1.5,
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            fontFamily: "monospace",
          }}>
            {item.content}
          </div>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(39,39,42,0.8)" }}>
          {/* Full content */}
          <div style={{ padding: "14px 18px", background: "rgba(9,9,11,0.6)" }}>
            <div style={{
              fontSize: 11, color: "#a1a1aa", lineHeight: 1.7, fontFamily: "monospace",
              whiteSpace: "pre-wrap", maxHeight: 280, overflowY: "auto",
              scrollbarWidth: "thin",
            }}>
              {item.content}
            </div>
          </div>

          {/* Action row — only for pending */}
          {isPending && (
            <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(39,39,42,0.6)", background: "rgba(24,24,27,0.8)" }}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Revision notes (optional — required only for revision requests)"
                style={{
                  width: "100%", background: "rgba(9,9,11,0.8)", border: "1px solid #27272a",
                  borderRadius: 8, padding: "10px 12px", color: "#d4d4d8", fontSize: 11,
                  lineHeight: 1.5, resize: "vertical", minHeight: 64, outline: "none",
                  fontFamily: "inherit", boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={() => decide("approved")}
                  disabled={!!loading}
                  style={{
                    flex: 1, padding: "9px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: loading === "approved" ? "#065f46" : "#059669",
                    color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
                    transition: "all 0.15s",
                  }}
                >
                  {loading === "approved" ? "Approving…" : "✓ Approve"}
                </button>
                <button
                  onClick={() => decide("revision_requested")}
                  disabled={!!loading}
                  style={{
                    flex: 1, padding: "9px 16px", borderRadius: 8, cursor: "pointer",
                    background: "transparent", border: "1px solid rgba(109,40,217,0.6)",
                    color: "#a78bfa", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
                    transition: "all 0.15s",
                  }}
                >
                  {loading === "revision_requested" ? "Sending…" : "↺ Request Revision"}
                </button>
                <button
                  onClick={() => decide("rejected")}
                  disabled={!!loading}
                  style={{
                    padding: "9px 16px", borderRadius: 8, cursor: "pointer",
                    background: "transparent", border: "1px solid rgba(153,27,27,0.6)",
                    color: "#f87171", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
                    transition: "all 0.15s",
                  }}
                >
                  {loading === "rejected" ? "…" : "✕"}
                </button>
              </div>
            </div>
          )}

          {/* Reviewer notes (if any) */}
          {item.reviewer_notes && (
            <div style={{ padding: "10px 18px", borderTop: "1px solid rgba(39,39,42,0.6)", background: "rgba(9,9,11,0.4)" }}>
              <span style={{ fontSize: 9, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Your notes: </span>
              <span style={{ fontSize: 11, color: "#a1a1aa" }}>{item.reviewer_notes}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ReviewQueue component ────────────────────────────────────────────────
export default function ReviewQueue() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<DraftStatus | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  const fetchItems = useCallback(async () => {
    const authHeader = await getAuthHeader();
    if (!authHeader.Authorization) {
      setAuthError(true);
      setLoading(false);
      return;
    }
    const params = filter !== "all" ? `?status=${filter}` : "";
    const res = await fetch(`/api/review${params}`, { headers: authHeader });
    if (res.status === 401) {
      setAuthError(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
    setAuthError(false);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDecision = async (id: string, status: DraftStatus, notes?: string) => {
    const authHeader = await getAuthHeader();
    await fetch(`/api/review/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ status, reviewer_notes: notes }),
    });
    await fetchItems();
  };

  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#d4d4d8" }}>
              Review Queue
            </span>
            {pendingCount > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 20,
                background: "#92400e", color: "#fcd34d", border: "1px solid rgba(251,191,36,0.3)",
              }}>
                {pendingCount} pending
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#52525b", marginTop: 2 }}>
            AI-generated drafts appear here — you approve, reject, or request revisions
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 2, background: "#18181b", borderRadius: 8, padding: 3, border: "1px solid #27272a" }}>
          {(["pending", "all", "approved", "rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 10,
                fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", transition: "all 0.15s",
                background: filter === f ? "#27272a" : "transparent",
                color: filter === f ? "#f4f4f5" : "#52525b",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Auth error state */}
      {authError && (
        <div style={{ borderRadius: 12, border: "1px solid rgba(153,27,27,0.5)", background: "rgba(69,10,10,0.3)", padding: "16px 18px", marginBottom: 12 }}>
          <p style={{ color: "#f87171", fontSize: 12, margin: 0 }}>⚠️ Session expired — please refresh the page to reload your session.</p>
        </div>
      )}

      {/* Items */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: "#3f3f46", fontSize: 12 }}>Loading queue…</div>
      ) : items.length === 0 && !authError ? (
        <div style={{ borderRadius: 12, border: "1px solid #27272a", background: "#18181b", padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
          <p style={{ color: "#52525b", fontSize: 12, margin: 0 }}>
            {filter === "pending" ? "No pending drafts." : "No items in this filter."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => (
            <ReviewCard key={item.id} item={item} onDecision={handleDecision} />
          ))}
        </div>
      )}
    </div>
  );
}
