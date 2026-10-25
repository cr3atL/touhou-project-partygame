import { CHARACTER_LIST } from '../../../packages/content';
import { publicAsset } from './assets';
export function CharacterCatalog() {
  return <section className="character-catalog" id="characters" aria-labelledby="characters-heading">
    <h2 id="characters-heading">七位旅人</h2>
    <div className="character-grid">{CHARACTER_LIST.map(character=><article className="character-card" key={character.id} aria-labelledby={`character-${character.id}`}>
      <div className="catalog-identity"><img src={publicAsset(`characters/${character.id}-portrait.svg`)} alt={character.name} loading="lazy"/><h3 id={`character-${character.id}`}>{character.name}</h3></div>
      <div className="catalog-skills"><div className="catalog-skill-title"><h4>{character.active}</h4><span>冷却 {character.cooldown} 回合</span></div><p>{character.activeText}</p>
      <div className="catalog-skill-title passive-title"><h4>{character.passive}</h4><span>被动{character.cleanseCooldown?` · 冷却 ${character.cleanseCooldown} 回合`:''}</span></div><p>{character.passiveText}</p></div>
    </article>)}</div>
  </section>;
}
