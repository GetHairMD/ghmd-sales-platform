'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/design/cn';

export interface TabItem {
  key: string;
  label: string;
  disabled?: boolean;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onValueChange: (key: string) => void;
  className?: string;
}

/**
 * Accessible tablist (PRD §4.3) — roving focus, Left/Right/Home/End keys.
 * Panels are rendered by the consumer keyed off `value`.
 */
export default function Tabs({ tabs, value, onValueChange, className }: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusTab(index: number) {
    const enabled = tabs.map((t, i) => ({ t, i })).filter(({ t }) => !t.disabled);
    if (enabled.length === 0) return;
    const wrapped = ((index % tabs.length) + tabs.length) % tabs.length;
    // Skip disabled tabs.
    let idx = wrapped;
    while (tabs[idx].disabled) idx = (idx + 1) % tabs.length;
    refs.current[idx]?.focus();
    onValueChange(tabs[idx].key);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusTab(index + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusTab(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusTab(0);
        break;
      case 'End':
        e.preventDefault();
        focusTab(tabs.length - 1);
        break;
    }
  }

  return (
    <div role="tablist" className={cn('flex items-center gap-1 border-b border-mist', className)}>
      {tabs.map((tab, i) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={tab.disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(tab.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 font-heading text-sm uppercase tracking-caps',
              'transition-colors duration-base ease-standard',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
              'disabled:opacity-40 disabled:pointer-events-none',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
