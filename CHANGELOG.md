# Changelog

All notable changes to this project will be documented in this file.

## 2025-10-31

### Trait Operations Pattern
- Archetypes support `trait.operation` syntax (e.g., `mind.append`) for composable operations
- NPCs compose cultural knowledge from multiple archetype bases
- `DB.get_belief_about_subject_in_state(state, about_subject)` - Query learned beliefs
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
- `subject.beliefs_valid_at(timestamp)` - Generator yielding outermost beliefs on each branch at or before timestamp (moved from DB.valid_at)
- `mind.states_valid_at(timestamp)` - Generator yielding outermost states on each branch at or before timestamp
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
