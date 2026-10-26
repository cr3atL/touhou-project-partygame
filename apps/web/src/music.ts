import { publicAsset } from './assets';

export type Music = 'title' | 'game';
export const MUSIC = {
  title: { id: 'title', title: '少女奇想天外曲', file: 'audio/bgm-title.mp3' },
  game: { id: 'jazz', title: '恋色ジャズタイム', file: 'audio/bgm-game.mp3' }
} as const;
export const GAME_MUSIC = [
  MUSIC.game,
  { id: 'cirno', title: 'チルノの日常', file: 'audio/bgm-game-cirno.mp3' },
  { id: 'momiji', title: '椛の日常', file: 'audio/bgm-game-momiji.mp3' },
  { id: 'sunflower', title: "向日葵's Coffee", file: 'audio/bgm-game-sunflower.mp3' },
  { id: 'forest-cafe', title: '魔法の森のカフェ', file: 'audio/bgm-game-forest-cafe.mp3' },
  { id: 'tea', title: '紅茶を飲みましょう', file: 'audio/bgm-game-tea.mp3' }
] as const;
type GameTrack = typeof GAME_MUSIC[number];
type Track = typeof MUSIC.title | GameTrack;
const FADE_SECONDS = 1.2;

/** Every available song is used once per bag, including across the bag boundary. */
export function shuffleGameMusic(previous: string | null, random = Math.random): GameTrack[] {
  const result: GameTrack[] = [...GAME_MUSIC];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  if (result[0].id === previous) [result[0], result[1]] = [result[1], result[0]];
  return result;
}

let player: HTMLAudioElement | undefined;
let scene: Music | null = null;
let track: Track | null = null;
let loaded: string | null = null;
let queue: GameTrack[] = [];
let previous: string | null = null;
const failed = new Set<string>();
let unlocked = false, enabled = true, volume = .28;

function nextGameTrack(): GameTrack | null {
  queue = queue.filter(song => !failed.has(song.id));
  if (!queue.length) queue = shuffleGameMusic(previous).filter(song => !failed.has(song.id));
  // Filtering unavailable songs can expose the previous song at a bag boundary.
  if (queue.length > 1 && queue[0].id === previous) [queue[0], queue[1]] = [queue[1], queue[0]];
  const next = queue.shift() ?? null;
  if (next) previous = next.id;
  return next;
}

function updateVolume() {
  if (!player) return;
  // Use media time so pausing in the background also freezes the fade envelope.
  const fadeIn = scene === 'game' ? Math.min(1, player.currentTime / FADE_SECONDS) : 1;
  const fadeOut = scene === 'game' && Number.isFinite(player.duration) ? Math.min(1, Math.max(0, player.duration - player.currentTime) / FADE_SECONDS) : 1;
  player.volume = volume * Math.max(0, Math.min(fadeIn, fadeOut));
}

function syncMusic() {
  if (!unlocked || !track) { player?.pause(); return; }
  if (!player) {
    player = new Audio(); player.preload = 'auto';
    player.addEventListener('timeupdate', updateVolume);
    player.addEventListener('loadedmetadata', updateVolume);
    player.addEventListener('ended', () => {
      if (scene !== 'game' || !player?.ended) return;
      track = nextGameTrack(); syncMusic();
    });
    player.addEventListener('error', () => {
      if (scene !== 'game' || !track) return;
      failed.add(track.id); track = nextGameTrack(); syncMusic();
    });
  }
  player.loop = scene === 'title';
  if (loaded !== track.id) { loaded = track.id; player.src = publicAsset(track.file); }
  updateVolume();
  if (!enabled || document.hidden) player.pause();
  else if (player.paused) void player.play().catch(() => { /* Retry on the next user gesture. */ });
}

export function setMusic(next: Music) {
  if (scene !== next) {
    scene = next; queue = []; failed.clear();
    track = next === 'title' ? MUSIC.title : nextGameTrack();
  }
  syncMusic();
}
export function configureMusic(on: boolean, level: number) {
  enabled = on; volume = Math.max(0, Math.min(1, level)); syncMusic();
}
export function unlockMusic() { unlocked = true; syncMusic(); }
export function refreshMusic() { syncMusic(); }
export function stopMusic() { scene = null; track = null; queue = []; player?.pause(); }
