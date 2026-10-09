export type RenderMode = "solid" | "wireframe" | "both";

export interface RenderSettings {
  mode: RenderMode;
  bloom: boolean;
  autoRotate: boolean;
}

export const defaultRenderSettings: RenderSettings = {
  mode: "both",
  bloom: true,
  autoRotate: true,
};

/** Outcome of the WebGL context creation, shown in the status pill. */
export type RendererStatus = "starting" | "webgl2" | "unavailable";
