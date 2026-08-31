import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../ThemeContext';

export function ThemeToggle(): React.ReactElement {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={`it-theme-toggle ${isDark ? 'it-theme-toggle--dark' : 'it-theme-toggle--light'}`}
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="it-theme-toggle__track" aria-hidden="true">
        <span className="it-theme-toggle__thumb">
          {isDark ? <Moon size={10} aria-hidden="true" /> : <Sun size={10} aria-hidden="true" />}
        </span>
      </span>
      <span className="it-theme-toggle__label">{isDark ? 'Dark' : 'Light'}</span>
    </button>
  );
}

const CSS = `
.it-theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--it-sp-2);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--it-sp-1) var(--it-sp-2);
  border-radius: var(--it-r-pill);
  transition: background-color var(--it-dur-fast) var(--it-ease);
}
.it-theme-toggle:hover { background-color: var(--it-gray-surface); }
.it-theme-toggle:focus-visible { outline: none; box-shadow: var(--it-focus-ring); }

.it-theme-toggle__track {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: var(--it-r-pill);
  background-color: var(--it-border-strong);
  transition: background-color var(--it-dur-base) var(--it-ease);
  flex-shrink: 0;
}
.it-theme-toggle--dark .it-theme-toggle__track {
  background-color: var(--it-green);
}

.it-theme-toggle__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--it-gray-text);
  transition: transform var(--it-dur-base) var(--it-ease);
  box-shadow: var(--it-shadow-xs);
}
.it-theme-toggle--dark .it-theme-toggle__thumb {
  transform: translateX(16px);
  color: var(--it-green);
  background-color: var(--it-card);
}

.it-theme-toggle__label {
  font-size: var(--it-text-xs);
  font-weight: var(--it-weight-semibold);
  color: var(--it-text-secondary);
  letter-spacing: var(--it-tracking-label);
  text-transform: uppercase;
}

@media (prefers-reduced-motion: reduce) {
  .it-theme-toggle__track,
  .it-theme-toggle__thumb { transition: none; }
}
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-theme-toggle-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-theme-toggle-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
