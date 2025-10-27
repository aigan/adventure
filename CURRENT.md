# Current Work

## Active Plan

None - ready for next task

## Recently Completed

(See CHANGELOG.md for completed work)

## Backlog
- [ ] **Lazy Version Propagation** - Enable efficient shared belief updates without version cascades ([plan](docs/plans/lazy-version-propagation.md))
  - Add branch tracking to beliefs (branches set, metadata)
  - Implement state resolver interface for branch evaluation
  - Update trait resolution to walk branches lazily
  - Materialization on explicit version creation
  - Superposition handling for probability branches
  - Enables scaling to millions of NPCs inheriting cultural knowledge
- [ ] **Clarify shared belief architecture** - Implement template minds for shared cultural/template beliefs ([plan](docs/plans/shared-belief-architecture.md))
  - Add parent mind tracking to Mind class
  - Create template mind pattern (sibling to NPC minds under parent)
  - All beliefs MUST have `in_mind` and `origin_state` (no null values)
  - Update base resolution to check parent's template mind
  - Migrate existing shared beliefs to template minds
  - Remove all code handling null mind/state cases
  - Enables proper scoping: shared only among siblings of same parent
- [ ] **Shared States** - Implement shared mind states for cultural knowledge templates
  - Mind templates define what to learn: `{tavern: ['location'], mayor: ['occupation']}`
  - Multiple NPCs can base their initial state on same template
  - Enables shared cultural knowledge without duplicating learning specifications
  - Related to template minds in shared-belief-architecture.md
  - Currently: Each NPC must enumerate individual shared beliefs they learn about
  - Future: Define reusable mind templates for cultural groups (village guards, merchants, etc.)
- [ ] **Mind Template Syntax: Support Bases** - Enable specifying belief bases in declarative mind templates
  - Current limitation: `mind: {tavern: ['location']}` only supports labeled subjects
  - Need: Way to specify bases for beliefs created during learning
  - Options: Use same format as beliefs (with bases/traits) OR add `@bases` meta-trait
  - Goal: Avoid deep nesting in template syntax while supporting full belief construction

## Next Up

- **Exposure Metadata** - Add observation modality metadata to support perception system ([plan](docs/plans/exposure-metadata.md))

## Workflow

When working on features:

1. **Start**: Create plan in `docs/plans/`, update CURRENT.md to point to it
2. **During**: Track progress with checkboxes in the plan file
3. **Complete**: Mark plan complete, update CURRENT.md to next plan
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
