import { useCallback, useEffect, useState } from "react";
import { CPU_RESOLUTION, useWignerField } from "./gpu/useWignerField";
import { defaultRenderSettings, type RendererStatus } from "./scene/renderSettings";
import { Scene } from "./scene/Scene";
import { SceneErrorBoundary } from "./scene/SceneErrorBoundary";
import type { CatParameters, InitialState } from "./simulation/messages";
import { recommendedDimension } from "./simulation/truncation";
import { useFlipTimes } from "./simulation/useFlipTimes";
import { useSimulation } from "./simulation/useSimulation";
import { Controls } from "./ui/Controls";
import { Dock } from "./ui/Dock";
import { FlipPlot } from "./ui/FlipPlot";
import { Panel } from "./ui/Panel";
import { StatusPill } from "./ui/StatusPill";
import { type TutorialStep, tutorialSteps } from "./ui/steps";
import { Tutorial } from "./ui/Tutorial";
import { useMediaQuery } from "./ui/useMediaQuery";

const MAX_ALPHA_SQUARED = 8;
/** |α|² = 0.5, 1, …, 8: each point costs up to ~0.5 s with the converged flip-time truncation. */
const ALPHA_SWEEP = Float64Array.from({ length: 16 }, (_, i) => Math.sqrt(0.5 * (i + 1)));
/** Side panels: w-80 (20rem) plus 1rem of margin, in CSS pixels at the default font size. */
const SIDE_PANEL_INSET = 336;

function stateAmplitude(state: InitialState): number {
  switch (state.kind) {
    case "vacuum":
      return 0;
    case "fock":
      return Math.sqrt(state.n);
    case "coherent":
    case "cat":
      return Math.hypot(state.re, state.im);
  }
}

/** Half-width of the phase-space window, in steps of 0.5 so the mesh is not rebuilt constantly. */
function phaseSpaceExtent(parameters: CatParameters, state: InitialState): number {
  const amplitude = Math.max(parameters.alpha, stateAmplitude(state));
  return Math.max(3.5, Math.ceil((Math.SQRT2 * amplitude + 3) * 2) / 2);
}

const firstStep = tutorialSteps[0] as TutorialStep;

