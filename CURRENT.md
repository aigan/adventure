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
- [ ] Audit Cosmos usage - remove indirection where circular dependencies don't exist (e.g., get_traittype, DB access, unnecessary factory calls)

## Next Up

- **Exposure Metadata** - Add observation modality metadata to support perception system ([plan](docs/plans/exposure-metadata.md))

## Workflow

When working on features:

1. **Start**: Create plan in `docs/plans/`, update CURRENT.md to point to it
2. **During**: Track progress with checkboxes in the plan file
3. **Complete**: Mark plan complete, update CURRENT.md to next plan
4. **Changelog**: Add summary to CHANGELOG.md when feature is fully complete (for multi-phase work, wait until all phases done)

See existing plans in `docs/plans/` for format examples.
