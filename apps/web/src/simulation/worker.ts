/// <reference lib="webworker" />
import init, { CatSimulation, flipTimes } from "@physics-wasm";
import type { Frame, InitialState, WignerRequest, WorkerCommand, WorkerEvent } from "./messages";

const FRAME_INTERVAL_MS = 1000 / 60;
/** Caps the simulated step after the tab was throttled or a frame took too long. */
const MAX_WALL_STEP_S = 0.1;

const scope = self as unknown as DedicatedWorkerGlobalScope;
const ready = init();

let simulation: CatSimulation | null = null;
let currentState: InitialState = { kind: "vacuum" };
let speed = 0;
let wignerRequest: WignerRequest | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastTick = 0;
/** Id of the newest flip-time sweep; an older sweep still running stops at its next point. */
let latestFlipRequest = 0;

function post(event: WorkerEvent, transfer: Transferable[] = []) {
  scope.postMessage(event, transfer);
}

function applyState(sim: CatSimulation, state: InitialState) {
  switch (state.kind) {
    case "vacuum":
      sim.resetVacuum();
      break;
    case "fock":
      sim.resetFock(state.n);
      break;
    case "coherent":
      sim.resetCoherent(state.re, state.im);
      break;
    case "cat":
      sim.resetCat(state.re, state.im, state.odd);
      break;
  }
}

function postFrame(sim: CatSimulation) {
  const snapshot = sim.observables();
  const wigner = wignerRequest ? sim.wigner(wignerRequest.resolution, wignerRequest.extent) : null;
  const frame: Frame = {
    time: sim.time,
    dimension: sim.dimension,
    densityMatrix: sim.densityMatrix(),
    observables: {
      meanPhotonNumber: snapshot.mean_photon_number,
      parity: snapshot.parity,
      purity: snapshot.purity,
      trace: snapshot.trace,
    },
    wigner,
  };
  snapshot.free();
  const transfer: Transferable[] = [frame.densityMatrix.buffer];
  if (wigner) {
    transfer.push(wigner.buffer);
  }
  post({ type: "frame", frame }, transfer);
}

function tick() {
  timer = null;
  if (!simulation || speed <= 0) {
    return;
  }
  const now = performance.now();
  const wallStep = Math.min((now - lastTick) / 1000, MAX_WALL_STEP_S);
  lastTick = now;
  simulation.evolve(wallStep * speed);
  postFrame(simulation);
  timer = setTimeout(tick, FRAME_INTERVAL_MS);
}

function handle(command: WorkerCommand) {
  switch (command.type) {
    case "configure": {
      const { alpha, kappa1, kappa2, kappaPhi } = command.parameters;
      if (simulation?.dimension === command.dimension) {
        simulation.setParameters(alpha, kappa1, kappa2, kappaPhi);
      } else {
        simulation?.free();
        simulation = new CatSimulation(command.dimension, alpha, kappa1, kappa2, kappaPhi);
        applyState(simulation, currentState);
      }
      postFrame(simulation);
      break;
    }
    case "reset":
      currentState = command.state;
      if (simulation) {
        applyState(simulation, currentState);
        postFrame(simulation);
      }
      break;
    case "play":
      speed = command.speed;
      if (timer === null) {
        lastTick = performance.now();
        timer = setTimeout(tick, FRAME_INTERVAL_MS);
      }
      break;
    case "pause":
      speed = 0;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      break;
    case "cpuWigner":
      wignerRequest = command.request;
      if (simulation) {
        postFrame(simulation);
      }
      break;
    case "gpuSelfTest": {
      const { requestId, request } = command;
      let sim: CatSimulation | null = null;
      try {
        sim = new CatSimulation(request.dimension, request.alpha, 0, 0, 0);
        sim.resetCat(request.alpha, 0, true);
        const reference = {
          ...request,
          densityMatrix: sim.densityMatrix(),
          wigner: sim.wigner(request.resolution, request.extent),
        };
        post({ type: "gpuSelfTest", requestId, reference }, [
          reference.densityMatrix.buffer,
          reference.wigner.buffer,
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        post({ type: "gpuSelfTest", requestId, reference: null, error: message });
      } finally {
        sim?.free();
      }
      break;
    }
    case "flipTimes":
      latestFlipRequest = command.requestId;
      sweepFlipTimes(command).catch(postError);
      break;
  }
}

/**
 * Computes the sweep one point at a time and streams each point. Yielding to the event loop
 * between points lets a newer request arrive and abort this one, instead of queueing behind it.
 */
async function sweepFlipTimes(command: Extract<WorkerCommand, { type: "flipTimes" }>) {
  const { requestId, alphas, kappa1, kappa2, kappaPhi } = command;
  for (let index = 0; index < alphas.length; index++) {
    if (latestFlipRequest !== requestId) {
      return;
    }
    const pair = flipTimes(alphas.subarray(index, index + 1), kappa1, kappa2, kappaPhi);
    post({
      type: "flipTimesPoint",
      requestId,
      index,
      total: alphas.length,
      bitFlip: pair[0] ?? Number.POSITIVE_INFINITY,
      phaseFlip: pair[1] ?? Number.POSITIVE_INFINITY,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function postError(error: unknown) {
  post({ type: "error", message: error instanceof Error ? error.message : String(error) });
}

scope.onmessage = async (event: MessageEvent<WorkerCommand>) => {
  try {
    await ready;
    handle(event.data);
  } catch (error) {
    postError(error);
  }
};

ready.then(
  () => post({ type: "ready" }),
  (error: unknown) => post({ type: "error", message: `WebAssembly init failed: ${String(error)}` }),
);