export function App() {
  const { ready, frame, error, send } = useSimulation();
  const [stepIndex, setStepIndex] = useState(0);
  const [parameters, setParameters] = useState(firstStep.setup.parameters);
  const [dimension, setDimension] = useState(
    recommendedDimension(firstStep.setup.parameters.alpha),
  );
  const [playing, setPlaying] = useState(firstStep.setup.playing);
  const [speed, setSpeed] = useState(firstStep.setup.speed);
  // The token makes a restart, or a click on the current preset, reset the state again.
  const [reset, setReset] = useState({ state: firstStep.setup.state, token: 0 });
  const [renderSettings, setRenderSettings] = useState(defaultRenderSettings);
  const [renderer, setRenderer] = useState<RendererStatus>("starting");
  const wide = useMediaQuery("(min-width: 1024px)");

  const extent = phaseSpaceExtent(parameters, reset.state);
  const { backend, field } = useWignerField(frame, extent);
  const { curve, pending } = useFlipTimes(ALPHA_SWEEP, parameters);

  useEffect(() => {
    if (ready) {
      send({ type: "configure", parameters, dimension });
    }
  }, [ready, parameters, dimension, send]);

  useEffect(() => {
    if (ready) {
      send({ type: "reset", state: reset.state });
    }
  }, [ready, reset, send]);

  useEffect(() => {
    if (ready) {
      send(playing ? { type: "play", speed } : { type: "pause" });
    }
  }, [ready, playing, speed, send]);

  useEffect(() => {
    if (ready && backend === "cpu") {
      send({ type: "cpuWigner", request: { resolution: CPU_RESOLUTION, extent } });
    }
  }, [ready, backend, extent, send]);

  const resetTo = useCallback((state: InitialState) => {
    setReset((previous) => ({ state, token: previous.token + 1 }));
  }, []);

  const restart = useCallback(() => {
    setReset((previous) => ({ state: previous.state, token: previous.token + 1 }));
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      const step = tutorialSteps[index];
      if (!step) {
        return;
      }
      setStepIndex(index);
      setParameters(step.setup.parameters);
      setDimension(recommendedDimension(step.setup.parameters.alpha));
      setPlaying(step.setup.playing);
      setSpeed(step.setup.speed);
      resetTo(step.setup.state);
    },
    [resetTo],
  );

  return (
    <div className="relative flex min-h-dvh flex-col lg:block lg:h-dvh lg:overflow-hidden">
      <div className="relative h-[62dvh] shrink-0 lg:absolute lg:inset-0 lg:h-auto">
        <SceneErrorBoundary onError={() => setRenderer("unavailable")}>
          <Scene
            field={field}
            settings={renderSettings}
            sideInset={wide ? SIDE_PANEL_INSET : 0}
            onRendererStatus={setRenderer}
          />
        </SceneErrorBoundary>
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 p-3 lg:p-4">
        <h1 className="pointer-events-auto text-lg font-medium tracking-tight">
          Cat Qubit{" "}
          <span className="text-signal [text-shadow:0_0_18px_var(--color-signal)]">Lab</span>
        </h1>
        <StatusPill renderer={renderer} backend={backend} />
      </header>

      {error && (
        <p className="absolute top-14 left-1/2 z-10 -translate-x-1/2 rounded-full bg-alert/20 px-3 py-1 text-xs text-alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 p-3 lg:contents">
        <div className="lg:absolute lg:bottom-4 lg:left-1/2 lg:z-10 lg:w-max lg:max-w-[calc(100vw-44rem)] lg:-translate-x-1/2">
          <Dock
            playing={playing}
            speed={speed}
            time={frame?.time ?? 0}
            stationary={
              parameters.kappa1 === 0 && parameters.kappa2 === 0 && parameters.kappaPhi === 0
            }
            restartToken={reset.token}
            settings={renderSettings}
            onPlayingChange={setPlaying}
            onRestart={restart}
            onSpeedChange={setSpeed}
            onSettingsChange={setRenderSettings}
          />
        </div>

        <aside className="lg:absolute lg:top-16 lg:left-4 lg:z-10 lg:max-h-[calc(100dvh-9rem)] lg:w-80 lg:overflow-y-auto">
          <Panel title={`Tutorial · ${stepIndex + 1}/${tutorialSteps.length}`}>
            <Tutorial index={stepIndex} onNavigate={goToStep} />
          </Panel>
        </aside>

        <aside className="flex flex-col gap-3 lg:absolute lg:top-16 lg:right-4 lg:z-10 lg:max-h-[calc(100dvh-5rem)] lg:w-80 lg:overflow-y-auto">
          <Panel title="Parameters">
            <Controls
              parameters={parameters}
              dimension={dimension}
              recommendedDimension={recommendedDimension(parameters.alpha)}
              observables={frame?.observables ?? null}
              onParametersChange={setParameters}
              onDimensionChange={setDimension}
              onReset={resetTo}
            />
          </Panel>
          <Panel
            title="Flip times (τ)"
            aside={pending && <span className="text-[11px] text-slate-50">computing…</span>}
          >
            <FlipPlot curve={curve} alpha={parameters.alpha} maxAlphaSquared={MAX_ALPHA_SQUARED} />
          </Panel>
        </aside>

        <footer className="space-y-1 text-[10px] leading-snug text-slate-50 lg:absolute lg:bottom-4 lg:left-4 lg:z-10 lg:w-80">
          <p>
            Wigner function W(x, p): <span className="text-teal">negative</span> ·{" "}
            <span className="text-signal">positive</span>. Drag to orbit, scroll to zoom.
          </p>
          <p>
            Independent project, not affiliated with Alice & Bob. Physics after Mirrahimi et al.
            (2014) and Réglade et al. (2024), reference data from dynamiqs.
          </p>
        </footer>
      </div>
    </div>
  );
}
