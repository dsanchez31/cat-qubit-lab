import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Frosted-glass card floating over the 3D view. */
export function Panel({ title, aside, className = "", children }: PanelProps) {
  return (
    <section
      className={`pointer-events-auto rounded-2xl border border-paper/10 bg-ink/60 p-4 shadow-glass backdrop-blur-xl ${className}`}
    >
      {title && (
        <header className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-50">
            {title}
          </h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}
