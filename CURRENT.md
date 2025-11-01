# Current Work

## Active Plan

None - ready for next feature!

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

### Features
- [ ] **Lazy Version Propagation** - Enable efficient shared belief updates without version cascades ([plan](docs/plans/lazy-version-propagation.md))
  - Add branch tracking to beliefs (branches set, metadata)
  - Implement state resolver interface for branch evaluation
  - Update trait resolution to walk branches lazily
  - Materialization on explicit version creation
  - Superposition handling for probability branches
  - Enables scaling to millions of NPCs inheriting cultural knowledge
  - Includes: Shared Belief documentation integration (Phase 7 from [shared belief plan](docs/plans/archive/shared-belief-architecture.md))
- [ ] **Shared Belief Scoping Documentation** - Document ground_mind scoping patterns ([plan](docs/plans/archive/shared-belief-architecture.md) Phase 6)
  - Update SPECIFICATION.md with shared belief scoping semantics
  - Document Subject.ground_mind property and global vs scoped beliefs
  - Add examples of cross-parent isolation
- [ ] **Mind Template Syntax: Support Bases** - Enable specifying belief bases in declarative mind templates
  - Current limitation: `mind: {tavern: ['location']}` only supports labeled subjects
  - Need: Way to specify bases for beliefs created during learning
  - Options: Use same format as beliefs (with bases/traits) OR add `@bases` meta-trait
  - Goal: Avoid deep nesting in template syntax while supporting full belief construction
- [ ] **`register_prototypes()` Helper** - Simplify prototype (shared belief) creation in world setup
  - Add `DB.register_prototypes()` matching pattern of `DB.register()` for archetypes
  - API: `{PrototypeName: {bases: [...], tt: 1, traits: {...}}}`
  - Default `tt` to 1, provide default decider using `beliefs_at_tt(1)`
  - Reduces verbose `Belief.create_shared_from_template()` boilerplate in world.mjs
  - See world.mjs:99-107 for current pattern to simplify

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
