import { useEffect, useRef, useState } from "react";
import type { Frame, GpuSelfTestReference, GpuSelfTestRequest } from "../simulation/messages";
import { requestGpuDevice } from "./device";
import { WignerPipeline } from "./wignerPipeline";
import { gridPoint, referenceProbe, WignerProbe } from "./wignerProbe";

export const GPU_RESOLUTION = 256;
export const CPU_RESOLUTION = 128;

export type WignerBackend = "detecting" | "gpu" | "cpu";

/**
 * Backend selection from the `?wigner=` query parameter: `gpu` (default) uses WebGPU when
 * available, `cpu` forces the CPU computation, `diagnose` runs WebGPU and compares every frame
 * with the CPU values on the same grid (results in the console).
 */
export type WignerMode = "gpu" | "cpu" | "diagnose";

function readWignerMode(): WignerMode {
  const value = new URLSearchParams(window.location.search).get("wigner");
  return value === "cpu" || value === "diagnose" ? value : "gpu";
}

export const wignerMode: WignerMode = readWignerMode();

/** Minimum delay between two diagnostic reports, so the console stays readable. */
const DIAGNOSTIC_INTERVAL_MS = 1000;
/** Minimum delay between two per-term probes: each one logs several large tables. */
const PROBE_INTERVAL_MS = 5000;
/** Probes run only when the GPU departs from the CPU by more than this, in units of 1/π. */
const PROBE_THRESHOLD = 1e-3;

/**
 * GPU self-test state: odd cat |α⟩ − |−α⟩ with α = 2 at the dimension the app recommends for it
 * (28) plus margin. Fock populations up to n ≈ 15 and all even coherences, enough to expose a
 * miscompiled Laguerre recurrence (see wigner.wgsl), which gave errors of ~200/π on that state.
 */
const SELF_TEST: GpuSelfTestRequest = {
  dimension: 32,
  alpha: 2,
  resolution: GPU_RESOLUTION,
  extent: 6,
};
/** Largest accepted |ΔW|·π against the CPU; f32 rounding stays below 1e-5. */
const SELF_TEST_TOLERANCE = 1e-3;

export interface WignerField {
  values: Float32Array;
  resolution: number;
  extent: number;
}

interface FieldComparison {
  maxDifference: number;
  worstIndex: number;
  nanCount: number;
  infinityCount: number;
  gpuMax: number;
  cpuMax: number;
}

/** Compares GPU values with the CPU reference on the same grid. */
function compareFields(gpu: Float32Array, cpu: Float32Array): FieldComparison {
  let maxDifference = 0;
  let worstIndex = 0;
  let nanCount = 0;
  let infinityCount = 0;
  let gpuMax = 0;
  let cpuMax = 0;
  for (let i = 0; i < gpu.length; i++) {
    const g = gpu[i] as number;
    const c = cpu[i] as number;
    if (Number.isNaN(g)) {
      nanCount++;
      continue;
    }
    if (!Number.isFinite(g)) {
      infinityCount++;
      continue;
    }
    gpuMax = Math.max(gpuMax, Math.abs(g));
    cpuMax = Math.max(cpuMax, Math.abs(c));
    const difference = Math.abs(g - c);
    if (difference > maxDifference) {
      maxDifference = difference;
      worstIndex = i;
    }
  }
  return { maxDifference, worstIndex, nanCount, infinityCount, gpuMax, cpuMax };
}

/**
 * Logs how far the WebGPU values are from the CPU reference computed on the same grid, and
 * returns the worst grid point (null when the grids differ).
 */
function reportDiagnostic(
  adapterLabel: string,
  frame: Frame,
  extent: number,
  resolution: number,
  gpu: Float32Array,
  cpu: Float32Array,
): { index: number; difference: number } | null {
  if (cpu.length !== gpu.length) {
    console.warn(`Wigner diagnostic skipped: CPU grid ${cpu.length}, GPU grid ${gpu.length}`);
    return null;
  }
  const { maxDifference, worstIndex, nanCount, infinityCount, gpuMax, cpuMax } = compareFields(
    gpu,
    cpu,
  );
  const spacing = (2 * extent) / (resolution - 1);
  console.table({
    adapter: adapterLabel,
    time: frame.time,
    dimension: frame.dimension,
    extent,
    "max |ΔW|·π": maxDifference * Math.PI,
    "worst x": -extent + (worstIndex % resolution) * spacing,
    "worst p": -extent + Math.floor(worstIndex / resolution) * spacing,
    "GPU W·π at worst": (gpu[worstIndex] as number) * Math.PI,
    "CPU W·π at worst": (cpu[worstIndex] as number) * Math.PI,
    "max |W|·π GPU": gpuMax * Math.PI,
    "max |W|·π CPU": cpuMax * Math.PI,
    "NaN count": nanCount,
    "Inf count": infinityCount,
  });
  return { index: worstIndex, difference: maxDifference };
}

