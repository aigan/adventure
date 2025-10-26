# Current Work

## Active Plan

None - ready for next task

## Recently Completed

(See CHANGELOG.md for completed work)

## Backlog
- [ ] **Code Quality Cleanup** - Refactoring, cleanup, and quality improvements across the codebase
  - Code consistency and style compliance (docs/STYLE.md)
  - Test coverage and quality
  - Documentation accuracy
  - Naming conventions and clarity
  - Reducing complexity where possible
  - Removing dead code or TODOs
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
- [ ] **Clarify shared belief architecture** - Implement template minds for shared cultural/template beliefs ([plan](docs/plans/shared-belief-architecture.md))
  - Add parent mind tracking to Mind class
  - Create template mind pattern (sibling to NPC minds under parent)
  - All beliefs MUST have `in_mind` and `origin_state` (no null values)
  - Update base resolution to check parent's template mind
  - Migrate existing shared beliefs to template minds
  - Remove all code handling null mind/state cases
  - Enables proper scoping: shared only among siblings of same parent
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
