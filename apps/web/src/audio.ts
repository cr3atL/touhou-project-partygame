import { publicAsset } from './assets';

export type Sound = 'cat00' | 'pldead00' | 'nep00' | 'slash' | 'nodamage' | 'kira00' | 'cardget' | 'select00' | 'ok00' | 'cancel00' | 'dice-roll' | 'dice-settle' | 'piece-move' | 'timeout';
const sounds: Sound[] = ['cat00','pldead00','nep00','slash','nodamage','kira00','cardget','select00','ok00','cancel00','dice-roll','dice-settle','piece-move','timeout'];
let context: AudioContext | undefined, master: GainNode | undefined;
let enabled = true, volume = .45;
let generation = 0;
const buffers = new Map<Sound, Promise<AudioBuffer | null>>();
const active = new Set<AudioBufferSourceNode>();

function buffer(id: Sound) {
  const filename = ['dice-roll','dice-settle','piece-move'].includes(id) ? `${id}.wav` : `se_${id}.mp3`;
  if (!buffers.has(id)) buffers.set(id, fetch(publicAsset(`audio/${filename}`))
    .then(r => { if (!r.ok) throw new Error('Audio unavailable'); return r.arrayBuffer(); })
    .then(data => context!.decodeAudioData(data)).catch(() => { buffers.delete(id); return null; }));
  return buffers.get(id)!;
}
export function configureAudio(on: boolean, level: number) {
  enabled = on; volume = Math.max(0, Math.min(1, level));
  if (master && context) master.gain.setTargetAtTime(enabled ? volume : 0, context.currentTime, .025);
  if (!enabled) stopAudio();
}
export function stopAudio() {
  generation++;
  for (const source of active) { try { source.stop(); } catch { /* already ended */ } }
  active.clear();
}
/** Called from a real input gesture, including when sound was previously muted. */
export function unlockAudio() {
  try {
    if (!context) {
      context = new AudioContext(); master = context.createGain(); master.gain.value = enabled ? volume : 0; master.connect(context.destination);
      for (const id of sounds) void buffer(id);
    }
    if (context.state === 'suspended') void context.resume().catch(() => {});
  } catch { /* Audio is optional; gameplay must stay available. */ }
}
export function playSound(id: Sound, gain = 1, delay = 0) {
  const audio = context;
  const ticket = generation;
  if (!enabled || document.hidden || !audio || audio.state !== 'running') return;
  void buffer(id).then(decoded => {
    if (!decoded || ticket !== generation || !enabled || document.hidden || audio.state !== 'running' || active.size >= 8) return;
    const source = audio.createBufferSource(), level = audio.createGain();
    source.buffer = decoded; level.gain.value = gain; source.connect(level); level.connect(master!);
    active.add(source); source.onended = () => { active.delete(source); source.disconnect(); level.disconnect(); };
    source.start(audio.currentTime + delay / 1000);
    // A party-game impact should not leave the original long laser tail playing.
    if (id === 'nep00') {
      const end = audio.currentTime + delay / 1000 + .65;
      level.gain.setValueAtTime(gain, end - .15); level.gain.linearRampToValueAtTime(0, end); source.stop(end);
    }
  });
}
