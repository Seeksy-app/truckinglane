import { useMemo } from "react";
import { cn } from "@/lib/utils";

export type TranscriptTurn = { speaker: "Jess" | "Driver"; text: string };

/** Map ElevenLabs / webhook roles to display names (Jess = AI, Driver = caller). */
export function speakerLabelFromRole(role: string): "Jess" | "Driver" {
  const r = role.trim().toLowerCase();
  if (["user", "customer", "caller", "driver", "human", "client"].includes(r)) return "Driver";
  return "Jess";
}

/** Parse stored transcript: JSON array of {role,message}, or newline "role: text" (webhook format). */
export function parseTranscriptToTurns(raw: string): TranscriptTurn[] | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const turns: TranscriptTurn[] = [];
      for (const t of parsed) {
        if (!t || typeof t !== "object") continue;
        const msg =
          (t as { message?: string; text?: string }).message ??
          (t as { text?: string }).text;
        const role = (t as { role?: string }).role;
        if (msg == null || String(msg).trim() === "") continue;
        turns.push({
          speaker: speakerLabelFromRole(String(role ?? "agent")),
          text: String(msg).trim(),
        });
      }
      if (turns.length) return turns;
    }
  } catch {
    // not JSON — try line-oriented text
  }
  const turns: TranscriptTurn[] = [];
  for (const line of trimmed.split(/\n+/)) {
    if (!line.trim()) continue;
    const m = line.match(/^([^:]+):\s*(.+)$/s);
    if (m) {
      const text = m[2].trim();
      if (!text) continue;
      turns.push({
        speaker: speakerLabelFromRole(m[1].trim()),
        text,
      });
    }
  }
  return turns.length ? turns : null;
}

/** Inline Jess/Driver turns: Jess = muted bg, Driver = white + border (matches Lead Detail). */
export function TranscriptTurnsList({ transcript }: { transcript: string }) {
  const turns = useMemo(() => parseTranscriptToTurns(transcript), [transcript]);
  if (!transcript?.trim()) {
    return (
      <p className="text-sm text-muted-foreground">No transcript available.</p>
    );
  }
  return (
    <div className="space-y-1">
      {turns && turns.length > 0 ? (
        turns.map((turn, i) => (
          <div
            key={i}
            className={cn(
              "rounded-md px-3 py-2 text-sm leading-relaxed",
              turn.speaker === "Jess"
                ? "bg-muted text-foreground"
                : "bg-white text-foreground border border-border/70 dark:bg-background dark:border-border",
            )}
          >
            <span className="font-medium">{turn.speaker}:</span>{" "}
            <span>&ldquo;{turn.text}&rdquo;</span>
          </div>
        ))
      ) : (
        <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
          {transcript}
        </div>
      )}
    </div>
  );
}

/** Two-column transcript: speaker (small gray) | message — left-aligned, no bubbles. */
export function TranscriptTwoColumnList({ transcript }: { transcript: string }) {
  const turns = useMemo(() => parseTranscriptToTurns(transcript), [transcript]);
  if (!transcript?.trim()) {
    return (
      <p className="text-sm text-muted-foreground text-left">No transcript available.</p>
    );
  }
  if (turns && turns.length > 0) {
    return (
      <div className="space-y-2.5 text-left">
        {turns.map((turn, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(3.5rem,5rem)_1fr] gap-x-3 gap-y-0.5 items-start"
          >
            <span className="text-xs text-muted-foreground font-medium pt-0.5">
              {turn.speaker}
            </span>
            <span className="text-sm font-normal text-foreground leading-relaxed">
              {turn.text}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed text-left font-sans">
      {transcript}
    </pre>
  );
}
