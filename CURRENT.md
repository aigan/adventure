# Current Work

## Recently Completed

**Eidos Migration - Eliminate Limbo Pattern** (2025-11-03) ([plan](docs/plans/eidos-migration.md))
- ✅ Created Eidos singleton (`eidos()`) - realm of forms for prototypes
- ✅ Added `mind.origin_state` property tracking first state created
- ✅ Updated `DB.register()` to create prototypes in Eidos.origin_state
- ✅ Migrated all test files from `create_shared_from_template(null, ...)` to Eidos
- ✅ Encapsulated `locked` property (getter with `._locked` internal field)
- ✅ Changed to reference equality (`in_mind === eidos()`) from string comparison
- ✅ Moved primordial singletons to cosmos.mjs (`logos()`, `logos_state()`, `eidos()`)
- ✅ Updated all test imports to use `logos` directly from cosmos.mjs
- ✅ Updated `is_shared` getter to recognize Eidos beliefs
- ✅ Updated `get_shared_belief_by_state` to make Eidos beliefs globally accessible
- ✅ All 210 tests passing with Eidos architecture
- Note: Kept `create_shared_from_template()` for backward compatibility
- Note: Kept `DB.get_eidos()` wrapper for backward compatibility

**Logos Singleton & Null Elimination** (2025-11-03)
- ✅ Created Logos singleton (`DB.get_logos_mind()`) - the ONE mind with `parent=null`
- ✅ Created logos_state singleton - the ONE state with `ground_state=null`
- ✅ Enforced Mind constructor: `parent` must be Mind (or null only for Logos)
- ✅ Removed implicit `ground_state=null` default from `Mind.create_state()`
- ✅ Migrated 194 test instances to use `Mind(logos(), ...)` pattern
- ✅ Fixed `Mind.create_from_template()` to work with shared beliefs (uses `subject.ground_mind`)
- ✅ All 210 tests passing with strict null enforcement

**Remaining nulls (intentional)**:
- `ground_mind: Mind|null` - null only for Logos (primordial mind has no parent)
- `ground_state: State|null` - null only for logos_state (primordial state has no ground)

## Active Plan

**Eliminate null ground_state** ([plan](docs/plans/eliminate-null-ground-state.md))

Enforce that `create_state()` requires ground_state parameter. Only `logos_state()` created in cosmos.mjs should have `ground_state=null`.

**Current Status**: Planning
- [ ] Update Mind.create_state() to require ground_state (no null allowed)
- [ ] Bulk update ~200 test instances: `.create_state(tt, null)` → `.create_state(tt, logos_state())`
- [ ] Fix special cases (NPC minds use world_state, not logos_state)
- [ ] Verify all 210 tests passing
- [ ] Update CURRENT.md to remove ground_state from remaining nulls

## Backlog

### Testing & Validation
- [ ] **Trait Operations with Versioning** - Test operations on versioned beliefs with existing minds
  - Case: NPC at tt=1 gets mind from archetypes, then at tt=2 gets additional `mind.append` in belief traits
  - Should: Call existing Mind's `state_data()` with new operations only (not re-collect archetype operations)
  - Tests: Versioning path in `get_or_create_open_state_for_ground()` (locked belief creates new state via fork invariant)
- [ ] **Trait Composition Beyond Mind** - Validate trait operations pattern with non-Mind traits
  - Example: Enchanted Sword with `damage_types.append`, `tags.append` from multiple bases
  - Validates pattern is generic, not Mind-specific
  - Tests: Array-valued traits compose correctly via append operations

### Design & Architecture
- [ ] **UnionState for Prototype Composition** - Flyweight composition for prototype minds ([plan](docs/plans/union-state.md))
  - Enable VillageBlacksmith = Villager + Blacksmith without multiple base states
  - UnionState holds ordered array of component_states
  - Trait resolution: last wins (override pattern)
  - Restrictions: no delete operations (only insert/replace)
  - Used for prototype minds with composed knowledge
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

## Next Up

- **Exposure Metadata** - Add observation modality metadata to support perception system ([plan](docs/plans/exposure-metadata.md))

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
