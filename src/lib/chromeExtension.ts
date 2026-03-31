/** Minimal typing for chrome.runtime.sendMessage (externally_connectable → extension). */

type ChromeRuntime = {
  sendMessage: (
    extensionId: string,
    message: unknown,
    responseCallback?: (response: unknown) => void
  ) => void;
  lastError?: { message: string };
};

function getChromeRuntime(): ChromeRuntime | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const c = (globalThis as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return c?.runtime;
}

/**
 * Ask the TruckingLane Chrome extension (ID from VITE_TRUCKINGLANE_EXTENSION_ID) to push loads to Aljex.
 * Returns false if extension messaging is unavailable.
 */
export function sendPushToAljexToExtension(): boolean {
  const extId = import.meta.env.VITE_TRUCKINGLANE_EXTENSION_ID as string | undefined;
  if (!extId?.trim()) return false;
  const rt = getChromeRuntime();
  if (!rt?.sendMessage) return false;
  rt.sendMessage(extId.trim(), { action: "push-to-aljex" }, () => {
    if (rt.lastError?.message) {
      console.warn("[TruckingLane] extension push-to-aljex:", rt.lastError.message);
    }
  });
  return true;
}
