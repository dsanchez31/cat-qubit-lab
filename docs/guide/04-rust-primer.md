# Rust primer

Enough Rust to read `crates/`. Each feature is shown where the code uses it.

## Crates, modules, workspace

A **crate** is a compilation unit (a library or a binary). The root `Cargo.toml` declares a
**workspace** of two crates:

- `crates/physics`: a plain library, testable on any machine with `cargo test`;
- `crates/physics-wasm`: a thin layer that exposes the library to JavaScript.

Inside a crate, each file is a **module**. `lib.rs` lists them with `pub mod fock;` and re-exports
the main types with `pub use` so that users write `cat_qubit_physics::Simulation` rather than
`cat_qubit_physics::simulation::Simulation`.

## Structs, impl blocks, methods

```rust
pub struct DenseMatrix {
    pub dim: usize,
    pub data: Vec<C64>,
}

impl DenseMatrix {
    pub fn zeros(dim: usize) -> Self { ... }          // associated function, called DenseMatrix::zeros(4)
    pub fn trace(&self) -> C64 { ... }                // method, called m.trace()
    pub fn fill_zero(&mut self) { ... }               // method that modifies m
}
```

`Vec<C64>` is a growable array of complex numbers. `usize` is an unsigned integer used for sizes and
indices. Fields without `pub` are private to the module.

## Ownership and borrowing

The rule that makes Rust different: every value has exactly one **owner**, and memory is freed when
the owner goes out of scope. Other code can **borrow** it:

- `&T`: shared borrow, read-only, any number at a time;
- `&mut T`: exclusive borrow, read-write, only one at a time and no shared borrow meanwhile.

The compiler checks these rules, which rules out data races and use-after-free without a garbage
collector. Example from `lindblad.rs`:

```rust
pub fn apply(&self, rho: &DenseMatrix, out: &mut DenseMatrix, scratch: &mut DenseMatrix)
```

`rho` is only read, `out` and `scratch` are written. Passing buffers in, instead of returning new
matrices, avoids allocating memory at every RK4 stage. In `Rk4Integrator::step`,
`let Self { lindbladian, k1, .. } = self;` splits `self` into separate mutable borrows of its fields
so they can be used side by side.

When a function takes a value without `&` (`LuDecomposition::new(mut matrix: Vec<f64>, ...)`), it
takes ownership: the matrix is factored in place and the caller can no longer use it.

## Enums and pattern matching

```rust
pub enum InitialState {
    Vacuum,
    Fock(usize),
    Coherent(C64),
    Cat(C64, CatParity),
}
```

An enum value is exactly one of its variants, each carrying its own data. `match` must handle every
variant, otherwise the code does not compile (`Simulation::reset`).

## Option and Result

Rust has no `null` and no exceptions.

- `Option<T>` is `Some(value)` or `None`: used for "might not exist"
  (`ParityBlock::position` returns `None` outside the block).
- `Result<T, E>` is `Ok(value)` or `Err(error)`: used for operations that can fail
  (`LuDecomposition::new` returns `Err(SingularMatrix)` on a zero pivot).

The `?` operator returns early on `None` / `Err`. `.ok()?` in `smallest_eigenvalue` converts the
`Result` to an `Option` and bails out if the factorization failed.

## Iterators and closures

```rust
let purity = rho.data.iter().map(C64::norm_sqr).sum();
```

`iter()` walks a collection, `map` transforms each element, `sum` reduces. Iterator chains compile to
the same machine code as hand-written loops. `|m, n| m % 2 != n % 2` is a **closure**, an anonymous
function, passed to `ParityBlock::new` to select the members of a block.

## Traits and derive

A **trait** is an interface. `#[derive(Clone, Copy, Debug, PartialEq)]` asks the compiler to
implement standard traits automatically: `Clone` (explicit copy), `Copy` (implicit copy for small
values), `Debug` (printable with `{:?}`), `PartialEq` (comparable with `==`). `SingularMatrix`
implements `Display` and `std::error::Error` by hand so it behaves like any other error.

## Tests

`crates/physics/tests/reference.rs` is an **integration test**: it uses the crate from the outside,
like a user would. Each `#[test]` function runs with `cargo test`; `assert!` fails the test with a
formatted message.

## Lints

The workspace enables Clippy's `pedantic` group and forbids `unsafe` code (`[workspace.lints]` in
`Cargo.toml`). A few pedantic lints are disabled with a stated reason, mainly integer to float
casts, which are everywhere in index arithmetic on Fock levels.

## WebAssembly bindings

`crates/physics-wasm/src/lib.rs` wraps the library for JavaScript with `wasm-bindgen`:

- `#[wasm_bindgen]` on a struct makes it a JavaScript class; on a function, an exported function;
- `#[wasm_bindgen(constructor)]` maps to `new CatSimulation(...)`;
- `js_name = resetCat` gives the JavaScript name (camelCase);
- `Vec<f32>` becomes a `Float32Array`, `&[f64]` accepts a `Float64Array`, `Result<T, JsError>`
  throws a JavaScript exception on `Err`.

`wasm-pack build crates/physics-wasm --target web` compiles to `.wasm` and generates the JavaScript
glue and TypeScript types in `crates/physics-wasm/pkg/`.
