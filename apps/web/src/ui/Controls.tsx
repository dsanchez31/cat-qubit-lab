import type { CatParameters, InitialState, Observables } from "../simulation/messages";
import { LogSlider, Slider } from "./Slider";

interface ControlsProps {
  parameters: CatParameters;
  dimension: number;
  recommendedDimension: number;
  observables: Observables | null;
  onParametersChange: (parameters: CatParameters) => void;
  onDimensionChange: (dimension: number) => void;
  onReset: (state: InitialState) => void;
}

export function Controls({
  parameters,
  dimension,
  recommendedDimension,
  observables,
  onParametersChange,
  onDimensionChange,
  onReset,
}: ControlsProps) {
  const { alpha } = parameters;
  const update = (patch: Partial<CatParameters>) => onParametersChange({ ...parameters, ...patch });
  const presets: { label: string; state: InitialState }[] = [
    { label: "Vacuum", state: { kind: "vacuum" } },
    { label: "|1⟩", state: { kind: "fock", n: 1 } },
    { label: "|α⟩", state: { kind: "coherent", re: alpha, im: 0 } },
    { label: "Even cat", state: { kind: "cat", re: alpha, im: 0, odd: false } },
    { label: "Odd cat", state: { kind: "cat", re: alpha, im: 0, odd: true } },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {presets.map(({ label, state }) => (
          <button
            key={label}
            type="button"
            onClick={() => onReset(state)}
            className="rounded-full border border-paper/15 px-2.5 py-0.5 text-xs transition hover:border-signal hover:text-signal"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <Slider
          label="Amplitude α"
          value={alpha}
          min={0}
          max={2.8}
          step={0.01}
          onChange={(value) => update({ alpha: value })}
          format={(value) => `${value.toFixed(2)} · |α|² ${(value * value).toFixed(1)}`}
        />
        <LogSlider
          label="Two-photon dissipation κ₂"
          value={parameters.kappa2}
          minExponent={-1}
          maxExponent={0.5}
          allowZero
          onChange={(value) => update({ kappa2: value })}
        />
        <LogSlider
          label="Single-photon loss κ₁"
          value={parameters.kappa1}
          minExponent={-4}
          maxExponent={-1}
          allowZero
          onChange={(value) => update({ kappa1: value })}
        />
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-slate-50 hover:text-paper">
            <span className="inline-block transition group-open:rotate-90">›</span> Advanced
          </summary>
          <div className="mt-3 space-y-3">
            <LogSlider
              label="Dephasing κφ"
              value={parameters.kappaPhi}
              minExponent={-4}
              maxExponent={-1}
              allowZero
              onChange={(value) => update({ kappaPhi: value })}
            />
            <Slider
              label="Fock truncation N"
              value={dimension}
              min={10}
              max={50}
              step={1}
              onChange={onDimensionChange}
              hint={`Recommended: ${recommendedDimension}. Changing N restarts the state.`}
            />
          </div>
        </details>
        <p className="text-[11px] text-slate-50">Rates in 1/τ, times in τ (arbitrary time unit).</p>
      </div>

      {observables && (
        <dl className="grid grid-cols-3 gap-1.5 text-center">
          <Readout label="⟨n⟩" value={observables.meanPhotonNumber.toFixed(2)} />
          <Readout label="Parity" value={observables.parity.toFixed(3)} />
          <Readout label="Purity" value={observables.purity.toFixed(3)} />
        </dl>
      )}
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-paper/5 px-2 py-1">
      <dt className="text-[10px] text-slate-50">{label}</dt>
      <dd className="font-mono text-xs tabular-nums">{value}</dd>
    </div>
  );
}
