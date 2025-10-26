# Current Work

## Active Plan

**Code Quality Cleanup** - Refactoring, cleanup, and quality improvements across the codebase

Focus areas:
- Code consistency and style compliance (docs/STYLE.md)
- Test coverage and quality
- Documentation accuracy
- Naming conventions and clarity
- Reducing complexity where possible
- Removing dead code or TODOs

Current priority: TBD - assessing areas that need attention

## Recently Completed

## Backlog
- [ ] **Validate and correct traits for the belief** - Validate trait values by walking the inheritance chain
- [ ] **Lazy Version Propagation** - Enable efficient shared belief updates without version cascades ([plan](docs/plans/lazy-version-propagation.md))
  - Add branch tracking to beliefs (branches set, metadata)
  - Implement state resolver interface for branch evaluation
  - Update trait resolution to walk branches lazily
  - Materialization on explicit version creation
  - Superposition handling for probability branches
  - Enables scaling to millions of NPCs inheriting cultural knowledge
- [ ] **Document all indexes and enforce encapsulation** - Make all internal data structures private
  - Document all indexes (DB registries, Mind.states_by_ground_state, etc.)
  - Make all Sets/Maps private (prefix with `_`)
  - No code should directly access Sets/Maps except in their owning class
  - All access must go through getter methods with proper indexed lookups
  - Example: `Mind._states` (private), access via `mind.get_states_by_ground_state(state)`
- [ ] **Clarify shared belief architecture** - Resolve confusion about beliefs without minds/states and remove workarounds
  - All beliefs MUST have `in_mind` and `origin_state` (no null values)
  - Shared/template beliefs live in a proper mind (not null)
  - Remove all code handling null mind/state cases
  - Remove code that iterates over states/beliefs (violates relative context principle)
  - Create template context mechanism for label→belief resolution (keep out of Subject)
  - No direct pointers to specific beliefs - everything must be contextual/relative
- [ ] Create documentation for data traversal patterns - Document all navigation patterns (state_by_belief, belief_by_state, subject_by_label, etc.) showing how to traverse the data model
- [ ] Create test case for shared beliefs - Test how trait resolution works when multiple beliefs reference the same shared subject

## Next Up

- **Exposure Metadata** - Add observation modality metadata to support perception system ([plan](docs/plans/exposure-metadata.md))

## Workflow

When working on features:

1. **Start**: Create plan in `docs/plans/`, update CURRENT.md to point to it
2. **During**: Track progress with checkboxes in the plan file
3. **Complete**: Mark plan complete, update CURRENT.md to next plan
4. **Changelog**: Add BRIEF summary to CHANGELOG.md when feature is fully complete (for multi-phase work, wait until all phases done)
   - Only include information valuable for updating old unimplemented plans
   - Focus on WHAT changed, not HOW it was done
   - Omit implementation details, file names, test counts

See existing plans in `docs/plans/` for format examples.
