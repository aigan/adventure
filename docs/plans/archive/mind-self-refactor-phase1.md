# Mind-Self Refactor - Phase 1: Add `self` to State

**Parent Plan**: [mind-self-refactor.md](../mind-self-refactor.md)

**Goal**: Add `self` property to State without breaking any existing code. This is a purely additive change.

## Changes Required

### 1. State Constructor (state.mjs:66)

**Current signature**:
```javascript
constructor(mind, timestamp, base=null, ground_state=null)
```

**New signature**:
```javascript
constructor(mind, timestamp, base=null, ground_state=null, self=null)
```

**Changes**:
- Add `self` parameter (defaults to null for backwards compatibility)
- Add `this.self = self` property initialization after line 74
- Add assertion to validate `self` is Subject or null

**Location**: state.mjs lines 66-80

```javascript
constructor(mind, timestamp, base=null, ground_state=null, self=null) {
  assert(base === null || base.locked, 'Cannot create state from unlocked base state')
  assert(self === null || self instanceof Subject, 'self must be Subject or null')

  this._id = next_id()
  this.in_mind = mind
  this.base = base
  this.timestamp = timestamp
  this.ground_state = ground_state
  this.self = self  // NEW
  this.insert = []
  this.remove = []
  this.branches = []
  this.locked = false

  this.in_mind.state.add(this)
  DB.state_by_id.set(this._id, this)
}
```

### 2. State.branch_state() (state.mjs:117-121)

**Update to inherit `self` from parent**:

```javascript
branch_state(ground_state) {
  const state = Cosmos.create_state(
    this.in_mind,
    this.timestamp + 1,
    this,
    ground_state ?? this.ground_state,
    this.self  // NEW: inherit self from parent
  )
  this.branches.push(state)
  return state
}
```

### 3. State.toJSON() (state.mjs:388-404)

**Add `self` to serialization**:

```javascript
toJSON() {
  // Register in_mind as dependency if we're in a serialization context
  if (Cosmos.is_serializing() && this.in_mind) {
    Cosmos.add_serialization_dependency(this.in_mind)
  }

  return {
    _type: 'State',
    _id: this._id,
    timestamp: this.timestamp,
    base: this.base?._id ?? null,
    ground_state: this.ground_state?._id ?? null,
    self: this.self?.toJSON() ?? null,  // NEW: serialize self
    insert: this.insert.map(b => b._id),
    remove: this.remove.map(b => b._id),
    in_mind: this.in_mind?._id ?? null
  }
}
```

### 4. State.from_json() (state.mjs:467-536)

**Add `self` deserialization**:

Around line 494 (after ground_state resolution), add:

```javascript
// Resolve self reference
let self = null
if (data.self != null) {
  self = DB.get_or_create_subject(data.self)
}
```

Then at line 525 (when creating state object):

```javascript
state.self = self  // NEW
```

### 5. Cosmos.create_state() (cosmos.mjs:58-60)

**Update factory function signature**:

```javascript
/**
 * Create a new State instance
 * @param {Mind} mind - Mind this state belongs to
 * @param {number} timestamp - State timestamp/tick
 * @param {import('./state.mjs').State|null} base - Base state
 * @param {import('./state.mjs').State|null} ground_state - Ground state reference
 * @param {import('./subject.mjs').Subject|null} self - Who experiences this state
 * @returns {import('./state.mjs').State}
 */
export function create_state(mind, timestamp, base = null, ground_state = null, self = null) {
  return new State(mind, timestamp, base, ground_state, self)
}
```

### 6. Mind Constructor (mind.mjs:50-74)

**Migrate Mind.self to State.self pattern**:

This is where we connect the old `mind.self` to the new `state.self`. When a Mind is created with `self`:

```javascript
constructor(label = null, self = null) {
  if (label && typeof label === 'object' && label._type === 'Mind') {
    const data = /** @type {MindJSON} */ (label)
    this._id = data._id
    this.label = data.label
    this.self = null  // Will be migrated to State in Phase 2
    this.state = new Set()

    DB.mind_by_id.set(this._id, this)
    if (this.label) {
      DB.mind_by_label.set(this.label, this)
    }
    return
  }

  this._id = next_id()
  this.label = /** @type {string|null} */ (label)
  this.self = self  // Keep for now (Phase 2 will remove)
  /** @type {Set<import('./state.mjs').State>} */ this.state = new Set()

  DB.mind_by_id.set(this._id, this)
  if (this.label) {
    DB.mind_by_label.set(this.label, this)
  }
}
```

