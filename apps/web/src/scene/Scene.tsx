import { Grid, OrbitControls, Sparkles } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import type { WignerField } from "../gpu/useWignerField";
import { palette } from "../theme";
import { CameraRig } from "./CameraRig";
import type { RendererStatus, RenderSettings } from "./renderSettings";
import { WignerSurface } from "./WignerSurface";

const DEFAULT_EXTENT = 4;

interface SceneProps {
  field: WignerField | null;
  settings: RenderSettings;
  sideInset: number;
  onRendererStatus: (status: RendererStatus) => void;
}

export function Scene({ field, settings, sideInset, onRendererStatus }: SceneProps) {
  const extent = field?.extent ?? DEFAULT_EXTENT;
  return (
    <Canvas
      camera={{ fov: 40, near: 0.1, far: 200 }}
      dpr={[1, 2]}
      onCreated={({ gl }) => onRendererStatus(gl.capabilities.isWebGL2 ? "webgl2" : "unavailable")}
    >
      <color attach="background" args={[palette.black]} />
      <fog attach="fog" args={[palette.black, 4 * extent, 9 * extent]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 9, 6]} intensity={1.7} />
      <directionalLight position={[-7, 3, -5]} intensity={0.6} color={palette.teal} />
      <pointLight position={[0, 3, 0]} intensity={6} distance={3 * extent} color={palette.yellow} />

      {field && <WignerSurface field={field} mode={settings.mode} />}
      <Grid
        args={[2 * extent, 2 * extent]}
        position={[0, -0.02, 0]}
        cellSize={0.5}
        sectionSize={2}
        cellColor={palette.blueGray}
        sectionColor={palette.blueGray50}
        fadeDistance={5 * extent}
        infiniteGrid
      />
      <Sparkles
        count={70}
        scale={[2.4 * extent, 3, 2.4 * extent]}
        position={[0, 1.2, 0]}
        size={2.2}
        speed={0.25}
        opacity={0.55}
        color={palette.yellow}
      />

      <CameraRig extent={extent} sideInset={sideInset} />
      <OrbitControls
        makeDefault
        enableDamping
        autoRotate={settings.autoRotate}
        autoRotateSpeed={0.45}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={2}
        maxDistance={12 * extent}
      />

      {settings.bloom && (
        <EffectComposer>
          <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.6} luminanceSmoothing={0.25} />
          <Vignette offset={0.25} darkness={0.7} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
