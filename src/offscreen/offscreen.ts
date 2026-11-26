// Offscreen document: captures the tab's audio (and plays it back so the tab stays audible),
// downsamples to 16 kHz, segments speech at pauses and sends segments to the STT worker.
// Results go to the background, which translates them and forwards them to the tab.
import { Downsampler, mixToMono } from '../shared/audio';
import { cleanTranscript, isOffscreenMessage, type LiveReportMessage, type LiveState } from '../shared/live';
import { Segmenter, type SegmentEvent } from '../shared/vad';
import type { WorkerRequest, WorkerResponse } from './stt-protocol';

interface Job {
  id: number;
  final: boolean;
  audio: Float32Array;
  endedAt: number;
}

/** Segment end times / lengths by id, reported with the transcript for latency tracking. */
const timing = new Map<number, { endedAt: number; durationMs: number }>();

let worker: Worker | null = null;
let stream: MediaStream | null = null;
let ctx: AudioContext | null = null;
let processor: ScriptProcessorNode | null = null;
let segmenter: Segmenter | null = null;
let downsampler: Downsampler | null = null;
let ready = false;
let busy = false;
const finals: Job[] = [];
let interim: Job | null = null;
/** ids already finalized: their late interims are dropped */
let lastFinalId = 0;
let state: Omit<LiveState, 'tabId'> = { phase: 'off' };

function report(msg: LiveReportMessage): void {
  chrome.runtime.sendMessage(msg).catch(() => undefined);
}

function setState(next: Omit<LiveState, 'tabId'>): void {
  state = next;
  report({ type: 'LIVE_STATUS', state });
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./stt-worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => onWorker(e.data));
  worker.addEventListener('error', (e) => setState({ phase: 'error', error: e.message || 'worker error' }));
  return worker;
}

function onWorker(msg: WorkerResponse): void {
  switch (msg.type) {
    case 'progress':
      if (state.phase === 'loading' || state.phase === 'starting') setState({ phase: 'loading', progress: msg.progress });
      return;
    case 'ready':
      ready = true;
      if (stream) setState({ phase: 'listening', device: msg.device });
      pump();
      return;
    case 'result': {
      busy = false;
      const text = cleanTranscript(msg.text);
      const tm = timing.get(msg.id);
      timing.delete(msg.id);
      if (msg.final) {
        report(text ? { type: 'LIVE_TEXT', id: msg.id, text, final: true, ...tm } : { type: 'LIVE_DISCARD', id: msg.id });
      } else if (text && msg.id > lastFinalId) {
        report({ type: 'LIVE_TEXT', id: msg.id, text, final: false });
      }
      pump();
      return;
    }
    case 'error':
      busy = false;
      if (msg.fatal) {
        setState({ phase: 'error', error: msg.error });
        void stop(false);
      } else {
        pump();
      }
      return;
  }
}

/** Sends the next job: finals first (in order), then the newest interim. */
function pump(): void {
  if (!ready || busy || !worker) return;
  const job = finals.shift() ?? interim;
  if (!job) return;
  if (job === interim) interim = null;
  busy = true;
  const req: WorkerRequest = { type: 'transcribe', id: job.id, final: job.final, audio: job.audio };
  worker.postMessage(req, [job.audio.buffer]);
}

function onSegments(events: SegmentEvent[]): void {
  for (const ev of events) {
    if (ev.kind === 'final') {
      lastFinalId = Math.max(lastFinalId, ev.id);
      if (interim && interim.id <= ev.id) interim = null;
      const endedAt = Date.now();
      timing.set(ev.id, { endedAt, durationMs: Math.round((ev.audio.length / 16000) * 1000) });
      finals.push({ id: ev.id, final: true, audio: ev.audio, endedAt });
    } else if (ev.kind === 'interim') {
      // Interim (partial) transcripts are not shown: an English line that is later replaced by
      // Turkish confused users, and skipping them keeps the GPU free for final segments.
    } else {
      if (interim?.id === ev.id) interim = null;
      report({ type: 'LIVE_DISCARD', id: ev.id });
    }
  }
  pump();
}

async function start(streamId: string): Promise<void> {
  await stop(false);
  setState({ phase: 'starting' });
  const w = getWorker();
  if (!ready) w.postMessage({ type: 'load' } satisfies WorkerRequest);
  try {
    const constraints = {
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false,
    } as unknown as MediaStreamConstraints;
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    setState({ phase: 'error', error: err instanceof Error ? err.message : String(err) });
    return;
  }
  ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  source.connect(ctx.destination); // capturing mutes the tab; play it back
  downsampler = new Downsampler(ctx.sampleRate);
  segmenter = new Segmenter();
  processor = ctx.createScriptProcessor(4096, 2, 1);
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer;
    const channels: Float32Array[] = [];
    for (let c = 0; c < input.numberOfChannels; c++) channels.push(input.getChannelData(c));
    const mono16k = downsampler!.push(mixToMono(channels));
    onSegments(segmenter!.push(mono16k));
  };
  source.connect(processor);
  processor.connect(ctx.destination); // outputs silence; needed for onaudioprocess to fire
  for (const track of stream.getAudioTracks()) {
    track.addEventListener('ended', () => void stop(true));
  }
  setState(ready ? { phase: 'listening' } : { phase: 'loading', progress: 0 });
}

async function stop(reportOff: boolean): Promise<void> {
  if (segmenter) onSegments(segmenter.flush());
  processor?.disconnect();
  processor = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  await ctx?.close().catch(() => undefined);
  ctx = null;
  segmenter = null;
  downsampler = null;
  interim = null;
  if (reportOff) setState({ phase: 'off' });
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isOffscreenMessage(message)) return false;
  if (message.type === 'OFFSCREEN_START') void start(message.streamId);
  else void stop(true);
  sendResponse({ ok: true });
  return false;
});
