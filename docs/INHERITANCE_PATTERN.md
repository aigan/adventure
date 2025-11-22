# Inheritance Pattern Rules

## Overview

This document defines the canonical pattern for class inheritance in the worker modules to avoid circular dependencies while maintaining type safety and single source of truth for properties.

---

## Class Hierarchy

```
State (base - permissive, allows null ground_state)
  ├─ TemporalState (normal states, strict - requires ground_state)
  ├─ Timeless (timeless states, ground_state can be null)
  └─ UnionState (composition, requires ground_state)

Mind (base - permissive, allows null parent)
  ├─ Materia (normal minds, strict - requires parent)
  ├─ Logos (primordial, parent must be null)
  └─ Eidos (realm of forms, requires parent)
```

---

## Pattern Rules

### Rule 1: Type Property (Always)

**Every class MUST have a `_type` property that identifies its type.**

```javascript
export class State {
  /** @type {string} */
  _type = 'State'

  // ... rest of class
}

export class Timeless extends State {
  /** @type {string} */
  _type = 'Timeless'  // Override parent's _type

  // ... rest of class
}
```

**Purpose:**
- Enables type checking without instanceof
- Enables deserialization dispatch
- Breaks circular dependencies

---

### Rule 2: No instanceof Across Module Boundaries

**NEVER use instanceof for classes that could create circular dependencies.**

**❌ BAD (creates circular dependency):**
```javascript
// state.mjs
import { Timeless } from './timeless.mjs'  // ❌ Creates circular import

if (ground_state instanceof Timeless) { /* ... */ }
```

**✅ GOOD (no import needed):**
```javascript
// state.mjs
// No import needed!

if (ground_state._type === 'Timeless') { /* ... */ }
```

**When instanceof IS okay:**
- Within the same file
- For classes that don't import each other (e.g., Belief checking Subject)
- For built-in types (Array, Map, Set, etc.)

---

### Rule 3: Import Only for Construction

**Import a class ONLY when you need to construct instances, not for type checking.**

**✅ GOOD:**
```javascript
// eidos.mjs
import { Mind } from './mind.mjs'        // ✅ Need to extend
import { Timeless } from './timeless.mjs' // ✅ Need to construct

export class Eidos extends Mind {
  constructor() {
    super(logos(), 'Eidos', null)
    this.origin_state = new Timeless(this)  // Construction
  }
}
```

**✅ GOOD (type checking without import):**
```javascript
// state.mjs
// NO import of Timeless needed!

constructor(mind, ground_state, base, options) {
  // Type check without import
  if (ground_state && ground_state._type === 'Timeless') {
    // Handle timeless case
  }
}
```

---

### Rule 4: Shared Initialization Method

**Extract ALL property initialization to a protected `_init_properties()` method.**

This ensures:
- Single source of truth for initialization
- Constructor and from_json use same code
- Subclasses can bypass constructor (for from_json)

**Pattern:**
```javascript
export class State {
  // =========================================================================
  // Property Declarations - SINGLE SOURCE OF TRUTH
  // =========================================================================
  /** @type {string} */ _type = 'State'
  /** @type {number} */ _id
  /** @type {Mind} */ in_mind
  /** @type {State|null} */ base
  /** @type {State|null} */ ground_state
  /** @type {number|null} */ tt
  /** @type {number|null} */ vt
  // ... ALL properties declared here

  /**
   * Constructor - validates and calls shared init
   */
  constructor(mind, ground_state, base, options = {}) {
    // Validation specific to normal usage
    // ...

    // Call shared initialization
    this._init_properties(mind, ground_state, base, tt, vt, self, about_state)
  }

  /**
   * Shared initialization - SINGLE SOURCE OF TRUTH for property assignment
   * @protected
   * @param {Mind} in_mind
   * @param {State|null} ground_state
   * @param {State|null} base
   * @param {number|null} tt
   * @param {number|null} vt
   * @param {Subject|null} self
   * @param {State|null} about_state
   */
  _init_properties(in_mind, ground_state, base, tt, vt, self, about_state) {
    // Initialize ALL properties
    this._id = next_id()
    this.in_mind = in_mind
    this.base = base
    this.ground_state = ground_state
    this.tt = tt
    this.vt = vt
    this.self = self
    this.about_state = about_state
    this._insert = []
    this._remove = []
    this.locked = false
    this._branches = []
    this._subject_index = null
    this._rev_base = new Map()
    this._rev_add = new Map()
    this._rev_del = new Map()

    // Register with DB
    DB.register_state(this)
  }

  /**
   * Deserialization - uses Object.create + shared init
   */
  static from_json(mind, data) {
    // Dispatch based on _type
    if (data._type === 'Timeless') {
      return Timeless.from_json(mind, data)
    }
    if (data._type === 'UnionState') {
      return UnionState.from_json(mind, data)
    }

    // Resolve references
    const resolved_mind = data.in_mind ? DB.get_mind_by_id(data.in_mind) : mind
    const base = data.base ? DB.get_state_by_id(data.base) : null
    const ground_state = data.ground_state ? DB.get_state_by_id(data.ground_state) : null
    // ...

    // Create instance bypassing constructor
    const state = Object.create(State.prototype)

    // Use shared initialization
    state._init_properties(resolved_mind, ground_state, base, data.tt, data.vt, self, about_state)

    // Override _id to match deserialized value
    state._id = data._id

    // Restore collections
    // ...

    return state
  }
}
```

