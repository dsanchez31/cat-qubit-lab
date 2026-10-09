import { useCallback, useEffect, useRef, useState } from "react";
import { createWorker } from "./createWorker";
import type {
  Frame,
  GpuSelfTestReference,
  GpuSelfTestRequest,
  WorkerCommand,
  WorkerEvent,
} from "./messages";

/** Owns the simulation worker and exposes its latest frame. */
export function useSimulation() {
  const workerRef = useRef<Worker | null>(null);
  const [ready, setReady] = useState(false);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selfTests = useRef(
    new Map<
      number,
      { resolve: (reference: GpuSelfTestReference) => void; reject: (error: Error) => void }
    >(),
  );
  const nextSelfTestId = useRef(0);

  useEffect(() => {
    const worker = createWorker();
    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const message = event.data;
      switch (message.type) {
        case "ready":
          setReady(true);
          break;
        case "frame":
          setFrame(message.frame);
          break;
        case "error":
          setError(message.message);
          break;
        case "gpuSelfTest": {
          const pending = selfTests.current.get(message.requestId);
          selfTests.current.delete(message.requestId);
          if (message.reference) {
            pending?.resolve(message.reference);
          } else {
            pending?.reject(new Error(message.error ?? "GPU self-test reference failed"));
          }
          break;
        }
        case "flipTimes":
          break;
      }
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      for (const pending of selfTests.current.values()) {
        pending.reject(new Error("simulation worker stopped"));
      }
      selfTests.current.clear();
      workerRef.current = null;
      setReady(false);
    };
  }, []);

  const send = useCallback((command: WorkerCommand) => {
    workerRef.current?.postMessage(command);
  }, []);

  /** Resolves with the CPU reference of the GPU self-test state, computed by the worker. */
  const requestGpuSelfTest = useCallback(
    (request: GpuSelfTestRequest) =>
      new Promise<GpuSelfTestReference>((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error("simulation worker not started"));
          return;
        }
        const requestId = nextSelfTestId.current++;
        selfTests.current.set(requestId, { resolve, reject });
        worker.postMessage({ type: "gpuSelfTest", requestId, request } satisfies WorkerCommand);
      }),
    [],
  );

  return { ready, frame, error, send, requestGpuSelfTest };
}
