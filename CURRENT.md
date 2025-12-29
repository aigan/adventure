# Current Work

## Active

- [ ] **Recall Implementation** - Query what a mind knows about a subject ([plan](docs/plans/recall-implementation.md))
  - New `Trait` class as first-class object with subject, type, value, source, certainty
  - `recall()` function returns Trait iterator, flattens component hierarchy
  - Handles superposition (multiple beliefs for same subject)
  - Replaces limited `query_possibilities()`

---

## Backlog

- [ ] **Inspect handling server reload** - Wait for nonexisting states to come back after restart
- [ ] **Resolve Remaining Circular Dependencies** - Clean up safe but non-ideal import cycles ([guide](docs/CIRCULAR_DEPENDENCIES.md))
  - Critical cycles (state ↔ mind) already resolved via registry pattern
  - Remaining 22 static import cycles are safe but indicate tight coupling
  - Priority targets: `session ↔ channel`, `worker ↔ narrator`, `traittype ↔ archetype`
  - Core data model cycle (`db ↔ belief ↔ state ↔ mind`) is fundamental, low priority
  - Use dpdm to track progress: `npx dpdm public/worker/worker.mjs --circular`
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

---

## Workflow

When working on features:

1. **Start**: Create plan in `docs/plans/`, update CURRENT.md to point to it
2. **During**: Track progress with checkboxes in the plan file
3. **Complete**: Mark plan complete, archive it, update CURRENT.md
4. **Changelog**: Add BRIEF summary to CHANGELOG.md when feature is fully complete
   - **Focus on capabilities and APIs**: What can the system do now? What changed for users/implementers?
   - **Skip refactoring details**: Don't mention code reorganization, delegation patterns, or internal structure changes
   - **Skip implementation details**: No file names, test counts, or "how it works"
   - **Examples**:
     - ✅ "Mind constructor requires parent_mind parameter"
     - ✅ "`get_prototypes()` returns full prototype chain"
     - ❌ "Moved resolution logic to owning classes using delegation pattern"
     - ❌ "Removed type-specific conditionals from Traittype infrastructure"

See existing plans in `docs/plans/` for format examples.
