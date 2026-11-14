// Popup: master toggle, status of the active tab, settings controls with live preview.
import { localizeDocument, t } from '../shared/i18n';
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, saveSettings, subscribeSettings } from '../shared/settings';
import { isRecord, type Settings, type StatusInfo } from '../shared/types';
import { statusMessageKey, detailMessageKey, sourceMessageKey, PREVIEW_SCALE } from './popup-logic';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const enabledEl = $<HTMLInputElement>('enabled');
const fontSizeEl = $<HTMLInputElement>('fontSize');
const bottomOffsetEl = $<HTMLInputElement>('bottomOffset');
const bgOpacityEl = $<HTMLInputElement>('bgOpacity');
const hideOriginalEl = $<HTMLInputElement>('hideOriginal');
const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.segmented button'));

let settings: Settings = { ...DEFAULT_SETTINGS };

function render(s: Settings): void {
  enabledEl.checked = s.enabled;
  fontSizeEl.value = String(s.fontSize);
  bottomOffsetEl.value = String(s.bottomOffset);
  bgOpacityEl.value = String(s.bgOpacity);
  hideOriginalEl.checked = s.hideOriginal;
  modeButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === s.mode)));
  $('fontSize-out').textContent = `${s.fontSize}px`;
  $('bottomOffset-out').textContent = `${Math.round(s.bottomOffset)}%`;
  $('bgOpacity-out').textContent = `${Math.round(s.bgOpacity * 100)}%`;
  $('controls').classList.toggle('disabled', !s.enabled);
  renderPreview(s);
}

function renderPreview(s: Settings): void {
  const sub = $('preview-sub');
  const fs = Math.max(9, s.fontSize * PREVIEW_SCALE);
  sub.style.fontSize = `${fs}px`;
  sub.style.bottom = `${s.bottomOffset}%`;
  sub.style.background = `rgba(0,0,0,${s.bgOpacity})`;
  const en = sub.querySelector<HTMLElement>('.preview-en');
  if (en) {
    en.hidden = s.mode !== 'tr+en';
    en.style.fontSize = `${fs * 0.75}px`;
  }
  sub.style.opacity = s.enabled ? '1' : '0.35';
}

let saveTimer = 0;
let pending: Partial<Settings> = {};

/** Updates the UI immediately and saves (debounced so sliders don't hit storage.sync quotas). */
function update(patch: Partial<Settings>, immediate = false): void {
  settings = normalizeSettings({ ...settings, ...patch });
  render(settings);
  pending = { ...pending, ...patch };
  window.clearTimeout(saveTimer);
  const flush = (): void => {
    const p = pending;
    pending = {};
    void saveSettings(p).catch(() => undefined);
  };
  if (immediate) flush();
  else saveTimer = window.setTimeout(flush, 250);
}

enabledEl.addEventListener('change', () => update({ enabled: enabledEl.checked }, true));
hideOriginalEl.addEventListener('change', () => update({ hideOriginal: hideOriginalEl.checked }, true));
fontSizeEl.addEventListener('input', () => update({ fontSize: Number(fontSizeEl.value) }));
bottomOffsetEl.addEventListener('input', () => update({ bottomOffset: Number(bottomOffsetEl.value) }));
bgOpacityEl.addEventListener('input', () => update({ bgOpacity: Number(bgOpacityEl.value) }));
for (const btn of modeButtons) {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode === 'tr+en' ? 'tr+en' : 'tr';
    update({ mode }, true);
  });
}
window.addEventListener('pagehide', () => {
  if (Object.keys(pending).length > 0) void saveSettings(pending);
});

// --- status ---
function showStatus(info: StatusInfo | null): void {
  const box = $('status');
  const main = $('status-main');
  const detail = $('status-detail');
  const source = $('status-source');
  box.dataset.state = info ? info.status : 'unsupported';
  main.textContent = t(statusMessageKey(info?.status));
  const dKey = detailMessageKey(info?.detail);
  detail.hidden = !dKey;
  detail.textContent = dKey ? t(dKey) : '';
  const sKey = sourceMessageKey(info?.source);
  source.hidden = !sKey || info?.status === 'disabled';
  source.textContent = sKey ? t(sKey) : '';
}

function isStatusInfo(value: unknown): value is StatusInfo {
  return isRecord(value) && typeof value.status === 'string';
}

async function queryStatus(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) {
      showStatus(null);
      return;
    }
    const res: unknown = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });
    showStatus(isStatusInfo(res) ? res : null);
  } catch {
    showStatus(null); // no content script in this tab (chrome://, store pages, PDF…)
  }
}

async function showShortcut(): Promise<void> {
  const el = $('shortcut');
  try {
    const commands = await chrome.commands.getAll();
    const cmd = commands.find((c) => c.name === 'toggle-subs');
    el.textContent = cmd?.shortcut ? t('shortcutHint', cmd.shortcut) : t('shortcutNotSet');
  } catch {
    el.textContent = t('shortcutHint', 'Alt+Shift+T');
  }
}

async function init(): Promise<void> {
  localizeDocument();
  document.documentElement.lang = chrome.i18n.getUILanguage().startsWith('tr') ? 'tr' : 'en';
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  settings = await loadSettings();
  render(settings);
  subscribeSettings((s) => {
    if (Object.keys(pending).length > 0) return; // our own debounced save is in progress
    settings = s;
    render(s);
  });
  void showShortcut();
  await queryStatus();
  window.setInterval(() => void queryStatus(), 1000);
}

void init();
