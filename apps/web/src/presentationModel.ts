import { FINISH } from '../../../packages/core/constants';
import type { CharacterId, GameEvent, GameState } from '../../../packages/core/types';
import { piecePoint, type Point } from './boardModel';

export const SPELL_DECLARE_MS = 1500;
export const SPELL_FLIGHT_MS = 360;
export const SPELL_RETURN_MS = 280;
export interface SpellTarget { piece: string; launch: number; impact: number; from: Point; to: Point }
export interface SpellSequence { caster: string; origin: Point; targets: SpellTarget[]; duration: number }

export interface SpellPresentation { id: number; character: CharacterId; player: string; pieces: string[] }
export interface PresentationBeat { id: number; before: GameState; after: GameState; events: GameEvent[]; spell: SpellPresentation | null }
export function presentationBeat(before: GameState, after: GameState): PresentationBeat {
  const events = after.events.filter(e => e.id > before.eventId);
  const skill = events.find(e => e.type === 'skill');
  const player = before.players[before.current];
  return { id: after.revision, before, after, events, spell: skill ? {
    id: skill.id, character: player.character, player: player.name,
    pieces: [...new Set([...skill.pieces, ...events.filter(e => ['move','return','shield','mark','cleanse'].includes(e.type)).flatMap(e => e.pieces)])]
  } : null };
}
/** One clock for the camera, travelling effect, impact and piece movement. */
export function spellSequence(beat: PresentationBeat): SpellSequence | null {
  if (!beat.spell) return null;
  const command = beat.after.history.at(-1)?.command;
  const cast = command?.type === 'cast' ? command : undefined;
  const skill = beat.events.find(e => e.type === 'skill');
  const caster = cast?.caster ?? skill?.pieces.find(id => beat.before.pieces.find(p => p.id === id)?.owner === beat.before.current);
  const source = beat.before.pieces.find(p => p.id === caster);
  // Fate targets the die, so it keeps its existing dice effect and does not pan the map.
  if (!source) return null;
  const ids = [...new Set(cast?.targets?.length ? cast.targets : skill?.pieces.filter(id => id !== caster))];
  if (!ids.length) ids.push(source.id);
  for (const event of beat.events.filter(e => ['move','return','shield','mark','cleanse'].includes(e.type))) {
    for (const id of event.pieces) if (id !== caster && !ids.includes(id)) ids.push(id);
  }
  const targets = ids.flatMap((id, index) => {
    const before = beat.before.pieces.find(p => p.id === id), after = beat.after.pieces.find(p => p.id === id);
    if (!before || !after || before.progress < 0 || before.progress >= FINISH) return [];
    const launch = 220 + index * 600;
    const from = piecePoint(before), to = after.progress >= 0 && after.progress < FINISH ? piecePoint(after) : from;
    return [{ piece:id, launch, impact:launch+SPELL_FLIGHT_MS, from, to }];
  });
  return {caster:source.id, origin:piecePoint(source), targets, duration:Math.max(920,(targets.at(-1)?.impact ?? 0)+900)};
}

export function spellPieceMotion(beat: PresentationBeat | null, id: string) {
  const sequence = beat && spellSequence(beat);
  if (!sequence) return {delay:0,duration:600};
  if (id === sequence.caster) return beat!.spell!.character === 'flandre'
    ? {delay:0,duration:220} : {delay:220,duration:SPELL_FLIGHT_MS};
  return {delay:sequence.targets.find(t => t.piece === id)?.impact ?? 0,duration:480};
}
