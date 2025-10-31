# Current Work

## Active Plan

None - ready for next feature!

## Recently Completed

- **Trait Operations Pattern Phase 4** - Completed integration of trait operations pattern ([plan](docs/plans/trait-operations-pattern.md))
  - Added Mental, Villager, Blacksmith archetypes demonstrating mind.append composition
  - Integration tests verify NPCs compose cultural knowledge from multiple bases
  - Fixed timestamp synchronization: mind states created at ground_state.timestamp
  - Added DB.get_belief_about_subject_in_state() helper for querying learned beliefs
  - State.lock() now chainable for cleaner code

- **Shared Belief Architecture Phase 5** - Added ground_mind scoping to prevent cross-parent belief access ([plan](docs/plans/shared-belief-architecture.md))
  - Subject.ground_mind property scopes shared beliefs to parent mind hierarchies
  - Global shared beliefs (ground_mind=null) accessible from any context
  - Prevents unintended belief sharing across different world hierarchies

## Backlog
- [ ] **Time Progression and Coordination** - Design proper time system for minds and ground states
  - Problem: All `timestamp + 1` uses are placeholders (state.mjs:192, mind.mjs:355)
  - Current: Simple increment with no coordination between mind states and ground states
  - Need: Define how time flows when minds create new states
  - Questions: Should mind states sync to ground_state time? Independent timelines? Event-based?
  - Impact: Affects versioning, state branching, mind state creation
- [ ] **Shared Belief Architecture - Documentation** - Complete remaining phases of shared belief plan
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
