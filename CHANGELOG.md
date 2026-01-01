# Changelog

All notable changes to this project will be documented in this file.

## 2026-01-01

### Changed
- **Alpha 1 Stage 2 complete** - Descriptors & Identity
  - Objects distinguished by descriptor traits (color, size)
  - Recognition reuses existing knowledge beliefs
  - Query by descriptor via `recall_by_archetype`
- **Lazy Version Propagation complete** - All 7 phases done, plan archived
  - Shared beliefs update with O(1) instead of O(NPCs)
  - Promotion tracking, resolver interface, trait resolution
  - Materialization, superposition handling via Fuzzy trait values
  - Full save/load round-trip test coverage

### Refactored
- **Composable trait handling inlined** in `_get_inherited_trait()`
  - Removed `traittype.get_derived_value()` indirection
  - Composables now handled directly with BFS accumulation pattern
  - Matches `get_defined_traits()` approach for consistency

## 2025-12-30

### Added
- **Centralized icons registry** (`public/lib/icons.mjs`)
  - All UI icons defined with glyph and title for hover tooltips
  - `renderIcon(name)` generates `<span title="...">glyph</span>` for accessibility
  - Icons: 🔒 locked, 🌊 promotions, ❓ fuzzy_unknown, ☁️ fuzzy_compact
  - Mind types: 🌟 logos, 💠 eidos, 🌍 world, 👤 prototype, 🔮 npc
  - Belief types: 🌱 eidos_belief, 📍 belief, ⭕ archetype, 🔺 child
- **Promotions list in belief inspection** - shows all promotions with certainty percentages
- **Children list in belief inspection** - shows beliefs that inherit from this one
  - Scan-based via `get_children_for_inspect()`, marked as INSPECT-ONLY
  - Excludes promotions (shown separately)
- **Save/load round-trip tests** added to multiple test files
  - `belief.test.mjs` - promotions, certainty, base chain, trait resolution
  - `state.test.mjs` - state certainty, base chain, about_state reference
  - `locking.test.mjs` - locking works after load
  - `reverse_trait.test.mjs` - rev_trait works with state chains after load
  - `composable_traits.test.mjs` - composable array traits preserved
  - `composable_mind.test.mjs` - mind trait and NPC knowledge preserved
  - `learn_about.test.mjs` - @about trait reference, learn_about after world load
  - `temporal_reasoning.test.mjs` - tt/vt preserved, states_at_tt works, temporal coordination
  - `load.test.mjs` - Fuzzy trait values, unknown() singleton preserved
  - `mind.test.mjs` - mind hierarchy, in_eidos property
  - `subject.test.mjs` - subject identity, beliefs_at_tt after load
  - `rev_base.test.mjs` - rev_base traversal after load
  - `reverse_trait_convergence.test.mjs` - Convergence rev_trait after load
  - `saveAndReload()` helper in `test/helpers.mjs`

### Fixed
- **Belief.promotions serialization** - now saves promotion IDs and restores Set after load
  - Added `_finalize_promotions_from_json()` for deferred resolution
  - Added to both `Mind.from_json()` and `Materia.from_json()`
- **Belief.certainty serialization** - now preserved across save/load
- **Reverse trait index** - now rebuilt during JSON load via `_finalize_traits_from_json()`
  - Calls `origin_state.rev_add()` for Subject trait values
- **States locked after load** - preserves `base.locked` invariant
  - All states and their beliefs are locked after loading
  - Uses `state.lock()` to cascade to beliefs in `_insert`
  - Must happen before loading nested minds (they reference parent states as ground_state)

### Changed
- **Serialization enforces locked states** - `State.toJSON()` asserts state is locked during `save_mind()`
  - Prevents serializing unlocked data, which would violate invariants on load
  - Assertion only active during `Serialize.active` to allow toJSON() for testing/inspection
