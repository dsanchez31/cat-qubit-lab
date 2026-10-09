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

export type WorkerCommand =
  | { type: "configure"; parameters: CatParameters; dimension: number }
  | { type: "reset"; state: InitialState }
  | { type: "play"; speed: number }
  | { type: "pause" }
  /** Asks the worker to also compute the Wigner function on the CPU (no WebGPU). */
  | { type: "cpuWigner"; request: WignerRequest | null }
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
      type: "flipTimes";
      requestId: number;
      alphas: Float64Array;
      bitFlip: Float64Array;
      phaseFlip: Float64Array;
    }
  | { type: "error"; message: string };
