import type { PointerEvent } from "react";
import type { CatParameters } from "../simulation/messages";
import { type FlipTimesCurve, isComplete } from "../simulation/useFlipTimes";
import { palette } from "../theme";
import { formatRate } from "./Slider";

const WIDTH = 320;
const HEIGHT = 180;
const MARGIN = { top: 8, right: 8, bottom: 30, left: 40 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const MAX_DECADE_LABELS = 6;
/** Bit-flip rates below this are beyond the eigensolver resolution. */
const SOLVER_LIMIT = "1e13";

type Series = [number, number][];

interface FlipPlotProps {
  curve: FlipTimesCurve | null;
  /** Last complete curve, drawn dimmed while `curve` is being computed. */
  previous: FlipTimesCurve | null;
  progress: { done: number; total: number } | null;
  rates: Pick<CatParameters, "kappa1" | "kappa2" | "kappaPhi">;
  alpha: number;
  maxAlpha: number;
  maxAlphaSquared: number;
  onAlphaChange: (alpha: number) => void;
}

/** Log-scale plot of the bit-flip and phase-flip times (in τ) against the mean photon number. */
export function FlipPlot({
  curve,
  previous,
  progress,
  rates,
  alpha,
  maxAlpha,
  maxAlphaSquared,
  onAlphaChange,
}: FlipPlotProps) {
  const points = curve ? collect(curve) : null;
  const stale = previous ? collect(previous) : null;
  const complete = isComplete(curve);
  const empty =
    complete && points !== null && points.bitFlip.length === 0 && points.phaseFlip.length === 0;
  // Bit-flip times stop where the rate drops below the eigensolver resolution, not because they
  // stop growing.
  const truncatedBitFlip =
    complete &&
    curve !== null &&
    points !== null &&
    points.bitFlip.length > 0 &&
    points.bitFlip.length < curve.alphas.length;
  // Previous points take part in the range so that the axis does not jump while points arrive.
  const logs = [points, stale]
    .flatMap((series) => (series ? [...series.bitFlip, ...series.phaseFlip] : []))
    .map(([, t]) => Math.log10(t));
  const minDecade = Math.floor(Math.min(0, ...logs));
  const maxDecade = Math.ceil(Math.max(1, ...logs));
  const decades = Array.from({ length: maxDecade - minDecade + 1 }, (_, i) => minDecade + i);
  const labelEvery = Math.ceil(decades.length / MAX_DECADE_LABELS);
  const xTicks = Array.from({ length: Math.floor(maxAlphaSquared / 2) + 1 }, (_, i) => 2 * i);

  const x = (alphaSquared: number) => MARGIN.left + (alphaSquared / maxAlphaSquared) * PLOT_W;
  const y = (time: number) =>
    MARGIN.top + PLOT_H - ((Math.log10(time) - minDecade) / (maxDecade - minDecade)) * PLOT_H;
  const path = (series: Series) =>
    series
      .map(([a, t], i) => `${i === 0 ? "M" : "L"}${x(a).toFixed(1)},${y(t).toFixed(1)}`)
      .join("");

  const alphaSquared = alpha * alpha;
  // The partial curve may not reach the current α yet: fall back on the previous one.
  const bitFlipAt =
    interpolate(points?.bitFlip, alphaSquared) ?? interpolate(stale?.bitFlip, alphaSquared);
  const phaseFlipAt =
    interpolate(points?.phaseFlip, alphaSquared) ?? interpolate(stale?.phaseFlip, alphaSquared);
  const lastBitFlip = points?.bitFlip.at(-1);
  const beyondSolver =
    truncatedBitFlip && lastBitFlip !== undefined && alphaSquared > lastBitFlip[0];

  const setAlphaFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const target = ((viewX - MARGIN.left) / PLOT_W) * maxAlphaSquared;
    const next = Math.min(maxAlpha, Math.sqrt(Math.max(target, 0)));
    onAlphaChange(Math.round(next * 100) / 100);
  };

  return (
    <figure className="space-y-2">
      <p className="font-mono text-[11px] text-slate-50 tabular-nums">
        κ₂ {formatRate(rates.kappa2)} · κ₁ {formatRate(rates.kappa1)} · κφ{" "}
        {formatRate(rates.kappaPhi)}
      </p>
      <div className="h-0.5 overflow-hidden rounded-full bg-paper/10" aria-hidden>
        <div
          className="h-full bg-signal transition-[width] duration-300"
          style={{ width: progress ? `${(100 * progress.done) / progress.total}%` : "0%" }}
        />
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full cursor-ew-resize touch-pan-y select-none"
          role="img"
          aria-label="Bit-flip and phase-flip times versus mean photon number"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setAlphaFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              setAlphaFromPointer(event);
            }
          }}
        >
          <defs>
            <filter id="curve-glow" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {decades.map((decade, i) => (
            <g key={decade}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={y(10 ** decade)}
                y2={y(10 ** decade)}
                stroke={palette.blueGray}
                strokeWidth={0.5}
              />
              {i % labelEvery === 0 && (
                <text
                  x={MARGIN.left - 6}
                  y={y(10 ** decade) + 3}
                  textAnchor="end"
                  fontSize={9}
                  fill={palette.blueGray50}
                >
                  1e{decade}
                </text>
              )}
            </g>
          ))}
          {xTicks.map((tick) => (
            <text
              key={tick}
              x={x(tick)}
              y={HEIGHT - MARGIN.bottom + 13}
              textAnchor="middle"
              fontSize={9}
              fill={palette.blueGray50}
            >
              {tick}
            </text>
          ))}
          <text
            x={MARGIN.left + PLOT_W / 2}
            y={HEIGHT - 3}
            textAnchor="middle"
            fontSize={10}
            fill={palette.blueGray20}
          >
            mean photon number |α|²
          </text>
          {stale && (
            <g fill="none" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.25}>
              <path d={path(stale.bitFlip)} stroke={palette.yellow} />
              <path d={path(stale.phaseFlip)} stroke={palette.teal} />
            </g>
          )}
          {points && (
            <g filter="url(#curve-glow)" fill="none" strokeWidth={2} strokeLinecap="round">
              <path d={path(points.bitFlip)} stroke={palette.yellow} />
              <path d={path(points.phaseFlip)} stroke={palette.teal} />
            </g>
          )}
          <line
            x1={x(alphaSquared)}
            x2={x(alphaSquared)}
            y1={MARGIN.top}
            y2={MARGIN.top + PLOT_H}
            stroke={palette.offWhite}
            strokeDasharray="3 3"
            strokeWidth={0.8}
          />
          {bitFlipAt !== undefined && (
            <circle cx={x(alphaSquared)} cy={y(bitFlipAt)} r={3.5} fill={palette.yellow} />
          )}
          {phaseFlipAt !== undefined && (
            <circle cx={x(alphaSquared)} cy={y(phaseFlipAt)} r={3.5} fill={palette.teal} />
          )}
        </svg>
        {empty && (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-slate-50">
            Turn on κ₁ and κ₂: without single-photon loss nothing flips, without two-photon
            dissipation there is no cat qubit.
          </p>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-1.5 text-center">
        <Readout
          label="Bit flip"
          color={palette.yellow}
          value={beyondSolver ? `> ${SOLVER_LIMIT} τ` : formatTime(bitFlipAt)}
        />
        <Readout label="Phase flip" color={palette.teal} value={formatTime(phaseFlipAt)} />
        <Readout
          label="Bias"
          value={
            bitFlipAt !== undefined && phaseFlipAt !== undefined
              ? (bitFlipAt / phaseFlipAt).toExponential(1)
              : "—"
          }
        />
      </dl>
      <p className="text-[10px] text-slate-50">
        Dashed line: the cat shown in 3D, at |α|² {alphaSquared.toFixed(1)}. Drag on the plot or
        move α; the κ sliders reshape the curves.
      </p>
      {truncatedBitFlip && (
        <p className="text-[10px] text-slate-50">
          The bit-flip curve stops where its rate falls below the solver resolution (~{SOLVER_LIMIT}{" "}
          τ).
        </p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-20">
        <Legend color={palette.yellow} label="Bit flip: exponential growth" />
        <Legend color={palette.teal} label="Phase flip: ∝ 1/|α|²" />
      </div>
    </figure>
  );
}

function Readout({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-paper/5 px-2 py-1">
      <dt className="text-[10px]" style={{ color: color ?? palette.blueGray50 }}>
        {label}
      </dt>
      <dd className="font-mono text-xs tabular-nums">{value}</dd>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function formatTime(time: number | undefined): string {
  if (time === undefined) {
    return "—";
  }
  return `${time < 1e3 ? time.toPrecision(3) : time.toExponential(1)} τ`;
}

/** Time at `alphaSquared`, linear in log10 between the two neighbouring points of `series`. */
function interpolate(series: Series | undefined, alphaSquared: number): number | undefined {
  if (!series) {
    return undefined;
  }
  for (let i = 1; i < series.length; i++) {
    const [a0, t0] = series[i - 1] as [number, number];
    const [a1, t1] = series[i] as [number, number];
    if (alphaSquared >= a0 && alphaSquared <= a1) {
      const f = (alphaSquared - a0) / (a1 - a0);
      return 10 ** (Math.log10(t0) + f * (Math.log10(t1) - Math.log10(t0)));
    }
  }
  return undefined;
}

/** Finite points among the first `computed` ones, as [|α|², time] pairs. */
function collect(curve: FlipTimesCurve) {
  const bitFlip: Series = [];
  const phaseFlip: Series = [];
  for (let i = 0; i < curve.computed; i++) {
    const alphaSquared = (curve.alphas[i] ?? 0) ** 2;
    const tBf = curve.bitFlip[i] ?? Number.POSITIVE_INFINITY;
    const tPf = curve.phaseFlip[i] ?? Number.POSITIVE_INFINITY;
    if (Number.isFinite(tBf)) {
      bitFlip.push([alphaSquared, tBf]);
    }
    if (Number.isFinite(tPf)) {
      phaseFlip.push([alphaSquared, tPf]);
    }
  }
  return { bitFlip, phaseFlip };
}
