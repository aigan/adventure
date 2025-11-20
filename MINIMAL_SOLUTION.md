# Minimal Circular Dependency Fix

## Strategy: Surgical Fixes, Not Architecture Overhaul

Instead of trying to unify all patterns, fix each issue with the minimal change:

1. **State ↔ Timeless**: MUST break this circular dependency (blocking)
2. **Mind ↔ Logos**: Current hack is acceptable, OR use symbol-based token pattern
3. **Keep working patterns**: Don't touch Eidos or UnionState

---

## Fix 1: Break State ↔ Timeless Circular Dependency (CRITICAL)

### Current Problem
```javascript
// state.mjs:30
import { Timeless } from './timeless.mjs'  // ❌ Creates circular dep

// state.mjs:120
assert(
  ground_state instanceof Timeless,  // ❌ Requires import
  'tt can only be provided when ground_state is Timeless'
)

// timeless.mjs
// Can't import State because State already imports Timeless
export class Timeless { /* ... hack ... */ }
```

### Solution: Duck Typing (No Import Needed)

```javascript
// state.mjs
// REMOVE: import { Timeless } from './timeless.mjs'

// state.mjs:120 - Replace instanceof with property check
if (tt_option != null) {
  assert(
    ground_state?.vt === null,  // ✅ Duck typing - no import needed
    'tt can only be provided explicitly when ground_state is timeless (vt === null)',
    {provided_tt: tt_option, ground_vt: ground_state.vt}
  )
}

// REMOVE: import { _setup_timeless_inheritance } from './timeless.mjs'
// REMOVE: _setup_timeless_inheritance(State)
```

```javascript
// timeless.mjs
import { State } from './state.mjs'  // ✅ No circular dependency!

/**
 * Timeless state - exists outside normal temporal flow
 */
export class Timeless extends State {  // ✅ Clean extends!
  /**
   * @param {Mind} mind
   */
  constructor(mind) {
    const ground_state = mind.parent?.origin_state ?? null

    super(mind, ground_state, null, {
      tt: null,   // Timeless
      vt: null    // Timeless
    })
  }
}

// ✅ NO MORE _init() method
// ✅ NO MORE _setup_timeless_inheritance
// ✅ NO MORE Object.setPrototypeOf hack
```

