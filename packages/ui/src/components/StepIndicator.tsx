import React from 'react';
import { Check } from 'lucide-react';

export interface StepItem {
  id: string;
  label: string;
}

export interface StepIndicatorProps {
  steps: StepItem[];
  currentStepIndex: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

export function StepIndicator({
  steps,
  currentStepIndex,
  onStepClick,
  className = '',
}: StepIndicatorProps): React.ReactElement {
  return (
    <nav aria-label="Progress" className={`it-step-indicator ${className}`}>
      <ol className="it-step-list">
        {steps.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;
          const isClickable = onStepClick && isCompleted;

          return (
            <li key={step.id} className="it-step-item">
              <button
                type="button"
                className={[
                  'it-step-pill',
                  isCompleted ? 'it-step-pill--completed' : '',
                  isCurrent ? 'it-step-pill--current' : '',
                  !isCompleted && !isCurrent ? 'it-step-pill--pending' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => isClickable && onStepClick(index)}
                disabled={!isClickable && !isCurrent}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span className="it-step-num">
                  {isCompleted ? <Check size={12} strokeWidth={3} /> : index + 1}
                </span>
                <span className="it-step-label">{step.label}</span>
              </button>
              {index < steps.length - 1 && (
                <span className="it-step-connector" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const CSS = `
.it-step-indicator {
  margin-bottom: var(--it-sp-6);
}

.it-step-list {
  display: flex;
  align-items: center;
  list-style: none;
  padding: 0;
  margin: 0;
  gap: var(--it-sp-2);
}

.it-step-item {
  display: flex;
  align-items: center;
  gap: var(--it-sp-2);
}

.it-step-pill {
  display: flex;
  align-items: center;
  gap: var(--it-sp-2);
  padding: var(--it-sp-2) var(--it-sp-4);
  border-radius: var(--it-r-pill);
  font-size: var(--it-text-sm);
  font-weight: var(--it-weight-semibold);
  border: 1px solid transparent;
  background: transparent;
  color: var(--it-text-secondary);
  cursor: default;
  transition: background-color var(--it-dur-fast) var(--it-ease), color var(--it-dur-fast) var(--it-ease);
}

.it-step-pill--current {
  background-color: var(--it-green-surface);
  color: var(--it-green-text);
  border-color: var(--it-green-border);
}

.it-step-pill--completed {
  background-color: var(--it-surface);
  color: var(--it-text-primary);
  border-color: var(--it-border);
  cursor: pointer;
}
.it-step-pill--completed:hover {
  background-color: var(--it-gray-surface);
}

.it-step-pill--pending {
  background-color: var(--it-surface);
  color: var(--it-text-disabled);
  border-color: var(--it-border);
}

.it-step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.06);
  font-size: var(--it-text-xs);
  font-weight: var(--it-weight-bold);
}
[data-theme='dark'] .it-step-num {
  background-color: rgba(255, 255, 255, 0.1);
}

.it-step-pill--current .it-step-num {
  background-color: var(--it-green);
  color: #ffffff;
}

.it-step-pill--completed .it-step-num {
  background-color: var(--it-green);
  color: #ffffff;
}

.it-step-connector {
  width: 24px;
  height: 2px;
  background-color: var(--it-border);
}
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-step-indicator-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-step-indicator-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