---

### Rule 5: Subclass Pattern

**Subclasses can use clean extends + super() pattern:**

```javascript
// timeless.mjs
import { State } from './state.mjs'  // ✅ No circular dependency!

export class Timeless extends State {
  /** @type {string} */
  _type = 'Timeless'

  /**
   * @param {Mind} mind
   */
  constructor(mind) {
    // Resolve timeless-specific parameters
    const ground_state = mind.parent?.origin_state ?? null

    // Call parent constructor with resolved parameters
    super(mind, ground_state, null, {
      tt: null,
      vt: null
    })
  }

  /**
   * Deserialization for Timeless
   */
  static from_json(mind, data) {
    // Resolve references
    const resolved_mind = data.in_mind ? DB.get_mind_by_id(data.in_mind) : mind
    const ground_state = data.ground_state ? DB.get_state_by_id(data.ground_state) : null
    // ...

    // Create instance bypassing constructor
    const timeless = Object.create(Timeless.prototype)

    // Use inherited _init_properties
    timeless._init_properties(resolved_mind, ground_state, null, null, null, self, null)

    // Override _id
    timeless._id = data._id

    // Restore collections
    // ...

    return timeless
  }

  toJSON() {
    return {
      _type: 'Timeless',  // ✅ Correct type marker
      _id: this._id,
      // ... rest same as State
    }
  }
}
```

**Key points:**
- Override `_type` property
- Call `super()` with appropriate parameters
- Provide `from_json` that uses inherited `_init_properties()`
- Override `toJSON()` to include correct `_type`

---

### Rule 6: Type Checking Pattern

**Use `_type` property for type discrimination:**

```javascript
// Check for specific type
if (state._type === 'Timeless') {
  // Handle timeless state
}

// Check for base type or subtype
if (state._type === 'State' || state._type === 'Timeless' || state._type === 'UnionState') {
  // This is some kind of State
}

// Or use duck typing for semantic checks
if (state.tt === null && state.vt === null) {
  // This is a timeless state (semantic check)
}
```

**For JSDoc type annotations, still use class types:**
```javascript
/**
 * @param {State} state - Can be State, Timeless, or UnionState
 * @returns {Belief|null}
 */
function get_belief(state) {
  // Runtime check uses _type
  if (state._type === 'Timeless') {
    // ...
  }
}
```

---

### Rule 7: Base Class Permissiveness

**Base classes (State, Mind) MUST be permissive to allow special subclasses.**

```javascript
// state.mjs
export class State {
  constructor(mind, ground_state, base, options) {
    // Allow null ground_state (for Timeless with Logos bootstrap)
    if (ground_state !== null) {
      assert(ground_state._type, 'ground_state must have _type property')
      assert(ground_state.in_mind === mind.parent, 'ground_state must be in parent mind')
    }

    // ...
  }
}

// mind.mjs
export class Mind {
  constructor(parent_mind, label, self) {
    // Allow null parent (for Logos)
    if (parent_mind !== null) {
      assert(parent_mind._type, 'parent_mind must have _type property')
    }

    // ...
  }
}
```

**Strict validation goes in TemporalState/Materia:**
```javascript
// temporal-state.mjs (future addition)
import { State } from './state.mjs'

export class TemporalState extends State {
  _type = 'TemporalState'

  constructor(mind, ground_state, base, options) {
    // Strict validation for normal states
    assert(ground_state !== null, 'TemporalState requires ground_state')
    assert(ground_state._type === 'State' || ground_state._type === 'TemporalState',
           'ground_state must be a regular State')

    super(mind, ground_state, base, options)
  }
}
```

