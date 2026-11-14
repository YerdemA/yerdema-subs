// YouTube adapter — implemented in Phase 5.
import type { Settings, StatusInfo } from '../../shared/types';
import type { Adapter } from './types';

export class YouTubeAdapter implements Adapter {
  constructor(private settings: Settings) {}

  getStatus(): StatusInfo {
    return { status: 'idle' };
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
  }

  destroy(): void {}
}
