import { useId } from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  hint?: string;
}

export function Slider({ label, value, min, max, step, onChange, format, hint }: SliderProps) {
  const id = useId();
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <label htmlFor={id} className="text-slate-20">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-[11px] text-paper tabular-nums">
          {format ? format(value) : value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint && <p className="text-[11px] text-slate-50">{hint}</p>}
    </div>
  );
}

interface LogSliderProps extends Omit<SliderProps, "min" | "max" | "step"> {
  /** Base-10 exponents of the range ends. */
  minExponent: number;
  maxExponent: number;
  /** Maps the leftmost position to exactly zero. */
  allowZero?: boolean;
}

const LOG_STEPS = 100;

export function LogSlider({
  value,
  minExponent,
  maxExponent,
  allowZero = false,
  onChange,
  ...rest
}: LogSliderProps) {
  const span = maxExponent - minExponent;
  const position =
    allowZero && value <= 0
      ? 0
      : Math.round(
          ((Math.log10(Math.max(value, 10 ** minExponent)) - minExponent) / span) * LOG_STEPS,
        );
  return (
    <Slider
      {...rest}
      value={position}
      min={0}
      max={LOG_STEPS}
      step={1}
      format={() => (rest.format ? rest.format(value) : formatRate(value))}
      onChange={(next) =>
        onChange(allowZero && next === 0 ? 0 : 10 ** (minExponent + (next / LOG_STEPS) * span))
      }
    />
  );
}

export function formatRate(value: number): string {
  if (value === 0) {
    return "0";
  }
  return value >= 0.01 ? value.toFixed(3) : value.toExponential(1);
}
