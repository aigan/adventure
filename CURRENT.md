# Current Work

## Active Plan

*No active plan - ready for next task*

---

## Recently Completed

**Client-Worker Message Protocol** - 2025-11-14
- All message formats documented in `docs/IMPLEMENTATION.md`
- 367 tests passing (12 new message protocol tests)
- Message format consistency established
- GUI terminology clarified (Locus/topic)
- See [CHANGELOG.md](CHANGELOG.md) for details
- Archived plans in `docs/plans/archive/`

**Trait Resolution Consistency** - 2025-11-11
- Fixed `get_traits()` to compose from multiple bases consistently with `get_trait()`
- Simplified caching from state-based to belief-based (traits immutable per belief)
- Fixed `collect_latest_value_from_all_bases()` to collect one value per direct base chain
- Separated concerns: Belief provides traversal, Traittype handles derivation strategy
- Added `get_traits_composable.test.mjs` with consistency tests

See [CHANGELOG.md](CHANGELOG.md) for older completed work.

## Backlog

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