- **Replaced Trait class with Notion for recall API**
  - `mind.recall_by_subject(ground, subject, tt, traits?)` now returns a single `Notion` (not a generator)
  - `mind.recall_by_archetype(ground, archetype, tt, traits)` now yields `Notion` objects (not `[Subject, Trait[]]`)
  - `Notion` class: contains `subject` and `traits` Map<Traittype, null|value|Fuzzy>
  - Values in Notion are: `null` (explicit absence), concrete value, or `Fuzzy` (uncertain with alternatives)
  - Same-value alternatives from multiple sources are combined (certainties summed, capped at 1.0)
  - `belief.get_trait_path()` now returns value directly (not wrapped in Trait)
- **Removed Trait class** - provenance tracking dropped in favor of simpler Fuzzy-based uncertainty
- **Backend uses boolean flags for icons** - `has_promotions: true` instead of emoji strings

### Refactored
- **Simplified trait lookup methods** in `belief.mjs`
  - Extracted `_get_trait_from_promotions()` - handles promotion lookup with early returns
  - Extracted `_apply_certainty()` - wraps values in Fuzzy when certainty is set
  - `_get_inherited_trait()` reduced from ~120 to ~30 lines
  - `_get_trait_skip_promotions()` reduced from ~55 to ~15 lines

## 2025-12-29

### Added
- **Recall API for querying mind knowledge**
  - `mind.recall_by_subject(ground, subject, tt, traits?)` - Direct lookup returning `Notion`
  - `mind.recall_by_archetype(ground, archetype, tt, traits)` - Search by archetype returning `Notion` iterator
  - Dot notation paths for nested component access (e.g., `'handle.color'`)
  - Superposition support: `Fuzzy` values with multiple alternatives when belief branches exist
  - Combined certainty = path certainty × belief certainty
- **Stage 2: Descriptors & Identity tests** (Alpha 1)
  - Test 2.1: Player distinguishes objects by color trait
  - Test 2.2: Similar objects distinguished by size (ambiguous vs specific identification)
  - Test 2.5: Query by descriptor via `recall_by_archetype` + trait filtering

## 2025-12-19

### Changed
- **Inspect UI uses Mind type architecture for icon display**
  - Replaced label-based comparison (`mind.label === 'logos'`) with type-based (`mind.type === 'Logos'`)
  - Uses Mind._type property ('Logos', 'Eidos', 'Materia') from proper Mind class architecture
  - Worker `channel.mjs` now includes `type` field in all mind_path and child_minds data
  - More robust and follows established data model patterns

### Added
- **Unicode icons for visual mind/belief hierarchy in inspect UI**
  - Mind breadcrumbs: 🌟 Logos (icon only) | 💠 Eidos | 🌍 world minds | 👤 prototype minds | 🔮 NPC minds
  - Belief icons: 🌱 for Eidos beliefs | 📍 for Materia beliefs
  - Icons appear in breadcrumb navigation, child minds table, and beliefs list
  - Helps distinguish mind types and belief contexts at a glance

### Refactored
- **Extracted duplicated icon selection logic** into `get_mind_label_with_icon()` helper function
  - Eliminated ~60 lines of code duplication across 3 render functions
  - Single source of truth for mind icon/label formatting
  - Improved maintainability and consistency

## 2025-12-16

### Added
- **`Session.tick()` helper method** - Simplifies linear time progression
  - Automatically locks current state if unlocked
  - Branches to next vt (defaults to current vt + 1)
  - Updates and returns `this.state`
  - Usage: `st = session.tick()` instead of manual `state.lock(); state.branch(...)`

### Fixed
- **Mind trait inspection filtered by ground_state** - Inspector now shows only relevant mind state
  - When viewing a belief with mind trait, only shows state grounded in current viewing state
  - Prevents showing states from other world branches or timeline ancestors
  - Example: viewing person1 from world state #43 shows only mind state #44 (grounded in #43), not #38 (grounded in ancestor #6)
