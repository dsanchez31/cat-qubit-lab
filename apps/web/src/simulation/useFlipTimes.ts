import { useEffect, useRef, useState } from "react";
import { createWorker } from "./createWorker";
import type { CatParameters, WorkerCommand, WorkerEvent } from "./messages";

const SWEEP_DEBOUNCE_MS = 250;

export interface FlipTimesCurve {
  alphas: Float64Array;
  bitFlip: Float64Array;
  phaseFlip: Float64Array;
  /** Points already computed, from index 0; the curve is complete when it equals `alphas.length`. */
  computed: number;
}

interface Sweep {
  curve: FlipTimesCurve | null;
  /** Last complete curve, kept on screen while `curve` is being computed. */
  previous: FlipTimesCurve | null;
}

type Rates = Pick<CatParameters, "kappa1" | "kappa2" | "kappaPhi">;

export function isComplete(curve: FlipTimesCurve | null): boolean {
  return curve !== null && curve.computed === curve.alphas.length;
}

function emptyCurve(alphas: Float64Array): FlipTimesCurve {
  return {
    alphas,
    bitFlip: new Float64Array(alphas.length).fill(Number.NaN),
    phaseFlip: new Float64Array(alphas.length).fill(Number.NaN),
    computed: 0,
  };
}

/**
 * Bit-flip and phase-flip times over `alphas`, recomputed in a dedicated worker so that the sweep
 * never stalls the time evolution. Points stream in one by one; a parameter change abandons the
 * running sweep.
 */
export function useFlipTimes(alphas: Float64Array, rates: Rates) {
  const workerRef = useRef<Worker | null>(null);
  const latestRequest = useRef(0);
  const [sweep, setSweep] = useState<Sweep>({ curve: null, previous: null });

  useEffect(() => {
    const worker = createWorker();
    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const message = event.data;
      if (message.type !== "flipTimesPoint" || message.requestId !== latestRequest.current) {
        return;
      }
      setSweep(({ curve, previous }) => {
        if (!curve) {
          return { curve, previous };
        }
        const bitFlip = curve.bitFlip.slice();
        const phaseFlip = curve.phaseFlip.slice();
        bitFlip[message.index] = message.bitFlip;
        phaseFlip[message.index] = message.phaseFlip;
        const next = { alphas: curve.alphas, bitFlip, phaseFlip, computed: message.index + 1 };
        return { curve: next, previous: isComplete(next) ? null : previous };
      });
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const { kappa1, kappa2, kappaPhi } = rates;
  useEffect(() => {
    // Bumped right away so that points of a sweep still running are ignored from now on.
    latestRequest.current += 1;
    const requestId = latestRequest.current;
    setSweep(({ curve, previous }) => ({
      curve: emptyCurve(alphas),
      previous: isComplete(curve) ? curve : previous,
    }));
    const handle = setTimeout(() => {
      workerRef.current?.postMessage({
        type: "flipTimes",
        requestId,
        alphas,
        kappa1,
        kappa2,
        kappaPhi,
      } satisfies WorkerCommand);
    }, SWEEP_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [alphas, kappa1, kappa2, kappaPhi]);

  const { curve, previous } = sweep;
  const progress =
    curve && !isComplete(curve) ? { done: curve.computed, total: curve.alphas.length } : null;
  return { curve, previous, progress };
}
