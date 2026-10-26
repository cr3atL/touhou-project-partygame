import { playUISound, stopAudio, unlockAudio } from './audio';
import { refreshMusic, stopMusic, unlockMusic } from './music';

const selector = 'button,[role="button"],select,summary,a[href]';

export function installUIAudio() {
  let keyboardNavigation = false;
  let lastSelection: Element | null = null;
  const control = (target: EventTarget | null): Element | null => {
    const element = target instanceof Element ? target.closest(selector) : null;
    return element && !element.matches(':disabled,[aria-disabled="true"]') ? element : null;
  };
  const select = (element: Element | null) => {
    if (!element || element === lastSelection || element.classList.contains('dice-button')) return;
    lastSelection = element; playUISound('select00');
  };
  const pointerdown = () => {
    keyboardNavigation = false; lastSelection = null;
    unlockAudio(); unlockMusic();
  };
  const pointerover = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const element = control(event.target);
    if (element && !element.contains(event.relatedTarget as Node | null)) select(element);
  };
  const pointerout = (event: PointerEvent) => {
    const element = control(event.target);
    if (element === lastSelection && !element?.contains(event.relatedTarget as Node | null)) lastSelection = null;
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    unlockAudio(); unlockMusic();
    keyboardNavigation = ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key);
    if (event.key === 'Escape' && document.querySelector('[aria-modal="true"],.title-screen:not(.title-main)')) playUISound('cancel00');
  };
  const focusin = (event: FocusEvent) => { if (keyboardNavigation) select(control(event.target)); };
  const click = (event: MouseEvent) => {
    unlockAudio(); unlockMusic();
    const element = control(event.target);
    if (element?.classList.contains('dice-button')) return;
    if (element?.matches('select')) return;
    if (!element) {
      if (event.target instanceof Element && event.target.matches('.dialog-backdrop,.presentation-settings-backdrop')) playUISound('cancel00');
      return;
    }
    const label = element.getAttribute('aria-label') || element.textContent || '';
    playUISound(/返回|退出|离开|取消|关闭|收起/.test(label) ? 'cancel00' : 'ok00');
  };
  const change = (event: Event) => { if (control(event.target)?.matches('select')) playUISound('ok00'); };
  const visibility = () => { if (document.hidden) stopAudio(); refreshMusic(); };
  window.addEventListener('pointerdown', pointerdown, true);
  window.addEventListener('pointerover', pointerover, true);
  window.addEventListener('pointerout', pointerout, true);
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('focusin', focusin, true);
  window.addEventListener('click', click, true);
  window.addEventListener('change', change, true);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    window.removeEventListener('pointerdown', pointerdown, true);
    window.removeEventListener('pointerover', pointerover, true);
    window.removeEventListener('pointerout', pointerout, true);
    window.removeEventListener('keydown', keydown, true);
    window.removeEventListener('focusin', focusin, true);
    window.removeEventListener('click', click, true);
    window.removeEventListener('change', change, true);
    document.removeEventListener('visibilitychange', visibility);
    stopAudio(); stopMusic();
  };
}
