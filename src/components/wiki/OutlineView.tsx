import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { HeadingEntry } from '@/lib/markdown';

interface OutlineViewProps {
  readonly headings: HeadingEntry[];
  readonly contentRef: React.RefObject<HTMLDivElement>;
}

export function OutlineView({ headings, contentRef }: OutlineViewProps) {
  const [activeId, setActiveId] = useState<string>('');
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const container = contentRef.current;
    if (!container || headings.length === 0) {
      setActiveId('');
      return;
    }

    const detect = () => {
      const containerTop = container.getBoundingClientRect().top;
      let current = headings[0].id;
      for (const h of headings) {
        const el = container.querySelector<HTMLElement>(`#${CSS.escape(h.id)}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top - containerTop <= 72) current = h.id;
      }
      setActiveId(current);
    };

    detect();
    container.addEventListener('scroll', detect, { passive: true });
    return () => container.removeEventListener('scroll', detect);
  }, [headings, contentRef]);

  // Keep active outline item visible inside the outline scroll container
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const handleClick = (id: string) => {
    const container = contentRef.current;
    if (!container) return;
    container.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <ul className="text-sm py-1">
      {headings.map((h, i) => {
        const isActive = activeId === h.id;
        return (
          <li key={`${h.id}-${i}`}>
            <button
              ref={isActive ? activeItemRef : undefined}
              type="button"
              onClick={() => handleClick(h.id)}
              style={{ paddingLeft: `${(h.level - 1) * 10 + 8}px` }}
              className={cn(
                'w-full text-left py-0.5 pr-3 rounded-md transition-colors truncate text-xs leading-5',
                'hover:bg-muted/60',
                isActive
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground',
                h.level === 1 && 'font-semibold',
              )}
            >
              {h.text}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
