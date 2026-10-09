import shaderSource from "./wignerProbe.wgsl?raw";

const WORKGROUP_SIZE = 16;
const UNIFORM_BYTES = 16;

/** Number of floats in the probe layout described in wignerProbe.wgsl. */
export function probeLength(dimension: number): number {
  return 4 * dimension + dimension * dimension + 1;
}

/** Grid coordinates of a row-major index, rounded to f32 like the shader inputs. */
export function gridPoint(index: number, resolution: number, extent: number) {
  const spacing = Math.fround((2 * extent) / (resolution - 1));
  return {
    x: Math.fround(-extent + (index % resolution) * spacing),
    p: Math.fround(-extent + Math.floor(index / resolution) * spacing),
  };
}

/**
 * f64 port of the shader recurrence at one phase-space point, returning the probe layout of
 * wignerProbe.wgsl. Same algorithm, so any gap with the GPU values comes from the GPU arithmetic.
 */
export function referenceProbe(
  densityMatrix: Float32Array,
  dimension: number,
  x: number,
  p: number,
): Float64Array {
  const out = new Float64Array(probeLength(dimension));
  const psiOffset = 4 * dimension;
  const u = 2 * (x * x + p * p);
  const theta = Math.atan2(p, x);
  const rho = (row: number, col: number, part: 0 | 1) =>
    densityMatrix[2 * (row * dimension + col) + part] as number;

  let total = 0;
  let psiFirst = Math.exp(-0.5 * u);
  for (let d = 0; d < dimension; d++) {
    if (d > 0) {
      psiFirst *= Math.sqrt(u / d);
    }
    let psiPrevious = 0;
    let psi = psiFirst;
    let sumRe = rho(d, 0, 0) * psi;
    let sumIm = rho(d, 0, 1) * psi;
    out[psiOffset + d * dimension] = psi;
    for (let n = 0; n + d + 1 < dimension; n++) {
      const psiNext =
        -((2 * n + d + 1 - u) * psi + Math.sqrt(n * (n + d)) * psiPrevious) /
        Math.sqrt((n + 1) * (n + 1 + d));
      psiPrevious = psi;
      psi = psiNext;
      sumRe += rho(n + 1 + d, n + 1, 0) * psi;
      sumIm += rho(n + 1 + d, n + 1, 1) * psi;
      out[psiOffset + d * dimension + n + 1] = psi;
    }
    const weight = d === 0 ? 1 : 2;
    const angle = -d * theta;
    const contribution = weight * (Math.cos(angle) * sumRe - Math.sin(angle) * sumIm);
    total += contribution;
    out[4 * d] = psiFirst;
    out[4 * d + 1] = sumRe;
    out[4 * d + 2] = sumIm;
    out[4 * d + 3] = contribution;
  }
  out[psiOffset + dimension * dimension] = total;
  return out;
}

/** Runs wignerProbe.wgsl over the full grid and reads back the probe of one grid point. */
export class WignerProbe {
  readonly #device: GPUDevice;
  readonly #resolution: number;
  readonly #pipeline: GPUComputePipeline;
  readonly #uniforms: GPUBuffer;
  readonly #output: GPUBuffer;
  #buffers: { dimension: number; rho: GPUBuffer; probe: GPUBuffer; readback: GPUBuffer } | null =
    null;

  constructor(device: GPUDevice, resolution: number) {
    this.#device = device;
    this.#resolution = resolution;
    this.#pipeline = device.createComputePipeline({
      label: "wigner-probe",
      layout: "auto",
      compute: { module: device.createShaderModule({ label: "wigner-probe", code: shaderSource }) },
    });
    this.#uniforms = device.createBuffer({
      label: "wigner-probe-params",
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.#output = device.createBuffer({
      label: "wigner-probe-values",
      size: resolution * resolution * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE,
    });
  }

  async run(
    densityMatrix: Float32Array,
    dimension: number,
    extent: number,
    index: number,
  ): Promise<Float32Array> {
    const device = this.#device;
    const buffers = this.#ensureBuffers(dimension);

    const uniforms = new ArrayBuffer(UNIFORM_BYTES);
    new Uint32Array(uniforms, 0, 2).set([dimension, this.#resolution]);
    new Float32Array(uniforms, 8, 1).set([extent]);
    new Uint32Array(uniforms, 12, 1).set([index]);
    device.queue.writeBuffer(this.#uniforms, 0, uniforms);
    device.queue.writeBuffer(buffers.rho, 0, densityMatrix);

    const bindGroup = device.createBindGroup({
      layout: this.#pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.#uniforms } },
        { binding: 1, resource: { buffer: buffers.rho } },
        { binding: 2, resource: { buffer: this.#output } },
        { binding: 3, resource: { buffer: buffers.probe } },
      ],
    });
    const encoder = device.createCommandEncoder({ label: "wigner-probe" });
    encoder.clearBuffer(buffers.probe);
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, bindGroup);
    const groups = Math.ceil(this.#resolution / WORKGROUP_SIZE);
    pass.dispatchWorkgroups(groups, groups);
    pass.end();
    encoder.copyBufferToBuffer(buffers.probe, 0, buffers.readback, 0, buffers.readback.size);
    device.queue.submit([encoder.finish()]);

    await buffers.readback.mapAsync(GPUMapMode.READ);
    const values = new Float32Array(buffers.readback.getMappedRange().slice(0));
    buffers.readback.unmap();
    return values.subarray(0, probeLength(dimension));
  }

  destroy() {
    this.#uniforms.destroy();
    this.#output.destroy();
    this.#destroyBuffers();
  }

  #ensureBuffers(dimension: number) {
    if (this.#buffers?.dimension === dimension) {
      return this.#buffers;
    }
    this.#destroyBuffers();
    // Storage and copy sizes must be multiples of 4 bytes; floats already are.
    const probeBytes = probeLength(dimension) * Float32Array.BYTES_PER_ELEMENT;
    this.#buffers = {
      dimension,
      rho: this.#device.createBuffer({
        label: "wigner-probe-rho",
        size: dimension * dimension * 2 * Float32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
      probe: this.#device.createBuffer({
        label: "wigner-probe-record",
        size: probeBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      }),
      readback: this.#device.createBuffer({
        label: "wigner-probe-readback",
        size: probeBytes,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      }),
    };
    return this.#buffers;
  }

  #destroyBuffers() {
    this.#buffers?.rho.destroy();
    this.#buffers?.probe.destroy();
    this.#buffers?.readback.destroy();
    this.#buffers = null;
  }
}
