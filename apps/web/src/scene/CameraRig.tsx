import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { PerspectiveCamera, Vector3 } from "three";

/** The part of drei's OrbitControls used here (registered with `makeDefault`). */
interface OrbitTarget {
  target: Vector3;
  update: () => void;
}

/** Camera elevation above the phase-space plane. */
const ELEVATION = (34 * Math.PI) / 180;
const MARGIN = 1.15;
/** Vertical room kept for the surface peaks, in world units. */
const PEAK_ALLOWANCE = 1.2;
/** Never frame into less than this fraction of the canvas width. */
const MIN_USABLE_FRACTION = 0.45;

interface CameraRigProps {
  extent: number;
  /** Width in CSS pixels covered by overlay panels on each side of the canvas. */
  sideInset: number;
}

/**
 * Places the camera so that the whole phase-space window fits in the part of the canvas left free
 * by the side panels, looking at the origin. Re-runs when the window or the extent changes.
 */
export function CameraRig({ extent, sideInset }: CameraRigProps) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const controls = useThree((state) => state.controls) as OrbitTarget | null;
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  useEffect(() => {
    const usableWidth = Math.max(width - 2 * sideInset, width * MIN_USABLE_FRACTION);
    const aspect = usableWidth / height;
    const verticalFov = (camera.fov * Math.PI) / 180;
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    // Half-width of the window across the view, and half-height of its tilted footprint plus a
    // peak. The near corners look wider than the plane center, hence the margin.
    const halfWidth = MARGIN * extent;
    const halfHeight = MARGIN * (extent * Math.sin(ELEVATION) + PEAK_ALLOWANCE);
    const distance = Math.max(
      halfWidth / Math.tan(horizontalFov / 2),
      halfHeight / Math.tan(verticalFov / 2),
    );
    camera.position.set(0, distance * Math.sin(ELEVATION), distance * Math.cos(ELEVATION));
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [camera, controls, extent, sideInset, width, height]);

  return null;
}
