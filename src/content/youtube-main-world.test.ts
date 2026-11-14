// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import manual from '../shared/__fixtures__/yt-manual.json3.json';
import { isPageMessage, type PageMessage } from '../shared/types';

const body = JSON.stringify(manual);

/** jsdom's postMessage leaves event.source null; real Chrome sets it to window. */
function send(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data, source: window }));
}

function collect(): { messages: PageMessage[]; stop: () => void } {
  const messages: PageMessage[] = [];
  const handler = (e: MessageEvent<unknown>): void => {
    if (isPageMessage(e.data)) messages.push(e.data);
  };
  window.addEventListener('message', handler);
  return { messages, stop: () => window.removeEventListener('message', handler) };
}

describe('youtube-main-world interceptor', () => {
  const pageFetch = vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.includes('/api/timedtext')) return new Response(body, { status: 200 });
    return new Response('{"other":true}', { status: 200 });
  });

  beforeAll(async () => {
    window.fetch = pageFetch as unknown as typeof fetch;
    await import('./youtube-main-world');
  });

  it('passes fetch responses through untouched and posts timedtext json3', async () => {
    const { messages, stop } = collect();
    const res = await window.fetch('/api/timedtext?v=vid123456&lang=en&kind=asr&fmt=json3&pot=x');
    expect(await res.text()).toBe(body); // page still gets the body
    await vi.waitFor(() => expect(messages.some((m) => m.type === 'YT_CAPTIONS')).toBe(true));
    const msg = messages.find((m) => m.type === 'YT_CAPTIONS');
    expect(msg).toMatchObject({ videoId: 'vid123456', lang: 'en', kind: 'asr', json: body });
    stop();
  });

  it('ignores unrelated requests and auto-translated tracks', async () => {
    const { messages, stop } = collect();
    await window.fetch('/youtubei/v1/player');
    await window.fetch('/api/timedtext?v=vid123456&lang=en&tlang=tr&fmt=json3');
    await new Promise((r) => setTimeout(r, 20));
    expect(messages.filter((m) => m.type === 'YT_CAPTIONS')).toHaveLength(0);
    stop();
  });

  it('replays buffered captions on YT_READY', async () => {
    await window.fetch('/api/timedtext?v=buffered01&lang=en&fmt=json3');
    await new Promise((r) => setTimeout(r, 20));
    const { messages, stop } = collect();
    send({ source: 'yerdema-subs', type: 'YT_READY', videoId: 'buffered01' });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === 'YT_CAPTIONS' && m.videoId === 'buffered01')).toBe(true),
    );
    stop();
  });

  it('reports failure to enable captions when there is no player', async () => {
    vi.useFakeTimers();
    const { messages, stop } = collect();
    send({ source: 'yerdema-subs', type: 'YT_ENABLE_CC', videoId: 'noplayer01' });
    await vi.advanceTimersByTimeAsync(6000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(messages.some((m) => m.type === 'YT_CC_RESULT')).toBe(true));
    expect(messages.find((m) => m.type === 'YT_CC_RESULT')).toMatchObject({ ok: false, detail: 'noPlayer' });
    stop();
  });

  it('selects the manual English track through the player API', async () => {
    const setOption = vi.fn();
    const player = document.createElement('div') as HTMLDivElement & Record<string, unknown>;
    player.id = 'movie_player';
    player.loadModule = vi.fn();
    player.getOption = (_m: string, option: string) =>
      option === 'tracklist'
        ? [
            { languageCode: 'en', kind: 'asr', vss_id: 'a.en' },
            { languageCode: 'en', vss_id: '.en' },
          ]
        : {};
    player.setOption = setOption;
    document.body.append(player);
    const { messages, stop } = collect();
    send({ source: 'yerdema-subs', type: 'YT_ENABLE_CC', videoId: 'withplayer' });
    await vi.waitFor(() => expect(messages.some((m) => m.type === 'YT_CC_RESULT')).toBe(true));
    expect(setOption).toHaveBeenCalledWith('captions', 'track', { languageCode: 'en', vss_id: '.en' });
    expect(messages.find((m) => m.type === 'YT_CC_RESULT')).toMatchObject({ ok: true, detail: 'manual' });
    stop();
    player.remove();
  });
});
