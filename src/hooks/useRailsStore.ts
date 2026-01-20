import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "ui_rails_v1";

interface RailsState {
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  lastRightClosedAt: number | null;
}

const DEFAULT_STATE: RailsState = {
  leftOpen: false,
  rightOpen: false,
  leftWidth: 360,
  rightWidth: 380,
  lastRightClosedAt: null,
};

// Hydrate from localStorage synchronously to avoid flicker
function getInitialState(): RailsState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_STATE, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_STATE;
}

export function useRailsStore() {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<RailsState>(DEFAULT_STATE);

  // Hydrate on mount
  useEffect(() => {
    const initial = getInitialState();
    setState(initial);
    setHydrated(true);
  }, []);

  // Persist to localStorage on changes
  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state, hydrated]);

  const setLeftOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, leftOpen: open }));
  }, []);

  const setRightOpen = useCallback((open: boolean) => {
    setState((prev) => ({
      ...prev,
      rightOpen: open,
      lastRightClosedAt: open ? prev.lastRightClosedAt : Date.now(),
    }));
  }, []);

  const setLeftWidth = useCallback((width: number) => {
    const clamped = Math.min(520, Math.max(320, width));
    setState((prev) => ({ ...prev, leftWidth: clamped }));
  }, []);

  const setRightWidth = useCallback((width: number) => {
    const clamped = Math.min(520, Math.max(320, width));
    setState((prev) => ({ ...prev, rightWidth: clamped }));
  }, []);

  // Check if we can auto-open right rail (not closed in last 10 mins)
  const canAutoOpenRight = useCallback(() => {
    if (!state.lastRightClosedAt) return true;
    const tenMinutes = 10 * 60 * 1000;
    return Date.now() - state.lastRightClosedAt > tenMinutes;
  }, [state.lastRightClosedAt]);

  return {
    hydrated,
    leftOpen: state.leftOpen,
    rightOpen: state.rightOpen,
    leftWidth: state.leftWidth,
    rightWidth: state.rightWidth,
    setLeftOpen,
    setRightOpen,
    setLeftWidth,
    setRightWidth,
    canAutoOpenRight,
  };
}
