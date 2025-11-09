# Current Work

## Active Plan

None - ready for next task from backlog

## Recently Completed

**Exposure Metadata for Observation System** - 2025-01-09 ([plan](docs/plans/exposure-metadata.md))
- Implemented enum datatype support with validation (values field on Traittype)
- Added exposure metadata to traittypes (visual, tactile, spatial, internal)
- Added @form meta-trait with enum values (solid, liquid, vapor, olfactory, auditory, intangible)
- Applied @form: 'solid' to ObjectPhysical archetype (auto-inherits to all physical entities)
- 297 tests passing (11 new tests added)
- Foundation for observation mechanics and LOOK command

**Mind Composition Testing - All Phases** - 2025-11-09 ([archived plan](docs/plans/archive/mind-composition-tests.md))
- Comprehensive test coverage for composable mind traits (15 tests across 4 phases)
- Phase 1: Basic coverage (null blocking, to_inspect_view, own trait composition, caching)
- Phase 2: Temporal & structural (component_states, is_union flag, state branching)
- Phase 3: Edge cases (nested UnionStates, overlapping knowledge, 3+ bases, deep inheritance)
- Phase 4: Mind-specific validation (parent mind compatibility, self_subject, about_state, read-only composition after lock)
- 285 tests passing (8 new tests added in Phases 3-4)

**Trait Composition from Multiple Bases** - 2025-11-09 ([archived plan](docs/plans/archive/trait-composition-from-multiple-bases.md))
- Implemented traittype-defined composition strategy (composable flag)
- Array composition working (inventory deduplication by sid)
- Mind.compose() method creates UnionState from multiple base minds
- Delegation pattern: Traittype.compose() delegates to type_class.compose()
- Fixed UnionState constructor to match State signature
- All tests passing (270 passing, P1.1 enabled)

**Mind Extension via State Base** - 2025-11-08 ([plan](docs/plans/archive/mind-extension-via-state-base.md))
- Minds created from templates inherit knowledge from base beliefs via State.base chain
- `Mind.create_from_template()` detects inherited minds and uses their state as base
- Cross-mind state bases validated and tested
- Fixed `recognize()` to properly identify inherited beliefs (avoids duplicates)
- Enhanced inspection UI to show "about" labels for knowledge beliefs
- Updated all documentation from removed `tick()` to `branch_state()`

## Backlog

### Design & Architecture
- [ ] **Observable Trait Mapping** - Design how internal traits map to observable perceptions
  - Internal `health: 50` → Observable `condition: 'wounded'`
  - Internal `inventory: [key]` → Observable `visible_items: []`
  - One-to-many mapping? Separate traits? Computed properties?

### Features
- [ ] **Lazy Version Propagation with Group Minds** - Enable efficient shared belief updates ([plan](docs/plans/lazy-version-propagation.md))
  - NPCs reference sibling group_mind states as bases
  - Cultural knowledge updates create new group_mind states
  - NPCs inherit old version until they observe/interact
  - Materialization on explicit observation (not automatic cascade)
  - Enables scaling to millions of NPCs inheriting cultural knowledge
  - Architecture: `npc_state.base = world.group_mind.origin_state`
- [ ] **Mind Template Syntax: Support Bases** - Enable specifying belief bases in declarative mind templates
  - Current limitation: `mind: {tavern: ['location']}` only supports labeled subjects
  - Need: Way to specify bases for beliefs created during learning
  - Options: Use same format as beliefs (with bases/traits) OR add `@bases` meta-trait
  - Goal: Avoid deep nesting in template syntax while supporting full belief construction

## Workflow

When working on features:

1. **Start**: Create plan in `docs/plans/`, update CURRENT.md to point to it
2. **During**: Track progress with checkboxes in the plan file
3. **Complete**: Mark plan complete, remove from CURRENT.md, update to next plan
4. **Changelog**: Add BRIEF summary to CHANGELOG.md when feature is fully complete (for multi-phase work, wait until all phases done)
   - **Focus on capabilities and APIs**: What can the system do now? What changed for users/implementers?
   - **Skip refactoring details**: Don't mention code reorganization, delegation patterns, or internal structure changes
   - **Skip implementation details**: No file names, test counts, or "how it works"
   - **Examples**:
     - ✅ "Mind constructor requires parent_mind parameter"
     - ✅ "`get_prototypes()` returns full prototype chain"
     - ❌ "Moved resolution logic to owning classes using delegation pattern"
     - ❌ "Removed type-specific conditionals from Traittype infrastructure"

See existing plans in `docs/plans/` for format examples.
