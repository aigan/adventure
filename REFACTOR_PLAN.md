# Refactor Plan: Clean Inheritance + No Circular Dependencies

## Problem Statement

You have two interconnected problems:

### 1. Scattered Property Declarations (DRY violation)
- **State**: Properties declared in State class, duplicated in Timeless `_init()`
- **Mind**: Properties declared in Mind constructor, duplicated in Logos constructor
- Makes JSDoc tracking difficult, violates single source of truth

### 2. Inheritance Hacks Due to Circular Dependencies
- **Timeless**: Can't `import { State }` because State imports Timeless for `instanceof` checks
  - Uses `Object.setPrototypeOf(Timeless.prototype, State.prototype)` after module load
  - Uses `_setup_timeless_inheritance(State)` callback (state.mjs:986)
- **Logos**: Manually initializes Mind properties, uses `Object.setPrototypeOf(Logos.prototype, Mind.prototype)`
  - Hack needed because Logos needs `parent=null` but Mind constructor validates `parent_mind instanceof Mind`

### 3. Desired Architecture
```
Mind (abstract base)              State (abstract base)
  ├─ Materia (normal)          ├─ TemporalState (normal)
  ├─ Logos (primordial)             ├─ Timeless (primordial/eidos)
  └─ Eidos (realm of forms)         └─ UnionState (composition)
```

All properties declared ONCE in base classes, all subclasses use proper `extends`, no hacks.

---

## Solution: Shared Initialization Pattern

This elegant pattern solves ALL three problems simultaneously:

### Core Idea
1. Declare ALL properties in base class (single source of truth)
2. Extract initialization logic to protected `_init_*()` method
3. Constructor accepts `_manual` flag to bypass automatic init
4. Subclasses call `_init_*()` manually after special setup
5. **This breaks circular dependencies** because subclasses can now import the base class directly

### Why This Works
- **No circular deps**: Timeless can `import { State }` because it properly extends it (no callback needed)
- **Single source of truth**: All properties declared in base class
- **Clean inheritance**: Standard `extends`, no `Object.setPrototypeOf` hacks
- **Works with JSDoc**: Standard class inheritance, TypeScript understands it perfectly
- **No async**: Pure synchronous initialization

---

## Implementation: State Hierarchy

### Current Code (state.mjs)
```javascript
export class State {
  // Property declarations (lines 68-84) ✅ GOOD - keep these
  /** @type {number} */ _id
  /** @type {Mind} */ in_mind
  // ... etc

  constructor(mind, ground_state, base=null, options = {}) {
    // Validation and initialization (lines 97-155)
    assert(ground_state instanceof State, 'ground_state is required')
    // ... lots of validation
    this._id = next_id()
    this.in_mind = mind
    // ... set properties
    this._init_state_properties()  // line 155
  }

  _init_state_properties() {  // line 163
    this.locked = false
    this._branches = []
    // ... initialize collections
    DB.register_state(this)
  }
}
```

### Current Code (timeless.mjs) - THE HACK
```javascript
// HACK: Can't import State due to circular dependency
// State imports Timeless for instanceof checks

export class Timeless {
  constructor(mind) {
    this.ground_state = mind.parent.origin_state
    this._init(mind)
  }

  _init(mind) {
    this._id = next_id()  // ❌ DUPLICATES State property setting
    this.in_mind = mind
    // ... duplicate all property initialization

    // @ts-ignore - inherited via runtime prototype manipulation
    this._init_state_properties()  // ❌ DEPENDS ON RUNTIME PROTOTYPE HACK
  }
}

// HACK: Set up inheritance after State loads
export function _setup_timeless_inheritance(StateClass) {
  Object.setPrototypeOf(Timeless.prototype, StateClass.prototype)
}
```