- **State branching with proper base chain tracking** - Child mind states correctly inherit from locked parent states
  - `get_core_state_by_host()` checks ancestry chain to distinguish world branches
  - `get_or_create_open_state_for_ground()` walks ground_state base chain to find latest locked state
  - `get_active_state_by_host()` creates new state when no core state found in current world branch
  - Ensures proper base chain: new state → locked parent → earlier locked state
- **Lock cascade works across parallel world branches** - Locking world state correctly propagates to all child mind states
  - States indexed by logical position `(mind_id:vt)` instead of object identity
  - Cascade finds child states regardless of which world branch object was used

## 2025-12-11

### Fixed
- **Test debugging helpers now use `sysdesig()` for formatted output**
  - `trace_trait()`, `inspect_perception()`, and `explain_recognize()` test helpers now return human-readable summaries
  - Changed from `debug()` (returns boolean) to `sysdesig()` (returns formatted string)
  - Output shows "sword Subject sid=7 @world" instead of "false" or raw objects
  - Helps debugging test failures with clear, contextual trait values

## 2025-12-10

### Changed
- **Refactored perception module to use explicit state parameters**
  - Removed Object.assign mixin pattern from State.prototype
  - All perception functions now take explicit `state` as first parameter instead of using `this` context
  - Functions called as `perceive(state, ...)` instead of `state.perceive(...)`
  - Moved 4 methods from state.mjs to perception.mjs: `recognize()`, `learn_about()`, `integrate()`, `_recursively_learn_trait_value()`
  - Maintains one-way dependency: perception → state (perception can import from state, not vice versa)
  - Updated all call sites in test files and worker modules (materia.mjs, mind.mjs, world.mjs, narrator.mjs)
  - Removed `@this {State}` JSDoc annotations, added `@param {State} state` to all functions
  - Improved TypeScript type safety with explicit parameter types

### Fixed
- **Fixed duplicate belief creation bug in `integrate()` function**
  - During mixin refactoring, forgot to remove old belief after branching to new version
  - `belief.branch(state, traits)` automatically inserts new belief into state
  - Now correctly calls `state.remove_beliefs(existing)` after branching to prevent duplicates
  - Fixes 3 integration tests that were expecting 1 belief but finding 2 (duplicate knowledge beliefs about same entity)

