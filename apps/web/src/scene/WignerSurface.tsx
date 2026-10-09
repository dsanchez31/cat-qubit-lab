import { useEffect, useMemo } from "react";
import { BufferAttribute, Color, DoubleSide, PlaneGeometry } from "three";
import type { WignerField } from "../gpu/useWignerField";
import { divergingColor } from "./colormap";
import type { RenderMode } from "./renderSettings";

/** Height of the surface where |W| reaches its physical maximum 1/π. */
const PEAK_HEIGHT = 1.6;
/** The wireframe uses a coarser grid: at full resolution the lines would merge into a solid. */
const WIRE_SEGMENTS = 64;
/** Wire colors are pushed above 1 so that the bloom pass picks them up. */
const WIRE_GLOW = 1.6;

interface WignerSurfaceProps {
  field: WignerField;
  mode: RenderMode;
}

/**
 * Heightfield of the Wigner function: x to the right, p into the screen, W upwards. Values are
 * scaled by π so that ±1 corresponds to the bound |W| ≤ 1/π, which keeps the scale fixed in time.
 */
export function WignerSurface({ field, mode }: WignerSurfaceProps) {
  const solid = useHeightfield(field, field.resolution - 1, 1);
  const wire = useHeightfield(field, Math.min(WIRE_SEGMENTS, field.resolution - 1), WIRE_GLOW);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {mode !== "wireframe" && (
        <mesh geometry={solid}>
          <meshStandardMaterial
            vertexColors
            side={DoubleSide}
            roughness={0.45}
            metalness={0.1}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
      )}
      {mode !== "solid" && (
        <mesh geometry={wire}>
          <meshBasicMaterial
            vertexColors
            wireframe
            transparent
            opacity={mode === "both" ? 0.35 : 0.9}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

/** Plane geometry with `segments` quads per side whose heights and colors follow `field`. */
function useHeightfield(field: WignerField, segments: number, colorScale: number): PlaneGeometry {
  const { resolution, extent, values } = field;

  const geometry = useMemo(() => {
    const plane = new PlaneGeometry(2 * extent, 2 * extent, segments, segments);
    const vertices = (segments + 1) * (segments + 1);
    plane.setAttribute("color", new BufferAttribute(new Float32Array(vertices * 3), 3));
    return plane;
  }, [extent, segments]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const positions = geometry.getAttribute("position") as BufferAttribute;
    const colors = geometry.getAttribute("color") as BufferAttribute;
    const color = new Color();
    const stride = (resolution - 1) / segments;
    for (let row = 0; row <= segments; row++) {
      // PlaneGeometry rows run from +y to -y, the Wigner rows from -p to +p.
      const sourceRow = resolution - 1 - Math.round(row * stride);
      for (let col = 0; col <= segments; col++) {
        const vertex = row * (segments + 1) + col;
        const sourceCol = Math.round(col * stride);
        const normalized = (values[sourceRow * resolution + sourceCol] ?? 0) * Math.PI;
        positions.setZ(vertex, normalized * PEAK_HEIGHT);
        divergingColor(normalized, color);
        colors.setXYZ(vertex, color.r * colorScale, color.g * colorScale, color.b * colorScale);
      }
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    geometry.computeVertexNormals();
  }, [geometry, values, resolution, segments, colorScale]);

  return geometry;
}