### Refactored Code (state.mjs)
```javascript
export class State {
  // ========================================================================
  // Property Declarations - SINGLE SOURCE OF TRUTH
  // ========================================================================
  /** @type {number} */ _id
  /** @type {Mind} */ in_mind
  /** @type {State|null} */ base
  /** @type {number|null} */ tt
  /** @type {number|null} */ vt
  /** @type {Belief[]} */ _insert
  /** @type {Belief[]} */ _remove
  /** @type {State|null} */ ground_state  // null for Timeless (Logos only)
  /** @type {Subject|null} */ self
  /** @type {State|null} */ about_state
  /** @type {boolean} */ locked
  /** @type {State[]} */ _branches
  /** @type {Map<Subject, Belief|null>|null} */ _subject_index
  // ... all other properties

  /**
   * @param {Mind} mind
   * @param {State|null} ground_state - Null only for Timeless (Logos bootstrap)
   * @param {State|null} base
   * @param {object} [options]
   * @param {number|null} [options.tt]
   * @param {number|null} [options.vt]
   * @param {Subject|null} [options.self]
   * @param {State|null} [options.about_state]
   * @param {boolean} [options.derivation]
   * @param {boolean} [options._manual] - Internal: skip auto-init for special subclasses
   */
  constructor(mind, ground_state, base=null, options = {}) {
    // Allow subclasses to manually control initialization
    if (options._manual) {
      return  // Subclass will call _init_state() manually
    }

    this._init_state(mind, ground_state, base, options)
  }

  /**
   * Shared initialization logic - can be called from constructor or manually
   * @protected
   * @param {Mind} mind
   * @param {State|null} ground_state
   * @param {State|null} base
   * @param {object} [options]
   */
  _init_state(mind, ground_state, base=null, options = {}) {
    const { tt: tt_option, vt, self, about_state, derivation } = options

    // Validation (only for temporal states)
    if (ground_state !== null) {
      assert(base === null || base.locked, 'Cannot create state from unlocked base')
      assert(ground_state instanceof State, 'ground_state must be State')
      assert(
        ground_state.in_mind === mind.parent,
        'ground_state must be in parent mind',
        {
          mind: mind.label,
          parent: mind.parent?.label ?? null,
          ground_state_mind: ground_state.in_mind?.label ?? null
        }
      )
    }

    // Derive tt from ground_state.vt (or use provided for Timeless)
    const tt = tt_option ?? ground_state?.vt ?? null

    // Default self to base.self, vt to tt
    const effective_self = self ?? base?.self ?? null
    const effective_vt = vt ?? tt

    // Set properties
    this._id = next_id()
    this.in_mind = mind
    this.base = base
    this.ground_state = ground_state
    this.tt = tt
    this.vt = effective_vt
    this.self = effective_self
    this.about_state = about_state ?? null
    this._insert = []
    this._remove = []

    // Initialize common properties and register
    this._init_state_properties()
  }

  /**
   * Initialize properties that are always the same (collections, registration)
   * @protected
   */
  _init_state_properties() {
    this.locked = false
    this._branches = []
    this._subject_index = null
    this._rev_base = new Map()
    this._rev_add = new Map()
    this._rev_del = new Map()

    DB.register_state(this)
  }

  // ... all other methods unchanged
}
```

### Refactored Code (timeless.mjs) - NO MORE HACKS!
```javascript
import { State } from './state.mjs'  // ✅ Direct import - no circular dependency!

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./belief.mjs').Belief} Belief
 * @typedef {import('./subject.mjs').Subject} Subject
 * @typedef {import('./traittype.mjs').Traittype} Traittype
 */

/**
 * Timeless state - exists outside normal temporal flow
 * Used for Logos and Eidos primordial states
 */
export class Timeless extends State {  // ✅ Clean inheritance!
  /**
   * @param {Mind} mind - Mind this timeless state belongs to
   */
  constructor(mind) {
    // Use _manual flag to control initialization
    super(mind, null, null, { _manual: true })

    // Special Timeless setup
    // For Logos bootstrap: ground_state is null (set explicitly in logos.mjs)
    // For Eidos/others: ground_state is parent mind's origin_state
    this.ground_state = mind.parent?.origin_state ?? null

    // Call shared initialization with timeless options
    this._init_state(mind, this.ground_state, null, {
      tt: null,   // Timeless - no transaction time
      vt: null    // Timeless - no valid time
    })
  }
}

// ✅ NO MORE _setup_timeless_inheritance hack!
// ✅ NO MORE Object.setPrototypeOf!
```