**Why this works:**
- Timeless instances always have `vt === null`
- The check `ground_state?.vt === null` identifies timeless states without importing Timeless
- No loss of validation (we're checking the same semantic condition)
- Breaks circular dependency completely

**Changes needed:**
1. Remove Timeless import from state.mjs (line 30)
2. Change instanceof check to duck typing (line 120)
3. Remove _setup_timeless_inheritance lines (985-986)
4. Rewrite timeless.mjs to use extends (whole file ~30 lines)

---

## Fix 2: Logos Inheritance (Three Options)

### Option A: Keep the Current Hack (Simplest)

**Current code works:**
```javascript
// logos.mjs
export class Logos {
  constructor() {
    // Manual init...
  }
}
Object.setPrototypeOf(Logos.prototype, Mind.prototype)
```

**Pros:**
- ✅ Zero changes needed
- ✅ No circular dependencies
- ✅ Works correctly
- ✅ Type safety preserved (Mind constructor stays strict)

**Cons:**
- ⚠️  Uses runtime prototype manipulation
- ⚠️  Inconsistent with Eidos pattern

**Verdict:** Acceptable if you want minimal changes. The hack is localized and well-documented.

---

### Option B: Symbol-Based Permission Token (Clean + Type Safe)

```javascript
// mind.mjs
const PRIMORDIAL = Symbol('primordial_mind')

export class Mind {
  /**
   * @param {Mind|null} parent_mind - Parent (null only for Logos with PRIMORDIAL token)
   * @param {string|null} label
   * @param {Belief|null} self
   * @param {Symbol} [_token] - Internal: PRIMORDIAL token allows null parent
   */
  constructor(parent_mind, label = null, self = null, _token) {
    // Strict validation for normal usage
    if (parent_mind === null) {
      assert(
        _token === PRIMORDIAL,
        'parent_mind cannot be null (only Logos can have null parent)'
      )
    } else {
      assert(parent_mind instanceof Mind, 'parent_mind must be Mind instance', {label})
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

  get parent() {
    return this._parent
  }
}

// Export symbol for Logos use only
export { PRIMORDIAL }
```

```javascript
// logos.mjs
import { Mind, PRIMORDIAL } from './mind.mjs'
import { Timeless } from './timeless.mjs'

export class Logos extends Mind {  // ✅ Clean extends!
  constructor() {
    super(null, 'logos', null, PRIMORDIAL)  // ✅ Token grants permission

    this.origin_state = new Timeless(this)
  }

  get parent() {
    return null  // Always null
  }
}

// ✅ NO MORE Object.setPrototypeOf!
```

**Pros:**
- ✅ Clean `extends` inheritance
- ✅ Type safety preserved (normal code can't pass null without token)
- ✅ Symbol is unforgeable (can't accidentally use null)
- ✅ Self-documenting (token makes intention clear)

**Cons:**
- ⚠️  Adds token parameter to Mind constructor
- ⚠️  More complex than current hack

**Verdict:** Best option if you want clean inheritance with type safety.

---

### Option C: Permissive Constructor + Strong Documentation (Pragmatic)

```javascript
// mind.mjs
export class Mind {
  /**
   * Create a mind
   * @param {Mind|null} parent_mind - Parent mind (null ONLY for Logos - DO NOT USE IN NORMAL CODE)
   * @param {string|null} label
   * @param {Belief|null} self
   */
  constructor(parent_mind, label = null, self = null) {
    // Allow null parent for Logos (primordial mind)
    // Normal application code should NEVER pass null
    if (parent_mind !== null) {
      assert(parent_mind instanceof Mind, 'parent_mind must be Mind instance', {label})
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

  get parent() {
    return this._parent
  }
}
```

```javascript
// logos.mjs
import { Mind } from './mind.mjs'
import { Timeless } from './timeless.mjs'

export class Logos extends Mind {  // ✅ Clean extends!
  constructor() {
    super(null, 'logos', null)  // Documented exception

    this.origin_state = new Timeless(this)
  }

  get parent() {
    return null
  }
}

// ✅ NO MORE Object.setPrototypeOf!
```

**Pros:**
- ✅ Clean `extends` inheritance
- ✅ Simple (no tokens or complexity)
- ✅ Works correctly

**Cons:**
- ❌ Type safety reduced (JSDoc shows Mind|null everywhere)
- ❌ Relies on convention (can't enforce "don't pass null")
- ❌ Runtime assertion doesn't prevent null at compile time

**Verdict:** Works but loses the type safety you want to preserve.

---

## Recommendation

**Phase 1: Break State ↔ Timeless** (MUST DO - fixes circular dependency)
- Use duck typing (`vt === null`) instead of `instanceof Timeless`
- Rewrite Timeless to use clean `extends State`
- **Impact**: Fixes circular dependency, minimal changes (~30 lines)

**Phase 2: Fix Logos** (Choose one):
- **Conservative**: Keep current hack (0 changes, works fine)
- **Recommended**: Symbol token pattern (clean + type safe)
- **Pragmatic**: Permissive constructor (simple but loses type safety)

---

## Implementation: Phase 1 (State/Timeless)

### Step 1: Modify state.mjs

```javascript
// Line 30 - REMOVE
// DELETE: import { Timeless } from './timeless.mjs'

// Line 114-123 - MODIFY
// Derive tt from ground_state.vt
const tt = tt_option ?? ground_state.vt

// If tt was explicitly provided, validate it's only for timeless ground_state
if (tt_option != null) {
  assert(
    ground_state.vt === null,  // ✅ Duck typing instead of instanceof
    'tt can only be provided explicitly when ground_state is timeless (vt === null)',
    {provided_tt: tt_option, ground_vt: ground_state.vt}
  )
}

// Line 985-986 - REMOVE
// DELETE: import { _setup_timeless_inheritance } from './timeless.mjs'
// DELETE: _setup_timeless_inheritance(State)
```

### Step 2: Rewrite timeless.mjs

```javascript
/**
 * Timeless - timeless state without temporal restrictions
 *
 * Special State subclass for states that exist outside normal temporal flow.
 * Used for primordial states (Logos, Eidos) that don't have tt/vt.
 *
 * Unlike regular State:
 * - Has tt=null and vt=null (timeless)
 * - ground_state can be null (for Logos) or parent's origin_state
 */

import { State } from './state.mjs'

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./belief.mjs').Belief} Belief
 * @typedef {import('./subject.mjs').Subject} Subject
 * @typedef {import('./traittype.mjs').Traittype} Traittype
 */

/**
 * Timeless state - exists outside normal temporal flow
 */
export class Timeless extends State {
  /**
   * @param {Mind} mind - Mind this timeless state belongs to
   */
  constructor(mind) {
    // For Logos: mind.parent is null, so ground_state will be null
    // For Eidos/others: mind.parent exists, so ground_state is parent's origin_state
    const ground_state = mind.parent?.origin_state ?? null

    super(mind, ground_state, null, {
      tt: null,   // Timeless - no transaction time
      vt: null    // Timeless - no valid time
    })
  }
}
```

### Step 3: Modify State constructor to allow null ground_state

```javascript
// state.mjs constructor (around line 98)
constructor(mind, ground_state, base=null, options = {}) {
  assert(base === null || base.locked, 'Cannot create state from unlocked base state')

  // Allow null ground_state for Timeless (Logos bootstrap only)
  if (ground_state !== null) {
    assert(ground_state instanceof State, 'ground_state must be a State')

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

### Step 4: Test

```bash
npm test
```

---

## Summary

**Minimal fix:**
1. Break State ↔ Timeless circular dependency with duck typing (~30 lines)
2. Either keep Logos hack or use symbol token pattern (~20 lines)

**Total effort:** 30-50 lines changed, ~1 hour work.

**Result:**
- ✅ No circular dependencies
- ✅ Timeless uses clean `extends State`
- ✅ Type safety preserved (with symbol token pattern)
- ✅ Eidos and UnionState unchanged (already clean)
- ✅ Works with JSDoc/TypeScript
- ✅ No async needed

This is much simpler than architectural refactors and focuses on fixing the actual problems.
