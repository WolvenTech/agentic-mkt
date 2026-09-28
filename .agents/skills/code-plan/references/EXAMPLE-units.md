# Example work units (code-plan)

Reference table shape for `docs/specs/<slug>/<slug>-plan.md`: vertical
observable Done when (behavior + proof or gate check), typed Unresolved
rows, the Subagent column, and wave STOP gates.

Worked example below: a hypothetical avatar-upload feature
(`docs/specs/avatar-upload/avatar-upload-plan.md`).

## Wave stops

| Stop | After unit | Gate |
|------|------------|------|
| **1** | 04 | Structural inspection of units 02–03 + `harness:validate` PASS — **abort before Wave 2** |
| **2** | 07 | Structural inspection of units 05–06 + `harness:validate` PASS — **abort; Wave 2 is the last wave** |
| **Ship** | closeout unit | Final closeout checks pass; `harness:validate` PASS |

## Unresolved (typed rows — carry from the locked spec)

| Identifier | Decision needed | Owner | Blocking effect | Disposition | Unit |
|---|---|---|---|---|---|
| `U-example-storage` | Object storage vs. inline DB blob for the uploaded image. | *(decision owner)* | **Blocks Wave 1** (unit 01) until resolved. | *(empty until decided — do not invent)* | 01 |
| `U-example-size-limit` | Maximum upload size in MB before rejecting the file. | *(decision owner)* | **Blocks Wave 2** (unit 06) until resolved. | *(empty until decided — do not invent)* | 06 |

Blocking rows stay visible. An empty Disposition is fine; an invented one
is not — even in an example, never show a Disposition no one actually
decided.

## Work units (excerpt)

| # | Unit | Depends | Owns | Subagent | Done when |
|---|------|---------|------|----------|-----------|
| 01 | Record disposition `U-example-storage` | — | `docs/specs/avatar-upload/avatar-upload-plan.md` (Unresolved table) | `inline` | Disposition filled; storage choice named; Wave 1 unblocked **or** escalated and stopped — proof: Unresolved row inspectable |
| 02 | Implement avatar upload endpoint | 01 | `src/avatar/upload/**` | `spawn` | Endpoint accepts an image and stores it per the spec's storage disposition; spec-named proof (or gate check) inspectable |
| 03 | Implement image resize pipeline | 01 | `src/avatar/resize/**` | `spawn` | Uploaded image is resized to the spec's named thumbnail sizes; spec-named proof (or gate check) inspectable |
| 04 | **Wave 1 gate** | 02, 03 | — | `inline` | Structural inspection satisfies units 02–03's proofs; `harness:validate` PASS; failure → **abort** before Wave 2 |
| 05 | Wire the avatar into the profile page | 04 | `src/profile/**` | `spawn` | Profile page shows the uploaded avatar after a successful upload; spec-named proof (or gate check) inspectable |
| 06 | Record disposition `U-example-size-limit` + enforce it | 04 | `src/avatar/upload/**`, `docs/specs/avatar-upload/avatar-upload-plan.md` (Unresolved table) | `inline` | Disposition filled; size limit enforced to match; Wave 2 unblocked **or** escalated and stopped |
| 07 | **Wave 2 gate** | 05, 06 | — | `inline` | Structural inspection satisfies units 05–06's proofs; `harness:validate` PASS; failure → **abort** |

## Frontier order

**Wave 1:** 01 → (02 ∥ 03) → **04 STOP**

**Wave 2:** (05 ∥ 06) → **07 STOP**

Parallel only when Owns are disjoint. Never pack Wave 2 into the Wave 1
mutate batch to skip unit 04.

## Vertical unit shape (good)

| # | Unit | Depends | Owns | Subagent | Done when |
|---|------|---------|------|----------|-----------|
| 02 | Implement avatar upload endpoint | 01 | `src/avatar/upload/**` | `spawn` | Endpoint accepts an image and stores it per the spec's storage disposition; spec-named proof (or gate check) inspectable |

**Why good:** one coherent outcome end-to-end; Done when names behavior + a
spec-named proof; agent-sized; Subagent stated explicitly.

## Layer-only slice (bad — re-slice)

| # | Unit | Depends | Owns | Subagent | Done when |
|---|------|---------|------|----------|-----------|
| 98 | Update every avatar module file | — | `src/avatar/upload/**`, `src/avatar/resize/**`, `src/profile/**` | `spawn` | All avatar files touched; formatting cleaned up |

**Why bad:** layer-only (files/formatting), no observable behavior, no
named proof, mixes Owns across unrelated outcomes. Safety valve → stop and
split into vertical units, each with behavior + a spec-named proof (or
gate check).

## Mega-unit shape (bad — re-slice)

| # | Unit | Depends | Done when |
|---|------|---------|-----------|
| 99 | Ship the avatar feature | — | Upload, resize, and profile wiring all built; tests pass |

**Why bad:** not agent-sized; no per-outcome proof; safety valve → stop and
split.

## Validate / proof ownership

| # | Unit | Depends | Subagent | Done when | Validate |
|---|------|---------|----------|-----------|----------|
| 02 | Implement avatar upload endpoint | 01 | `spawn` | Behavior + spec-named proof (or gate check) ready | Unit-specific structural check; `harness:validate` at the wave gate |
| 04 | **Wave 1 gate** | 02, 03 | `inline` | Units 02–03's proofs PASS | `harness:validate` PASS |

Gate units own `harness:validate` and the wave's named proofs;
implementation units name unit-specific behavior + proof readiness.
