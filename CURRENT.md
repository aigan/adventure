# Current Work

## Active Plan

[Mind and Self Refactor](docs/plans/mind-self-refactor.md) - Refactor relationship between Mind, State, and self-identity

**Phase 1: COMPLETE** ✅ - Added `self` property to State ([details](docs/plans/archive/mind-self-refactor-phase1.md))

**Phase 2: COMPLETE** ✅ - Created Mind.resolve_template() and new `mind` trait ([details](docs/plans/archive/mind-self-refactor-phase2.md))

**Phase 3: COMPLETE** ✅ - Replaced mind_states with mind everywhere ([details](docs/plans/archive/mind-self-refactor-phase3.md))

## Backlog
- [ ] Phase 4: Add locking constraints - locked self prevents state creation ([plan](docs/plans/mind-self-refactor.md))
- [ ] Generalize Traittype system - Remove ALL hardcoded type checks (Mind, State, Subject, Belief) from traittype.mjs. Instead, use a registry-based system where classes register themselves with their capabilities (resolve_template, instanceof checks, serialization, inspection). Affects lines 168-190 (_resolve_item), 203-222 (resolve), 237 (serializeTraitValue), 263-271 (inspect)
- [ ] Update z_markdown_links.test.mjs to check links in .mjs file comments (JSDoc, code comments)
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
