export interface GpuContext {
  device: GPUDevice;
  /** "vendor architecture device (description)", for logs and diagnostics. */
  adapterLabel: string;
}

function describeAdapter(adapter: GPUAdapter): string {
  const { vendor, architecture, device, description } = adapter.info;
  const name = [vendor, architecture, device].filter(Boolean).join(" ") || "unknown adapter";
  return description ? `${name} (${description})` : name;
}

/**
 * Requests a WebGPU device, or resolves to null when the browser has no WebGPU support or no
 * suitable adapter. Callers fall back to the CPU Wigner computation in that case.
 */
export async function requestGpuDevice(): Promise<GpuContext | null> {
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
    const adapterLabel = describeAdapter(adapter);
    console.info(`WebGPU adapter: ${adapterLabel}`, {
      features: Array.from(adapter.features).sort(),
      isFallbackAdapter: adapter.info.isFallbackAdapter,
    });
    return { device, adapterLabel };
  } catch (error) {
    console.warn("WebGPU unavailable, using the CPU fallback", error);
    return null;
  }
}
