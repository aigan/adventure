# Changelog

All notable changes to this project will be documented in this file.

## 2025-11-16

### State Properties Made Private
- Refactored `state.insert` and `state.remove` to private properties (`_insert`, `_remove`)
- Updated 3 core modules: `state.mjs`, `union_state.mjs`, `timeless.mjs`
- Fixed documentation example in `docs/notes/event-perception.md` to use public API
- Updated internal implementation comment in `docs/IMPLEMENTATION.md`
- Added automated style checker (`test/z_style.test.mjs`) to enforce STYLE.md rules
  - Detects inline imports in JSDoc (STYLE.md row 7 violation)
  - Runs automatically with `npm test`
- Zero breaking changes: All external code already uses public API methods
- All 450 tests pass (1 new style checker test added)
- Follows underscore convention for private properties per `docs/STYLE.md`

### Comprehensive Test Coverage Project Complete
- **458 tests passing** (up from 413 at project start), 99.5% pass rate
- **45 new tests added** across trait inheritance and reverse trait lookup systems
- **All critical bugs fixed**:
  - UnionState `rev_trait()` bug - now properly traverses component_states
  - Subject resolution missing - added `Subject.resolve_trait_value_from_template()`
  - Test isolation issues - fixed Serialize cache and test setup patterns
- **Verified non-bugs**: Inherited reference tracking and composable inheritance work correctly
- **Unknown behaviors documented**: Empty array semantics, non-composable arrays, archetype defaults
- **Code quality improvements**:
  - Added `sysdesig()` debug methods to Traittype and UnionState
  - Eliminated ~25 lines of duplication in Subject/Archetype resolve methods
  - Converted error handling to use asserts
- **Comprehensive documentation**: 12 files in `docs/trait-inheritance/` and `docs/plans/`
- **Archived**: See `docs/plans/archive/test-coverage-comprehensive-COMPLETE.md`

### Comprehensive Test Coverage Complete (Phase 7)
- **38 New Tests Added**: Critical bug checks (8) + Missing rev_trait tests (11) + Trait inheritance (19)
- **All 446 tests passing** (up from 442), 2 pending (documented limitations)
- **Test Quality Improvements**:
  - Fixed test isolation (removed mocha imports from 5 files)
  - Established `replace_beliefs()` pattern for temporal evolution
  - All tests can now run standalone
- **Critical Pattern Fix**: Fixed 11 instances of missing `replace_beliefs()` calls across 6 test files
  - Ensures old belief versions are properly removed from reverse trait index
  - Pattern: `state.replace_beliefs(belief_v2)` after creating versioned beliefs
- **Key Discoveries**:
  - ✅ Composable inheritance fully compatible with reverse trait lookup
  - ✅ Archetype defaults remain as string labels (not resolved to Subjects)
  - ✅ Temporal evolution (add/remove) works correctly with proper pattern
  - ✅ Performance excellent (100+ refs: 0ms, 100-state chains: 0ms)
- **Documentation**: `docs/plans/PHASE7_CORE_TESTS_SUMMARY.md`
- **Files Modified**: 9 total (1 new, 8 updated)
- **Test Coverage**: Comprehensive coverage for both `get_trait` and `rev_trait` systems

### Critical Bug Check Tests for Reverse Trait Lookup
- **Phase 1 Complete**: Added 4 critical tests in `test/critical_rev_trait.test.mjs`
- Test 4.2: Archetype defaults correctly excluded from reverse index (string labels, not Subjects)
- Test 7.3: **Composable inheritance confirmed working** with reverse trait lookup ✅
  - knight inheriting sword from Warrior prototype is correctly found by sword.rev_trait()
  - Suspected critical bug DOES NOT EXIST - implementation is robust
- Test 5.1: Inherited references from belief bases correctly tracked in reverse index
- Test 3.3: Composable array elements work with reverse lookups
- **Result**: 0 bugs found, all 442 tests passing (up from 438)
- **Key Finding**: Composable inheritance is fully compatible with reverse trait lookup
- Documentation: `docs/plans/PHASE1_CRITICAL_TESTS_SUMMARY.md`

### UnionState Support in Reverse Trait Lookup
- **CRITICAL BUG FIX**: `rev_trait()` now properly traverses UnionState component_states
- Added polymorphic `State.rev_base(subject, traittype)` method (returns array)
- Added `UnionState.rev_base()` override to handle multiple component states
- Refactored `Belief.rev_trait()` to use queue-based traversal instead of single-state chain
- **Impact**: Fixes reverse lookups for ALL multi-parent beliefs (VillageBlacksmith, MasterCraftsman, etc.)
- Before: `rev_trait()` stopped at UnionState (base = null), returning empty results
- After: Properly searches all component states for trait references
- All 422 tests passing with no regressions

### Test Infrastructure and rev_base() Coverage
- **Cache Pollution Fix**: Added `Serialize.reset_state()` to prevent test pollution
  - Clears `dependency_queue`, `seen`, and `active` static properties
  - Called by `DB.reset_registries()` to ensure clean test state
- **Test File**: Added `test/rev_base.test.mjs` with 16 comprehensive tests
  - 8 basic interface tests (State and UnionState polymorphism)
  - 4 P0 critical edge cases (null pointers, rev_del, inherited refs)
  - 4 P1 high priority cases (multiple subjects, nested UnionState)
- **Test Pattern Fixes**: Corrected state creation and belief versioning patterns
  - Use `state.branch_state(ground_state, vt)` for state chains
  - Use `Belief.from_template({bases: [old]})` + `replace_beliefs()` for versioning
  - Create beliefs before locking state in UnionState tests
