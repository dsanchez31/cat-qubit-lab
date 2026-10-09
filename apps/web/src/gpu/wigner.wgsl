// Wigner function of a truncated density matrix, one invocation per phase-space grid point.
// Same expansion as crates/physics/src/wigner.rs:
//   W(x, p) = (1/pi) sum_d c_d Re[ exp(-i d theta) sum_n rho(n+d, n) psi_n^(d)(u) ]
// with u = 2 (x^2 + p^2), theta = atan2(p, x), c_0 = 1, c_d = 2, and psi_n^(d) the normalized
// Laguerre functions (bounded by 1) obtained by forward recurrence.

struct Params {
  dim: u32,
  resolution: u32,
  extent: f32,
  _padding: f32,
}

const INV_PI: f32 = 0.318309886;

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> rho: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> wigner: array<f32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.resolution || id.y >= params.resolution) {
    return;
  }
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
    var psi_previous = 0.0;
    var psi = psi_first;
    var diagonal_sum = rho[d * params.dim] * psi;
    for (var n = 0u; n + d + 1u < params.dim; n++) {
      let nf = f32(n);
      let psi_next = -((2.0 * nf + df + 1.0 - u) * psi + sqrt(nf * (nf + df)) * psi_previous)
        / sqrt((nf + 1.0) * (nf + 1.0 + df));
      psi_previous = psi;
      psi = psi_next;
      diagonal_sum += rho[(n + 1u + d) * params.dim + n + 1u] * psi;
    }
    let weight = select(2.0, 1.0, d == 0u);
    let angle = -df * theta;
    total += weight * (cos(angle) * diagonal_sum.x - sin(angle) * diagonal_sum.y);
  }
  wigner[id.y * params.resolution + id.x] = total * INV_PI;
}
