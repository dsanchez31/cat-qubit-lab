// Diagnostic copy of wigner.wgsl (keep the arithmetic identical): the invocation at grid index
// `probe_index` also records every intermediate value of its evaluation.
// Probe layout, with D = dim:
//   [4 d + 0..3]          psi_first, n-sum re, n-sum im, contribution of d (before 1/pi)
//   [4 D + d D + n]       psi_n^(d)
//   [4 D + D D]           total (before 1/pi)

struct Params {
  dim: u32,
  resolution: u32,
  extent: f32,
  probe_index: u32,
}

const INV_PI: f32 = 0.318309886;

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> rho: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> wigner: array<f32>;
@group(0) @binding(3) var<storage, read_write> probe: array<f32>;

// psi_{n+1}^(d) from psi_n (`current`) and psi_{n-1} (`previous`).
fn recurrence_step(n: u32, df: f32, u: f32, current: f32, previous: f32) -> f32 {
  let nf = f32(n);
  return -((2.0 * nf + df + 1.0 - u) * current + sqrt(nf * (nf + df)) * previous)
    / sqrt((nf + 1.0) * (nf + 1.0 + df));
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.resolution || id.y >= params.resolution) {
    return;
  }
  let recording = id.y * params.resolution + id.x == params.probe_index;
  let psi_offset = 4u * params.dim;
  let spacing = 2.0 * params.extent / f32(params.resolution - 1u);
  let x = -params.extent + f32(id.x) * spacing;
  let p = -params.extent + f32(id.y) * spacing;
  let u = 2.0 * (x * x + p * p);
  let theta = atan2(p, x);

  var total = 0.0;
  var psi_first = exp(-0.5 * u);
  for (var d = 0u; d < params.dim; d++) {
    if (d > 0u) {
      psi_first *= sqrt(u / f32(d));
    }
    let df = f32(d);
    let steps = params.dim - d - 1u;
    var psi_even = psi_first;
    var psi_odd = 0.0;
    var diagonal_sum = rho[d * params.dim] * psi_even;
    if (recording) {
      probe[psi_offset + d * params.dim] = psi_even;
    }
    for (var n = 0u; n < steps; n += 2u) {
      psi_odd = recurrence_step(n, df, u, psi_even, psi_odd);
      diagonal_sum += rho[(n + 1u + d) * params.dim + n + 1u] * psi_odd;
      if (recording) {
        probe[psi_offset + d * params.dim + n + 1u] = psi_odd;
      }
      if (n + 1u < steps) {
        psi_even = recurrence_step(n + 1u, df, u, psi_odd, psi_even);
        diagonal_sum += rho[(n + 2u + d) * params.dim + n + 2u] * psi_even;
        if (recording) {
          probe[psi_offset + d * params.dim + n + 2u] = psi_even;
        }
      }
    }
    let weight = select(2.0, 1.0, d == 0u);
    let angle = -df * theta;
    let contribution = weight * (cos(angle) * diagonal_sum.x - sin(angle) * diagonal_sum.y);
    total += contribution;
    if (recording) {
      probe[4u * d] = psi_first;
      probe[4u * d + 1u] = diagonal_sum.x;
      probe[4u * d + 2u] = diagonal_sum.y;
      probe[4u * d + 3u] = contribution;
    }
  }
  if (recording) {
    probe[psi_offset + params.dim * params.dim] = total;
  }
  wigner[id.y * params.resolution + id.x] = total * INV_PI;
}
