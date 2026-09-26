/**
 * Animation utilities for view transitions and micro-interactions.
 * P3: View transition animations (slide/fade) and micro-animations.
 */

export type TransitionDirection = 'slide-left' | 'slide-right' | 'fade' | 'scale';

/**
 * CSS class names for view transitions
 */
export const TRANSITION_CLASSES = {
  // Entering
  'slide-left-enter': 'it-transition it-transition--slide-left it-transition--enter',
  'slide-left-enter-active': 'it-transition it-transition--slide-left it-transition--enter-active',
  'slide-right-enter': 'it-transition it-transition--slide-right it-transition--enter',
  'slide-right-enter-active':
    'it-transition it-transition--slide-right it-transition--enter-active',
  'fade-enter': 'it-transition it-transition--fade it-transition--enter',
  'fade-enter-active': 'it-transition it-transition--fade it-transition--enter-active',
  'scale-enter': 'it-transition it-transition--scale it-transition--enter',
  'scale-enter-active': 'it-transition it-transition--scale it-transition--enter-active',

  // Exiting
  'slide-left-exit': 'it-transition it-transition--slide-left it-transition--exit',
  'slide-left-exit-active': 'it-transition it-transition--slide-left it-transition--exit-active',
  'slide-right-exit': 'it-transition it-transition--slide-right it-transition--exit',
  'slide-right-exit-active': 'it-transition it-transition--slide-right it-transition--exit-active',
  'fade-exit': 'it-transition it-transition--fade it-transition--exit',
  'fade-exit-active': 'it-transition it-transition--fade it-transition--exit-active',
  'scale-exit': 'it-transition it-transition--scale it-transition--exit',
  'scale-exit-active': 'it-transition it-transition--scale it-transition--exit-active',
} as const;

/**
 * Get transition classes for a direction
 */
export function getTransitionClasses(
  direction: TransitionDirection,
  phase: 'enter' | 'exit',
  active: boolean = false,
): string {
  const base = `it-transition it-transition--${direction} it-transition--${phase}`;
  return active ? `${base} it-transition--${phase}-active` : base;
}

/**
 * Micro-animation variants for button press, success feedback, etc.
 */
export const MICRO_ANIMATIONS = {
  /** Button press - quick scale down */
  press: 'it-micro-press',
  /** Success checkmark - scale up with bounce */
  success: 'it-micro-success',
  /** Error shake */
  error: 'it-micro-error',
  /** Pulse for loading/attention */
  pulse: 'it-micro-pulse',
  /** Fade in/out for toasts/notifications */
  fade: 'it-micro-fade',
  /** Slide up for dropdowns/modals */
  slideUp: 'it-micro-slide-up',
  /** Slide down for dropdowns */
  slideDown: 'it-micro-slide-down',
} as const;

/**
 * Apply a micro-animation to an element (one-shot, auto-removes)
 */
export function triggerMicroAnimation(
  element: HTMLElement,
  animation: keyof typeof MICRO_ANIMATIONS,
  duration: number = 300,
): Promise<void> {
  return new Promise((resolve) => {
    const className = MICRO_ANIMATIONS[animation];
    element.classList.add(className);

    const cleanup = () => {
      element.classList.remove(className);
      element.removeEventListener('animationend', cleanup);
      resolve();
    };

    element.addEventListener('animationend', cleanup);

    // Fallback timeout
    setTimeout(cleanup, duration + 50);
  });
}

/**
 * CSS for transitions and micro-animations (injected on first import)
 */
const ANIMATION_CSS = `
/* ===== View Transitions ===== */
.it-transition {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  transition: transform 240ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 200ms ease;
  will-change: transform, opacity;
}

.it-transition--slide-left.it-transition--enter { transform: translateX(100%); opacity: 0; }
.it-transition--slide-left.it-transition--enter-active { transform: translateX(0); opacity: 1; }
.it-transition--slide-left.it-transition--exit { transform: translateX(0); opacity: 1; }
.it-transition--slide-left.it-transition--exit-active { transform: translateX(-100%); opacity: 0; }

.it-transition--slide-right.it-transition--enter { transform: translateX(-100%); opacity: 0; }
.it-transition--slide-right.it-transition--enter-active { transform: translateX(0); opacity: 1; }
.it-transition--slide-right.it-transition--exit { transform: translateX(0); opacity: 1; }
.it-transition--slide-right.it-transition--exit-active { transform: translateX(100%); opacity: 0; }

.it-transition--fade.it-transition--enter { opacity: 0; }
.it-transition--fade.it-transition--enter-active { opacity: 1; }
.it-transition--fade.it-transition--exit { opacity: 1; }
.it-transition--fade.it-transition--exit-active { opacity: 0; }

.it-transition--scale.it-transition--enter { transform: scale(0.95); opacity: 0; }
.it-transition--scale.it-transition--enter-active { transform: scale(1); opacity: 1; }
.it-transition--scale.it-transition--exit { transform: scale(1); opacity: 1; }
.it-transition--scale.it-transition--exit-active { transform: scale(0.95); opacity: 0; }

/* ===== Micro-animations ===== */
.it-micro-press {
  animation: it-press 120ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes it-press {
  0% { transform: scale(1); }
  50% { transform: scale(0.96); }
  100% { transform: scale(1); }
}

.it-micro-success {
  animation: it-success 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes it-success {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

.it-micro-error {
  animation: it-error 400ms cubic-bezier(0.36, 0.07, 0.19, 0.97);
}
@keyframes it-error {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}

.it-micro-pulse {
  animation: it-pulse 1.5s ease-in-out infinite;
}
@keyframes it-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.it-micro-fade {
  animation: it-fade 200ms ease;
}
@keyframes it-fade {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.it-micro-slide-up {
  animation: it-slide-up 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
@keyframes it-slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.it-micro-slide-down {
  animation: it-slide-down 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
@keyframes it-slide-down {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Button press feedback */
.it-btn:active:not(:disabled) {
  animation: it-press 100ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Toast/snackbar entrance */
.it-toast-enter {
  animation: it-slide-up 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.it-toast-exit {
  animation: it-fade 150ms ease reverse;
}

/* Dropdown/menu entrance */
.it-dropdown-enter {
  animation: it-slide-down 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.it-dropdown-exit {
  animation: it-fade 150ms ease reverse;
}
`;

// Inject CSS on first load
if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-animation-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-animation-styles';
    style.textContent = ANIMATION_CSS;
    document.head.appendChild(style);
  }
}
