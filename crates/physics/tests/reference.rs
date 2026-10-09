//! Compares the crate against dynamiqs reference data from `reference/data/`.
//!
//! Regenerate the data with `uv run generate` in `reference/`.

use std::path::PathBuf;

use cat_qubit_physics::fock::C64;
use cat_qubit_physics::{CatParams, CatParity, InitialState, Simulation, flip_times, wigner};
use serde::Deserialize;
use serde::de::DeserializeOwned;

const DENSITY_MATRIX_TOLERANCE: f64 = 1e-6;
const FLIP_TIME_RELATIVE_TOLERANCE: f64 = 1e-4;
const WIGNER_TOLERANCE: f64 = 1e-9;

#[derive(Deserialize)]
struct Dataset<T> {
    generator: String,
    cases: Vec<T>,
}

#[derive(Deserialize)]
struct Matrix {
    re: Vec<Vec<f64>>,
    im: Vec<Vec<f64>>,
}

#[derive(Deserialize)]
struct TimeEvolutionCase {
    name: String,
    alpha: f64,
    kappa1: f64,
    kappa2: f64,
    kappa_phi: f64,
    dimension: usize,
    times: Vec<f64>,
    states: Vec<Matrix>,
}

#[derive(Deserialize)]
struct FlipTimesCase {
    alpha: f64,
    kappa1: f64,
    kappa2: f64,
    kappa_phi: f64,
    dimension: usize,
    bit_flip_time: f64,
    phase_flip_time: f64,
}

#[derive(Deserialize)]
struct WignerCase {
    name: String,
    alpha: f64,
    odd: bool,
    dimension: usize,
    x: Vec<f64>,
    p: Vec<f64>,
    values: Vec<Vec<f64>>,
}

fn load<T: DeserializeOwned>(name: &str) -> Dataset<T> {
    let path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("../../reference/data/{name}.json"));
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "cannot read {}: {e}; run `uv run generate` in reference/",
            path.display()
        )
    });
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("invalid {}: {e}", path.display()))
}

fn relative_error(actual: f64, expected: f64) -> f64 {
    ((actual - expected) / expected).abs()
}

#[test]
fn time_evolution_matches_dynamiqs() {
    let dataset: Dataset<TimeEvolutionCase> = load("time_evolution");
    for case in dataset.cases {
        let params = CatParams {
            alpha: case.alpha,
            kappa1: case.kappa1,
            kappa2: case.kappa2,
            kappa_phi: case.kappa_phi,
        };
        let mut simulation = Simulation::new(case.dimension, params);
        simulation.reset(InitialState::Vacuum);
        for (time, expected) in case.times.iter().zip(&case.states) {
            simulation.evolve(time - simulation.time());
            let rho = simulation.density_matrix();
            for m in 0..case.dimension {
                for n in 0..case.dimension {
                    let expected = C64::new(expected.re[m][n], expected.im[m][n]);
                    let error = (rho.get(m, n) - expected).norm();
                    assert!(
                        error < DENSITY_MATRIX_TOLERANCE,
                        "{} ({}): rho[{m}][{n}] at t = {time} differs by {error:e}",
                        case.name,
                        dataset.generator,
                    );
                }
            }
        }
    }
}

#[test]
fn flip_times_match_dynamiqs_spectrum() {
    let dataset: Dataset<FlipTimesCase> = load("flip_times");
    for case in dataset.cases {
        let params = CatParams {
            alpha: case.alpha,
            kappa1: case.kappa1,
            kappa2: case.kappa2,
            kappa_phi: case.kappa_phi,
        };
        let times = flip_times(&params, case.dimension);
        let bit_flip_error = relative_error(times.bit_flip, case.bit_flip_time);
        let phase_flip_error = relative_error(times.phase_flip, case.phase_flip_time);
        assert!(
            bit_flip_error < FLIP_TIME_RELATIVE_TOLERANCE,
            "alpha = {}, kappa_phi = {}: bit-flip time {} vs {} ({})",
            case.alpha,
            case.kappa_phi,
            times.bit_flip,
            case.bit_flip_time,
            dataset.generator,
        );
        assert!(
            phase_flip_error < FLIP_TIME_RELATIVE_TOLERANCE,
            "alpha = {}, kappa_phi = {}: phase-flip time {} vs {} ({})",
            case.alpha,
            case.kappa_phi,
            times.phase_flip,
            case.phase_flip_time,
            dataset.generator,
        );
    }
}

#[test]
fn wigner_matches_dynamiqs() {
    let dataset: Dataset<WignerCase> = load("wigner");
    for case in dataset.cases {
        let parity = if case.odd {
            CatParity::Odd
        } else {
            CatParity::Even
        };
        let mut simulation = Simulation::new(
            case.dimension,
            CatParams {
                alpha: case.alpha,
                kappa1: 0.0,
                kappa2: 0.0,
                kappa_phi: 0.0,
            },
        );
        simulation.reset(InitialState::Cat(C64::new(case.alpha, 0.0), parity));
        for (row, &p) in case.p.iter().enumerate() {
            for (col, &x) in case.x.iter().enumerate() {
                let actual = wigner::wigner_at(simulation.density_matrix(), x, p);
                let expected = case.values[row][col];
                assert!(
                    (actual - expected).abs() < WIGNER_TOLERANCE,
                    "{}: W({x}, {p}) = {actual} vs {expected} ({})",
                    case.name,
                    dataset.generator,
                );
            }
        }
    }
}
