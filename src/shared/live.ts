// Live transcription (tab audio → STT → translation → overlay): message types, guards and
// display timing helpers.
import { isRecord } from './types';

export type LivePhase = 'off' | 'starting' | 'loading' | 'listening' | 'error';
export type SttDevice = 'webgpu' | 'wasm';

export interface LiveState {
  phase: LivePhase;
  /** tab being transcribed */
  tabId?: number;
  /** model download progress 0–1 while loading */
  progress?: number;
  device?: SttDevice;
  error?: string;
}

// popup / command → background
export type LiveControlMessage =
  | { type: 'LIVE_START'; tabId: number; streamId: string }
  | { type: 'LIVE_STOP' }
  | { type: 'GET_LIVE_STATE' };

// background → offscreen
export type OffscreenMessage =
  | { target: 'offscreen'; type: 'OFFSCREEN_START'; streamId: string }
  | { target: 'offscreen'; type: 'OFFSCREEN_STOP' };

// offscreen → background
export type LiveReportMessage =
  | { type: 'LIVE_STATUS'; state: Omit<LiveState, 'tabId'> }
  | {
      type: 'LIVE_TEXT';
      id: number;
      text: string;
      final: boolean;
      /** wall-clock ms when the speech segment ended (latency measurement) */
      endedAt?: number;
      /** segment length in ms */
      durationMs?: number;
    }
  | { type: 'LIVE_DISCARD'; id: number };

// background → content (top frame of the captured tab)
export type LiveCaptionMessage =
  | {
      type: 'LIVE_CAPTION';
      id: number;
      original: string;
      /** missing only when translation failed (English shown as a fallback) */
      translation?: string;
      final: boolean;
      endedAt?: number;
      durationMs?: number;
    }
  | { type: 'LIVE_DISCARD'; id: number }
  | { type: 'LIVE_END' };

const PHASES: readonly string[] = ['off', 'starting', 'loading', 'listening', 'error'];

export function isLiveControlMessage(v: unknown): v is LiveControlMessage {
  if (!isRecord(v)) return false;
  switch (v.type) {
    case 'LIVE_START':
      return typeof v.tabId === 'number' && typeof v.streamId === 'string' && v.streamId !== '';
    case 'LIVE_STOP':
    case 'GET_LIVE_STATE':
      return true;
    default:
      return false;
  }
}

export function isOffscreenMessage(v: unknown): v is OffscreenMessage {
  if (!isRecord(v) || v.target !== 'offscreen') return false;
  if (v.type === 'OFFSCREEN_START') return typeof v.streamId === 'string';
  return v.type === 'OFFSCREEN_STOP';
}

export function isLiveState(v: unknown): v is LiveState {
  return isRecord(v) && typeof v.phase === 'string' && PHASES.includes(v.phase);
}

export function isLiveReportMessage(v: unknown): v is LiveReportMessage {
  if (!isRecord(v)) return false;
  switch (v.type) {
    case 'LIVE_STATUS':
      return isLiveState(v.state);
    case 'LIVE_TEXT':
      return typeof v.id === 'number' && typeof v.text === 'string' && typeof v.final === 'boolean';
    case 'LIVE_DISCARD':
      return typeof v.id === 'number';
    default:
      return false;
  }
}

export function isLiveCaptionMessage(v: unknown): v is LiveCaptionMessage {
  if (!isRecord(v)) return false;
  switch (v.type) {
    case 'LIVE_CAPTION':
      return (
        typeof v.id === 'number' &&
        typeof v.original === 'string' &&
        typeof v.final === 'boolean' &&
        (v.translation === undefined || typeof v.translation === 'string')
      );
    case 'LIVE_DISCARD':
      return typeof v.id === 'number';
    case 'LIVE_END':
      return true;
    default:
      return false;
  }
}

/** STT output cleanup: trims, drops empty/punctuation-only and bracketed non-speech tags. */
export function cleanTranscript(text: string): string {
  const t = text
    .replace(/\[(?:[^\]]{0,30})\]|\((?:[^)]{0,30})\)/g, ' ') // [Music], (laughs)
    .replace(/\s+/g, ' ')
    .trim();
  return /[a-z0-9]/i.test(t) ? t : '';
}

/** How long a finished caption stays on screen if nothing replaces it (ms). */
export function holdMs(text: string): number {
  return Math.min(8000, Math.max(3000, 1500 + text.length * 60));
}