- **Enabled identify() optimization tests** (5 of 7 now passing)
  - Removed `describe.skip` from test suite (test/observation.test.mjs line 1196)
  - Fixed test setup by adding missing player knowledge about nested entities (heads, handles)
  - Empty trait array `[]` creates no knowledge - changed to include at least one trait
  - Tests now verify: rev_trait usage, max_candidates limit, trait verification, refurbished parts detection
  - Remaining issues: breadth-first ordering (Test #3), prototype vs particular matching (Test #7)

## 2025-12-09

### Constraint-Based identify() Optimization
- **`identify()` uses trait-based filtering**: Searches by most discriminating traits first (certain particular Subjects via rev_trait)
- **Early exit at max_candidates**: Stops after finding 3 candidates (default, configurable)
- **Fallback to archetype scan**: Uses most specific archetype only when no certain traits available
- **Performance**: 10-250× faster depending on constraint selectivity

### Prototype Reuse in Nested Perception
- **Nested certain entities correctly use fast path**: Prototypes/shared beliefs nested within uncertain entities are now properly reused
  - Slow path checks `@uncertain_identity` on nested Subject-valued traits
  - Certain nested entities use `_perceive_with_recognition()` for reuse
  - Uncertain nested entities use `_perceive_single()` for new perceived beliefs
- **Prevents duplicate prototypes**: Shared knowledge like common handles, standard parts, or cultural knowledge are reused rather than duplicated

### Perception Module Extraction
- **Extracted perception methods to `perception.mjs`**: 11 perception-related methods moved from `state.mjs` for better code organization
  - `perceive()`, `identify()`, `learn_from()`, `match_traits()`, `get_observable_traits()`
  - `_perceive_single()`, `_perceive_with_recognition()`
  - Helper methods: `_is_certain_particular()`, `_all_traits_match()`, `_get_most_specific_archetype()`, `_identify_by_archetype()`
- **Mixin pattern implementation**: Functions applied to `State.prototype` via `Object.assign()`
  - No API changes - `state.perceive()` still works identically
  - Cleaner separation of concerns
  - Better maintainability for perception subsystem

## 2025-12-04

### API Refinement - State Method Renames
- **`State.branch_state()` → `State.branch()`**: Simpler name, better consistency
  - Updated 79 call sites across production code, tests, tools, and documentation
  - Now matches `Belief.branch()` naming pattern
  - Clearer, more concise API surface
- **`State.tick_with_traits()` → `State.tick_with_template()`**: More accurate naming
  - Updated 6 call sites
  - Better reflects internal use of `Belief.from_template()`
  - Clarifies template-based nature of trait updates
- Breaking change: Internal API only (no public interface impact)
- All 494 tests passing

## 2025-12-03

### Fast-Path Perception with Identity Recognition
- **`perceive()` reuses existing knowledge**: Familiar entities no longer create duplicate beliefs
  - Fast path when identity is certain: finds existing knowledge via `recognize()`
  - Compares observable traits; reuses belief if unchanged or creates versioned belief if traits differ
  - Slow path when `@uncertain_identity` meta-trait is true: creates perceived belief with `@about: null`
- **First perception creates knowledge directly**: Sets `@about: world_entity.subject` on initial observation
- **Recursive nested perception**: Subject-valued observable traits are perceived recursively
  - EventPerception content includes all recursively perceived entities (parent + nested parts)
  - Parent versioning only needed when non-Subject traits change (Subjects auto-resolve)
- **`@uncertain_identity` meta-trait**: Forces slow path for entities where identity is questionable

### All Tests Passing: 478 tests

## 2025-11-23 - v1.0.1

### Alpha 1 Stage 1 Complete

- **Core Belief Structure** - Beliefs, minds, observation, `@about` linking, `learn_about()` with trait exposure

## 2025-11-22

### Belief Trait Caching Optimization
- **New `_cached_all` flag**: Tracks when all inherited traits are fully cached
  - Added to Belief constructor and `from_json()`
  - `get_defined_traits()` returns early when cache is complete
  - Subsequent iterations skip expensive base-walking entirely
- **Parent cache reuse**: When iterating traits, uses parent belief's cache if `_cached_all` is true
  - Avoids re-walking deep inheritance chains
  - O(traits) instead of O(depth × traits) for cached parents
- **Code cleanup**: Refactored `get_defined_traits()` to use early return/continue patterns

### Belief Lock Safety
- **New assertion in `belief.lock()`**: Verifies belief exists in `state._insert` before locking
  - Catches bugs where `belief.lock()` called without proper state context
  - Found and fixed 5 test bugs calling `lock()` incorrectly

### `rev_trait()` Converted to Generator
- **Lazy evaluation**: `rev_trait()` now yields beliefs instead of collecting into array
  - Enables early termination when only first few results needed
  - Uses `yielded` Set to track already-yielded beliefs (avoids duplicates)
- **Updated callers**: All test files and `state.mjs` updated to spread generator results

### Narrator Initialization Guard
- **Fixed `ensure_init()`**: Added `_initialized` flag to prevent double-registration
  - Keeps async/dynamic import pattern (needed to avoid loading browser code in tests)

### Files Modified
- `belief.mjs` - caching, lock assertion, rev_trait generator
- `state.mjs` - spread rev_trait results
- `narrator.mjs` - initialization guard
- `session.mjs` - no change (await already present)
- Test files - fixed lock() calls, spread rev_trait results

### All Tests Passing: 455 tests

## 2025-11-20

### Materia Introduced - Mind Made Abstract
- **New Class**: Created `Materia` extending `Mind` for time-aware entities
  - Moved temporal-specific methods: `create_world()`, `states_at_tt()`, `compose()`, `create_from_template()`
  - Requires non-null parent_mind (all temporal minds have parents)
  - Implements proper serialization with `from_json()`
- **Mind Class Made Abstract**:
  - Constructor throws error if instantiated directly
  - Must use subclasses: `Materia` (worlds, NPCs, players), `Logos` (root), `Eidos` (forms)
  - Added stub `states_at_tt()` that throws for non-temporal minds
  - Added delegation methods to `Materia` for backward compatibility
- **Mind Hierarchy Clarified**:
  - `Mind` (abstract base) → `Logos` (singleton, parent=null)
  - `Mind` (abstract base) → `Eidos` (singleton, parent=Logos)
  - `Mind` (abstract base) → `Materia` (world minds, NPC minds, player minds)
- **Updated References**:
  - All `new Mind()` calls → `new Materia()` (24 test files + 1 production file)
  - All `Mind.create_world()` → `Materia.create_world()` (6 files)
  - Updated serialization to handle Materia type
  - Updated cosmos.mjs exports
- **All Tests Passing**: 450 tests passing, 0 failing
- **Files Modified**: 32 files (1 new file, 31 updated)

## 2025-11-16

### State Properties Made Private
- Refactored `state.insert` and `state.remove` to private properties (`_insert`, `_remove`)
- Updated 3 core modules: `state.mjs`, `convergence.mjs`, `timeless.mjs`
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
  - Convergence `rev_trait()` bug - now properly traverses component_states
  - Subject resolution missing - added `Subject.resolve_trait_value_from_template()`
  - Test isolation issues - fixed Serialize cache and test setup patterns
- **Verified non-bugs**: Inherited reference tracking and composable inheritance work correctly
- **Unknown behaviors documented**: Empty array semantics, non-composable arrays, archetype defaults
- **Code quality improvements**:
  - Added `sysdesig()` debug methods to Traittype and Convergence
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

### Convergence Support in Reverse Trait Lookup
- **CRITICAL BUG FIX**: `rev_trait()` now properly traverses Convergence component_states
- Added polymorphic `State.rev_base(subject, traittype)` method (returns array)
- Added `Convergence.rev_base()` override to handle multiple component states
- Refactored `Belief.rev_trait()` to use queue-based traversal instead of single-state chain
- **Impact**: Fixes reverse lookups for ALL multi-parent beliefs (VillageBlacksmith, MasterCraftsman, etc.)
- Before: `rev_trait()` stopped at Convergence (base = null), returning empty results
- After: Properly searches all component states for trait references
- All 422 tests passing with no regressions

### Test Infrastructure and rev_base() Coverage
- **Cache Pollution Fix**: Added `Serialize.reset_state()` to prevent test pollution
  - Clears `dependency_queue`, `seen`, and `active` static properties
  - Called by `DB.reset_registries()` to ensure clean test state
- **Test File**: Added `test/rev_base.test.mjs` with 16 comprehensive tests
  - 8 basic interface tests (State and Convergence polymorphism)
  - 4 P0 critical edge cases (null pointers, rev_del, inherited refs)
  - 4 P1 high priority cases (multiple subjects, nested Convergence)
- **Test Pattern Fixes**: Corrected state creation and belief versioning patterns
  - Use `state.branch_state(ground_state, vt)` for state chains
  - Use `Belief.from_template({bases: [old]})` + `replace_beliefs()` for versioning
  - Create beliefs before locking state in Convergence tests
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

### Convergence for Multi-Parent Prototype Composition
- `Convergence` class enables flyweight composition from multiple parent states without data duplication
- Beliefs compose knowledge from multiple prototype bases (e.g., VillageBlacksmith = Villager + Blacksmith)
- Iterator-based `get_beliefs()` merges component states (last wins for overlaps)
- Supports nested Convergences (recursively traverses components)
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
- Edge cases: nested Convergences, overlapping knowledge, own trait overrides
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
