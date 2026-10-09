import { useEffect, useRef, useState } from "react";
import { createWorker } from "./createWorker";
import type { CatParameters, WorkerCommand, WorkerEvent } from "./messages";

const SWEEP_DEBOUNCE_MS = 250;

export interface FlipTimesCurve {
  alphas: Float64Array;
  bitFlip: Float64Array;
  phaseFlip: Float64Array;
}

type Rates = Pick<CatParameters, "kappa1" | "kappa2" | "kappaPhi">;

/**
 * Bit-flip and phase-flip times over `alphas`, recomputed in a dedicated worker so that the sweep
 * never stalls the time evolution.
 */
export function useFlipTimes(alphas: Float64Array, rates: Rates) {
  const workerRef = useRef<Worker | null>(null);
  const latestRequest = useRef(0);
  const [curve, setCurve] = useState<FlipTimesCurve | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const worker = createWorker();
    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const message = event.data;
      if (message.type === "flipTimes" && message.requestId === latestRequest.current) {
        setCurve({
          alphas: message.alphas,
          bitFlip: message.bitFlip,
          phaseFlip: message.phaseFlip,
        });
        setPending(false);
      }
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const { kappa1, kappa2, kappaPhi } = rates;
  useEffect(() => {
    setPending(true);
    const handle = setTimeout(() => {
      latestRequest.current += 1;
      workerRef.current?.postMessage({
        type: "flipTimes",
        requestId: latestRequest.current,
        alphas,
        kappa1,
        kappa2,
        kappaPhi,
      } satisfies WorkerCommand);
    }, SWEEP_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [alphas, kappa1, kappa2, kappaPhi]);

  return { curve, pending };
}
