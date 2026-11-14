// Isolated-world content script entry: picks the adapter by hostname, owns the lifecycle,
// applies settings live and answers GET_STATUS from the popup.
import { loadSettings, subscribeSettings } from '../shared/settings';
import { isRuntimeMessage, type Settings, type StatusInfo } from '../shared/types';
import { Html5Adapter } from './adapters/html5';
import type { Adapter } from './adapters/types';
import { YouTubeAdapter } from './adapters/youtube';

function isYouTubeHost(hostname: string): boolean {
  return hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname === 'm.youtube.com';
}

const isTop = window.top === window;
const onYouTube = isYouTubeHost(location.hostname);

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
  if (!s.enabled) {
    adapter?.destroy();
    adapter = null;
    return;
  }
  if (adapter) adapter.setSettings(s);
  else adapter = createAdapter(s);
}

function currentStatus(): StatusInfo {
  if (!settings) return { status: 'idle' };
  if (!settings.enabled) return { status: 'disabled' };
  return adapter?.getStatus() ?? { status: 'no-video' };
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
