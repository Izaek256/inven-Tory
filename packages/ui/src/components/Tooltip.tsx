import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 300,
}: TooltipProps): React.ReactElement {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((): void => {
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const offset = 8;
        const ttRect = tooltipRef.current?.getBoundingClientRect();
        const ttW = ttRect?.width ?? 200;
        const ttH = ttRect?.height ?? 28;

        switch (position) {
          case 'top':
            setCoords({ x: rect.left + rect.width / 2 - ttW / 2, y: rect.top - ttH - offset });
            break;
          case 'bottom':
            setCoords({ x: rect.left + rect.width / 2 - ttW / 2, y: rect.bottom + offset });
            break;
          case 'left':
            setCoords({ x: rect.left - ttW - offset, y: rect.top + rect.height / 2 - ttH / 2 });
            break;
          case 'right':
            setCoords({ x: rect.right + offset, y: rect.top + rect.height / 2 - ttH / 2 });
            break;
        }
      }
      setVisible(true);
    }, delay);
  }, [position, delay]);

  const hide = useCallback((): void => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  useEffect(() => {
    return (): void => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const trigger = React.cloneElement(children, {
    ref: triggerRef,
    onMouseEnter: (e: React.MouseEvent) => {
      show();
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide();
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      show();
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      hide();
      children.props.onBlur?.(e);
    },
  });

  const tooltipEl = visible ? (
    <div
      ref={tooltipRef}
      role="tooltip"
      className={`it-tooltip it-tooltip--${position}`}
      style={{
        position: 'fixed',
        left: coords.x,
        top: coords.y,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      {content}
      <div className={`it-tooltip__arrow it-tooltip__arrow--${position}`} />
    </div>
  ) : null;

  return (
    <>
      {trigger}
      {tooltipEl && createPortal(tooltipEl, document.body)}
    </>
  );
}

const CSS = `
.it-tooltip {
  background-color: var(--ink);
  color: #fff;
  font-size: 12px;
  font-family: var(--it-font-ui);
  padding: 5px 10px;
  border-radius: var(--it-r-sm);
  white-space: nowrap;
  box-shadow: var(--it-shadow-lg);
  animation: it-tooltip-in 0.12s ease both;
  max-width: 280px;
  white-space: normal;
  pointer-events: none;
}
@keyframes it-tooltip-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .it-tooltip { animation: none; }
}
.it-tooltip__arrow {
  position: absolute;
  width: 6px;
  height: 6px;
  background-color: var(--ink);
  transform: rotate(45deg);
}
.it-tooltip__arrow--top {
  bottom: -3px;
  left: 50%;
  margin-left: -3px;
}
.it-tooltip__arrow--bottom {
  top: -3px;
  left: 50%;
  margin-left: -3px;
}
.it-tooltip__arrow--left {
  right: -3px;
  top: 50%;
  margin-top: -3px;
}
.it-tooltip__arrow--right {
  left: -3px;
  top: 50%;
  margin-top: -3px;
}
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-tooltip-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-tooltip-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