### Changes Required in state.mjs

1. **Add `_manual` option to constructor** (line ~97)
2. **Extract validation/initialization to `_init_state()` method** (new method ~156)
3. **Move ground_state to property declarations** (already there at line 76)
4. **Allow ground_state=null in validation** (check `if (ground_state !== null)`)
5. **Remove the `_setup_timeless_inheritance` call** (line 985-986)

### Changes Required in timeless.mjs

1. **Add `import { State } from './state.mjs'`** (replaces comment about circular dep)
2. **Change to `extends State`** (line 36)
3. **Rewrite constructor** to use `_manual` flag and call `_init_state()`
4. **Delete `_init()` method** (replaced by inherited `_init_state()`)
5. **Delete `_setup_timeless_inheritance()` export** (no longer needed)

---

## Implementation: Mind Hierarchy

### Current Code (mind.mjs)
```javascript
export class Mind {
  constructor(parent_mind, label = null, self = null) {
    assert(parent_mind instanceof Mind, 'parent_mind must be Mind instance')

    // Properties declared inline during initialization
    this._id = next_id()
    this._parent = parent_mind
    this.label = label
    this.self = self
    this._child_minds = new Set()
    this._states = new Set()
    this._states_by_ground_state = new Map()
    // ... more properties

    // Registration
    parent_mind._child_minds.add(this)
    DB.register_mind(this)
  }
}
```

### Current Code (logos.mjs) - THE HACK
```javascript
export class Logos {
  constructor() {
    // ❌ Manually duplicate Mind property initialization
    this._id = next_id()
    this._parent = null  // Special case: Logos has no parent
    this.label = 'logos'
    this.self = null
    this._child_minds = new Set()
    this._states = new Set()
    this._states_by_ground_state = new Map()
    this.state = null

    // Bootstrap Timeless
    const timeless = Object.create(Timeless.prototype)
    timeless.ground_state = null
    timeless._init(this)
    this.origin_state = timeless

    DB.register_mind(this)
  }
}

// ❌ HACK: Set up inheritance at module level
Object.setPrototypeOf(Logos.prototype, Mind.prototype)
```

### Refactored Code (mind.mjs)
```javascript
export class Mind {
  // ========================================================================
  // Property Declarations - SINGLE SOURCE OF TRUTH
  // ========================================================================
  /** @type {number} */ _id
  /** @type {Mind|null} */ _parent
  /** @type {string|null} */ label
  /** @type {Belief|null} */ self
  /** @type {Set<Mind>} */ _child_minds
  /** @type {Set<State>} */ _states
  /** @type {Map<State, Set<State>>} */ _states_by_ground_state
  /** @type {State|null} */ state
  // ... all other properties

  /**
   * @param {Mind|null} parent_mind - Parent mind (null only for Logos)
   * @param {string|null} label
   * @param {Belief|null} self
   * @param {object} [options]
   * @param {boolean} [options._manual] - Internal: skip auto-init for special subclasses
   */
  constructor(parent_mind, label = null, self = null, options = {}) {
    if (options._manual) {
      return  // Subclass will call _init_mind() manually
    }

    this._init_mind(parent_mind, label, self, options)
  }

  /**
   * Shared initialization logic
   * @protected
   * @param {Mind|null} parent_mind
   * @param {string|null} label
   * @param {Belief|null} self
   * @param {object} [options]
   */
  _init_mind(parent_mind, label, self, options = {}) {
    // Validation (only for temporal minds)
    if (parent_mind !== null) {
      assert(parent_mind instanceof Mind, 'parent_mind must be Mind instance', {label})
    }

    // Set properties
    this._id = next_id()
    this._parent = parent_mind
    this.label = label
    this.self = self

    // Initialize common properties
    this._init_mind_properties()

    // Register with parent (if not Logos)
    if (parent_mind !== null) {
      parent_mind._child_minds.add(this)
    }
  }

  /**
   * Initialize properties that are always the same
   * @protected
   */
  _init_mind_properties() {
    this._child_minds = new Set()
    this._states = new Set()
    this._states_by_ground_state = new Map()
    this.state = null

    DB.register_mind(this)
  }

  /**
   * Get parent mind
   * @returns {Mind|null}
   */
  get parent() {
    return this._parent
  }

  // ... all other methods unchanged
}
```

