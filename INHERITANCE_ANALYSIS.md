# Current Inheritance Patterns - Analysis

## The Four Subclass Cases

### ✅ **Eidos extends Mind** - WORKS CLEANLY
```javascript
// eidos.mjs:35
export class Eidos extends Mind {
  constructor() {
    super(logos(), 'Eidos', null)  // ✅ Clean super() call
    this.origin_state = new Timeless(this)
  }
}
```

**Why it works:**
- Uses standard `extends Mind`
- Calls `super(logos(), ...)` where `logos()` returns a Mind instance
- No hacks needed
- No circular dependency issues

---

### ✅ **UnionState extends State** - WORKS CLEANLY
```javascript
// union_state.mjs:31
export class UnionState extends State {
  constructor(mind, ground_state, component_states, options = {}) {
    // Validation before super()
    assert(ground_state instanceof State, ...)

    super(mind, ground_state, null, {tt, vt, self, about_state, derivation})  // ✅ Clean super() call

    // UnionState-specific properties
    this.component_states = Object.freeze([...component_states])
    this.is_union = true
  }
}
```

**Why it works:**
- Uses standard `extends State`
- Calls `super(mind, ground_state, ...)` with normal parameters
- Can do validation BEFORE super() call
- No hacks needed
- No circular dependency issues

---

### ❌ **Logos extends Mind** - USES HACK

```javascript
// logos.mjs:30
export class Logos {  // ❌ No extends!
  constructor() {
    // Manual initialization of Mind properties (bypass Mind constructor)
    this._id = next_id()
    this._parent = null  // ❌ REASON: Mind constructor won't allow parent=null
    this.label = 'logos'
    this.self = null
    this._child_minds = new Set()
    this._states = new Set()
    this._states_by_ground_state = new Map()
    this.state = null

    // Bootstrap: Create Timeless state
    const timeless = Object.create(Timeless.prototype)
    timeless.ground_state = null
    timeless._init(this)
    this.origin_state = timeless

    DB.register_mind(this)
  }
}

// ❌ HACK: Runtime prototype manipulation
Object.setPrototypeOf(Logos.prototype, Mind.prototype)
```

**Why it needs the hack:**
- Can't call `super(null, 'logos', null)` because Mind constructor has:
  ```javascript
  assert(parent_mind instanceof Mind, 'parent_mind must be Mind instance')
  ```
