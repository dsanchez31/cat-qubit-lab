import { tutorialSteps } from "./steps";

interface TutorialProps {
  index: number;
  onNavigate: (index: number) => void;
}

export function Tutorial({ index, onNavigate }: TutorialProps) {
  const step = tutorialSteps[index];
  if (!step) {
    return null;
  }
  const last = tutorialSteps.length - 1;
  return (
    <div className="space-y-3">
      <fieldset className="flex items-center gap-1">
        <legend className="sr-only">Tutorial progress</legend>
        {tutorialSteps.map((s, i) => (
          <button
            key={s.title}
            type="button"
            aria-label={s.title}
            aria-current={i === index ? "step" : undefined}
            onClick={() => onNavigate(i)}
            className={`h-1 flex-1 rounded-full transition ${i <= index ? "bg-signal shadow-[0_0_8px_var(--color-signal)]" : "bg-paper/15 hover:bg-paper/30"}`}
          />
        ))}
      </fieldset>
      {/* Keyed on the step so that the entrance animation replays on navigation. */}
      <div key={index} className="space-y-2 motion-safe:animate-fade-up">
        <h3 className="text-base font-medium text-signal">{step.title}</h3>
        {step.paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-[13px] leading-relaxed text-slate-20">
            {paragraph}
          </p>
        ))}
      </div>
      <div className="flex justify-between">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onNavigate(index - 1)}
          className="text-xs text-slate-50 hover:text-paper disabled:invisible"
        >
          ← Previous
        </button>
        <button
          type="button"
          disabled={index === last}
          onClick={() => onNavigate(index + 1)}
          className="text-xs font-medium text-signal hover:brightness-110 disabled:invisible"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
