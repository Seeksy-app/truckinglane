/** localStorage: "true" means sound is muted (default is unmuted / sound ON). */
export const LEAD_SOUND_MUTED_STORAGE_KEY = "tl_dashboard_lead_sound_muted";

export function readLeadSoundMutedFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LEAD_SOUND_MUTED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeLeadSoundMutedToStorage(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEAD_SOUND_MUTED_STORAGE_KEY, muted ? "true" : "false");
  } catch {
    /* ignore quota / private mode */
  }
}

/** Short pleasant ding (~0.3s). Call only with a running AudioContext (after user gesture). */
export function playLeadNotificationDing(ctx: AudioContext): void {
  const t0 = ctx.currentTime;
  const dur = 0.3;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(784, t0);
  osc.frequency.exponentialRampToValueAtTime(1046.5, t0 + 0.1);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}
