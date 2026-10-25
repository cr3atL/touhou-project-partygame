import { useEffect, useRef, useState } from 'react';
import { configureAudio, playSound, stopAudio, unlockAudio } from './audio';

export interface PresentationSettings { sound: boolean; volume: number; effects: boolean; closeup: boolean }
const defaults: PresentationSettings = { sound: true, volume: .45, effects: true, closeup: true };
export function usePresentationSettings() {
  const [settings, setSettings] = useState<PresentationSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('party-presentation') || '{}');
      return { sound: typeof saved.sound === 'boolean' ? saved.sound : true,
        volume: typeof saved.volume === 'number' && Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : .45,
        effects: typeof saved.effects === 'boolean' ? saved.effects : true, closeup: typeof saved.closeup === 'boolean' ? saved.closeup : true };
    } catch { return defaults; }
  });
  useEffect(() => {
    configureAudio(settings.sound, settings.volume);
    try { localStorage.setItem('party-presentation', JSON.stringify(settings)); } catch { /* optional preference */ }
  }, [settings]);
  useEffect(() => {
    const input = (event: Event) => {
      unlockAudio();
      if (event instanceof KeyboardEvent && (event.repeat || !['Enter',' '].includes(event.key))) return;
      const button = event.target instanceof Element ? event.target.closest('button,[role="button"]') : null;
      if (!button || button.matches(':disabled,[aria-disabled="true"]')) return;
      if (button.classList.contains('dice-button')) return;
      const label = button.getAttribute('aria-label') || button.textContent || '';
      playSound(/取消|关闭|收起/.test(label) ? 'cancel00' : button.classList.contains('primary') ? 'ok00' : 'select00', .45);
    };
    const hidden = () => { if (document.hidden) stopAudio(); };
    window.addEventListener('pointerdown', input, true); window.addEventListener('keydown', input, true);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pointerdown', input, true); window.removeEventListener('keydown', input, true); document.removeEventListener('visibilitychange', hidden); stopAudio(); };
  }, []);
  return [settings, setSettings] as const;
}
export function PresentationSettingsDialog({ settings, onChange, onClose, onReturnToLobby }: {
  settings: PresentationSettings; onChange(value: PresentationSettings): void; onClose(): void; onReturnToLobby?(): void;
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
    <div className="presentation-settings" role="dialog" aria-modal="true" aria-label="演出设置" ref={panel}>
      <div className="window-heading"><h3>演出设置</h3><button aria-label="关闭演出设置" onClick={onClose}>×</button></div>
      <label>音效<input type="checkbox" checked={settings.sound} onChange={e => onChange({...settings, sound:e.target.checked})}/></label>
      <label className="volume-setting">音量 <input aria-label="音效音量" type="range" min="0" max="100" value={Math.round(settings.volume*100)} onChange={e => onChange({...settings, volume:Number(e.target.value)/100})}/><output>{Math.round(settings.volume*100)}%</output></label>
      <label>地图特效<input type="checkbox" checked={settings.effects} onChange={e => onChange({...settings, effects:e.target.checked})}/></label>
      <label>符卡镜头特写 <input type="checkbox" checked={settings.closeup} onChange={e => onChange({...settings, closeup:e.target.checked})}/></label>
      {onReturnToLobby&&<button className="secondary wide settings-return" onClick={onReturnToLobby}>回到大厅</button>}
    </div>
  </div>;
}