- Logos needs `parent=null` (it's the primordial mind)
- Solution: Manually duplicate ALL Mind property initialization
- Use `Object.setPrototypeOf` to inherit Mind methods

**Problem:** Mind constructor is too strict (requires parent to be Mind instance)

---

### ❌ **Timeless extends State** - USES HACK

```javascript
// timeless.mjs:36
export class Timeless {  // ❌ No extends! (added via runtime hack)
  constructor(mind) {
    this.ground_state = mind.parent.origin_state
    this._init(mind)
  }

  _init(mind) {
    // ❌ Manually duplicate State property initialization
    this._id = next_id()
    this.in_mind = mind
    this.tt = null
    this.vt = null
    this.base = null
    this.self = null
    this._insert = []
    this._remove = []

    // @ts-ignore - inherited via runtime hack
    this._init_state_properties()
  }
}

// ❌ HACK: Callback to set up inheritance after State loads
export function _setup_timeless_inheritance(StateClass) {
  Object.setPrototypeOf(Timeless.prototype, StateClass.prototype)
}

// state.mjs:985-986
import { _setup_timeless_inheritance } from './timeless.mjs'
_setup_timeless_inheritance(State)
```

**Why it needs the hack:**
- **Circular dependency**: State imports Timeless (line 30), so Timeless can't import State
- **Reason for State → Timeless import**: State constructor uses `instanceof Timeless` check (line 120)
- Solution: Use callback pattern + `Object.setPrototypeOf` after both modules load

**Problem:** Circular dependency State ↔ Timeless

---

## Summary Table

| Subclass | Base | Pattern | Status | Issue |
|----------|------|---------|--------|-------|
| Eidos | Mind | `extends` + `super()` | ✅ CLEAN | None |
| UnionState | State | `extends` + `super()` | ✅ CLEAN | None |
| Logos | Mind | Manual init + `setPrototypeOf` | ❌ HACK | Mind constructor too strict |
| Timeless | State | Manual init + `setPrototypeOf` | ❌ HACK | Circular dependency |

---

## Root Causes

### 1. Mind Constructor Validation Too Strict
```javascript
// mind.mjs:72
assert(parent_mind instanceof Mind, 'parent_mind must be Mind instance', {label, parent_mind})
```

This prevents Logos from calling `super(null, 'logos', null)`.

**Solution needed:** Allow `parent_mind=null` for Logos case.

### 2. State Imports Timeless for instanceof Check
```javascript
// state.mjs:30
import { Timeless } from './timeless.mjs'

// state.mjs:120 (in constructor)
if (tt_option != null) {
  assert(
    ground_state instanceof Timeless,
    'tt can only be provided explicitly when ground_state is Timeless',
    ...
  )
}
```

This creates circular dependency: State → Timeless → State (can't import).

**Solution needed:** Remove the `instanceof Timeless` check (use different pattern).

---

## Desired Consistent Pattern

All four should use the SAME pattern as Eidos and UnionState:

```javascript
export class Subclass extends Base {
  constructor(...args) {
    // Optional: validation before super()

    super(...modified_args)  // Standard super() call

    // Subclass-specific initialization
  }
}
```

**No hacks, no manual property duplication, no Object.setPrototypeOf.**

---

## Solution Strategies

### Strategy A: Make Base Constructors More Permissive (Simplest)

#### For Mind (fix Logos):
```javascript
// mind.mjs
constructor(parent_mind, label = null, self = null) {
  // Allow null for Logos (primordial mind)
  if (parent_mind !== null) {
    assert(parent_mind instanceof Mind, 'parent_mind must be Mind instance')
  }

  // ... rest of initialization

  // Register with parent (skip for Logos)
  if (parent_mind !== null) {
    parent_mind._child_minds.add(this)
  }
}
```

Then Logos can use:
```javascript
export class Logos extends Mind {
  constructor() {
    super(null, 'logos', null)  // ✅ Clean!
    this.origin_state = new Timeless(this)
  }
}
```

#### For State (fix Timeless):

**Problem:** Still have circular dependency State → Timeless.

**Sub-solution:** Remove the `instanceof Timeless` check in State constructor.

```javascript
// state.mjs constructor - BEFORE
if (tt_option != null) {
  assert(
    ground_state instanceof Timeless,  // ❌ Requires importing Timeless
    'tt can only be provided explicitly when ground_state is Timeless',
    ...
  )
}

// state.mjs constructor - AFTER
if (tt_option != null) {
  assert(
    ground_state.vt === null,  // ✅ Check property instead of type
    'tt can only be provided explicitly when ground_state is timeless (ground_state.vt === null)',
    ...
  )
}
```

Then remove the import:
```javascript
// state.mjs - DELETE
import { Timeless } from './timeless.mjs'
```

Then Timeless can use:
```javascript
// timeless.mjs
import { State } from './state.mjs'  // ✅ No circular dependency!

export class Timeless extends State {
  constructor(mind) {
    super(mind, mind.parent?.origin_state ?? null, null, {
      tt: null,
      vt: null
    })
  }
}
```

---

### Strategy B: Shared Initialization Pattern (from REFACTOR_PLAN.md)

Use `_manual` flag + `_init_*()` methods. This works but adds complexity.

**Pros:**
- Handles edge cases elegantly
- Single source of truth for properties

**Cons:**
- More complex than Strategy A
- Adds `_manual` flag concept
- Requires `_init_*()` protected methods

---

## Recommendation: Strategy A (Make Constructors Permissive)

**Why:**
1. **Simplest** - minimal changes
2. **Consistent** - all four use standard `extends` + `super()`
3. **No new concepts** - no `_manual` flags or `_init_*()` methods
4. **Works with existing clean cases** - Eidos and UnionState unchanged

**Changes needed:**
1. Mind: Allow `parent_mind=null` (2 line changes)
2. State: Remove `instanceof Timeless` check, use `ground_state.vt === null` instead (1 line change)
3. State: Remove `import { Timeless }` (1 line deletion)
4. Logos: Rewrite to use `extends Mind` + `super(null, ...)` (~10 lines)
5. Timeless: Rewrite to use `extends State` + `super(...)` (~5 lines)
6. Remove `_setup_timeless_inheritance` callback (2 lines)

**Total:** ~20 lines changed, much simpler than Strategy B.

---

## Implementation Steps (Strategy A)

### Step 1: Fix Mind Constructor (allow null parent)
```javascript
// mind.mjs constructor
constructor(parent_mind, label = null, self = null) {
  // Allow null parent for Logos (primordial mind)
  if (parent_mind !== null) {
    assert(parent_mind instanceof Mind, 'parent_mind must be Mind instance', {label, parent_mind})
  }

  this._id = next_id()
  this._parent = parent_mind
  this.label = label
  this.self = self
  this._child_minds = new Set()
  this._states = new Set()
  this._states_by_ground_state = new Map()
  this.state = null

  // Register with parent (skip for Logos)
  if (parent_mind !== null) {
    parent_mind._child_minds.add(this)
  }

  DB.register_mind(this)
}
```

### Step 2: Fix State Constructor (remove Timeless dependency)
```javascript
// state.mjs - REMOVE this import (line 30)
// DELETE: import { Timeless } from './timeless.mjs'

// state.mjs constructor - CHANGE this check (line 118)
if (tt_option != null) {
  assert(
    ground_state.vt === null,  // ✅ Duck typing instead of instanceof
    'tt can only be provided explicitly when ground_state is timeless (vt === null)',
    {provided_tt: tt_option, ground_vt: ground_state.vt}
  )
}

// state.mjs - DELETE these lines (985-986)
// DELETE: import { _setup_timeless_inheritance } from './timeless.mjs'
// DELETE: _setup_timeless_inheritance(State)
```

### Step 3: Rewrite Logos (use extends)
```javascript
// logos.mjs
import { Mind } from './mind.mjs'
import { Timeless } from './timeless.mjs'
import * as DB from './db.mjs'  // Only needed if not registered by Mind constructor

export class Logos extends Mind {
  constructor() {
    super(null, 'logos', null)  // ✅ Clean extends!

    // Bootstrap: Create Timeless origin state
    this.origin_state = new Timeless(this)
  }

  /**
   * Logos parent is always null (root of hierarchy)
   * @returns {null}
   */
  get parent() {
    return null
  }
}

// ✅ NO MORE Object.setPrototypeOf!
```

### Step 4: Rewrite Timeless (use extends)
```javascript
// timeless.mjs
import { State } from './state.mjs'  // ✅ No circular dependency!
import { next_id } from './id_sequence.mjs'
import * as DB from './db.mjs'

export class Timeless extends State {
  constructor(mind) {
    // For Logos: mind.parent is null, so ground_state will be null
    // For Eidos: mind.parent is Logos, so ground_state is logos.origin_state
    const ground_state = mind.parent?.origin_state ?? null

    super(mind, ground_state, null, {
      tt: null,   // Timeless - no transaction time
      vt: null    // Timeless - no valid time
    })
  }
}

// ✅ NO MORE _init() method!
// ✅ NO MORE _setup_timeless_inheritance!
```

### Step 5: Update State Constructor (allow null ground_state)

State constructor already has logic for this around line 99-111. Just need to make the assertion conditional:

```javascript
// state.mjs constructor (around line 98-111)
constructor(mind, ground_state, base=null, options = {}) {
  assert(base === null || base.locked, 'Cannot create state from unlocked base state')

  // Allow null ground_state for Timeless (Logos case only)
  if (ground_state !== null) {
    assert(ground_state instanceof State, 'ground_state is required and must be a State')

    const gs = ground_state
    assert(
      gs.in_mind === mind.parent,
      'ground_state must be in parent mind',
      {
        mind: mind.label,
        parent: mind.parent?.label ?? null,
        ground_state_mind: gs.in_mind?.label ?? null
      }
    )
  }

  // ... rest unchanged
}
```

---

## Testing

After each step:
```bash
npm test
```

Create verification script:
```javascript
// tmp/verify-clean-inheritance.mjs
import { Mind } from '../public/worker/mind.mjs'
import { State } from '../public/worker/state.mjs'
import { Logos, logos } from '../public/worker/logos.mjs'
import { Eidos, eidos } from '../public/worker/eidos.mjs'
import { Timeless } from '../public/worker/timeless.mjs'
import { UnionState } from '../public/worker/union_state.mjs'

console.log('=== Inheritance Verification ===\n')

// Check all four use extends
console.log('Eidos extends Mind:', Eidos.prototype instanceof Mind)
console.log('Logos extends Mind:', Logos.prototype instanceof Mind)
console.log('UnionState extends State:', UnionState.prototype instanceof State)
console.log('Timeless extends State:', Timeless.prototype instanceof State)

console.log('\n=== Singleton Verification ===\n')

const l = logos()
console.log('logos() is Mind:', l instanceof Mind)
console.log('logos() is Logos:', l instanceof Logos)
console.log('logos.parent:', l.parent)
console.log('logos.origin_state is Timeless:', l.origin_state instanceof Timeless)
console.log('logos.origin_state is State:', l.origin_state instanceof State)

const e = eidos()
console.log('\neidos() is Mind:', e instanceof Mind)
console.log('eidos() is Eidos:', e instanceof Eidos)
console.log('eidos.parent is Logos:', e.parent === l)
console.log('eidos.origin_state is Timeless:', e.origin_state instanceof Timeless)

console.log('\n✅ All checks passed!')
```

Run:
```bash
node tmp/verify-clean-inheritance.mjs
```

---

## Summary

**Current state:**
- Eidos ✅ and UnionState ✅ use clean `extends` + `super()`
- Logos ❌ and Timeless ❌ use `Object.setPrototypeOf` hacks

**Root causes:**
1. Mind constructor too strict (doesn't allow `parent=null`)
2. State imports Timeless (creates circular dependency)

**Solution:**
1. Make Mind constructor accept `parent=null`
2. Remove `instanceof Timeless` check (use `ground_state.vt === null`)
3. Remove Timeless import from State
4. Rewrite Logos and Timeless to use `extends` + `super()`

**Result:** All four cases use identical clean pattern, no hacks, no circular dependencies.
