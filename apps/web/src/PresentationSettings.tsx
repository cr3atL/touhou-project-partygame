import { useEffect, useRef, useState } from 'react';
import { configureAudio } from './audio';
import { configureMusic } from './music';
import { installUIAudio } from './uiAudio';

export interface PresentationSettings { sound: boolean; volume: number; music: boolean; musicVolume: number; effects: boolean; closeup: boolean }
const defaults: PresentationSettings = { sound: true, volume: .45, music: true, musicVolume: .28, effects: true, closeup: true };
export function usePresentationSettings() {
  const [settings, setSettings] = useState<PresentationSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('party-presentation') || '{}');
      return { sound: typeof saved.sound === 'boolean' ? saved.sound : true,
        volume: typeof saved.volume === 'number' && Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : .45,
        music: typeof saved.music === 'boolean' ? saved.music : true,
        musicVolume: typeof saved.musicVolume === 'number' && Number.isFinite(saved.musicVolume) ? Math.max(0, Math.min(1, saved.musicVolume)) : .28,
        effects: typeof saved.effects === 'boolean' ? saved.effects : true, closeup: typeof saved.closeup === 'boolean' ? saved.closeup : true };
    } catch { return defaults; }
  });
  useEffect(() => {
    configureAudio(settings.sound, settings.volume);
    configureMusic(settings.music, settings.musicVolume);
    try { localStorage.setItem('party-presentation', JSON.stringify(settings)); } catch { /* optional preference */ }
  }, [settings]);
  useEffect(installUIAudio, []);
  return [settings, setSettings] as const;
}
export function PresentationSettingsDialog({ settings, onChange, onClose, onReturnToLobby, inGame=false, online=false }: {
  settings: PresentationSettings; onChange(value: PresentationSettings): void; onClose(): void; onReturnToLobby?(): void; inGame?:boolean; online?:boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const controls = [...panel.current!.querySelectorAll<HTMLElement>('button,input')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); previous?.focus(); };
  }, []);
  return <div className="presentation-settings-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="presentation-settings" role="dialog" aria-modal="true" aria-label={inGame?'对局菜单':'设置'} ref={panel}>
      <div className="window-heading"><h3>{inGame?'对局菜单':'设置'}</h3><button aria-label="关闭设置" onClick={onClose}>×</button></div>
      {inGame&&<p className="menu-pause">{online?'联机对局仍在进行':'对局已暂停'}</p>}
      <label>音效<input type="checkbox" checked={settings.sound} onChange={e => onChange({...settings, sound:e.target.checked})}/></label>
      <label className="volume-setting">音效音量 <input aria-label="音效音量" type="range" min="0" max="100" value={Math.round(settings.volume*100)} onChange={e => onChange({...settings, volume:Number(e.target.value)/100})}/><output>{Math.round(settings.volume*100)}%</output></label>
      <label>音乐<input type="checkbox" checked={settings.music} onChange={e => onChange({...settings, music:e.target.checked})}/></label>
      <label className="volume-setting">音乐音量 <input aria-label="音乐音量" type="range" min="0" max="100" value={Math.round(settings.musicVolume*100)} onChange={e => onChange({...settings, musicVolume:Number(e.target.value)/100})}/><output>{Math.round(settings.musicVolume*100)}%</output></label>
      <label>地图特效<input type="checkbox" checked={settings.effects} onChange={e => onChange({...settings, effects:e.target.checked})}/></label>
      <label>符卡镜头特写 <input type="checkbox" checked={settings.closeup} onChange={e => onChange({...settings, closeup:e.target.checked})}/></label>
      {onReturnToLobby&&<button className="secondary wide settings-return" onClick={onReturnToLobby}>返回标题</button>}
    </div>
  </div>;
}
