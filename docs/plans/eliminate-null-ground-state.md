# Eliminate null ground_state

**Status**: Planning
**Created**: 2025-11-03

## Problem

Currently `create_state(tt, null)` is allowed and widely used throughout the codebase. The only state that should have `ground_state=null` is `logos_state()` - the primordial state created directly via `new State(logos(), 0, null, null)`.

All other states should reference a proper ground_state following the hierarchy:
- World minds (children of Logos) → use `logos_state()` as ground
- NPC minds (children of world mind) → use `world_state` as ground
- Nested minds → follow the parent chain

## Current State

**Grep results**: ~200+ instances of `.create_state(tt, null)` across test files

**Mind.create_state() signature**:
```javascript
create_state(tt, ground_state) {
  assert(
    ground_state === null || ground_state.in_mind === this.parent,
    'ground_state must be in parent mind (or null for root states)',
    // ...
  )
  const state = new State(this, tt, null, ground_state)
  // ...
}
```

**Issue**: Allows `null` for "root states in world minds" but this violates the principle that only `logos_state()` should have `ground_state=null`.

## Solution

### Phase 1: Update Mind.create_state() signature

**Goal**: Make ground_state required

Changes to `/home/agent/adventure/public/worker/mind.mjs`:

```javascript
/**
 * @param {number} tt
 * @param {State} ground_state - External world state (parent mind's state)
 * @returns {State}
 */
create_state(tt, ground_state) {
  assert(
    ground_state.in_mind === this.parent,
    'ground_state must be in parent mind',
    {mind: this.label, parent: this.parent?.label, ground_state_mind: ground_state.in_mind.label}
  )

  const state = new State(this, tt, null, ground_state)

  // Track first state as origin
  if (this.origin_state === null) {
    this.origin_state = state
  }

  return state
}
```

**Changes**:
- Remove `|null` from type annotation
- Remove `|| ground_state === null` from assertion
- Update error message to remove "(or null for root states)"
- Strengthen assertion to require `ground_state.in_mind === this.parent`

### Phase 2: Bulk Update Test Files

**Pattern to replace**: `.create_state(<tt>, null)` → `.create_state(<tt>, logos_state())`

**Commands**:
```bash
# Update all test files to use logos_state() instead of null
find test -name "*.test.mjs" -exec perl -i -pe 's/\.create_state\((\d+),\s*null\)/.create_state($1, logos_state())/g' {} \;

# Update helpers.mjs
perl -i -pe 's/\.create_state\((\d+),\s*null\)/.create_state($1, logos_state())/g' test/helpers.mjs
```

**Import updates**: Need to add `logos_state` to existing cosmos.mjs imports

### Phase 3: Fix Special Cases

Review and fix cases where ground_state should NOT be logos_state():

1. **NPC minds** - Should use parent world_state, not logos_state()
2. **Nested hierarchies** - Follow the actual parent chain
3. **Test edge cases** - Some tests intentionally create broken states for validation

**Files to manually review**:
- `test/belief.test.mjs` - Has multi-level mind hierarchies
- `test/state.test.mjs` - Has validation tests
- `test/temporal_reasoning.test.mjs` - Complex mind trees

### Phase 4: Verify & Document

**Verification**:
- Run `npm test` - expect all 210 tests passing
- TypeScript validation passes

**Documentation updates**:
- Update CURRENT.md to remove `ground_state: State|null` from "Remaining nulls"
- Add changelog entry (merged with Eidos migration)

## Expected Outcome

**Single source of truth**: Only `logos_state()` created in cosmos.mjs has `ground_state=null`

**All other states**: Created via `create_state(tt, ground_state)` where ground_state is always a State

**Remaining intentional nulls**:
- `Mind.parent: Mind|null` - null only for Logos (primordial mind)

## Checklist

- [ ] Phase 1: Update Mind.create_state() to require ground_state
- [ ] Phase 2: Bulk update test files to use logos_state()
- [ ] Phase 3: Fix special cases (NPC hierarchies, edge tests)
- [ ] Phase 4: Verify all tests pass
- [ ] Phase 5: Update CURRENT.md and remove from remaining nulls
- [ ] Phase 6: Update CHANGELOG.md

## Notes

This completes the null elimination work started with:
1. Logos singleton (eliminated Mind with parent=null)
2. Eidos migration (eliminated Belief with in_mind=null and origin_state=null)
3. This work (eliminates State with ground_state=null except for logos_state)

After this, the only remaining nulls are the two primordial entities:
- Logos has parent=null (no mind above it)
- logos_state() has ground_state=null (no state grounding it)