**Note**: We keep `mind.self` for now. Phase 2 will migrate usage to `state.self`.

### 7. State.resolve_template() (state.mjs:419-458)

**Pass `self` when creating initial state**:

Line 421 creates the entity_mind with owner_belief as self:
```javascript
const entity_mind = Cosmos.create_mind(spec.mind_label || null, owner_belief)
```

Line 427 creates the state - UPDATE to pass self:
```javascript
// Create initial state with self reference
const state = Cosmos.create_state(
  entity_mind,
  1,
  null,
  ground,
  owner_belief?.subject ?? null  // NEW: pass self
)
```

This ensures when mind_states trait creates a state, the state knows its self.

## Tests to Update

### Add new test: State with self (test/state.test.mjs)

```javascript
describe('State self property', () => {
  it('creates state with self reference', () => {
    const mind = new Mind('test');
    const state = mind.create_state(1);

    // Create a belief to be self
    const body = Belief.from_template(mind, {
      label: 'body',
      bases: ['Actor']
    });

    // Create state with self
    const state2 = state.tick({
      insert: [body]
    });

    // Manually create a new state with self
    const state3 = Cosmos.create_state(
      mind,
      3,
      state2,
      null,
      body.subject
    );

    expect(state3.self).to.equal(body.subject);
  });

  it('branch_state inherits self from parent', () => {
    const mind = new Mind('test');
    const body = Belief.from_template(mind, {
      label: 'body',
      bases: ['Actor']
    });

    const state1 = Cosmos.create_state(mind, 1, null, null, body.subject);
    state1.lock();

    const state2 = state1.branch_state(null);

    expect(state2.self).to.equal(body.subject);
  });

  it('serializes and deserializes self', () => {
    const mind = new Mind('test');
    const body = Belief.from_template(mind, {
      label: 'body',
      bases: ['Actor']
    });

    const state = Cosmos.create_state(mind, 1, null, null, body.subject);

    const json = state.toJSON();
    expect(json.self).to.equal(body.subject.sid);

    // Test deserialization happens in load tests
  });
});
```

### Verify existing tests still pass

All existing tests should pass without modification because:
- `self` parameter defaults to null
- Existing code doesn't use `self` yet
- No behavior changes, only additions

## Acceptance Criteria

- [x] State constructor accepts optional `self` parameter
- [x] State stores `self` property (Subject or null)
- [x] branch_state() inherits `self` from parent
- [x] State.toJSON() includes `self`
- [x] State.from_json() restores `self`
- [x] Cosmos.create_state() updated with `self` parameter
- [x] State.resolve_template() passes `self` when creating state
- [x] New tests for `self` property pass
- [x] All existing tests still pass (no regressions)

## Status

**✅ COMPLETE** - All tests passing (116 passing, 0 failing)

## Summary of Implementation

- state.mjs:67-68: Added `self` parameter and assertion
- state.mjs:77: Added `this.self = self` property
- state.mjs:121: Updated branch_state() to pass `this.self`
- state.mjs:30-40: Updated StateJSON typedef with `self` field
- state.mjs:403: Added `self` to toJSON() output
- state.mjs:500-504: Added `self` deserialization in from_json()
- state.mjs:534: Set `self` property when creating state from JSON
- state.mjs:431-437: Updated State.resolve_template() to pass `owner_belief?.subject`
- cosmos.mjs:57,60-61: Updated create_state() factory signature
- cosmos.mjs:120-131: Updated StateJSON typedef
- test/state.test.mjs:3: Added Cosmos import
- test/state.test.mjs:357-465: Added 6 new tests for `self` property

## Notes

- Mind.self is NOT removed in this phase (deferred to Phase 2)
- No changes to Mind.resolve_template() yet (doesn't exist - created in Phase 2)
- State.resolve_template() still exists (removed in Phase 3)
- No changes to mind_states trait yet (Phase 3)
- Fully backward compatible - all existing code works with `self=null` default

## Next Phase

Phase 2: Create Mind.resolve_template() and new `mind` trait
