// Background service worker: translation requests + keyboard command.
// Listeners are registered synchronously at top level (MV3 requirement).
import type { KeyValueStore } from '../shared/cache';
import { loadSettings, saveSettings } from '../shared/settings';
import { isRuntimeMessage, type TranslateResponse } from '../shared/types';
import { TranslationService } from './service';
import { GoogleGtxTranslator } from './translator';

const localStore: KeyValueStore = {
  get: (keys) => chrome.storage.local.get(keys) as Promise<Record<string, unknown>>,
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};

const service = new TranslationService(new GoogleGtxTranslator(), localStore);

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isRuntimeMessage(message) || message.type !== 'TRANSLATE') return false;
  service
    .handle(message.texts, message.videoKey)
    .then((res) => sendResponse(res))
    .catch((err: unknown) => {
      const res: TranslateResponse = { ok: false, error: String(err) };
      sendResponse(res);
    });
  return true; // async response
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-subs') return;
  void (async () => {
    try {
      const settings = await loadSettings();
      await saveSettings({ enabled: !settings.enabled });
    } catch {
      // never throw in the service worker
    }
  })();
});

self.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
});
