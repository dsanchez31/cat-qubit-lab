import { useCallback, useEffect, useRef, useState } from "react";
import { createWorker } from "./createWorker";
import type { Frame, WorkerCommand, WorkerEvent } from "./messages";

/** Owns the simulation worker and exposes its latest frame. */
export function useSimulation() {
  const workerRef = useRef<Worker | null>(null);
  const [ready, setReady] = useState(false);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        case "flipTimes":
          break;
      }
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      setReady(false);
    };
  }, []);

  const send = useCallback((command: WorkerCommand) => {
    workerRef.current?.postMessage(command);
  }, []);

  return { ready, frame, error, send };
}
