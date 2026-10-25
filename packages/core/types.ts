export const VERSIONS = { rules: '0.4.1', map: '0.1.0', protocol: 3, save: 3 } as const;
export type CharacterId = 'reimu' | 'marisa' | 'yukari' | 'remilia' | 'flandre' | 'yuyuko' | 'youmu';
export type Branch = 'ground' | 'spirit';
export interface Player { id: number; name: string; character: CharacterId; bot: boolean; turns: number; activeAt: number; passiveAt: number; bufferUsed: boolean }
export interface Piece { id: string; owner: number; index: number; progress: number; branch: Branch | null; shield: number | null; mark: { caster: number; expires: number; slow: number; retreat: number } | null }
/** Movement allowance is independent of the original natural die and its extra action. */
export interface Dice { value: number; natural: number; source: 'natural' | 'skill'; extra: boolean }
export interface Effect { type: string; [key: string]: unknown }
export interface ChoiceOption { id: string; label: string; effects: Effect[]; pieces?: string[]; nodes?: string[]; score?: number }
export interface Choice { id: number; kind: string; prompt: string; options: ChoiceOption[] }
export interface GameEvent { id: number; turn: number; type: string; text: string; pieces: string[]; from?: string; to?: string }
export interface GameState {
  versions: typeof VERSIONS; revision: number; players: Player[]; pieces: Piece[];
  current: number; turn: number; round: number; phase: 'roll' | 'action' | 'resolving' | 'over';
  dice: Dice | null; queue: Effect[]; choice: Choice | null; winner: number | null; rankings: number[];
  flags: { first: boolean; active: boolean; extra: boolean; used: Record<string, boolean>; moved: string[]; targeted: string[]; locked: string[]; rewritten: boolean };
  events: GameEvent[]; eventId: number; returns: number[];
  history: { command: Command; random: number[] }[];
}
export interface CastCommand { type: 'cast'; skill: string; caster?: string; targets?: string[]; branch?: Branch; mode?: 'advance' | 'switch' }
export interface MoveCommand { type: 'move'; piece: string; branch?: Branch; cleanse?: boolean; splitPiece?: string; splitBranch?: Branch }
export type Command = { type: 'roll' } | MoveCommand | CastCommand | { type: 'choose'; option: string } | { type: 'pass' };
export interface Action { id: string; kind: Command['type']; label: string; detail?: string; command: Command; pieces: string[]; nodes: string[]; score: number }
export interface DiceResult { piece: string; fromPublic: boolean; toPublic: boolean; first: boolean; natural: number; steps: number; spawn: boolean }
export interface RuleView {
  state: GameState; player: Player; own: Piece[]; enemies: Piece[];
  node(piece: Piece): string; distance(a: string, b: string): number;
  at(id: string): Piece; label(id: string): string;
  path(piece: Piece, steps: number, branch: Branch): string[];
  moves(steps: number, publicOnly?: boolean): ChoiceOption[];
  optionsAdvance(exclude?: string, steps?: number): ChoiceOption[];
}
export interface CharacterDefinition {
  id: CharacterId; name: string; short: string; glyph: string; color: string; active: string; passive: string; activeText: string; passiveText: string;
  cooldown: number; range?: number; cleanseCooldown?: number; splitThreshold?: number;
  actions(view: RuleView): Action[];
  cast(view: RuleView, command: CastCommand): Effect[];
  afterDice?(view: RuleView, result: DiceResult): Effect[];
  terrainRetreat?(view: RuleView, piece: Piece, steps: number): Effect[] | null;
  knockback?(view: RuleView, piece: Piece, steps: number): number;
}
export type Registry = Record<CharacterId, CharacterDefinition>;
export type Random = () => number;
export function action(command: Command, label: string, pieces: string[] = [], nodes: string[] = [], score = 0, detail?: string): Action {
  return { id: JSON.stringify(command), kind: command.type, command, label, pieces, nodes, score, detail };
}