---

### Rule 8: Circular Dependency Prevention Checklist

Before adding an import, check:

1. ✅ **Does the target module import this module?** → Circular dependency!
   - Solution: Use `_type` property instead of instanceof

2. ✅ **Do I need to construct instances?** → Import is necessary
   - Okay to import for construction

3. ✅ **Do I only need type checking?** → Use `_type` property
   - Don't import, use `obj._type === 'ClassName'`

4. ✅ **Do I only need JSDoc types?** → Use @typedef import
   - `/** @typedef {import('./module.mjs').ClassName} ClassName */`
   - No runtime import, only type information

---

## Summary Table

| Scenario | Pattern | Import Needed? |
|----------|---------|----------------|
| Type checking | `obj._type === 'ClassName'` | ❌ No |
| Construction | `new ClassName(...)` | ✅ Yes |
| Inheritance | `extends ClassName` | ✅ Yes |
| JSDoc type annotation | `@typedef` or `@param {ClassName}` | ⚠️ Only @typedef import |
| Method call on known instance | `obj.method()` | ❌ No (object already exists) |
| Static method call | `ClassName.static_method()` | ✅ Yes |

---

## Migration Checklist

When refactoring a class to follow this pattern:

- [ ] Add `_type` property to class
- [ ] Extract all property initialization to `_init_properties()`
- [ ] Update constructor to call `_init_properties()`
- [ ] Update `from_json` to use `Object.create()` + `_init_properties()`
- [ ] Update `toJSON()` to include `_type`
- [ ] Find all `instanceof ClassName` checks across codebase
- [ ] Replace with `obj._type === 'ClassName'` where appropriate
- [ ] Remove unnecessary imports that were only for instanceof
- [ ] Verify no circular dependencies with import analysis
- [ ] Run tests

---

## Example: Complete State Refactor

See GENERAL_SOLUTION.md for complete code examples of:
- State with shared initialization
- Timeless using clean inheritance
- Mind with shared initialization
- Logos using clean inheritance

---

## Benefits of This Pattern

1. ✅ **No circular dependencies** - Type checking doesn't require imports
2. ✅ **Single source of truth** - Properties and initialization in one place
3. ✅ **Type safe** - JSDoc/TypeScript understand the structure
4. ✅ **Extensible** - Easy to add new subclasses
5. ✅ **Deserialization friendly** - JSON carries type, from_json dispatches correctly
6. ✅ **Maintainable** - Clear, consistent pattern across all classes
7. ✅ **No hacks** - Standard JavaScript/JSON pattern used industry-wide

---

## Anti-Patterns to Avoid

❌ **Don't:** Import class just for instanceof check
```javascript
import { Timeless } from './timeless.mjs'  // ❌
if (obj instanceof Timeless) { /* ... */ }
```

✅ **Do:** Use _type property
```javascript
if (obj._type === 'Timeless') { /* ... */ }  // ✅
```

❌ **Don't:** Duplicate property initialization in multiple places
```javascript
constructor() {
  this._id = next_id()  // ❌ Duplicated
  // ...
}
from_json(data) {
  const obj = new ClassName()
  obj._id = data._id  // ❌ Different initialization
}
```

✅ **Do:** Use shared _init_properties method
```javascript
_init_properties(params) {
  this._id = next_id()  // ✅ Single source of truth
  // ...
}
```

❌ **Don't:** Make base constructors overly strict
```javascript
constructor(parent) {
  assert(parent !== null, 'parent required')  // ❌ Blocks special subclasses
}
```

✅ **Do:** Allow permissive base, strict validation in TemporalX classes
```javascript
// Base class - permissive
constructor(parent) {
  if (parent !== null) {
    assert(parent._type, 'parent must have _type')
  }
}

// Materia - strict
constructor(parent) {
  assert(parent !== null, 'Materia requires parent')
  super(parent, ...)
}
```

---

## Questions?

If unclear whether to import a class, ask:
1. Am I constructing a new instance? → Import
2. Am I checking type? → Use `_type`, don't import
3. Am I calling a static method? → Import
4. Am I only using it for JSDoc? → Use @typedef import

When in doubt: **Use `_type` property instead of instanceof**