/**
 * Evaluates the self-test state on the GPU and returns why the result is rejected, or null when it
 * matches the CPU reference.
 */
async function runSelfTest(
  pipeline: WignerPipeline,
  reference: GpuSelfTestReference,
): Promise<string | null> {
  const values = await pipeline.compute(
    reference.densityMatrix,
    reference.dimension,
    reference.extent,
  );
  if (!values || values.length !== reference.wigner.length) {
    return "no GPU result";
  }
  const { maxDifference, nanCount, infinityCount } = compareFields(values, reference.wigner);
  if (nanCount > 0 || infinityCount > 0) {
    return `${nanCount} NaN and ${infinityCount} infinite values`;
  }
  if (maxDifference * Math.PI > SELF_TEST_TOLERANCE) {
    return `max |ΔW|·π = ${(maxDifference * Math.PI).toPrecision(3)} (tolerance ${SELF_TEST_TOLERANCE})`;
  }
  return null;
}

/** True when a GPU value departs from its f64 reference beyond f32 rounding. */
function diverges(gpu: number, reference: number): boolean {
  return !(Math.abs(gpu - reference) <= 1e-4 * Math.max(1, Math.abs(reference)));
}

/** Logs the GPU intermediate values of one grid point next to their f64 reference. */
function reportProbe(
  frame: Frame,
  index: number,
  point: { x: number; p: number },
  gpu: Float32Array,
  reference: Float64Array,
  productionValue: number,
  cpuValue: number,
) {
  const dimension = frame.dimension;
  const psiOffset = 4 * dimension;
  const totalOffset = psiOffset + dimension * dimension;
  const at = (values: ArrayLike<number>, i: number) => values[i] as number;

  console.log(
    `Wigner probe at index ${index}, x = ${point.x}, p = ${point.p}, u = ${2 * (point.x ** 2 + point.p ** 2)}`,
  );
  console.table({
    "probe total GPU (W·π)": at(gpu, totalOffset),
    "probe total f64 (W·π)": at(reference, totalOffset),
    "production shader W·π": productionValue * Math.PI,
    "CPU (Rust) W·π": cpuValue * Math.PI,
  });

  const terms = Array.from({ length: dimension }, (_, d) => ({
    d,
    "ψ first GPU": at(gpu, 4 * d),
    "ψ first f64": at(reference, 4 * d),
    "Σ re GPU": at(gpu, 4 * d + 1),
    "Σ re f64": at(reference, 4 * d + 1),
    "Σ im GPU": at(gpu, 4 * d + 2),
    "Σ im f64": at(reference, 4 * d + 2),
    "term GPU": at(gpu, 4 * d + 3),
    "term f64": at(reference, 4 * d + 3),
    diverges: diverges(at(gpu, 4 * d + 3), at(reference, 4 * d + 3)),
  }));
  console.table(terms);

  let firstPsi: { d: number; n: number } | null = null;
  for (let d = 0; d < dimension && !firstPsi; d++) {
    for (let n = 0; n + d < dimension; n++) {
      const i = psiOffset + d * dimension + n;
      if (diverges(at(gpu, i), at(reference, i))) {
        firstPsi = { d, n };
        break;
      }
    }
  }
  if (!firstPsi) {
    console.log("Every ψ_n^(d) matches its f64 reference: the divergence is in the sums.");
    return;
  }
  const { d } = firstPsi;
  console.log(`First diverging ψ: d = ${d}, n = ${firstPsi.n}. ψ_n^(${d}) for every n:`);
  console.table(
    Array.from({ length: dimension - d }, (_, n) => ({
      n,
      "ψ GPU": at(gpu, psiOffset + d * dimension + n),
      "ψ f64": at(reference, psiOffset + d * dimension + n),
      "ρ(n+d, n) re": at(frame.densityMatrix, 2 * ((n + d) * dimension + n)),
      "ρ(n+d, n) im": at(frame.densityMatrix, 2 * ((n + d) * dimension + n) + 1),
    })),
  );
}

/**
 * Turns simulation frames into Wigner values: on the GPU when WebGPU is available and passes the
 * self-test against `requestGpuSelfTest` (CPU reference from the worker), otherwise from the CPU
 * values the worker attaches to each frame.
 */
