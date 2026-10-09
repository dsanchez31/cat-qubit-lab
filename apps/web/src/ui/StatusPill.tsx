import type { WignerBackend } from "../gpu/useWignerField";
import type { RendererStatus } from "../scene/renderSettings";

interface StatusPillProps {
  renderer: RendererStatus;
  backend: WignerBackend;
}

const rendererLabels: Record<RendererStatus, string> = {
  starting: "WebGL…",
  webgl2: "WebGL 2",
  unavailable: "WebGL off",
};

const backendLabels: Record<WignerBackend, string> = {
  detecting: "detecting GPU…",
  gpu: "Wigner on WebGPU",
  cpu: "Wigner on CPU",
};

/** Discreet indicator of the 3D renderer and of where the Wigner function is computed. */
export function StatusPill({ renderer, backend }: StatusPillProps) {
  const rendererOk = renderer === "webgl2";
  const title = rendererOk
    ? `3D rendered with WebGL 2. ${backend === "gpu" ? "Wigner function computed by a WebGPU compute shader." : "Wigner function computed on the CPU."}`
    : "3D rendering unavailable";
  return (
    <div
      className="pointer-events-auto flex items-center gap-2 rounded-full border border-paper/10 bg-ink/60 px-3 py-1 text-[11px] text-slate-50 backdrop-blur-xl"
      title={title}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${rendererOk ? "bg-teal shadow-[0_0_6px_var(--color-teal)]" : renderer === "starting" ? "bg-slate-50" : "bg-alert"}`}
      />
      <span>{rendererLabels[renderer]}</span>
      <span className="text-slate">·</span>
      <span className={backend === "gpu" ? "text-signal" : ""}>{backendLabels[backend]}</span>
    </div>
  );
}
