# Current Work

## Active Plan

None - Ready to start next feature!

## Recently Completed

**[Mind and Self Refactor](docs/plans/archive/mind-self-refactor.md)** - All 4 phases complete ✅
- Phase 1: Added `self` property to State
- Phase 2: Created Mind.resolve_template() and new `mind` trait
- Phase 3: Replaced mind_states with mind everywhere
- Phase 4: Added locking constraints with cascade

## Backlog
- [ ] Generalize Traittype system - Remove ALL hardcoded type checks (Mind, State, Subject, Belief) from traittype.mjs. Instead, use a registry-based system where classes register themselves with their capabilities (resolve_template, instanceof checks, serialization, inspection). Affects lines 168-190 (_resolve_item), 203-222 (resolve), 237 (serializeTraitValue), 263-271 (inspect)
- [ ] Create documentation for data traversal patterns - Document all navigation patterns (state_by_belief, belief_by_state, subject_by_label, etc.) showing how to traverse the data model
- [ ] Replace sid with subject in more places - Continue refactoring to use Subject objects instead of raw SIDs throughout the codebase
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