export function useWignerField(
  frame: Frame | null,
  extent: number,
  requestGpuSelfTest: (request: GpuSelfTestRequest) => Promise<GpuSelfTestReference>,
) {
  const [backend, setBackend] = useState<WignerBackend>("detecting");
  const [gpuRejected, setGpuRejected] = useState(false);
  const [field, setField] = useState<WignerField | null>(null);
  const pipelineRef = useRef<WignerPipeline | null>(null);
  const adapterLabel = useRef("");
  const lastDiagnostic = useRef(0);
  const probeRef = useRef<WignerProbe | null>(null);
  const lastProbe = useRef(0);
  const latestRequest = useRef<{ frame: Frame; extent: number } | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (wignerMode === "cpu") {
      setBackend("cpu");
      return;
    }
    let cancelled = false;
    const start = async () => {
      const context = await requestGpuDevice();
      if (cancelled) {
        context?.device.destroy();
        return;
      }
      if (!context) {
        setBackend("cpu");
        return;
      }
      const pipeline = new WignerPipeline(context.device, GPU_RESOLUTION);
      let rejection: string | null;
      try {
        rejection = await runSelfTest(pipeline, await requestGpuSelfTest(SELF_TEST));
      } catch (error) {
        rejection = `self-test failed to run: ${error instanceof Error ? error.message : error}`;
      }
      if (cancelled) {
        pipeline.destroy();
        context.device.destroy();
        return;
      }
      if (rejection && wignerMode !== "diagnose") {
        console.warn(
          `WebGPU Wigner result rejected on ${context.adapterLabel}: ${rejection}. Using the CPU fallback.`,
        );
        pipeline.destroy();
        context.device.destroy();
        setGpuRejected(true);
        setBackend("cpu");
        return;
      }
      if (rejection) {
        console.warn(`WebGPU self-test failed (kept in diagnose mode): ${rejection}`);
      } else {
        console.info(`WebGPU self-test passed on ${context.adapterLabel}`);
      }
      adapterLabel.current = context.adapterLabel;
      pipelineRef.current = pipeline;
      if (wignerMode === "diagnose") {
        probeRef.current = new WignerProbe(context.device, GPU_RESOLUTION);
      }
      setBackend("gpu");
    };
    void start();
    return () => {
      cancelled = true;
      pipelineRef.current?.destroy();
      pipelineRef.current = null;
      probeRef.current?.destroy();
      probeRef.current = null;
    };
  }, [requestGpuSelfTest]);

  useEffect(() => {
    if (!frame) {
      return;
    }
    if (backend === "cpu" && frame.wigner) {
      setField({ values: frame.wigner, resolution: CPU_RESOLUTION, extent });
      return;
    }
    const pipeline = pipelineRef.current;
    if (backend !== "gpu" || !pipeline) {
      return;
    }
    latestRequest.current = { frame, extent };
    if (inFlight.current) {
      // The running evaluation picks up the latest request when it completes.
      return;
    }
    inFlight.current = true;
    const drain = async () => {
      try {
        let request = latestRequest.current;
        while (request) {
          latestRequest.current = null;
          const values = await pipeline.compute(
            request.frame.densityMatrix,
            request.frame.dimension,
            request.extent,
          );
          if (values && pipelineRef.current === pipeline) {
            setField({ values, resolution: pipeline.resolution, extent: request.extent });
            const now = performance.now();
            if (
              wignerMode === "diagnose" &&
              request.frame.wigner &&
              now - lastDiagnostic.current >= DIAGNOSTIC_INTERVAL_MS
            ) {
              lastDiagnostic.current = now;
              const worst = reportDiagnostic(
                adapterLabel.current,
                request.frame,
                request.extent,
                pipeline.resolution,
                values,
                request.frame.wigner,
              );
              const probe = probeRef.current;
              if (
                probe &&
                worst &&
                worst.difference * Math.PI > PROBE_THRESHOLD &&
                now - lastProbe.current >= PROBE_INTERVAL_MS
              ) {
                lastProbe.current = now;
                const { frame: probed, extent: probedExtent } = request;
                const point = gridPoint(worst.index, pipeline.resolution, probedExtent);
                const cpuValue = request.frame.wigner[worst.index] as number;
                const gpuProbe = await probe.run(
                  probed.densityMatrix,
                  probed.dimension,
                  probedExtent,
                  worst.index,
                );
                reportProbe(
                  probed,
                  worst.index,
                  point,
                  gpuProbe,
                  referenceProbe(probed.densityMatrix, probed.dimension, point.x, point.p),
                  values[worst.index] as number,
                  cpuValue,
                );
              }
            }
          }
          request = latestRequest.current;
        }
      } catch (error) {
        console.error("Wigner evaluation failed", error);
      } finally {
        inFlight.current = false;
      }
    };
    void drain();
  }, [frame, backend, extent]);

  return { backend, gpuRejected, field };
}
