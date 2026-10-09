/** Mirrors `cat_qubit_physics::recommended_dimension` (crates/physics/src/flip_times.rs). */
export function recommendedDimension(alpha: number): number {
  const a = Math.abs(alpha);
  return Math.min(60, Math.max(12, Math.ceil(a * a + 6 * a + 12)));
}
