# Mind-Self Refactor - Phase 2: Create Mind.resolve_template() and `mind` Trait

**Parent Plan**: [mind-self-refactor.md](../mind-self-refactor.md)

**Goal**: Introduce new `mind` trait (singular Mind reference) alongside existing `mind_states` trait (array). Convert tests to use new syntax.

## Overview

This phase adds the new `mind` trait while keeping `mind_states` working. The key improvement is cleaner declarative syntax:

```javascript
// Old syntax (mind_states)
player: {
  bases: ['Person'],
  traits: {
    mind_states: {
      _type: 'State',
      learn: {
        workshop: ['location'],
        hammer: ['location']
      }
    }
  }
}

// New syntax (mind)
player: {
  bases: ['Person'],
  traits: {
    mind: {
      workshop: ['location'],
      hammer: ['location']
    }
  }
}
```

When `mind` trait is resolved with a plain object (learn spec), it creates a Mind + initial State and returns the Mind.

## Changes Required

### 1. Create Mind.resolve_template() (mind.mjs)

Add static method after `from_json()` around line 158:

```javascript
/**
 * Create Mind with initial state from declarative template
 * @param {Mind} parent_mind - Mind creating this (context for belief resolution)
 * @param {Object<string, string[]>} learn_spec - {belief_label: [trait_names]}
 * @param {import('./belief.mjs').Belief|null} self_belief - Belief that becomes state.self
 * @param {import('./state.mjs').State|null} creator_state - State creating this (provides ground_state)
 * @returns {Mind}
 */
static resolve_template(parent_mind, learn_spec, self_belief, creator_state) {
  // Create the mind (no self property - that's on State now)
  const entity_mind = Cosmos.create_mind(null)

  // Create initial state with self reference
  const state = Cosmos.create_state(
    entity_mind,
    1,  // timestamp
    null,  // no base
    creator_state,  // ground_state (where body exists)
    self_belief?.subject ?? null  // self (WHO is experiencing this)
  )

  // Execute learning
  for (const [label, trait_names] of Object.entries(learn_spec)) {
    const belief = DB.get_belief_by_label(label)
    if (!belief) {
      throw new Error(`Cannot learn about '${label}': belief not found`)
    }
    if (trait_names.length > 0) {
      assert(creator_state != null, `Cannot learn about beliefs without ground_state context`)
      state.learn_about(belief, trait_names, creator_state)
    }
  }

  state.lock()
  return entity_mind  // Return Mind, not State
}
```

**Key differences from State.resolve_template:**
- Returns **Mind** instead of State
- Takes `learn_spec` directly (plain object) instead of `spec` with `_type`
- No prototype support (that was in State.resolve_template but unused)
- Simpler - focused on one job

### 2. Add `mind` Traittype (world.mjs)

Update traittypes around line 26:

```javascript
const traittypes = {
  '@about': {
    type: 'Subject',
    mind: 'parent'
  },
  location: 'Location',
  mind_states: {  // Keep for now (Phase 3 removes)
    type: 'State',
    container: Array,
    min: 1
  },
  mind: 'Mind',  // NEW: simple Mind type
  color: 'string',
};
```

Update Mental archetype around line 50:

```javascript
Mental: {
  traits: {
    mind_states: null,  // Keep for backward compat
    mind: null,         // NEW
  },
},
```

### 3. Update Traittype.resolve() (traittype.mjs)

Around line 202, update the template detection logic:

```javascript
resolve(mind, data, owner_belief = null, creator_state = null) {
  // Check for Mind template (plain object learn spec)
  if (this.data_type === 'Mind' &&
      data &&
      typeof data === 'object' &&
      !data._type &&
      !(data instanceof Mind)) {
    // It's a learn spec - call Mind.resolve_template
    return Cosmos.Mind.resolve_template(
      mind,
      data,
      owner_belief,
      creator_state
    )
  }

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

  return this._resolver(mind, data)
}
```

**Logic**:
- If `data_type === 'Mind'` and data is plain object → call Mind.resolve_template with learn spec
- If `data._type === 'Mind'` → could support explicit Mind templates (future)
- Otherwise → normal resolution

### 4. Convert Tests to Use `mind` Trait

#### test/declarative_mind_state.test.mjs

**Change test file structure:**
- Rename describe block from "Declarative Mind State Construction" to "Mind Trait"
- Update all test beliefs to use `mind` instead of `mind_states`
- Update assertions to get Mind from trait, then query states

