// Isolated-world content script entry: picks the adapter by hostname, owns the lifecycle,
// applies settings live and answers GET_STATUS from the popup.
import { isSiteDisabled, loadSettings, subscribeSettings } from '../shared/settings';
import { isRuntimeMessage, type Settings, type StatusInfo } from '../shared/types';
import { Html5Adapter } from './adapters/html5';
import type { Adapter } from './adapters/types';
import { YouTubeAdapter } from './adapters/youtube';

function isYouTubeHost(hostname: string): boolean {
  return hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname === 'm.youtube.com';
}

const isTop = window.top === window;
const onYouTube = isYouTubeHost(location.hostname);

/** Hostname of the top-level page (iframes use ancestorOrigins). */
function topHost(): string {
  if (isTop) return location.hostname;
  try {
    const origins = location.ancestorOrigins;
    const top = origins && origins.length > 0 ? origins[origins.length - 1] : undefined;
    if (top) return new URL(top).hostname;
  } catch {
    // ignore
  }
  return location.hostname;
}
const siteHost = topHost();

function isActive(s: Settings): boolean {
  return s.enabled && !isSiteDisabled(s, siteHost);
}

let adapter: Adapter | null = null;
let settings: Settings | null = null;

function createAdapter(s: Settings): Adapter | null {
  if (onYouTube) {
    // The YouTube adapter needs the MAIN-world script, which only runs in the top frame.
    return isTop ? new YouTubeAdapter(s) : null;
  }
  return new Html5Adapter(s);
}

function apply(s: Settings): void {
  settings = s;
  if (!isActive(s)) {
    adapter?.destroy();
    adapter = null;
    return;
  }
  if (adapter) adapter.setSettings(s);
  else adapter = createAdapter(s);
}

function currentStatus(): StatusInfo {
  const base = { host: siteHost };
  if (!settings) return { ...base, status: 'idle' };
  if (!settings.enabled) return { ...base, status: 'disabled' };
  if (isSiteDisabled(settings, siteHost)) return { ...base, status: 'disabled', detail: 'siteDisabled' };
  const status = adapter?.getStatus() ?? { status: 'no-video' as const };
  const current = adapter?.getCurrent() ?? undefined;
  return { ...status, ...base, ...(current ? { current } : {}) };
}

/** Frames that have something to report answer immediately; the top frame answers last. */
function frameHasVideo(): boolean {
  return document.getElementsByTagName('video').length > 0;
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isRuntimeMessage(message) || message.type !== 'GET_STATUS') return false;
  if (frameHasVideo() || (onYouTube && isTop)) {
    sendResponse(currentStatus());
    return false;
  }
  if (!isTop) return false; // video-less sub-frames stay silent
  // Top frame without a video: give frames with a video a moment to answer first.
  setTimeout(() => sendResponse(currentStatus()), 200);
  return true;
});

void (async () => {
  apply(await loadSettings());
  subscribeSettings(apply);
})();
