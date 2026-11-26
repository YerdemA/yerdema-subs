// Web Worker: loads the speech-to-text model once (WebGPU, falling back to WASM/CPU) and
// transcribes 16 kHz mono segments. Runs off the main thread so audio capture never stalls.
import { env, pipeline } from '@huggingface/transformers';
import type { SttDevice } from '../shared/live';
import { STT_MODEL, type WorkerRequest, type WorkerResponse } from './stt-protocol';

// Extension pages may not load remote code: ONNX Runtime's WASM glue ships inside the
// extension (dist/ort/) and is imported from there directly (no blob: URLs under our CSP).
const ortBase = `${self.location.origin}/ort/`;
env.allowLocalModels = false;
(env as unknown as { useWasmCache?: boolean }).useWasmCache = false;
const onnxEnv = env.backends.onnx as unknown as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
if (onnxEnv.wasm) {
  onnxEnv.wasm.wasmPaths = {
    mjs: `${ortBase}ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${ortBase}ort-wasm-simd-threaded.asyncify.wasm`,
  };
  onnxEnv.wasm.numThreads = 1; // no cross-origin isolation → no threads
}

type Transcriber = (audio: Float32Array) => Promise<unknown>;
let asr: Transcriber | null = null;
let loading: Promise<void> | null = null;

const post = (msg: WorkerResponse): void => (self as unknown as Worker).postMessage(msg);

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

/** Aggregated download progress over all model files. */
function progressTracker(): (p: unknown) => void {
  const files = new Map<string, { loaded: number; total: number }>();
  let last = -1;
  return (p) => {
    const r = p as { status?: string; file?: string; loaded?: number; total?: number };
    if (r.status !== 'progress' || !r.file || !r.total) return;
    files.set(r.file, { loaded: r.loaded ?? 0, total: r.total });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    const pct = total > 0 ? Math.floor((loaded / total) * 100) / 100 : 0;
    if (pct !== last) {
      last = pct;
      post({ type: 'progress', progress: pct });
    }
  };
}

async function create(device: SttDevice): Promise<Transcriber> {
  const dtype = device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8';
  const options = { device, dtype, progress_callback: progressTracker() };
  const p = (await pipeline('automatic-speech-recognition', STT_MODEL, options as never)) as unknown as Transcriber;
  await p(new Float32Array(16000)); // warm-up: compiles shaders / initializes kernels
  return p;
}

async function load(): Promise<void> {
  if (asr) return;
  loading ??= (async () => {
    let device: SttDevice = (await hasWebGpu()) ? 'webgpu' : 'wasm';
    try {
      asr = await create(device);
    } catch (err) {
      if (device !== 'webgpu') throw err;
      device = 'wasm';
      asr = await create(device);
    }
    post({ type: 'ready', device });
  })();
  try {
    await loading;
  } catch (err) {
    loading = null;
    post({ type: 'error', error: err instanceof Error ? err.message : String(err), fatal: true });
  }
}

function textOf(out: unknown): string {
  const o = Array.isArray(out) ? out[0] : out;
  return o && typeof o === 'object' && typeof (o as { text?: unknown }).text === 'string'
    ? (o as { text: string }).text
    : '';
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'load') {
    void load();
    return;
  }
  void (async () => {
    try {
      await load();
      if (!asr) return;
      const text = textOf(await asr(msg.audio));
      post({ type: 'result', id: msg.id, final: msg.final, text });
    } catch (err) {
      post({ type: 'error', id: msg.id, error: err instanceof Error ? err.message : String(err), fatal: false });
    }
  })();
});
