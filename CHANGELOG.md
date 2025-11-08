# Changelog

All notable changes to this project will be documented in this file.

## 2025-11-06

### Null Ground State Elimination
- `Mind.create_state()` now requires ground_state parameter (null not allowed)
- Only `logos_state()` singleton has `ground_state=null`
- All test instances updated to use `logos_state()` or appropriate ground state

### Cross-State References
- `about_state` parameter enables prototypes to reference beliefs in different states
- `State.add_shared_from_template()` convenience method for creating prototypes
- `Belief.get_about()` checks `about_state` before `ground_state`
- `Traittype.to_inspect_view()` uses `about_state` for Subject resolution
- Auto-locking in `State.add_beliefs_from_template()` reduces boilerplate
- Improved error messages for unlocked bases (shows which belief, which state to lock)

## 2025-11-03

### Logos Singleton
- Mind constructor enforces parent parameter (null only allowed for Logos singleton)
- `Mind.create_state()` no longer defaults to `ground_state=null`
- Logos singleton (`logos()`) is the ONE mind with `parent=null`
- logos_state singleton is the ONE state with `ground_state=null`

## 2025-11-03

### Eidos - Realm of Forms
- Primordial singletons moved to cosmos.mjs: `logos()`, `logos_state()`, `eidos()`
- Eidos singleton holds all universal prototypes (child of Logos)
- `mind.origin_state` property tracks first state created by each mind
- Prototypes created by `DB.register()` now live in Eidos.origin_state
- `belief.locked` is now a getter (internal `._locked` field)
- Backward compatibility: `DB.get_eidos()`, `DB.get_logos_mind()`, `DB.get_logos_state()` still available

## 2025-11-01

### Unified Registration API
- `DB.register()` now accepts three parameters: `register(traittypes, archetypes, prototypes)`
- Prototypes are timeless shared beliefs created without `@tt` (automatically get `get_tt() === -Infinity`)
- Prototypes must have `bases` array, optional `traits` object
- All prototypes created with `null` parent mind (global scope) and `null` origin_state (stateless)
- Simplifies world setup - no manual `create_shared_from_template()` calls needed

### Timeless Shared Beliefs
- `belief.get_tt()` returns `-Infinity` for shared beliefs without `@tt` (was: `0`)
- Timeless prototypes are now always included in `subject.beliefs_at_tt()` queries
- Enables shared beliefs that exist "outside of time" for universal prototypes

### Method Rename
- `subject.beliefs_valid_at()` → `subject.beliefs_at_tt()` (consistent with `mind.states_at_tt()`)

### State Constructor Validation
- State constructor validates `ground_state` must be in parent mind
- State constructor skips locked self check for versioned states (only checks initial states)

## 2025-10-31

### Trait Operations Pattern
- Archetypes support `trait.operation` syntax (e.g., `mind.append`) for composable operations
- NPCs compose cultural knowledge from multiple archetype bases
- `DB.get_belief_for_state_subject(state, about_subject)` - Query learned beliefs
- `State.lock()` returns `this` for chaining

## 2025-10-27

### Template Data Validation
- Archetype trait values must be string labels or Subject objects (Belief objects now rejected with clear error)

### Mind Hierarchy Enforcement
- Mind constructor now requires parent_mind as mandatory first parameter with parent/child tracking

## 2025-10-26

### Shared Beliefs as Prototypes
- Shared beliefs now work as prototypes in the inheritance chain
- `get_prototypes()` - Returns full prototype chain (both Archetypes and shared Beliefs with labels)
- Inspector now shows "Prototypes" heading instead of "Archetypes"
- Displays both Archetypes and shared prototype Beliefs in order
- Enables prototype-based inheritance: traits resolve through archetype bases, then shared belief prototypes

### Temporal Queries with Branch Support
- `subject.beliefs_at_tt(timestamp)` - Generator yielding outermost beliefs on each branch at or before timestamp (moved from DB.valid_at)
- `mind.states_at_tt(timestamp)` - Generator yielding outermost states on each branch at or before timestamp
- Handles branching version histories correctly (filters out beliefs/states with descendants at same timestamp)
- Returns empty iterable if no versions exist before timestamp
- Enables "as of" queries across multiple parallel belief/state branches

## 2025-10-26

### Trait Value Inheritance
- `get_trait(name)` - Returns raw trait values (Subject, not Belief) with prototype-style inheritance through bases chain
- `get_traits()` generator - Iterates all traits including inherited (own traits shadow inherited)
- `get_slots()` generator - Shows available trait slots from archetype composition
- `learn_about()` now copies inherited trait values, not just own traits
- Enables incremental knowledge accumulation via belief versioning

### Temporal Tracking
- `get_timestamp()` - Unified interface checks `@timestamp` meta-trait, falls back to `origin_state.timestamp`
- `Temporal` archetype added for ontological modeling

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
