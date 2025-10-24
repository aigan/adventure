# Mind and Self Refactor

**Goal**: Refactor the relationship between Mind, State, and self-identity to support proper state management and locking constraints.

**Related**:
- docs/plans/mind-trait-refactor.md (supersedes this - mind_states → mind)
- docs/ALPHA-1.md Stage 1 (mental states)
- docs/SPECIFICATION.md (nested minds)

## Problem Statement

Current architecture has several issues:

1. **`mind_states` maintenance problem**: Person beliefs have `mind_states` array that must be updated every time the mind branches, but locked states make this impractical
2. **`self` location**: Mind has `self` property, but self-identity can change over time and should be temporal (per-state)
3. **State lookup**: No efficient way to query "what states are observing this ground_state?"
4. **Circular dependencies**: Complex relationship between Belief → mind_states → State → Mind → self → Belief

## Proposed Solution

### Core Changes

1. **Move `self` from Mind to State**: Self-identity is temporal, belongs on State
2. **Change `mind_states` to `mind`**: Store single Mind reference instead of array of States
3. **Add DB query**: `get_states_by_ground(mind, ground_state)` for dynamic state lookup
4. **New Mind.resolve_template()**: Create Mind + initial state from declarative syntax
5. **Remove State.resolve_template()**: Consolidate template resolution in Mind

### Before (Current)

```javascript
// Mind class
class Mind {
  _id, label
  self: Belief|null  // <-- self is on Mind
  state: Set<State>
}

// Mental belief
player: {
  bases: ['Person'],
  traits: {
    mind_states: [State, State, ...]  // <-- array of states
  }
}

// State class
class State {
  in_mind: Mind
  ground_state: State|null
  // no self property
}
```

### After (Proposed)

```javascript
// Mind class
class Mind {
  _id, label
  state: Set<State>
  // self removed - now lives on State
}

// Mental belief
player: {
  bases: ['Person'],
  traits: {
    mind: Mind  // <-- single Mind reference
  }
}

// State class
class State {
  in_mind: Mind
  ground_state: State|null
  self: Subject|null  // <-- self is on State now
}

// Query helper
get_states_by_ground(mind, ground_state) {
  // Returns states in mind observing ground_state
}
```

### Declarative Syntax

```javascript
// Old syntax (with mind_states)
player: {
  bases: ['Person'],
  traits: {
    location: 'workshop',
    mind_states: {
      _type: 'State',
      base: 'player_mind',
      learn: {
        workshop: ['location'],
        hammer: ['location']
      }
    }
  }
}

// New syntax (with mind)
player: {
  bases: ['Person'],
  traits: {
    location: 'workshop',
    mind: {
      workshop: ['location'],
      hammer: ['location']
    }
  }
}
```

When Traittype resolves `mind` trait with plain object, it calls:
```javascript
Mind.resolve_template(parent_mind, learn_spec, self_belief, creator_state)
// → Creates Mind
// → Creates initial State with self = self_belief.subject
// → Executes learning
// → Returns Mind
```

## Implementation Phases

### Phase 1: Add `self` to State (without breaking existing code)
- Add `self` parameter to State constructor (optional, defaults to null)
- Add `self` property to State
- Update serialization (toJSON/from_json)
- Migrate Mind.self → State.self where minds are created
- Update Cosmos.create_state() signature
- **Tests pass**: All existing tests continue to work

### Phase 2: Create Mind.resolve_template() and new `mind` trait
- Add Mind.resolve_template() static method
- Add `mind` traittype ('Mind')
- Update Traittype.resolve() to handle Mind trait with learn spec
- Keep both `mind_states` and `mind` working in parallel
- **Tests pass**: Existing tests work, new tests for `mind` trait

### Phase 3: Replace `mind_states` with `mind` everywhere
- Update Mental archetype: `mind_states` → `mind`
- Add get_states_by_ground() query helper
- Update world.mjs to use new syntax
- Update all test files to use `mind` trait
- Update all code that accessed `mind_states[0]` to use query pattern
- Remove `mind_states` traittype
- Remove State.resolve_template()
- **Tests pass**: All tests migrated and passing

### Phase 4: Add locking constraints (separate from this refactor)
- State constructor checks if self is locked
- Belief.lock() propagates to mind states
- Add tests for locking behavior

## Benefits

1. **Simpler model**: Mind doesn't need to track identity, State does
2. **No maintenance burden**: Mind can branch states without updating parent belief
3. **Efficient queries**: Can find all states observing a given ground_state
4. **Cleaner syntax**: `mind: { workshop: ['location'] }` vs complex _type declarations
5. **Temporal identity**: Self can theoretically change over time (though rarely used)

## Migration Notes

- Breaking change for saves (pre-alpha, acceptable)
- Tests need full migration in Phase 3
- `mind_states[0]` pattern must be replaced with query pattern

## Current Status

**Phase 1: COMPLETE** ✅ - Added `self` property to State ([details](mind-self-refactor-phase1.md))

**Phase 2: COMPLETE** ✅ - Created Mind.resolve_template() and new `mind` trait ([details](mind-self-refactor-phase2.md))

**Phase 3: COMPLETE** ✅ - Replaced mind_states with mind everywhere ([details](mind-self-refactor-phase3.md))

**Phase 4: COMPLETE** ✅ - Added locking constraints with cascade ([details](mind-self-refactor-phase4.md))

All phases complete! Mind and Self Refactor is finished.
