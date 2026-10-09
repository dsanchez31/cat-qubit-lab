export interface CatParameters {
  alpha: number;
  kappa1: number;
  kappa2: number;
  kappaPhi: number;
}

export type InitialState =
  | { kind: "vacuum" }
  | { kind: "fock"; n: number }
  | { kind: "coherent"; re: number; im: number }
  | { kind: "cat"; re: number; im: number; odd: boolean };

export interface Observables {
  meanPhotonNumber: number;
  parity: number;
  purity: number;
  trace: number;
}

export interface WignerRequest {
  resolution: number;
  extent: number;
}

/** Known state used to validate the WebGPU Wigner evaluation against the CPU one. */
export interface GpuSelfTestRequest {
  dimension: number;
  /** Amplitude of the odd cat state |α⟩ − |−α⟩, α real. */
  alpha: number;
  resolution: number;
  extent: number;
}

export interface GpuSelfTestReference extends GpuSelfTestRequest {
  /** Interleaved [re, im] pairs, row-major. */
  densityMatrix: Float32Array;
  /** CPU Wigner values on the requested grid. */
  wigner: Float32Array;
}

export type WorkerCommand =
  | { type: "configure"; parameters: CatParameters; dimension: number }
  | { type: "reset"; state: InitialState }
  | { type: "play"; speed: number }
  | { type: "pause" }
  /** Asks the worker to also compute the Wigner function on the CPU (no WebGPU). */
  | { type: "cpuWigner"; request: WignerRequest | null }
  /** Asks for the density matrix and CPU Wigner values of the GPU self-test state. */
  | { type: "gpuSelfTest"; requestId: number; request: GpuSelfTestRequest }
  | {
      type: "flipTimes";
      requestId: number;
      alphas: Float64Array;
      kappa1: number;
      kappa2: number;
      kappaPhi: number;
    };

export interface Frame {
  time: number;
  dimension: number;
  /** Interleaved [re, im] pairs, row-major. */
  densityMatrix: Float32Array;
  observables: Observables;
  /** Present only in CPU Wigner mode. */
  wigner: Float32Array | null;
}

export type WorkerEvent =
  | { type: "ready" }
  | { type: "frame"; frame: Frame }
  | {
      type: "gpuSelfTest";
      requestId: number;
      /** Null when the worker failed to build the reference, `error` then says why. */
      reference: GpuSelfTestReference | null;
      error?: string;
    }
  | {
      type: "flipTimes";
      requestId: number;
      alphas: Float64Array;
      bitFlip: Float64Array;
      phaseFlip: Float64Array;
    }
  | { type: "error"; message: string };
