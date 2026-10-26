import { CHARACTERS } from '../../../packages/content';
import type { GameEvent, GameState } from '../../../packages/core/types';

export interface LogTurn { turn: number; title: string; owner: number | null; entries: { id: number; type: string; text: string }[] }

export function gameLogTurns(game: GameState): LogTurn[] {
  const turns: LogTurn[] = [];
  for (const event of game.events) {
    let group = turns.at(-1);
    if (!group || group.turn !== event.turn) {
      group = {turn:event.turn,title:event.turn<1?'开局掷骰':`回合 ${event.turn}`,owner:null,entries:[]};
      turns.push(group);
    }
    if (event.type === 'turn') {
      group.title = event.text;
      const name=event.text.slice(event.text.indexOf(' · ')+3);
      group.owner=game.players.find(p=>p.name===name)?.id ?? null;
      continue;
    }
    const text = describeEvent(event, game);
    if (group.entries.at(-1)?.text !== text) group.entries.push({id:event.id,type:event.type,text});
  }
  return turns;
}

function describeEvent(event: GameEvent, game: GameState): string {
  // Effects such as "获得一次保护" need to name their affected pieces in a standalone log.
  if (!['shield','cleanse'].includes(event.type) || !event.pieces.length) return event.text;
  const labels=event.pieces.map(id=>game.pieces.find(p=>p.id===id)).filter(p=>!!p)
    .map(p=>`${CHARACTERS[game.players[p.owner].character].short}${'①②③④'[p.index]}`);
  return labels.length && !labels.some(label=>event.text.includes(label)) ? `${labels.join('、')} · ${event.text}` : event.text;
}
