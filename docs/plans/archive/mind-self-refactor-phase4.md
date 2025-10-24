# Mind-Self Refactor - Phase 4: Add Locking Constraints

**Parent Plan**: [mind-self-refactor.md](mind-self-refactor.md)

**Goal**: Enforce immutability constraints through proper locking cascade. Prevent state creation when dependencies (self belief) are locked.

## Overview

Phase 4 implements the locking constraints that ensure child minds can only be modified when their dependencies are mutable. The key insight is that locked entities (e.g., dead NPCs, destroyed objects) should not be able to have new mental states or modifications.

## Changes Implemented

### 1. Belief.lock() Cascade (belief.mjs:181-193)

Added cascade to child mind states when a belief locks:

```javascript
lock() {
  this.locked = true

  // Cascade to child mind states
  const mind = this._traits.get('mind')
  if (mind && typeof mind === 'object' && mind.constructor.name === 'Mind') {
    for (const state of mind.state) {
      if (!state.locked) {
        state.lock()  // This will cascade to state's beliefs, which cascade to their minds, etc.
      }
    }
  }
}
```

**Cascade chain:**
1. Belief locks → cascades to mind states
2. Mind states lock → cascade to their beliefs (State.lock() already does this)
3. Those beliefs lock → cascade to their mind states
4. And so on...

### 2. State Constructor Check (state.mjs:73-76)

Added check to prevent state creation when self belief is locked:

```javascript
// Check if self belief is unlocked
if (self !== null && ground_state !== null) {
  const self_belief = ground_state.resolve_subject(self.sid)
  assert(self_belief === null || !self_belief.locked, 'Cannot create state for locked self')
}
```

**Why this works:**
- Uses `ground_state.resolve_subject(self.sid)` to find the self belief
- Prevents creating states for locked entities (e.g., dead NPCs)
- Only checks when both self and ground_state are provided

### 3. No Ground State Check Needed

Initially considered checking if ground_state is locked, but this is incorrect:
- States CAN be created with locked ground_state
- They are immediately locked by Mind.resolve_template()
- Existing modification assertions prevent changes to locked states
- This allows beliefs to be created after world_state is locked (normal workflow)

## Tests Added

Created `test/locking.test.mjs` with 7 comprehensive tests:

### State Constructor Tests
1. **Allows creation with locked ground_state** - States can be created even if ground is locked
2. **Rejects creation when self belief is locked** - Prevents dead entities from having mental states
3. **Allows creation when ground_state is unlocked** - Normal case works

### Belief.lock() Cascade Tests
4. **Cascades to child mind states** - Belief.lock() locks its mind's states
5. **Cascades when world_state locks** - Full cascade from world to nested minds

### Full Locking Cascade Tests
6. **Locks entire dependency tree from world_state** - Complete cascade verification
7. **Prevents modification after cascade lock** - Locked states reject modifications

## Key Insights

### Locked vs Unlocked
- **Locked** = immutable = normal/final state
- **Unlocked** = mutable = during construction only

### Construction vs Modification
- States can be **constructed** with locked ground_state
- States cannot be **modified** once locked
- Self check prevents construction for locked entities

### Cascade Pattern
Each constructor checks its direct dependencies:
- If dependency locks → this entity becomes locked
- No need to check entire chain
- Cascade happens automatically through locking

## Test Results

- **121 passing** (7 new + 114 existing) ✅
- **2 pending** (unchanged)
- **0 failing** ✅

## Files Modified

- `public/worker/belief.mjs` - Added cascade to Belief.lock()
- `public/worker/state.mjs` - Added self belief check in constructor
- `test/locking.test.mjs` - New test file (7 tests)

## Benefits

1. **Automatic cascade** - Locking propagates through entire dependency tree
2. **Dead entities handled** - Locked self prevents mental state creation
3. **Simple implementation** - Each class checks its direct dependencies only
4. **Existing assertions work** - Modification checks already in place
5. **Comprehensive tests** - Full coverage of locking scenarios

## Next Steps

All phases of Mind and Self Refactor are now complete! According to CURRENT.md workflow, this multi-phase work should now be documented in CHANGELOG.md.
