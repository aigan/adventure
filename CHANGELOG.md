# Changelog

All notable changes to this project will be documented in this file.

## 2025-10-24

### Cosmos Cleanup
Removed factory methods from Cosmos (create_mind, create_belief, create_state, get_traittype). Classes now import directly - no circular dependencies exist. Serialization state moved to Serialize class. Cosmos is now pure re-export mediator.

### Inspection UI Enhancement
Added `[MUTABLE]` indicator for unlocked states and beliefs

## 2025-10-24

### Mind and Self Refactor
- **State.self**: `self` property moved from Mind to State (temporal self-identity)
- **`mind` trait**: Replaced `mind_states` array with singular `mind` reference
  - Old: `mind_states: [{_type: 'State', learn: {...}}]`
  - New: `mind: {workshop: ['location']}`
- **State.resolve_template()**: Removed (use Mind.resolve_template() instead)
- **Locking cascade**: Belief.lock() now cascades to child mind states
- **Breaking change**: Save file format (pre-alpha, acceptable)
- Details: [docs/plans/archive/mind-self-refactor.md](docs/plans/archive/mind-self-refactor.md)

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
