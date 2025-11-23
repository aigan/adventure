# Current Work

## Active Plan

**Observation Events** - Implement observation event creation with hierarchical traits ([plan](docs/plans/observation-events.md))

Stage 2 of Alpha 1 requires compositional object matching. Observation events capture **what was perceived** (hierarchical traits) separately from **what entity it was** (resolved identity).

### Current Phase: Pre-work

- [ ] Update `docs/notes/observation_recognition_spec.md` examples to match codebase syntax
- [ ] Resolve design decisions (Event archetype structure, observer trait type, etc.)

### Next Phases

- Phase 1: Schema Setup (traittypes + archetypes)
- Phase 2: Observation Creation (helper function + tests)
- Phase 3: Recognition (`recognize_by_traits()` method)
- Phase 4: Integration with `learn_about()`

---

## Backlog

- [ ] **Observation and Recognition System** - Implement trait-based observation and acquaintance-based recognition ([spec](docs/notes/observation_recognition_spec.md))
  - Meta-traits: `@about` (identification), `@subject` (identity), `@acquaintance` (familiarity), `@source` (origin)
  - Observation based on trait exposure (visual, tactile, spatial, internal)
  - Recognition based on acquaintance level (intimate, familiar, slight, null)
  - Minds observe entities from parent mind, creating beliefs in own mind
  - Supports misidentification, context-dependent recognition, belief updates
  - Foundation for LOOK command and NPC perception
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