**Example conversion:**

```javascript
// Old
const player = Belief.from_template(world_mind, {
  bases: ['Person'],
  traits: {
    mind_states: {
      _type: 'State',
      learn: {
        workshop: ['location']
      }
    }
  }
}, world_state);

const mind_states = player.traits.get('mind_states');
const state = mind_states[0];

// New
const player = Belief.from_template(world_mind, {
  bases: ['Person'],
  traits: {
    mind: {
      workshop: ['location']
    }
  }
}, world_state);

const player_mind = player.traits.get('mind');
expect(player_mind).to.be.instanceOf(Mind);

// Get state by querying Mind's states
const states = [...player_mind.state];
expect(states).to.have.lengthOf(1);
const state = states[0];
```

**Tests to convert** (5 tests in declarative_mind_state.test.mjs):
1. "creates mind state from declarative template"
2. "applies prototype template" - May need adjustment or removal (prototype support not in Phase 2)
3. "merges prototype and custom learning" - May need adjustment or removal
4. "empty trait array learns nothing"
5. "throws error for non-existent belief"

#### test/state.test.mjs

Convert "State.resolve_template sets self from owner_belief" test to use `mind`:

```javascript
it('Mind.resolve_template sets state.self from owner_belief', () => {
  const world_mind = new Mind('world');
  const world_state = world_mind.create_state(1);

  const player_body = Belief.from_template(world_mind, {
    label: 'player_body',
    bases: ['Actor']
  });

  world_state.insert_beliefs(player_body);
  world_state.lock();

  // Create player with mind using new syntax
  const player = Belief.from_template(world_mind, {
    label: 'player',
    bases: ['Person'],
    traits: {
      mind: {
        // empty learn spec
      }
    }
  }, world_state);

  const player_mind = player.traits.get('mind');
  expect(player_mind).to.be.instanceOf(Mind);

  const states = [...player_mind.state];
  const player_state = states[0];

  expect(player_state.self).to.equal(player.subject);
  expect(player_state.ground_state).to.equal(world_state);
});
```

#### test/integration.test.mjs

Check if this test uses `mind_states` - if so, convert it.

#### test/inspect.test.mjs

These are just rendering tests with mock data - may not need changes, but check if any use `mind_states` trait name.

### 5. Keep `mind_states` Working in Production Code

**Important**: Do NOT remove `mind_states` from production code (world.mjs, traittypes, archetypes). Phase 3 will handle the migration.

Only convert:
- Test files
- Test helper utilities if any

## Acceptance Criteria

- [ ] Mind.resolve_template() static method created
- [ ] `mind` traittype added to world.mjs
- [ ] Mental archetype has `mind` trait
- [ ] Traittype.resolve() detects Mind trait with plain object and calls Mind.resolve_template()
- [ ] All tests in declarative_mind_state.test.mjs converted to use `mind` trait
- [ ] State.test.mjs test converted to use `mind` trait
- [ ] All tests pass (116+ passing, 0 failing)
- [ ] `mind_states` trait still works in production code (not removed)

## Notes

### Prototype Support

The old State.resolve_template() had prototype support via `spec.base` and `DB.state_by_label`. This was never used in tests or production code. Options:

1. **Skip it** - Don't implement prototype support in Phase 2
2. **Defer it** - Add TODO for future prototype support
3. **Implement it** - Add prototype support to Mind.resolve_template()

**Recommendation**: Skip it for Phase 2. Can add later if needed.

### Error Messages

Mind.resolve_template() should have clear error messages:
- "Cannot learn about 'X': belief not found"
- "Cannot learn about beliefs without ground_state context"

### Test Count

After conversion, test count should remain ~116 or slightly change (if we remove prototype tests).

## Files to Modify

- `public/worker/mind.mjs` - Add Mind.resolve_template()
- `public/worker/world.mjs` - Add `mind` traittype and update Mental archetype
- `public/worker/traittype.mjs` - Update resolve() to handle Mind trait
- `test/declarative_mind_state.test.mjs` - Convert all tests to use `mind` trait
- `test/state.test.mjs` - Convert one test to use `mind` trait
- `test/integration.test.mjs` - Convert if needed
- `test/inspect.test.mjs` - Check if changes needed

## Next Phase

Phase 3: Replace `mind_states` with `mind` in production code (world.mjs, etc.) and remove `mind_states` trait
