//! Flip times must not depend on the Fock truncation chosen by `flip_time_dimension`.

use cat_qubit_physics::{CatParams, flip_time_dimension, flip_times};

const RELATIVE_TOLERANCE: f64 = 1e-3;
const EXTRA_LEVELS: usize = 10;

fn params(alpha_squared: f64, kappa1: f64, kappa_phi: f64) -> CatParams {
    CatParams {
        alpha: alpha_squared.sqrt(),
        kappa1,
        kappa2: 1.0,
        kappa_phi,
    }
}

#[test]
fn flip_times_are_converged_in_the_truncation() {
    for kappa1 in [1e-2, 1e-3] {
        for alpha_squared in [2.0, 4.0, 6.0, 8.0] {
            let p = params(alpha_squared, kappa1, 0.0);
            let dim = flip_time_dimension(p.alpha);
            let coarse = flip_times(&p, dim);
            let fine = flip_times(&p, dim + EXTRA_LEVELS);
            for (name, a, b) in [
                ("bit flip", coarse.bit_flip, fine.bit_flip),
                ("phase flip", coarse.phase_flip, fine.phase_flip),
            ] {
                assert!(
                    a.is_finite(),
                    "{name} infinite at |α|² = {alpha_squared}, κ1 = {kappa1}"
                );
                let error = ((a - b) / b).abs();
                assert!(
                    error < RELATIVE_TOLERANCE,
                    "{name} at |α|² = {alpha_squared}, κ1 = {kappa1}: {a:e} with N = {dim}, \
                     {b:e} with N = {}",
                    dim + EXTRA_LEVELS,
                );
            }
        }
    }
}

#[test]
fn bit_flip_time_grows_with_the_photon_number() {
    let times: Vec<f64> = [2.0, 4.0, 6.0, 8.0]
        .iter()
        .map(|&a2| {
            let p = params(a2, 1e-3, 0.0);
            flip_times(&p, flip_time_dimension(p.alpha)).bit_flip
        })
        .collect();
    assert!(
        times.windows(2).all(|w| w[1] > 10.0 * w[0]),
        "bit-flip times must keep growing exponentially: {times:?}",
    );
}

#[test]
fn no_single_photon_loss_means_no_flips() {
    for alpha_squared in [2.0, 4.0, 8.0] {
        let p = params(alpha_squared, 0.0, 0.0);
        let times = flip_times(&p, flip_time_dimension(p.alpha));
        assert!(
            times.bit_flip.is_infinite(),
            "bit flip at |α|² = {alpha_squared}: {times:?}"
        );
        assert!(
            times.phase_flip.is_infinite(),
            "phase flip at |α|² = {alpha_squared}: {times:?}"
        );
    }
}
