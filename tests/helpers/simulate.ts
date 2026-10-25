import { CHARACTERS } from '../../packages/content';
import { reduceGame, seededRandom } from '../../packages/core/engine';
import type { Command, GameState } from '../../packages/core/types';
import { botAction } from '../../packages/session/bot';
export function simulate(game: GameState, maxSteps = 15000, seed = 42) {
  let state = structuredClone(game); const random = seededRandom(seed);
  const commands: Command[] = [];
  while (state.phase !== 'over' && commands.length < maxSteps) {
    const a = botAction(state); commands.push(a.command); state = reduceGame(state, a.command, CHARACTERS, random);
  }
  return { state, commands };
}
