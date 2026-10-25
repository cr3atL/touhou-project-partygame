import { useLayoutEffect, useRef, useState } from 'react';
import type { GameState } from '../../../packages/core/types';
import { playSound, stopAudio } from './audio';
import { presentationBeat, SPELL_DECLARE_MS, SPELL_RETURN_MS, spellSequence, type PresentationBeat, type SpellPresentation } from './presentationModel';

/** Playback is local to the view; rules and server revisions never depend on animation. */
export function useGamePresentation(source: GameState | null, session = 0) {
  const [game, setGame] = useState(source);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState(5);
  const [reveal, setReveal] = useState(0);
  const [spell, setSpell] = useState<SpellPresentation | null>(null);
  const [beat, setBeat] = useState<PresentationBeat | null>(null);
  const sessionRef = useRef(session);
  const playback = useRef({ latest: source, shown: source, queue: [] as GameState[], running: false, generation: 0 });

  useLayoutEffect(() => {
    const state = playback.current;
    if (source === state.latest && sessionRef.current === session) return;
    if (!source || !state.latest || sessionRef.current !== session || source.revision < state.latest.revision) {
      sessionRef.current = session;
      state.generation++;
      state.latest = source; state.shown = source; state.queue = []; state.running = false;
      setGame(source); setBusy(false); setRolling(false); setSpell(null); setBeat(null); stopAudio();
      return;
    }
    // Lobby/connection updates may repeat the same authoritative game snapshot.
    if (source.revision === state.latest.revision) return;
    state.latest = source;
    state.queue.push(source);
    if (state.running) return;
    state.running = true;
    setBusy(true);
    const generation = state.generation;
    const alive = () => generation === state.generation;
    const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    void (async () => {
      while (state.queue.length && alive()) {
        const next = state.queue.shift()!;
        const packet = presentationBeat(state.shown!, next);
        const events = packet.events;
        const diceEvent = events.find(e => e.type === 'dice');
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const sequence = spellSequence(packet);
        if (packet.spell) {
          setBeat(packet); setSpell(packet.spell); playSound('cat00', .85);
          await sleep(SPELL_DECLARE_MS);
          if (!alive()) return;
          setSpell(null);
          const sound = packet.spell.character === 'marisa' ? 'nep00' : ['youmu','flandre'].includes(packet.spell.character) ? 'slash' : 'kira00';
          if(sound!=='kira00'||!events.some(e=>e.type==='shield')) {
            if(sequence&&!reduced)for(const target of sequence.targets)playSound(sound,.8,target.launch);
            else playSound(sound,.8);
          }
        }
        if (diceEvent) {
          setRolling(true);
          if (!reduced) playSound('dice-roll', .9);
          if (!reduced) {
            for (let i = 0; i < 10 && alive(); i++) {
              setFace((i * 5 + 2) % 6 + 1);
              await sleep(55 + i * 5);
            }
          }
          if (!alive()) return;
          setRolling(false);
          setReveal(diceEvent.id);
          playSound('dice-settle', .85);
        }
        if (!packet.spell) setBeat(packet);
        state.shown = next;
        setGame(next);
        const moved = events.some(e => e.type === 'move' || e.type === 'return');
        const impactDelay = reduced ? 0 : sequence?.targets[0]?.impact ?? 430;
        for(const event of events.filter(e => e.type === 'return')) {
          const impact = sequence?.targets.find(t => event.pieces.includes(t.piece))?.impact;
          playSound('pldead00', .65, reduced ? 0 : impact ?? impactDelay);
        }
        if (events.some(e => e.type === 'shield')) {
          const sounds=new Map<string,{blocked:boolean;delay:number}>();
          for(const event of events.filter(e=>e.type==='shield'))for(const id of event.pieces) {
            const blocked=packet.before.pieces.find(p=>p.id===id)?.shield!==null&&next.pieces.find(p=>p.id===id)?.shield===null;
            const delay=reduced?0:sequence?.targets.find(t=>t.piece===id)?.impact??(moved?impactDelay:50);
            sounds.set(`${blocked}-${delay}`,{blocked,delay});
          }
          for(const {blocked,delay} of sounds.values())playSound(blocked?'nodamage':'kira00',.65,delay);
        } else if (!packet.spell && (events.some(e => ['cleanse','passive','mark'].includes(e.type)) || packet.before.choice && ['wind','advance'].includes(packet.before.choice.kind) && moved)) playSound('kira00', .5);
        if (events.some(e => e.type === 'place' || e.type === 'move' && e.to?.startsWith('done'))) playSound('cardget', .7, impactDelay);
        else if (moved && !packet.spell) playSound('piece-move', .95);
        if (events.some(e => e.type === 'turn' || e.type === 'extra')) playSound('ok00', .4, moved ? 650 : 0);
        await sleep(reduced ? packet.spell ? 250 : 0 : sequence?.duration ?? (packet.spell || moved ? 920 : diceEvent ? 260 : 180));
        if (!alive()) return;
        setBeat(null);
        if(packet.spell&&!reduced)await sleep(SPELL_RETURN_MS);
      }
      if (alive()) { state.running = false; setBusy(false); }
    })();
  }, [source, session]);

  useLayoutEffect(() => () => { playback.current.generation++; }, []);
  return { game, busy, rolling, face, reveal, spell, beat };
}