### Refactored Code (logos.mjs) - NO MORE HACKS!
```javascript
import { Mind } from './mind.mjs'  // ✅ Direct import!
import { Timeless } from './timeless.mjs'
import * as DB from './db.mjs'

/**
 * Primordial mind - ground of being
 * The ONE mind with parent=null
 */
export class Logos extends Mind {  // ✅ Clean inheritance!
  constructor() {
    // Use _manual flag to control initialization
    super(null, 'logos', null, { _manual: true })

    // Call shared initialization with parent=null
    this._init_mind(null, 'logos', null)

    // Bootstrap: Create Timeless state
    // Timeless constructor will set ground_state = parent?.origin_state ?? null
    // For Logos, parent is null, so ground_state will be null ✅
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

// ✅ NO MORE Object.setPrototypeOf hack!

/**
 * Access Logos singleton
 * @returns {Mind}
 */
export function logos() {
  if (_logos === null) {
    _logos = new Logos()
  }
  return _logos  // ✅ Already a Mind via proper extends!
}
```

### Refactored Code (eidos.mjs) - Already Clean!
```javascript
// Eidos already uses clean inheritance - no changes needed!
export class Eidos extends Mind {
  constructor() {
    super(logos(), 'Eidos', null)  // ✅ Proper parent
    this.origin_state = new Timeless(this)
  }
}
```

---

## Implementation: Breaking Circular Dependencies

The refactor above ALREADY breaks most circular dependencies:

### Before Refactor
```
state.mjs ─imports─→ timeless.mjs (for instanceof checks)
    ↑                     │
    └────can't import─────┘ (CIRCULAR!)
```

### After Refactor
```
state.mjs ←─imports─── timeless.mjs ✅
  (no import of timeless needed!)
```

**Why does this work?**

Previously, `state.mjs` imported Timeless to check `ground_state instanceof Timeless` (line ~120).

After refactor, we don't need this check anymore because:
1. Timeless properly extends State
2. We check `if (ground_state !== null)` instead
3. The `_manual` flag handles special cases

### Remaining Circular Deps to Fix

After this refactor, apply the fixes from CIRCULAR_DEPS_SOLUTION.md:

1. **cosmos ↔ db**: Have db.mjs import directly from logos.mjs/eidos.mjs (Tier 1)
2. **archetype ↔ db**: Remove unused DB import from archetype.mjs (Tier 2)
3. **belief ↔ subject**: Use duck typing (`_type === 'Belief'`) (Tier 3a)
4. **traittype multi-way**: Use dependency injection pattern (Tier 3b)

---

## Implementation Order

### Phase 1: Fix State Hierarchy (30 minutes)
1. Modify `state.mjs`:
   - Add `_manual` option to constructor
   - Extract `_init_state()` method
   - Allow `ground_state=null` in validation
   - Keep all property declarations at top
2. Modify `timeless.mjs`:
   - Import State directly
   - Use `extends State`
   - Rewrite constructor to use `_manual` + `_init_state()`
   - Delete `_init()` and `_setup_timeless_inheritance()`