- All 438 tests passing (16 new tests added)

## 2025-11-14

### Client-Worker Message Protocol Documentation
- Documented all message formats in `docs/IMPLEMENTATION.md` (Message Protocol section)
- Client → Worker: `['command', data, ackid]` format with promise correlation
- Worker → Client: `ack`, `header_set`, `main_clear`, `main_add`, `topic_update` messages
- SubjectData (baked observation) format: `{id, description_short, actions, is: 'subject'}`
- ActionData format: `{do, target_blipp, subject_blopp, label}` (temp field names)
- TemplateTagResult format for rich text with embedded clickable subjects
- Promise-based RPC pattern with automatic ack handling

### Message Protocol Tests
- `test/message_protocol.test.mjs` - Message format validation (no mocking)
- `test/worker_mock.test.mjs` - Communication flow with MockWorker API simulation
- `test/worker_dispatch.test.mjs` - Real worker.mjs dispatch logic testing
- MockWorker class for testing Worker API patterns in Node.js
- Tests actual worker.mjs by mocking global Worker environment
- All 367 tests passing (12 new message protocol tests added)
- Test documentation added to `test/.CONTEXT.md`

### Message Format Consistency
- Fixed `ping` command to return `'pong'` via standard ack mechanism
- Removed separate `pong` message type - all messages use array format
- Updated handler types to allow return values (sent automatically via ack)
- String-to-array conversion kept for backwards compatibility
- Special handling for `start` command (initializes Session, multiple messages before ack)

### GUI Terminology Clarification
- **Locus**: Interactive GUI element (container) - avoids confusion with data model Subject
- **locus.topic**: The data payload (SubjectData or ActionData)
- Documented in IMPLEMENTATION.md to clarify overloaded terms

### Documentation Archiving
- Moved completed plan documents to `docs/plans/archive/`
- Archived: client-worker-foundation.md, refactor-complete-locus-topic.md, automated-testing.md, message-formats.md, gui-requirements.md, terminology.md, old-system-reference.md, testing-setup.md
- Deferred: message-enrichment.md (intentionally LAST - stays in docs/plans/, after action handlers)
- Added `docs/plans/archive/README.md` to explain archived content

## 2025-11-09

### Exposure Metadata for Observation System
- Traittypes support `exposure` field for sensory modalities (visual, tactile, spatial, internal)
- Traittypes support `values` field for enum validation with clear error messages
- Added `@form` meta-trait with enum values: solid, liquid, vapor, olfactory, auditory, intangible
- `ObjectPhysical` archetype includes `@form: 'solid'` (auto-inherits to all physical entities)
- Foundation for LOOK command and observation mechanics

### UnionState for Multi-Parent Prototype Composition
- `UnionState` class enables flyweight composition from multiple parent states without data duplication
- Beliefs compose knowledge from multiple prototype bases (e.g., VillageBlacksmith = Villager + Blacksmith)
- Iterator-based `get_beliefs()` merges component states (last wins for overlaps)
- Supports nested UnionStates (recursively traverses components)
- Restricted operations: insert and replace only (no remove to avoid ambiguity)
- Serialization support via `toJSON()` and `from_json()`
- All component states must be locked before composition

### Trait Composition from Multiple Bases
- Traittypes can declare `composable: true` to enable multi-base trait composition
- `Traittype.compose(values)` method delegates to type class if available
- Array traits automatically compose (deduplicate by sid for Belief arrays)
- Explicit `null` trait blocks composition from that inheritance branch
- Empty arrays/templates don't block composition (additive)
- Composition happens at both creation time and lookup time with caching

### Mind Composition Testing
- Comprehensive test coverage for composable mind traits (285 tests total)
- Multi-level prototype inheritance scenarios (deep chains, 3+ bases)
- Temporal evolution tests (versioning with additional bases, state branching)
- Edge cases: nested UnionStates, overlapping knowledge, own trait overrides
- Mind-specific validation: parent mind compatibility, self_subject, about_state

## 2025-11-08

### Mind Extension via State Base
- Minds created from templates automatically inherit cultural knowledge via `State.base` chain
- When belief inherits from prototype with mind trait, new mind's state uses inherited mind's state as base
- `Mind.create_from_template()` detects inherited minds and establishes cross-mind state inheritance
- Enables prototype-based knowledge sharing (e.g., player inheriting Villager cultural knowledge)

### Belief Recognition
- `recognize()` properly identifies inherited beliefs from base state chain (prevents duplicate beliefs)
- Knowledge beliefs now version correctly when extending inherited knowledge

### Inspection Enhancement
- Belief inspection now includes `about_label` field showing what knowledge beliefs are about
- Subject and Belief `to_inspect_view()` methods include mind context for cross-mind beliefs
- Trait values display "about X" suffix when they are knowledge beliefs (e.g., "Villager: #22 about workshop")

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

## 2024-10-24

### `learn_about()` Parameter Refactor
- Made `source_state` parameter optional (defaults to `ground_state`)
- Reordered params: `learn_about(belief, trait_names, source_state)`
- Updated all 16 call sites across codebase
- Added documentation clarifying `ground_state` relationship
- All 110 tests passing

## 2024-10-23

### `learn_about()` Refactor
- Split knowledge acquisition into three phases:
  - `recognize()` - Find existing beliefs about a subject
  - `integrate()` - Reconcile new knowledge with existing beliefs
  - `learn_about()` - Orchestrates recognize → integrate
- Behavior change: Multiple beliefs about same subject now updates first (was: error)
- Foundation for variant beliefs (contradictions, alternative scenarios, personas)
- All 110 tests passing
