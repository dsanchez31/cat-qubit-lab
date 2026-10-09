/**
 * Requests a WebGPU device, or resolves to null when the browser has no WebGPU support or no
 * suitable adapter. Callers fall back to the CPU Wigner computation in that case.
 */
export async function requestGpuDevice(): Promise<GPUDevice | null> {
  if (!("gpu" in navigator)) {
    return null;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      return null;
    }
    const device = await adapter.requestDevice();
    device.lost.then((info) => {
      console.warn(`WebGPU device lost: ${info.message}`);
    });
    return device;
  } catch (error) {
    console.warn("WebGPU unavailable, using the CPU fallback", error);
    return null;
  }
}
