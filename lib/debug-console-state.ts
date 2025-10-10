'use client';

const DEBUG_CONSOLE_KEY = 'chat-line-debug-console-visible';

export const debugConsoleState = {
  isVisible(): boolean {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(DEBUG_CONSOLE_KEY);
    return stored === 'true';
  },

  setVisible(visible: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(DEBUG_CONSOLE_KEY, String(visible));
    window.dispatchEvent(new CustomEvent('debug-console-visibility-change', {
      detail: { visible }
    }));
  },

  toggle(): boolean {
    const newValue = !this.isVisible();
    this.setVisible(newValue);
    return newValue;
  }
};
