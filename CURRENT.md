# Current Work

## Active

- [ ] **Alpha 1: Missing Hammer Investigation** ([stages](docs/ALPHA-1.md))
  - Stage 1: Core Belief Structure ✅
  - Stage 2: Descriptors & Identity ✅
  - Stage 3: Multiple Similar Objects
  - Stage 4+: Location, NPCs, Time, Events...

- [ ] **Combinatorial Explosion Components**
  - Phase 1: Foundation ✅
  - Phase 2: Promotions ✅ ([archived](docs/plans/archive/lazy-version-propagation.md))
  - Phase 3: Belief Resolution ✅
  - Phase 4: Timeline Resolution ✅ ([archived](docs/plans/archive/phase4-timeline-resolution.md))
  - **Phase 5a: @tracks** ← Next ([plan](docs/plans/phase5a-tracks.md))
  - Phase 5b: alts ([plan](docs/plans/phase5b-alts.md)) - depends on Phase 5a
  - Phase 6: Session.legacy ([plan](docs/plans/phase6-session-legacy.md)) - depends on Phase 4
  - Phase 7: Observation System + recall() ([plan](docs/plans/phase7-observation-system.md)) - independent
  - Phase 8: Superposition API ([plan](docs/plans/phase8-superposition-api.md)) - depends on Phase 5b
  - **Deferred**: Branch lifecycle, @path_certainty cache, decision time

---

## Backlog

- [ ] **Inspect handling server reload** - Wait for nonexisting states to come back after restart
- [ ] **Resolve Remaining Circular Dependencies** - Clean up safe but non-ideal import cycles ([guide](docs/CIRCULAR_DEPENDENCIES.md))
  - Critical cycles (state ↔ mind) already resolved via registry pattern
  - Remaining 22 static import cycles are safe but indicate tight coupling
  - Priority targets: `session ↔ channel`, `worker ↔ narrator`, `traittype ↔ archetype`
  - Core data model cycle (`db ↔ belief ↔ state ↔ mind`) is fundamental, low priority
  - Use dpdm to track progress: `npx dpdm public/worker/worker.mjs --circular`
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
