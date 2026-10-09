import type { CatParameters, InitialState } from "../simulation/messages";

export interface TutorialStep {
  title: string;
  paragraphs: string[];
  /** Applied when the step opens; the user can then play with every control. */
  setup: {
    parameters: CatParameters;
    state: InitialState;
    playing: boolean;
    speed: number;
  };
}

const idle: Omit<CatParameters, "alpha"> = { kappa1: 0, kappa2: 0, kappaPhi: 0 };

export const tutorialSteps: TutorialStep[] = [
  {
    title: "1. A box of microwave photons",
    paragraphs: [
      "A superconducting resonator traps microwave light. Quantum mechanically it is a harmonic oscillator whose energy comes in packets: the Fock states |0⟩, |1⟩, |2⟩… hold exactly 0, 1, 2… photons.",
      "The surface is the Wigner function, a map of the state over the two quadratures of the field, x and p. Here the resonator holds exactly one photon: the dip below zero (teal) at the center has no classical equivalent. Try the Vacuum button for comparison.",
    ],
    setup: {
      parameters: { alpha: 2, ...idle },
      state: { kind: "fock", n: 1 },
      playing: false,
      speed: 0.5,
    },
  },
  {
    title: "2. A coherent state",
    paragraphs: [
      "Driving the resonator with a classical microwave tone produces a coherent state |α⟩: a Gaussian bump displaced from the origin in proportion to α. It is the most classical state of light, a wave with a well defined amplitude and phase.",
      "Move the α slider, then press |α⟩: the larger α, the further the bump and the more photons (|α|² on average).",
    ],
    setup: {
      parameters: { alpha: 2, ...idle },
      state: { kind: "coherent", re: 2, im: 0 },
      playing: false,
      speed: 0.5,
    },
  },
  {
    title: "3. Schrödinger cat states",
    paragraphs: [
      "A cat state superposes two opposite coherent states, |α⟩ + |−α⟩: the field oscillates with two opposite phases at once. Between the two bumps, interference fringes dip below zero, the fingerprint of the superposition.",
      "The even cat holds only even photon numbers (parity +1), the odd cat only odd ones (parity −1). These two states, or equivalently the two bumps, encode a qubit.",
    ],
    setup: {
      parameters: { alpha: 2, ...idle },
      state: { kind: "cat", re: 2, im: 0, odd: false },
      playing: false,
      speed: 0.5,
    },
  },
  {
    title: "4. Two-photon dissipation",
    paragraphs: [
      "Alice & Bob's cat qubits are not just prepared, they are stabilized: the resonator exchanges photons with its environment in pairs only (rate κ₂), which continuously pulls any state towards the two coherent states ±α.",
      "Watch the vacuum inflate into a cat (↺ in the dock replays it). Photons arrive two by two, so the parity stays +1 and the fringes appear. Every state is attracted to the same two-dimensional space: the qubit is protected by construction.",
    ],
    setup: {
      parameters: { alpha: 2, kappa1: 0, kappa2: 1, kappaPhi: 0 },
      state: { kind: "vacuum" },
      playing: true,
      speed: 0.5,
    },
  },
  {
    title: "5. Exponential bit-flip suppression",
    paragraphs: [
      "Real resonators also lose single photons (κ₁). A bit flip means jumping from one bump to the other: the dissipation must be beaten across a distance that grows with α, so the bit-flip time grows exponentially with |α|² (yellow curve).",
      "The price is linear: each lost photon flips the parity, so the phase-flip time shrinks as 1/|α|² (teal curve). The cat inflates again, now with losses; drag α and watch the trade-off. Only phase flips remain to be corrected, with a simple repetition code instead of a 2D surface code.",
    ],
    setup: {
      parameters: { alpha: 2, kappa1: 1e-3, kappa2: 1, kappaPhi: 0 },
      state: { kind: "vacuum" },
      playing: true,
      speed: 0.5,
    },
  },
];