3. Remove `_setup_timeless_inheritance` call from state.mjs (line 985-986)
4. Verify `union_state.mjs` still works (should be unchanged - already uses clean extends)
5. Run tests: `npm test`

### Phase 2: Fix Mind Hierarchy (30 minutes)
1. Modify `mind.mjs`:
   - Add property declarations at top
   - Add `_manual` option to constructor
   - Extract `_init_mind()` method
   - Allow `parent_mind=null` in validation
2. Modify `logos.mjs`:
   - Import Mind directly
   - Use `extends Mind` (remove Object.setPrototypeOf)
   - Rewrite constructor to use `_manual` + `_init_mind()`
   - Simplify Timeless bootstrap
3. Verify `eidos.mjs` still works (should be unchanged - already clean)
4. Run tests: `npm test`

### Phase 3: Fix Remaining Circular Deps (30 minutes)
Apply fixes from CIRCULAR_DEPS_SOLUTION.md Tier 1-3.

### Phase 4: Optional - Introduce Materia/TemporalState (15 minutes)
```javascript
// temporal-mind.mjs
import { Mind } from './mind.mjs'

/**
 * Normal temporal mind (most minds are this type)
 * Convenience class - identical to Mind but makes intention clear
 */
export class Materia extends Mind {
  // No overrides needed - just use base constructor
}

// temporal-state.mjs
import { State } from './state.mjs'

/**
 * Normal temporal state (most states are this type)
 * Convenience class - identical to State but makes intention clear
 */
export class TemporalState extends State {
  // No overrides needed - just use base constructor
}
```

Then update code to use `new Materia()` and `new TemporalState()` instead of `new Mind()` and `new State()`.

**OR** just keep using Mind/State directly - they work fine as concrete classes.

---

## Benefits Summary

### Before
- ❌ Property declarations duplicated across files
- ❌ Inheritance hacks with `Object.setPrototypeOf`
- ❌ Circular dependencies prevent clean imports
- ❌ Callback functions to set up prototype chains
- ❌ Comments like "can't import due to circular dependency"
- ❌ TypeScript confused by runtime prototype manipulation

### After
- ✅ Single source of truth for all properties
- ✅ Clean `extends` inheritance, no hacks
- ✅ No circular dependencies
- ✅ Standard ES6 class semantics
- ✅ Works perfectly with JSDoc/TypeScript
- ✅ More maintainable, easier to understand
- ✅ No async needed
- ✅ No behavior changes

---

## Testing Strategy

After each phase:
```bash
npm test  # All existing tests should pass
```

Create verification script:
```javascript
// tmp/verify-inheritance.mjs
import { State } from '../public/worker/state.mjs'
import { Timeless } from '../public/worker/timeless.mjs'
import { Mind } from '../public/worker/mind.mjs'
import { Logos, logos } from '../public/worker/logos.mjs'

// Verify clean inheritance
console.log('Timeless extends State:', Timeless.prototype instanceof State)
console.log('Logos extends Mind:', Logos.prototype instanceof Mind)

// Verify singletons work
const l = logos()
console.log('logos() returns Mind:', l instanceof Mind)
console.log('logos.origin_state is Timeless:', l.origin_state instanceof Timeless)
console.log('logos.origin_state is State:', l.origin_state instanceof State)

console.log('\n✅ All inheritance checks passed!')
```

Run with:
```bash
node tmp/verify-inheritance.mjs
```

---

## Summary

This refactor achieves ALL your goals:
1. ✅ Mind and State are clean base classes with all properties declared once
2. ✅ Logos/Eidos extend Mind cleanly (no hacks)
3. ✅ Timeless/UnionState extend State cleanly (no hacks)
4. ✅ No circular dependencies (subclasses can import bases directly)
5. ✅ Works perfectly with JSDoc/TypeScript
6. ✅ No async needed
7. ✅ Elegant, maintainable, DRY

Total effort: ~90 minutes for complete refactor + circular dependency fixes.

Ready to implement when you are!
