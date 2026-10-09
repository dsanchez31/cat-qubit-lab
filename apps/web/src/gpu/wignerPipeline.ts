import shaderSource from "./wigner.wgsl?raw";

const WORKGROUP_SIZE = 16;
const BYTES_PER_COMPLEX = 2 * Float32Array.BYTES_PER_ELEMENT;
const UNIFORM_BYTES = 16;

/** Evaluates the Wigner function of a density matrix on a square grid with a compute shader. */
export class WignerPipeline {
  readonly resolution: number;
  readonly #device: GPUDevice;
  readonly #pipeline: GPUComputePipeline;
  readonly #uniforms: GPUBuffer;
  readonly #output: GPUBuffer;
  readonly #readback: GPUBuffer;
  #densityMatrix: GPUBuffer | null = null;
  #busy = false;

  constructor(device: GPUDevice, resolution: number) {
    this.resolution = resolution;
    this.#device = device;
    this.#pipeline = device.createComputePipeline({
      label: "wigner",
      layout: "auto",
      compute: { module: device.createShaderModule({ label: "wigner", code: shaderSource }) },
    });
    this.#uniforms = device.createBuffer({
      label: "wigner-params",
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const outputBytes = resolution * resolution * Float32Array.BYTES_PER_ELEMENT;
    this.#output = device.createBuffer({
      label: "wigner-values",
      size: outputBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.#readback = device.createBuffer({
      label: "wigner-readback",
      size: outputBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Returns the Wigner values (row-major, rows along p), or null when the previous evaluation is
   * still in flight: the caller simply skips that frame.
   */
  async compute(
    densityMatrix: Float32Array,
    dimension: number,
    extent: number,
  ): Promise<Float32Array | null> {
    if (this.#busy) {
      return null;
    }
    this.#busy = true;
    try {
      const device = this.#device;
      const matrixBuffer = this.#ensureDensityMatrixBuffer(dimension);

      const uniforms = new ArrayBuffer(UNIFORM_BYTES);
      new Uint32Array(uniforms, 0, 2).set([dimension, this.resolution]);
      new Float32Array(uniforms, 8, 2).set([extent, 0]);
      device.queue.writeBuffer(this.#uniforms, 0, uniforms);
      device.queue.writeBuffer(matrixBuffer, 0, densityMatrix);

      const bindGroup = device.createBindGroup({
        layout: this.#pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.#uniforms } },
          { binding: 1, resource: { buffer: matrixBuffer } },
          { binding: 2, resource: { buffer: this.#output } },
        ],
      });
      const encoder = device.createCommandEncoder({ label: "wigner" });
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.#pipeline);
      pass.setBindGroup(0, bindGroup);
      const groups = Math.ceil(this.resolution / WORKGROUP_SIZE);
      pass.dispatchWorkgroups(groups, groups);
      pass.end();
      encoder.copyBufferToBuffer(this.#output, 0, this.#readback, 0, this.#readback.size);
      device.queue.submit([encoder.finish()]);

      await this.#readback.mapAsync(GPUMapMode.READ);
      const values = new Float32Array(this.#readback.getMappedRange().slice(0));
      this.#readback.unmap();
      return values;
    } finally {
      this.#busy = false;
    }
  }

  destroy() {
    this.#uniforms.destroy();
    this.#output.destroy();
    this.#readback.destroy();
    this.#densityMatrix?.destroy();
  }

  #ensureDensityMatrixBuffer(dimension: number): GPUBuffer {
    const size = dimension * dimension * BYTES_PER_COMPLEX;
    if (!this.#densityMatrix || this.#densityMatrix.size < size) {
      this.#densityMatrix?.destroy();
      this.#densityMatrix = this.#device.createBuffer({
        label: "density-matrix",
        size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }
    return this.#densityMatrix;
  }
}
