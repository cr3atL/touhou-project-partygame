import type { CSSProperties } from 'react';
import { CHARACTERS } from '../../../packages/content';
import { publicAsset } from './assets';
import { SPELL_DECLARE_MS, type SpellPresentation } from './presentationModel';

export function SpellCutIn({ spell }: { spell: SpellPresentation }) {
  const character = CHARACTERS[spell.character];
  return <div className="spell-cut-in" key={spell.id} role="status" aria-label={`${spell.player}，${character.active}`} style={{'--spell-color':character.color,'--spell-duration':`${SPELL_DECLARE_MS}ms`} as CSSProperties}>
    <div className="spell-cut-band"/><div className="spell-cut-seal">✦</div>
    <img className="spell-cut-portrait" src={publicAsset(`characters/${spell.character}-portrait.svg`)} alt=""/>
    <div className="spell-cut-copy"><span>{character.name}</span><strong>{character.active}</strong></div>
    <div className="spell-cut-streaks"/>
  </div>;
}
