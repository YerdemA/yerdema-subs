// Messages between the offscreen document and the STT worker.
import type { SttDevice } from '../shared/live';

export type WorkerRequest =
  | { type: 'load' }
  | { type: 'transcribe'; id: number; final: boolean; audio: Float32Array };

export type WorkerResponse =
  | { type: 'progress'; progress: number }
  | { type: 'ready'; device: SttDevice }
  | { type: 'result'; id: number; final: boolean; text: string }
  | { type: 'error'; error: string; fatal: boolean; id?: number };

export const STT_MODEL = 'onnx-community/moonshine-base-ONNX';
