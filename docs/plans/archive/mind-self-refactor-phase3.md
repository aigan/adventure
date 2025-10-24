# Mind-Self Refactor - Phase 3: Replace mind_states with mind everywhere

**Parent Plan**: [mind-self-refactor.md](../mind-self-refactor.md)

**Goal**: Complete migration from `mind_states` array to `mind` singular Mind reference. Remove all legacy code.

## Overview

Phase 2 added the new `mind` trait alongside `mind_states`. Phase 3 completes the migration by:
1. Replacing all `mind_states` usage with `mind`
2. Removing `mind_states` traittype
3. Removing State.resolve_template()
4. Cleaning up Traittype.resolve()

## Changes Required

### 1. Update world.mjs Production Code

#### Player Definition (lines 92-106)

**Old:**
```javascript
player: {
  bases: ['Person'],
  traits: {
    location: 'workshop',
    mind_states: {
      _type: 'State',
      learn: {
        workshop: ['location']
      },
    }
  },
},
```

**New:**
```javascript
player: {
  bases: ['Person'],
  traits: {
    location: 'workshop',
    mind: {
      workshop: ['location']
    }
  },
},
```

#### Player Usage (line 117)

**Old:**
```javascript
let player_state = player.get_trait(state, 'mind_states')[0];
```

**New:**
```javascript
const player_mind = player.get_trait(state, 'mind');
let player_state = [...player_mind.state][0];
```

#### Remove mind_states Traittype (lines 32-37)

Delete:
```javascript
mind_states: {
  type: 'State',
  container: Array,
  min: 1
},
```

#### Update Mental Archetype (line 53)

**Old:**
```javascript
Mental: {
  traits: {
    mind_states: null,  // Keep for backward compat (Phase 3 removes)
    mind: null,         // New trait
  },
},
```

**New:**
```javascript
Mental: {
  traits: {
    mind: null,
  },
},
```

### 2. Update test/helpers.mjs

#### Remove mind_states Traittype (lines 38-42)

Delete:
```javascript
mind_states: {
  type: 'State',
  container: Array,
  min: 1
},
```

#### Update Mental Archetype (line 57)

**Old:**
```javascript
Mental: {
  traits: {
    mind_states: null,
    mind: null,  // New mind trait (Phase 2)
  },
},
```

**New:**
```javascript
Mental: {
  traits: {
    mind: null,
  },
},
```

### 3. Update test/integration.test.mjs

Find usage at line 63 and update the test to use `mind` trait.

**Current context needed** - read the test to see how mind_states is being used and convert appropriately.

### 4. Update test/load.test.mjs

Find usage at line 240 and update test to use `mind` trait.

**Current context needed** - read the test to see the pattern.

### 5. Update test/declarative_mind_state.test.mjs

Find remaining uses at lines 188 and 264 and convert to use `mind` trait pattern:

**Old pattern:**
```javascript
const mind_states = belief.traits.get('mind_states');
const state = mind_states[0];
```

**New pattern:**
```javascript
const player_mind = belief.traits.get('mind');
const states = [...player_mind.state];
const state = states[0];
```

### 6. Remove State.resolve_template() (state.mjs)

Delete the entire `static resolve_template()` method starting at line 424.

**Note**: Check how many lines this method spans before deletion.

### 7. Update Traittype.resolve() (traittype.mjs)

Remove State template handling from the resolve() method.

**Current code** (approximate line 145-162):
```javascript
// Check for template construction with _type field
if (data?._type) {
  let result
  if (data._type === 'Mind') {
    result = /** @type {any} */ (Cosmos.Mind).resolve_template(mind, data, owner_belief, creator_state)
  } else if (data._type === 'State') {
    result = /** @type {any} */ (Cosmos.State).resolve_template(mind, data, owner_belief, creator_state)
  }

  if (result !== undefined) {
    // Wrap in array if container expects it
    if (this.container === Array && !Array.isArray(result)) {
      return [result]
    }
    return result
  }
}
```

**Updated** (remove State handling):
```javascript
// Check for template construction with _type field
if (data?._type === 'Mind') {
  const result = /** @type {any} */ (Cosmos.Mind).resolve_template(mind, data, owner_belief, creator_state)
  // Note: Mind.resolve_template returns Mind, not array
  return result
}
```

The array wrapping logic can be removed since Mind.resolve_template() returns a Mind directly (not an array).

## Implementation Steps

1. **Read all affected test files** to understand current usage patterns
2. **Update world.mjs** (production code)
3. **Update test/helpers.mjs**
4. **Update all test files** one by one
5. **Remove State.resolve_template()** from state.mjs
6. **Update Traittype.resolve()** to remove State handling
7. **Run tests** to verify everything passes
8. **Update documentation** if needed

## Acceptance Criteria

- [ ] world.mjs player definition uses `mind` trait
- [ ] world.mjs player usage gets state from Mind.state Set
- [ ] test/helpers.mjs Mental archetype only has `mind` trait
- [ ] test/integration.test.mjs migrated to use `mind`
- [ ] test/load.test.mjs migrated to use `mind`
- [ ] test/declarative_mind_state.test.mjs has no remaining `mind_states[0]` patterns
- [ ] State.resolve_template() removed from state.mjs
- [ ] `mind_states` traittype removed from world.mjs
- [ ] `mind_states` traittype removed from test/helpers.mjs
- [ ] Traittype.resolve() State handling removed
- [ ] All tests pass (114 passing, 2 pending)
- [ ] No references to `mind_states` in production code (public/worker/)
- [ ] No references to State.resolve_template in production code

## Notes

### Pattern for Getting First State

When converting `mind_states[0]` to the new pattern:

```javascript
// Old
const state = belief.get_trait(some_state, 'mind_states')[0]

// New
const mind = belief.get_trait(some_state, 'mind')
const state = [...mind.state][0]
```

### Future Query Helper

Phase 3 mentions adding `get_states_by_ground()` helper, but this may not be needed yet if tests don't require it. Can defer to when actually needed.

### Breaking Changes

This is a breaking change for:
- Save files (pre-alpha, acceptable)
- Any external code using `mind_states` trait

## Files to Modify

- `public/worker/world.mjs` - Remove mind_states traittype, update player definition and usage
- `public/worker/state.mjs` - Remove State.resolve_template()
- `public/worker/traittype.mjs` - Remove State._type handling
- `test/helpers.mjs` - Remove mind_states traittype
- `test/integration.test.mjs` - Convert to mind trait
- `test/load.test.mjs` - Convert to mind trait
- `test/declarative_mind_state.test.mjs` - Convert remaining uses

## Next Phase

Phase 4: Add locking constraints - locked self prevents state creation
