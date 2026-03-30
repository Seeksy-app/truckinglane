/**
 * Full webhook body is stored in elevenlabs_post_calls.payload.
 * Transcript may live at data.analysis.transcript or data.transcript (see elevenlabs-webhook).
 */

function normalizeTranscriptValue(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length ? raw : null;
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return JSON.stringify(raw);
  }
  return null;
}

/** Returns a string suitable for parseTranscriptToTurns (JSON array or plain text). */
export function extractTranscriptFromElevenlabsPayload(payload: unknown): string | null {
  if (payload == null || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  const analysis = (data.analysis ?? {}) as Record<string, unknown>;
  const rootAnalysis = (root.analysis ?? {}) as Record<string, unknown>;

  const candidates: unknown[] = [
    analysis["transcript"],
    data["transcript"],
    rootAnalysis["transcript"],
    root["transcript"],
  ];

  for (const c of candidates) {
    const n = normalizeTranscriptValue(c);
    if (n) return n;
  }
  return null;
}
