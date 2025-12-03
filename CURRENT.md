# Current Work

## Active Plan

**Complete perceive/learn_from cycle** - Make observation-recognition pipeline functional

Currently: Looking at room twice creates two perception events with perceived objects doubled (correct). Next steps:

### ~~Step 1: Implement perceive() fast path~~ ✅ COMPLETE

**Implementation**:
- Added `@uncertain_identity` meta-trait to force slow path when identity is questionable
- Created `_perceive_with_recognition()` for recursive fast-path perception
- Fast path: finds existing knowledge, recursively perceives nested Subject-valued traits
- Comparison: only non-Subject traits matter for parent versioning (Subjects auto-resolve)
- Versioned beliefs created with `sid: knowledge.subject.sid` to maintain identity
- First perception creates knowledge directly with `@about: world_entity.subject`
- EventPerception.content includes all recursively perceived entities

**Tests**: All observation tests passing (478 total)

### Step 2: Implement learn_from() recognition (state.mjs:1001-1014)

For perceived beliefs with `@about: null`:
- Match to world entities by comparing trait values to ground_state beliefs
- Update `@about: null` → `@about: world_entity` (via belief versioning)
- Handle: exact match (1 candidate), ambiguous (multiple), no match (unknown)

**Result**: Unidentified perceived beliefs get linked to world entities

**Test**: Unskip `test/observation.test.mjs` "learn_from() should integrate unambiguous perception"

### Step 3: End-to-end validation

**Test**: Unskip `test/observation.test.mjs` "end-to-end: perceive → learn_from → knowledge updated"

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
