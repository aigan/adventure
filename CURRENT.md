# Current Work

**Status**: Active plan - [Exposure Metadata](docs/plans/exposure-metadata.md)

## Recently Completed

### `learn_about()` Refactor (2025-01-23)
- Split knowledge acquisition into three phases:
  - `recognize()` - Find existing beliefs about a subject
  - `integrate()` - Reconcile new knowledge with existing beliefs
  - `learn_about()` - Orchestrates recognize → integrate
- Behavior change: Multiple beliefs about same subject now updates first (was: error)
- Foundation for variant beliefs (contradictions, alternative scenarios, personas)
- All 110 tests passing

## Next Up

**Exposure Metadata** - Add observation modality metadata to support perception system
- See [docs/plans/exposure-metadata.md](docs/plans/exposure-metadata.md) for details

## Instructions for Claude Code

When starting work on a new feature or task:

1. **Create a plan file** in `docs/plans/` with a descriptive name (e.g., `descriptors-implementation.md`)
2. **Update this file** to point to the active plan
3. **Track progress** by updating checkboxes in the plan file
4. **Mark steps complete** as you finish them

## Plan File Template

Save plans in `docs/plans/` using this structure:

```markdown
# [Feature Name]

**Goal**: Brief description of what we're implementing

**Related**:
- docs/ALPHA-1.md stage
- docs/SPECIFICATION.md sections

## Context

Why we're doing this and what it enables.

## Steps

- [ ] Step 1: Description
- [ ] Step 2: Description
- [ ] Step 3: Description

## Current Status

What's done, what's blocked, what's next.

## Notes

Any decisions, trade-offs, or things to remember.
```

## When Plans Are Complete

1. Mark the plan as complete in the file
2. Update this CURRENT.md to "No active plan"
3. Leave the completed plan in `docs/plans/` for reference

---

**Note**: Historical design notes live in `docs/notes/` and should not be modified unless explicitly requested by the user.
