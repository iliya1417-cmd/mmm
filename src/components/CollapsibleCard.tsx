import React, { useState } from 'react';
import { ChevronDown, ChevronLeft, Maximize2 } from 'lucide-react';

export type CollapsibleCardSize = 'sm' | 'md' | 'lg' | 'auto';

interface CollapsibleCardProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  headerActions?: React.ReactNode;
  defaultOpen?: boolean;
  resizable?: boolean;
  defaultSize?: CollapsibleCardSize;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

const SIZE_LABELS: Record<CollapsibleCardSize, string> = {
  sm: 'کوچک',
  md: 'متوسط',
  lg: 'بزرگ',
  auto: 'کامل',
};

const SIZE_MAX_HEIGHT_CLASSES: Record<CollapsibleCardSize, string> = {
  sm: 'max-h-64 overflow-auto',
  md: 'max-h-[420px] overflow-auto',
  lg: 'max-h-[680px] overflow-auto',
  auto: 'overflow-x-auto',
};

export const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  title,
  subtitle,
  badge,
  headerActions,
  defaultOpen = true,
  resizable = true,
  defaultSize = 'auto',
  className = '',
  bodyClassName = '',
  children,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);
  const [size, setSize] = useState<CollapsibleCardSize>(defaultSize);

  return (
    <section
      aria-label={title}
      className={`bg-white border border-slate-200 rounded-lg overflow-hidden ${className}`}
    >
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50/75 flex flex-wrap items-center justify-between gap-2.5">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-start gap-2.5 text-right group min-w-[240px] flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/30 rounded"
        >
          <span className="mt-0.5 p-1 rounded bg-white border border-slate-200 text-slate-600 group-hover:text-teal-800 group-hover:border-teal-300 transition-colors shrink-0">
            {isOpen ? (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900 group-hover:text-teal-900 transition-colors">
                {title}
              </h2>
              {badge}
            </div>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-2 max-w-full">
          {isOpen && resizable && (
            <div
              className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 border border-slate-200 rounded-md"
              role="group"
              aria-label={`تنظیم اندازه کادر ${title}`}
            >
              <Maximize2
                className="w-3 h-3 text-slate-400 mx-1 hidden sm:inline"
                aria-hidden="true"
              />
              {(['sm', 'md', 'lg', 'auto'] as CollapsibleCardSize[]).map(
                (preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSize(preset)}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                      size === preset
                        ? 'bg-white text-teal-800 shadow-2xs border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {SIZE_LABELS[preset]}
                  </button>
                )
              )}
            </div>
          )}
          {headerActions}
        </div>
      </div>

      {isOpen && (
        <div
          className={`${SIZE_MAX_HEIGHT_CLASSES[size]} ${
            resizable ? 'resize-y min-h-[60px]' : ''
          } ${bodyClassName}`}
        >
          {children}
        </div>
      )}
    </section>
  );
};
