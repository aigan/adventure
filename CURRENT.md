# Current Work

## Active

- [ ] **Combinatorial Explosion Components** ([meta-plan](docs/plans/META-PLAN-combinatorial-explosion.md))
  - Implementing all "Designed - Ready for Implementation" components
  - Phase 1: Foundation ✅ Complete (Trait object, state.certainty)
  - Phase 2: Lazy Version Propagation ✅ Complete ([plan](docs/plans/lazy-version-propagation.md))
    - Promotion tracking, resolver interface, trait resolution
    - Superposition via `_join_traits_from_promotions()` → Fuzzy trait values
  - Phase 3: @resolution Pattern (orthogonal to Phase 2)
  - Phase 4: @tracks + Session.legacy
  - Phase 5: Observation System ([plan](docs/plans/observation-events.md))
  - Phase 6: Superposition API
  - **Key insight**: Multiple probability promotions are joined into Fuzzy trait values
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
