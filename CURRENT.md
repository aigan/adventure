# Current Work

## Active Plan

None - ready for next feature!

## Recently Completed

- **Bi-Temporal Database Implementation** - Implemented tri-temporal semantics for temporal reasoning and nested mind coordination
  - Renamed `timestamp` → `tt` (Transaction Time) throughout codebase
  - Added `State.vt` (Valid Time) for temporal reasoning: memory (vt < tt), present (vt = tt), planning (vt > tt)
  - Implemented fork invariant: `child_mind.tt = parent_state.vt` for nested mind time coordination
  - Updated `tick()` signature: `state.tick(ground_state, vt, {operations})` for explicit time control
  - Renamed `states_valid_at()` → `states_at_tt()` to clarify temporal querying semantics
  - Removed all `timestamp + 1` placeholders - time now coordinated via ground_state.vt
  - Documented tri-temporal model (TT/VT/DT) in SPECIFICATION.md and IMPLEMENTATION.md
  - All 176 tests passing with new temporal semantics

- **Trait Operations Pattern Phase 4** - Completed integration of trait operations pattern ([plan](docs/plans/archive/trait-operations-pattern.md))
  - Added Mental, Villager, Blacksmith archetypes demonstrating mind.append composition
  - Integration tests verify NPCs compose cultural knowledge from multiple bases
  - Fixed timestamp synchronization: mind states created at ground_state.timestamp
  - Added DB.get_belief_about_subject_in_state() helper for querying learned beliefs
  - State.lock() now chainable for cleaner code

- **Shared Belief Architecture Phase 5** - Added ground_mind scoping to prevent cross-parent belief access ([plan](docs/plans/archive/shared-belief-architecture.md))
  - Subject.ground_mind property scopes shared beliefs to parent mind hierarchies
  - Global shared beliefs (ground_mind=null) accessible from any context
  - Prevents unintended belief sharing across different world hierarchies

## Backlog
- [ ] **Trait Composition Beyond Mind** - Test trait operations pattern with non-Mind traits
  - Example: Enchanted Sword with `damage_types.append`, `tags.append` from multiple bases
  - Validates pattern is generic, not Mind-specific
  - Tests: Array-valued traits compose correctly via append operations
- [ ] **Trait Operations with Versioning** - Test operations on already-constructed values
  - Case: NPC at t=1 gets mind from archetypes, then at t=2 gets additional `mind.append` in belief traits
  - Should: Call existing Mind's `state_data()` with new operations only (not re-collect archetype operations)
  - Tests: Versioning path in `get_or_create_open_state_for_ground()` (locked belief → tt + 1)
- [ ] **Temporal Reasoning Tests** - Add tests for temporal scenarios (memory, planning, superposition)
  - Memory: NPC recalls past state (vt < tt)
  - Planning: NPC reasons about future (vt > tt)
  - Superposition: Multiple states at same tt with different possibilities
- [ ] **Shared Belief Architecture - Documentation** - Complete remaining phases of shared belief plan ([plan](docs/plans/archive/shared-belief-architecture.md))
  - Phase 6: Update documentation with scoping patterns
  - Phase 7: Integration with lazy version propagation
- [ ] **Lazy Version Propagation** - Enable efficient shared belief updates without version cascades ([plan](docs/plans/lazy-version-propagation.md))
  - Add branch tracking to beliefs (branches set, metadata)
  - Implement state resolver interface for branch evaluation
  - Update trait resolution to walk branches lazily
  - Materialization on explicit version creation
  - Superposition handling for probability branches
  - Enables scaling to millions of NPCs inheriting cultural knowledge
- [ ] **Mind Template Syntax: Support Bases** - Enable specifying belief bases in declarative mind templates
  - Current limitation: `mind: {tavern: ['location']}` only supports labeled subjects
  - Need: Way to specify bases for beliefs created during learning
  - Options: Use same format as beliefs (with bases/traits) OR add `@bases` meta-trait
  - Goal: Avoid deep nesting in template syntax while supporting full belief construction

## Next Up

- **Exposure Metadata** - Add observation modality metadata to support perception system ([plan](docs/plans/exposure-metadata.md))

## Workflow

When working on features:

1. **Start**: Create plan in `docs/plans/`, update CURRENT.md to point to it
2. **During**: Track progress with checkboxes in the plan file
3. **Complete**: Mark plan complete, update CURRENT.md to next plan
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
