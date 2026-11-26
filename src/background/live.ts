// Live transcription controller (background side): owns the offscreen document, keeps the
// live state (in storage.session, the worker can be restarted any time), translates final
// transcripts and forwards captions to the captured tab's top frame.
import {
  isLiveControlMessage,
  isLiveReportMessage,
  isLiveState,
  type LiveCaptionMessage,
  type LiveReportMessage,
  type LiveState,
  type OffscreenMessage,
} from '../shared/live';
import type { TranslateResponse } from '../shared/types';

const OFFSCREEN_URL = 'offscreen/index.html';
const STATE_KEY = 'liveState';

export type Translate = (texts: string[]) => Promise<TranslateResponse>;

async function getState(): Promise<LiveState> {
  try {
    const data = await chrome.storage.session.get(STATE_KEY);
    const s: unknown = data[STATE_KEY];
    return isLiveState(s) ? s : { phase: 'off' };
  } catch {
    return { phase: 'off' };
  }
}

async function setState(s: LiveState): Promise<void> {
  await chrome.storage.session.set({ [STATE_KEY]: s }).catch(() => undefined);
}

async function hasOffscreen(): Promise<boolean> {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    });
    return contexts.length > 0;
  } catch {
    return false;
  }
}

async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Capture the tab audio and transcribe speech locally for live subtitles.',
  });
}

async function toOffscreen(msg: OffscreenMessage): Promise<void> {
  // The document may still be starting: retry briefly.
  for (let i = 0; i < 10; i++) {
    try {
      await chrome.runtime.sendMessage(msg);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('offscreen document did not respond');
}

function toTab(tabId: number, msg: LiveCaptionMessage): void {
  chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }).catch(() => undefined);
}

export async function startLive(tabId: number, streamId: string): Promise<LiveState> {
  const prev = await getState();
  if (prev.tabId !== undefined && prev.tabId !== tabId && prev.phase !== 'off') {
    toTab(prev.tabId, { type: 'LIVE_END' });
  }
  const state: LiveState = { phase: 'starting', tabId };
  await setState(state);
  try {
    await ensureOffscreen();
    await toOffscreen({ target: 'offscreen', type: 'OFFSCREEN_START', streamId });
  } catch (err) {
    const failed: LiveState = { phase: 'error', tabId, error: err instanceof Error ? err.message : String(err) };
    await setState(failed);
    return failed;
  }
  return state;
}

export async function stopLive(): Promise<LiveState> {
  const prev = await getState();
  const off: LiveState = { phase: 'off' };
  await setState(off);
  if (prev.tabId !== undefined) toTab(prev.tabId, { type: 'LIVE_END' });
  if (await hasOffscreen()) {
    await toOffscreen({ target: 'offscreen', type: 'OFFSCREEN_STOP' }).catch(() => undefined);
    // Close the document: frees the model's GPU memory. Re-starting reloads it from cache.
    await chrome.offscreen.closeDocument().catch(() => undefined);
  }
  return off;
}

/** Captures the active tab (keyboard shortcut path: the command counts as a user gesture). */
export async function toggleLiveForActiveTab(): Promise<void> {
  const state = await getState();
  if (state.phase !== 'off' && state.phase !== 'error') {
    await stopLive();
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) return;
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  await startLive(tab.id, streamId);
}

async function onReport(message: LiveReportMessage, translate: Translate): Promise<void> {
  const state = await getState();
  const tabId = state.tabId;
  if (message.type === 'LIVE_STATUS') {
    if (state.phase === 'off' && message.state.phase !== 'error') return; // stopped meanwhile
    const next: LiveState = { ...message.state, tabId, device: message.state.device ?? state.device };
    await setState(next);
    if (next.phase === 'off' && tabId !== undefined) toTab(tabId, { type: 'LIVE_END' });
    return;
  }
  if (tabId === undefined || state.phase === 'off') return;
  if (message.type === 'LIVE_DISCARD') {
    toTab(tabId, { type: 'LIVE_DISCARD', id: message.id });
    return;
  }
  if (!message.final) return;
  const res = await translate([message.text]).catch(
    (): TranslateResponse => ({ ok: false, error: 'translate failed' }),
  );
  const translation = res.ok ? res.translations[0]?.trim() || undefined : undefined;
  // Only translated text is shown; English is sent alone only when translation failed.
  toTab(tabId, {
    type: 'LIVE_CAPTION',
    id: message.id,
    original: message.text,
    final: true,
    ...(translation ? { translation } : {}),
    ...(message.endedAt !== undefined ? { endedAt: message.endedAt } : {}),
    ...(message.durationMs !== undefined ? { durationMs: message.durationMs } : {}),
  });
}

export function registerLive(translate: Translate): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (isLiveControlMessage(message)) {
      const run =
        message.type === 'LIVE_START'
          ? startLive(message.tabId, message.streamId)
          : message.type === 'LIVE_STOP'
            ? stopLive()
            : getState();
      run.then(sendResponse, (err: unknown) => sendResponse({ phase: 'error', error: String(err) }));
      return true;
    }
    if (isLiveReportMessage(message) && sender.url?.startsWith(chrome.runtime.getURL(OFFSCREEN_URL))) {
      void onReport(message, translate);
    }
    return false;
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void getState().then((s) => (s.tabId === tabId && s.phase !== 'off' ? stopLive() : undefined));
  });
}
