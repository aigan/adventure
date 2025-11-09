# Current Work

## Active Plan

**Trait Composition from Multiple Bases** - Implemented ([archived plan](docs/plans/archive/trait-composition-from-multiple-bases.md))
- ✅ Implemented traittype-defined composition strategy
- ✅ Array composition working (inventory deduplication)
- ⏳ Mind composition in progress (compose() method added, tests being fixed)

## Recently Completed

**Mind Extension via State Base** - 2025-01-08 ([plan](docs/plans/archive/mind-extension-via-state-base.md))
- Minds created from templates inherit knowledge from base beliefs via State.base chain
- `Mind.create_from_template()` detects inherited minds and uses their state as base
- Cross-mind state bases validated and tested
- Fixed `recognize()` to properly identify inherited beliefs (avoids duplicates)
- Enhanced inspection UI to show "about" labels for knowledge beliefs
- Updated all documentation from removed `tick()` to `branch_state()`

## Backlog

### Testing & Validation
- [ ] **Mind Composition Testing** - Test prototype composition with multiple mind bases
  - Case: VillageBlacksmith inherits knowledge from both Villager and Blacksmith prototypes
  - Validates UnionState pattern for combining multiple mind states
  - Tests: P1.1 (multi-base composition), P1.2 (override semantics)
  - Status: Tests written but skipped, blocked by trait composition design decision

### Design & Architecture
- [x] **UnionState for Prototype Composition** - Flyweight composition for prototype minds ([plan](docs/plans/union-state.md))
  - ✅ UnionState class created with iterator-based get_beliefs()
  - ✅ Multi-parent mind detection in Mind.resolve_trait_value_from_template
  - ✅ UnionState creation in Mind.create_from_template
  - ✅ Serialization support (toJSON/from_json)
  - ⚠️ **BLOCKED**: Needs trait composition design (see active plan)
  - Issue: When bases have same trait, which value used? (first-wins vs compose)
  - Tests: P1.1 expects auto-composition, P1.2 expects override semantics
- [ ] **Trait Merge Semantics** - Document when traits update vs create new belief version
  - Why Mind is mutable reference (contains States, modified in place)
  - Contrast with immutable trait values (primitives, Subjects)
  - Question: Is mind.append needed, or can we unify trait merge patterns?
- [ ] **Learnable Trait Metadata** - Add visibility metadata to distinguish internal vs observable traits
  - Add `learnable` field to TraitTypeSchema (default: true)
  - Filter in State.integrate() to prevent learning internal traits
  - Examples: `mind` (internal), `location` (observable)
- [ ] **Observable Trait Mapping** - Design how internal traits map to observable perceptions
  - Internal `health: 50` → Observable `condition: 'wounded'`
  - Internal `inventory: [key]` → Observable `visible_items: []`
  - One-to-many mapping? Separate traits? Computed properties?

### Features
- [ ] **Mind.create_from_template with Locked Beliefs** - Fix creation of mind states when ground_belief is locked
  - Issue: Mind.create_from_template fails with "Cannot create state for locked self"
  - State constructor checks if self belief is locked in ground_state and rejects creation
  - Need: Either allow state creation for locked self beliefs, or provide alternative flow
  - Context: After removing trait operations code, this pattern needs reimplementation
  - Test: test/temporal_reasoning.test.mjs:78 (currently skipped)
  - Question: Should locked beliefs be allowed as self? Or should Mind.create_from_template version the belief first?
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
- [ ] **Trait Composition Fix** - Fix learned beliefs creating child minds ([plan](docs/plans/trait-composition-fixes.md))
  - Fix Mental archetype _call execution creating duplicate minds
  - Fix null trait values creating labeled subjects in learn_about
  - Add tests and asserts to prevent double-mind bugs

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
