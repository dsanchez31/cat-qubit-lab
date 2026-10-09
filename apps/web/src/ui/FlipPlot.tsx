import type { FlipTimesCurve } from "../simulation/useFlipTimes";
import { palette } from "../theme";

const WIDTH = 320;
const HEIGHT = 180;
const MARGIN = { top: 8, right: 8, bottom: 30, left: 40 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const MAX_DECADE_LABELS = 6;

interface FlipPlotProps {
  curve: FlipTimesCurve | null;
  alpha: number;
  maxAlphaSquared: number;
}

/** Log-scale plot of the bit-flip and phase-flip times (in τ) against the mean photon number. */
export function FlipPlot({ curve, alpha, maxAlphaSquared }: FlipPlotProps) {
  const points = curve ? collect(curve) : null;
  const empty = !points || (points.bitFlip.length === 0 && points.phaseFlip.length === 0);
  // Bit-flip times stop where the rate drops below the eigensolver resolution, not because they
  // stop growing.
  const truncatedBitFlip =
    points !== null &&
    points.bitFlip.length > 0 &&
    curve !== null &&
    points.bitFlip.length < curve.alphas.length;
  const logs = points ? [...points.bitFlip, ...points.phaseFlip].map(([, t]) => Math.log10(t)) : [];
  const minDecade = Math.floor(Math.min(0, ...logs));
  const maxDecade = Math.ceil(Math.max(1, ...logs));
  const decades = Array.from({ length: maxDecade - minDecade + 1 }, (_, i) => minDecade + i);
  const labelEvery = Math.ceil(decades.length / MAX_DECADE_LABELS);
  const xTicks = Array.from({ length: Math.floor(maxAlphaSquared / 2) + 1 }, (_, i) => 2 * i);

  const x = (alphaSquared: number) => MARGIN.left + (alphaSquared / maxAlphaSquared) * PLOT_W;
  const y = (time: number) =>
    MARGIN.top + PLOT_H - ((Math.log10(time) - minDecade) / (maxDecade - minDecade)) * PLOT_H;
  const path = (series: [number, number][]) =>
    series
      .map(([a, t], i) => `${i === 0 ? "M" : "L"}${x(a).toFixed(1)},${y(t).toFixed(1)}`)
      .join("");

  return (
    <figure className="space-y-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          role="img"
          aria-label="Bit-flip and phase-flip times versus mean photon number"
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
          <line
            x1={x(alpha * alpha)}
            x2={x(alpha * alpha)}
            y1={MARGIN.top}
            y2={MARGIN.top + PLOT_H}
            stroke={palette.offWhite}
            strokeDasharray="3 3"
            strokeWidth={0.8}
          />
          {points && (
            <g filter="url(#curve-glow)" fill="none" strokeWidth={2} strokeLinecap="round">
              <path d={path(points.bitFlip)} stroke={palette.yellow} />
              <path d={path(points.phaseFlip)} stroke={palette.teal} />
            </g>
          )}
        </svg>
        {curve && empty && (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-slate-50">
            Turn on κ₁ and κ₂: without single-photon loss nothing flips, without two-photon
            dissipation there is no cat qubit.
          </p>
        )}
      </div>
      {truncatedBitFlip && (
        <p className="text-[10px] text-slate-50">
          The bit-flip curve stops where its rate falls below the solver resolution (~1e13 τ).
        </p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-20">
        <Legend color={palette.yellow} label="Bit flip: exponential growth" />
        <Legend color={palette.teal} label="Phase flip: ∝ 1/|α|²" />
      </div>
    </figure>
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

function collect(curve: FlipTimesCurve) {
  const bitFlip: [number, number][] = [];
  const phaseFlip: [number, number][] = [];
  curve.alphas.forEach((alpha, i) => {
    const alphaSquared = alpha * alpha;
    const tBf = curve.bitFlip[i] ?? Number.POSITIVE_INFINITY;
    const tPf = curve.phaseFlip[i] ?? Number.POSITIVE_INFINITY;
    if (Number.isFinite(tBf)) {
      bitFlip.push([alphaSquared, tBf]);
    }
    if (Number.isFinite(tPf)) {
      phaseFlip.push([alphaSquared, tPf]);
    }
  });
  return { bitFlip, phaseFlip };
}
