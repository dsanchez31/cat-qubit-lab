import type { ReactNode } from "react";
import type { RenderMode, RenderSettings } from "../scene/renderSettings";
import { GlowIcon, OrbitIcon, PauseIcon, PlayIcon, RestartIcon } from "./icons";

const SPEED_MIN_EXPONENT = -2;
const SPEED_MAX_EXPONENT = 1;

const renderModes: { mode: RenderMode; label: string }[] = [
  { mode: "solid", label: "Solid" },
  { mode: "wireframe", label: "Wire" },
  { mode: "both", label: "Both" },
];

interface DockProps {
  playing: boolean;
  speed: number;
  time: number;
  /** All rates are zero: nothing evolves, so play and restart have no visible effect. */
  stationary: boolean;
  /** Changes on every restart, replays the icon animation. */
  restartToken: number;
  settings: RenderSettings;
  onPlayingChange: (playing: boolean) => void;
  onRestart: () => void;
  onSpeedChange: (speed: number) => void;
  onSettingsChange: (settings: RenderSettings) => void;
}

/** Playback and rendering controls, docked at the bottom of the 3D view. */
export function Dock({
  playing,
  speed,
  time,
  stationary,
  restartToken,
  settings,
  onPlayingChange,
  onRestart,
  onSpeedChange,
  onSettingsChange,
}: DockProps) {
  const speedPosition =
    (Math.log10(speed) - SPEED_MIN_EXPONENT) / (SPEED_MAX_EXPONENT - SPEED_MIN_EXPONENT);
  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl border border-paper/10 bg-ink/60 px-3 py-2 shadow-glass backdrop-blur-xl">
      {stationary && (
        <p className="w-full text-center text-[11px] text-slate-50">
          All rates are zero, the state is stationary. Turn on κ₂ or κ₁ to see it evolve.
        </p>
      )}
      <DockButton
        label={time > 0 ? "Restart from the initial state" : "Already at the initial state"}
        disabled={time === 0}
        onClick={onRestart}
      >
        <span key={restartToken} className="grid motion-safe:animate-spin-once">
          <RestartIcon />
        </span>
      </DockButton>
      <button
        type="button"
        onClick={() => onPlayingChange(!playing)}
        disabled={stationary}
        aria-label={playing ? "Pause" : "Play"}
        className="grid size-10 place-items-center rounded-full bg-signal text-ink shadow-[0_0_24px_-4px_var(--color-signal)] transition hover:brightness-110 active:scale-95 disabled:bg-slate disabled:text-slate-50 disabled:shadow-none"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <label className="flex items-center gap-2 text-[11px] text-slate-50">
        <span>Speed</span>
        <input
          type="range"
          className="w-20"
          min={0}
          max={1}
          step={0.01}
          value={speedPosition}
          onChange={(event) =>
            onSpeedChange(
              10 **
                (SPEED_MIN_EXPONENT +
                  Number(event.target.value) * (SPEED_MAX_EXPONENT - SPEED_MIN_EXPONENT)),
            )
          }
        />
        <span className="w-14 font-mono tabular-nums text-slate-20">{speed.toFixed(2)} τ/s</span>
      </label>

      <span className="w-20 font-mono text-xs tabular-nums text-paper">
        t = {time.toFixed(2)} τ
      </span>

      <span className="hidden h-6 w-px bg-paper/10 sm:block" />

      <fieldset className="flex rounded-full border border-paper/10 p-0.5 text-[11px]">
        <legend className="sr-only">Render mode</legend>
        {renderModes.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            aria-pressed={settings.mode === mode}
            onClick={() => onSettingsChange({ ...settings, mode })}
            className={`rounded-full px-2.5 py-1 transition ${settings.mode === mode ? "bg-paper/15 text-paper" : "text-slate-50 hover:text-paper"}`}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <DockButton
        label="Glow"
        pressed={settings.bloom}
        onClick={() => onSettingsChange({ ...settings, bloom: !settings.bloom })}
      >
        <GlowIcon />
      </DockButton>
      <DockButton
        label="Auto-rotate"
        pressed={settings.autoRotate}
        onClick={() => onSettingsChange({ ...settings, autoRotate: !settings.autoRotate })}
      >
        <OrbitIcon />
      </DockButton>
    </div>
  );
}

interface DockButtonProps {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function DockButton({ label, pressed, disabled, onClick, children }: DockButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-full border transition disabled:opacity-35 ${pressed ? "border-signal/50 text-signal" : "border-paper/10 text-slate-20 enabled:hover:text-paper"}`}
    >
      {children}
    </button>
  );
}
