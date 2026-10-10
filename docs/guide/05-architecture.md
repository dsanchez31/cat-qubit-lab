# Architecture

## Threads

```
main thread (React)                     simulation worker            flip-times worker
  App state ──── configure / reset ───▶  CatSimulation (WASM)
            ◀─── frame (ρ, observables)  evolve() every ~16 ms
  useWignerField
    ├─ GPU: WignerPipeline (WebGPU) ─▶ Float32Array
    └─ CPU: frame.wigner (computed by the worker)
  WignerSurface (three.js mesh)
  FlipPlot ◀──────────────────────────────────────── flipTimesPoint, one α at a time
```

The physics runs in **Web Workers** so the page never freezes. Two workers are created from the same
script (`apps/web/src/simulation/worker.ts`): one evolves the state, the other computes flip-time
sweeps, which take several seconds and would otherwise stall the animation. The sweep runs one `α`
at a time and posts each point as a `flipTimesPoint` event, so the curve draws itself while it is
computed. Between points the worker yields to its event loop: a newer request (a `κ` slider moved)
then aborts the stale sweep instead of queueing behind it.

## From a slider to the screen

1. `Controls` calls `onParametersChange`; `App` stores the new `CatParameters`.
2. An effect in `App` posts `{ type: "configure", parameters, dimension }` to the worker
   (`simulation/messages.ts` types every message).
3. The worker calls `setParameters` on its `CatSimulation`, which rebuilds the Liouvillian and the
   integrator in Rust, keeping the current state.
4. While playing, the worker loop calls `evolve(wallTime × speed)` and posts a `frame`: the density
   matrix as interleaved `[re, im]` floats plus the observables. The arrays are **transferred**, not
   copied.
5. `useWignerField` uploads the matrix to a GPU storage buffer, dispatches the compute shader
   (16×16 threads per workgroup, one thread per grid point), copies the result to a mappable buffer
   and reads it back. If a frame arrives while the GPU is busy, only the latest one is kept.
6. `WignerSurface` writes the values into the heights and vertex colors of a `PlaneGeometry` and
   recomputes normals. react-three-fiber renders the scene with three.js.

Without WebGPU, `App` sends `cpuWigner` to the worker, which then attaches a 128×128 CPU Wigner grid
to every frame.

### GPU self-test

A WebGPU adapter is used only after it reproduces the CPU result on a known state. Before switching
to the GPU backend, `useWignerField` asks the worker (`gpuSelfTest`) for the density matrix and the
CPU Wigner grid of an odd cat (α = 2, N = 32, 256×256 points), evaluates the same matrix with the
compute shader and compares: any NaN or infinite value, or a gap above 1e-3 in units of 1/π, rejects
the GPU. The app then falls back to the CPU and the status pill reads "WebGPU result rejected".

The check exists because WebGPU does not guarantee identical results across drivers. On Windows
D3D12 with an AMD GCN-5 integrated GPU, the shader compiler mishandled the usual swap of the
Laguerre recurrence (`previous = current; current = next;`), and the surface exceeded the bound
|W| ≤ 1/π by a factor of 200 without any error. `wigner.wgsl` now unrolls the recurrence by two so
that no value is copied between loop variables; the self-test catches the next defect of this kind.

### `?wigner=` query parameter

| Value | Effect |
| --- | --- |
| `gpu` (default) | WebGPU when available and the self-test passes, CPU otherwise |
| `cpu` | Forces the CPU computation, for a side-by-side comparison on the same machine |
| `diagnose` | Keeps WebGPU even if the self-test fails, asks the worker for the CPU grid at the GPU resolution and logs the gap every second; when it exceeds 1e-3, `wignerProbe.wgsl` records every intermediate value at the worst point and the console compares it with an f64 port of the recurrence (`wignerProbe.ts`) |

WebGPU needs a secure context: to test another machine on the local network, open the dev server
through an SSH tunnel (`ssh -N -L 5173:localhost:5173 <host>`) so the page stays on `localhost`.

## The 3D view

- `CameraRig` frames the phase-space window in the part of the canvas left free by the side panels
  (`sideInset`), for any window size and extent, then hands over to the orbit controls.
- `WignerSurface` draws a full-resolution solid surface and a coarser 64×64 wireframe; the dock
  switches between solid, wireframe and both. Wire colors exceed 1 so that the bloom pass
  (`@react-three/postprocessing`) makes them glow.
- The status pill in the header reports the renderer (WebGL 2, or an error caught by
  `SceneErrorBoundary`) and where the Wigner function is computed (WebGPU or CPU).
- Restart replays the last initial state with the current parameters: `App` bumps a token, the
  worker resets the density matrix and the clock.

## Layout

On screens at least 1024 px wide the page is exactly one viewport high: the canvas fills it and the
panels float over it (tutorial on the left, parameters and flip times on the right, dock at the
bottom). Below that width the canvas takes 62 % of the height and the panels stack under it.

## Why these choices

| Choice | Reason |
| --- | --- |
| Rust → WASM for the solver | near-native speed in the browser, a typed and tested core shared with native tests |
| CPU for the Lindblad equation | a single mode with `N ≤ 50` is small; the GPU would add transfer overhead without speedup |
| GPU for the Wigner function | 65 536 independent evaluations of an `O(N²)` sum per frame: an ideal data-parallel workload |
| Workers | keep the UI responsive while the physics runs |
| Spectral flip times | the only way to reach exponentially long times |
| dynamiqs references | an independent implementation catches convention and sign errors |

## Repository layout

```
Cargo.toml, rust-toolchain.toml   Rust workspace and pinned toolchain
package.json, pnpm-workspace.yaml JavaScript workspace (pnpm), root scripts
biome.json                        TypeScript lint and format
crates/physics                    physics library
crates/physics-wasm               JavaScript bindings
apps/web/src/simulation           worker, messages, React hooks
apps/web/src/gpu                  WebGPU device, WGSL shaders, pipeline, self-test, diagnostic probe
apps/web/src/scene                3D scene, surface, colormap
apps/web/src/ui                   controls, plot, tutorial
reference                         dynamiqs generator (uv) and data
.github/workflows                 CI and GitHub Pages deployment
```

## Commands

| Command | Effect |
| --- | --- |
| `pnpm build:wasm` | compile `crates/physics-wasm` into `crates/physics-wasm/pkg` |
| `pnpm dev` | development server with hot reload |
| `pnpm build` | production bundle in `apps/web/dist` |
| `pnpm check` | Biome lint and format check |
| `pnpm typecheck` | TypeScript type check |
| `cargo test --workspace --release` | physics tests against dynamiqs |
| `cargo clippy --workspace --all-targets` | Rust lints |
| `uv run generate` (in `reference/`) | regenerate the reference data |
