import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  constructor() { super(); FakeAudio.instances.push(this); }
  private source = '';
  sources: string[] = [];
  get src() { return this.source; }
  set src(value: string) { this.source = value; this.sources.push(value); this.currentTime = 0; this.paused = true; this.ended = false; }
  loop = false; preload = ''; volume = 1; currentTime = 0; duration = 180; paused = true; ended = false;
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  finish() { this.currentTime = this.duration; this.paused = true; this.ended = true; this.dispatchEvent(new Event('ended')); }
}

beforeEach(() => {
  vi.resetModules(); FakeAudio.instances = [];
  vi.spyOn(Math, 'random').mockReturnValue(.999);
  vi.stubGlobal('Audio', FakeAudio); vi.stubGlobal('document', { hidden: false });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('背景音乐播放', () => {
  it('首次交互后播放本地标题曲，大厅和设置保持进度', async () => {
    const music = await import('../apps/web/src/music');
    music.setMusic('title'); expect(FakeAudio.instances).toHaveLength(0);
    music.unlockMusic(); const player = FakeAudio.instances[0];
    expect(player.src).toBe('/audio/bgm-title.mp3'); expect(player.loop).toBe(true);
    player.currentTime = 42;
    music.setMusic('title'); music.configureMusic(true, .2); music.refreshMusic();
    expect(player.currentTime).toBe(42); expect(player.play).toHaveBeenCalledTimes(1);
    expect(FakeAudio.instances).toHaveLength(1);
  });
  it('进入对局切换曲目，玩家切换或设置变化不会重启', async () => {
    const music = await import('../apps/web/src/music');
    music.setMusic('title'); music.unlockMusic(); music.setMusic('game');
    const player = FakeAudio.instances[0];
    expect(player.src).toBe('/audio/bgm-game.mp3'); player.currentTime = 24;
    expect(player.loop).toBe(false);
    music.setMusic('game'); music.configureMusic(true, .35);
    expect(player.currentTime).toBe(24); expect(player.volume).toBe(.35);
    music.setMusic('title'); expect(player.src).toBe('/audio/bgm-title.mp3');
  });
  it('六首每轮各播放一次，连续三轮不出现相邻重复', async () => {
    const music = await import('../apps/web/src/music');
    music.setMusic('game'); music.unlockMusic(); const player = FakeAudio.instances[0];
    const played = [player.src];
    for (let i = 1; i < 18; i++) { player.finish(); played.push(player.src); }
    for (let i = 0; i < 18; i += 6) {
      expect(new Set(played.slice(i, i + 6)).size).toBe(6);
      expect(played.slice(i, i + 6).sort()).toEqual(music.GAME_MUSIC.map(song => `/${song.file}`).sort());
    }
    expect(played.every((file, i) => i === 0 || file !== played[i - 1])).toBe(true);
    expect(FakeAudio.instances).toHaveLength(1);
  });
  it('随机顺序变化，轮次边界也避开上一首', async () => {
    const { shuffleGameMusic, GAME_MUSIC } = await import('../apps/web/src/music');
    expect(shuffleGameMusic(null, () => 0)).not.toEqual(shuffleGameMusic(null, () => .999));
    for (const song of GAME_MUSIC) {
      for (const value of [0, .2, .5, .999]) {
        const bag = shuffleGameMusic(song.id, () => value);
        expect(bag[0].id).not.toBe(song.id);
        expect(new Set(bag.map(track => track.id)).size).toBe(6);
      }
    }
  });
  it('曲间淡出淡入，音量随播放进度变化而暂停时不自行推进', async () => {
    const music = await import('../apps/web/src/music');
    music.configureMusic(true, .4); music.setMusic('game'); music.unlockMusic();
    const player = FakeAudio.instances[0];
    expect(player.volume).toBe(0);
    player.currentTime = .6; player.dispatchEvent(new Event('timeupdate')); expect(player.volume).toBeCloseTo(.2);
    player.currentTime = 10; player.dispatchEvent(new Event('timeupdate')); expect(player.volume).toBe(.4);
    player.currentTime = player.duration - .6; player.dispatchEvent(new Event('timeupdate')); expect(player.volume).toBeCloseTo(.2);
    music.configureMusic(false, .4); expect(player.paused).toBe(true); expect(player.volume).toBeCloseTo(.2);
    music.configureMusic(true, .4); expect(player.volume).toBeCloseTo(.2);
    player.finish(); expect(player.currentTime).toBe(0); expect(player.volume).toBe(0);
  });
  it('换人、菜单、静音与后台往返均保留当前曲目和待播顺序', async () => {
    const music = await import('../apps/web/src/music');
    music.setMusic('game'); music.unlockMusic(); const player = FakeAudio.instances[0];
    player.finish(); const song = player.src; player.currentTime = 35;
    music.setMusic('game'); music.configureMusic(false, .3);
    Object.assign(document, {hidden: true}); music.refreshMusic();
    music.configureMusic(true, .3); expect(player.paused).toBe(true);
    Object.assign(document, {hidden: false}); music.refreshMusic();
    expect(player.src).toBe(song); expect(player.currentTime).toBe(35);
    player.finish(); expect(new Set(player.sources).size).toBe(3);
  });
  it('损坏曲目被跳过，全部不可用时停止而不无限请求', async () => {
    const music = await import('../apps/web/src/music');
    music.setMusic('game'); music.unlockMusic(); const player = FakeAudio.instances[0];
    for (let i = 0; i < 10; i++) player.dispatchEvent(new Event('error'));
    expect(new Set(player.sources).size).toBe(6); expect(player.sources).toHaveLength(6);
    expect(player.paused).toBe(true);
    music.setMusic('title'); expect(player.src).toBe('/audio/bgm-title.mp3'); expect(player.loop).toBe(true);
  });
  it('静音与后台暂停保留进度，重新开启后继续', async () => {
    const music = await import('../apps/web/src/music');
    music.setMusic('game'); music.unlockMusic(); const player = FakeAudio.instances[0];
    player.currentTime = 12; music.configureMusic(false, .2);
    expect(player.paused).toBe(true); music.configureMusic(true, .2);
    expect(player.paused).toBe(false); expect(player.currentTime).toBe(12);
    Object.assign(document, { hidden: true }); music.refreshMusic(); expect(player.paused).toBe(true);
    Object.assign(document, { hidden: false }); music.refreshMusic(); expect(player.paused).toBe(false);
    expect(player.currentTime).toBe(12);
  });
  it('自动播放被拒绝时，下次交互重试；音效停止不打断音乐', async () => {
    const music = await import('../apps/web/src/music');
    music.setMusic('title'); music.unlockMusic(); const player = FakeAudio.instances[0];
    player.paused = true; player.play.mockRejectedValueOnce(new Error('NotAllowedError'));
    music.refreshMusic(); await Promise.resolve();
    music.unlockMusic(); expect(player.paused).toBe(false);
    const { stopAudio, configureAudio } = await import('../apps/web/src/audio');
    stopAudio(); configureAudio(false, 0); expect(player.paused).toBe(false);
    music.stopMusic(); expect(player.paused).toBe(true);
  });
});
