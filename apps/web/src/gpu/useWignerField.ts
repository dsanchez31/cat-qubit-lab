import { useEffect, useRef, useState } from "react";
import type { Frame } from "../simulation/messages";
import { requestGpuDevice } from "./device";
import { WignerPipeline } from "./wignerPipeline";

export const GPU_RESOLUTION = 256;
export const CPU_RESOLUTION = 128;

export type WignerBackend = "detecting" | "gpu" | "cpu";

export interface WignerField {
  values: Float32Array;
  resolution: number;
  extent: number;
}

/**
 * Turns simulation frames into Wigner values: on the GPU when WebGPU is available, otherwise from
 * the CPU values the worker attaches to each frame.
 */
export function useWignerField(frame: Frame | null, extent: number) {
  const [backend, setBackend] = useState<WignerBackend>("detecting");
  const [field, setField] = useState<WignerField | null>(null);
  const pipelineRef = useRef<WignerPipeline | null>(null);
  const latestRequest = useRef<{ frame: Frame; extent: number } | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    requestGpuDevice().then((device) => {
      if (cancelled) {
        device?.destroy();
        return;
      }
      if (device) {
        pipelineRef.current = new WignerPipeline(device, GPU_RESOLUTION);
        setBackend("gpu");
      } else {
        setBackend("cpu");
      }
    });
    return () => {
      cancelled = true;
      pipelineRef.current?.destroy();
      pipelineRef.current = null;
    };
  }, []);

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

  return { backend, field };
}
