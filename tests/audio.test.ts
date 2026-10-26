import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeSource {
  buffer: unknown; onended: unknown;
  connect = vi.fn(); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
class FakeAudioContext {
  static instance: FakeAudioContext;
  constructor() { FakeAudioContext.instance = this; }
  state = 'running'; currentTime = 0; destination = {};
  sources: FakeSource[] = [];
  createGain() { return {gain: {value: 0, setTargetAtTime: vi.fn()}, connect: vi.fn(), disconnect: vi.fn()}; }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
  decodeAudioData = async () => ({});
}
beforeEach(() => {
  vi.resetModules(); vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('document', {hidden: false});
  vi.stubGlobal('fetch', async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(1)}));
});
afterEach(() => vi.unstubAllGlobals());

describe('界面与演出音效', () => {
  it('切换对局时取消待播演出音，保留按钮确定音', async () => {
    const audio = await import('../apps/web/src/audio'); audio.unlockAudio();
    audio.playSound('dice-roll'); audio.playUISound('ok00'); audio.stopGameAudio();
    await vi.waitFor(() => expect(FakeAudioContext.instance.sources).toHaveLength(1));
    const source = FakeAudioContext.instance.sources[0];
    expect(source.start).toHaveBeenCalledTimes(1);
    audio.stopGameAudio(); expect(source.stop).not.toHaveBeenCalled();
    audio.stopAudio(); expect(source.stop).toHaveBeenCalledTimes(1);
  });
  it('静音或切到后台时取消两类音效，包括尚未解码的请求', async () => {
    const audio = await import('../apps/web/src/audio'); audio.unlockAudio();
    audio.playSound('dice-roll'); audio.playUISound('ok00'); audio.configureAudio(false, .45);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(FakeAudioContext.instance.sources).toHaveLength(0);
    audio.configureAudio(true, .45); Object.assign(document, {hidden: true});
    audio.playSound('dice-roll'); audio.playUISound('ok00');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(FakeAudioContext.instance.sources).toHaveLength(0);
  });
});
