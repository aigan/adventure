# Changelog

All notable changes to this project will be documented in this file.

## 2025-01-24

### `learn_about()` Parameter Refactor
- Made `source_state` parameter optional (defaults to `ground_state`)
- Reordered params: `learn_about(belief, trait_names, source_state)`
- Updated all 16 call sites across codebase
- Added documentation clarifying `ground_state` relationship
- All 110 tests passing

## 2025-01-23

### `learn_about()` Refactor
- Split knowledge acquisition into three phases:
  - `recognize()` - Find existing beliefs about a subject
  - `integrate()` - Reconcile new knowledge with existing beliefs
  - `learn_about()` - Orchestrates recognize → integrate
- Behavior change: Multiple beliefs about same subject now updates first (was: error)
- Foundation for variant beliefs (contradictions, alternative scenarios, personas)
- All 110 tests passing
