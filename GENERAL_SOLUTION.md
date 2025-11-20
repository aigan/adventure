# General Solution: Type Property + Shared Initialization

## Your Codebase Already Has the Right Pattern!

Looking at your existing code, you **already use** the correct JavaScript pattern for polymorphism and deserialization:

### Pattern You Already Use

```javascript
// serialize.mjs:26-42
if (value._type === 'Belief') { /* ... */ }
if (value._type === 'State') { /* ... */ }
if (value._type === 'Mind') { /* ... */ }

// state.mjs:890
if (data._type === 'UnionState') {
  return Cosmos.UnionState.from_json(mind, data)
}
```

**This is not a hack** - this is the standard JavaScript pattern for:
- Polymorphic deserialization
- Type-safe discrimination without instanceof
- Works across module boundaries (no circular dependencies!)
- Self-documenting (the data carries its type)

---

## The General Solution

### Principle 1: Use `_type` Property for All Type Discrimination

**Instead of:**
```javascript
if (ground_state instanceof Timeless) { /* ... */ }
```

**Use:**
```javascript
if (ground_state._type === 'Timeless') { /* ... */ }
```

**Benefits:**
- ✅ No need to import the class (breaks circular dependencies!)
- ✅ Works with deserialized objects
- ✅ Works across module boundaries
- ✅ Self-documenting
- ✅ JSON-friendly

### Principle 2: Every Class Has `_type` Property

```javascript
// State class
toJSON() {
  return {
    _type: 'State',  // ✅ Always include type marker
    _id: this._id,
    // ...
  }
}

// Timeless class
toJSON() {
  return {
    _type: 'Timeless',  // ✅ Different type marker
    _id: this._id,
    // ...
  }
}
```

### Principle 3: Shared Initialization via Protected Method

**Single source of truth for properties AND initialization:**

```javascript
// state.mjs
export class State {
  // ========================================================================
  // ALL Properties - SINGLE SOURCE OF TRUTH
  // ========================================================================
  /** @type {string} */ _type = 'State'
  /** @type {number} */ _id
  /** @type {Mind} */ in_mind
  /** @type {State|null} */ base
  /** @type {State|null} */ ground_state
  /** @type {number|null} */ tt
  /** @type {number|null} */ vt
  /** @type {Subject|null} */ self
  /** @type {State|null} */ about_state
  /** @type {Belief[]} */ _insert
  /** @type {Belief[]} */ _remove
  /** @type {boolean} */ locked
  /** @type {State[]} */ _branches
  /** @type {Map<Subject, Belief|null>|null} */ _subject_index
  /** @type {Map<Subject, Map<Traittype, State|null>>} */ _rev_base
  /** @type {Map<Subject, Map<Traittype, Set<Belief>>>} */ _rev_add
  /** @type {Map<Subject, Map<Traittype, Set<Belief>>>} */ _rev_del

  /**
   * @param {Mind} mind
   * @param {State|null} ground_state
   * @param {State|null} base
   * @param {object} [options]
   */
  constructor(mind, ground_state, base = null, options = {}) {
    const { tt: tt_option, vt, self, about_state, derivation } = options

    // Validate (allow null ground_state for Timeless bootstrap)
    if (ground_state !== null) {
      assert(base === null || base.locked, 'Cannot create state from unlocked base')
      assert(ground_state._type === 'State' || ground_state._type === 'Timeless',
             'ground_state must be a State')
      assert(ground_state.in_mind === mind.parent, 'ground_state must be in parent mind')
    }

    // Derive values
    const tt = tt_option ?? ground_state?.vt ?? null
    const effective_self = self ?? base?.self ?? null
    const effective_vt = vt ?? tt

    // Use shared initialization
    this._init_properties(mind, ground_state, base, tt, effective_vt, effective_self, about_state)
  }

  /**
   * Shared initialization - used by constructor and from_json
   * This is the SINGLE SOURCE OF TRUTH for property initialization
   * @protected
   */
  _init_properties(mind, ground_state, base, tt, vt, self, about_state) {
    // Set all properties
    this._id = next_id()
    this.in_mind = mind
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

    // Register
    DB.register_state(this)
  }

  /**
   * Deserialization - uses same _init_properties
   * @param {Mind} mind
   * @param {StateJSON} data
   * @returns {State}
   */
  static from_json(mind, data) {
    // Dispatch based on _type
    if (data._type === 'UnionState') {
      return Cosmos.UnionState.from_json(mind, data)
    }
    if (data._type === 'Timeless') {
      return Timeless.from_json(mind, data)
    }

    // Resolve references
    const resolved_mind = data.in_mind ? DB.get_mind_by_id(data.in_mind) : mind
    const base = data.base ? DB.get_state_by_id(data.base) : null
    const ground_state = data.ground_state ? DB.get_state_by_id(data.ground_state) : null
    const self = data.self ? DB.get_or_create_subject(mind.parent, data.self) : null
    const about_state = data.about_state ? DB.get_state_by_id(data.about_state) : null

    // Create instance using Object.create (bypass constructor)
    const state = Object.create(State.prototype)

    // Use shared initialization
    state._init_properties(resolved_mind, ground_state, base, data.tt, data.vt, self, about_state)

    // Override _id to match deserialized value
    state._id = data._id

    // Restore insert/remove arrays
    state._insert = data.insert.map(id => {
      const b = DB.get_belief_by_id(id)
      assert(b, `Belief ${id} not found`)
      return b
    })
    state._remove = data.remove.map(id => {
      const b = DB.get_belief_by_id(id)
      assert(b, `Belief ${id} not found`)
      return b
    })

    return state
  }

  toJSON() {
    return {
      _type: 'State',  // ✅ Type marker
      _id: this._id,
      // ... rest
    }
  }
}
```

```javascript
// timeless.mjs
import { State } from './state.mjs'  // ✅ No circular dependency!

export class Timeless extends State {
  // Override _type
  _type = 'Timeless'

  /**
   * @param {Mind} mind
   */
  constructor(mind) {
    // Timeless-specific ground_state resolution
    const ground_state = mind.parent?.origin_state ?? null

    // Call State constructor with timeless options
    super(mind, ground_state, null, {
      tt: null,   // Timeless
      vt: null    // Timeless
    })

    // _type is already set by property initializer
  }

  /**
   * Deserialization
   * @param {Mind} mind
   * @param {StateJSON} data
   * @returns {Timeless}
   */
  static from_json(mind, data) {
    // Resolve references
    const resolved_mind = data.in_mind ? DB.get_mind_by_id(data.in_mind) : mind
    const ground_state = data.ground_state ? DB.get_state_by_id(data.ground_state) : null
    const self = data.self ? DB.get_or_create_subject(mind.parent, data.self) : null

    // Create instance using Object.create (bypass constructor)
    const timeless = Object.create(Timeless.prototype)

    // Use inherited _init_properties
    timeless._init_properties(resolved_mind, ground_state, null, null, null, self, null)

    // Override _id to match deserialized value
    timeless._id = data._id

    // Restore insert/remove arrays
    timeless._insert = data.insert.map(id => {
      const b = DB.get_belief_by_id(id)
      assert(b, `Belief ${id} not found`)
      return b
    })
    timeless._remove = data.remove.map(id => {
      const b = DB.get_belief_by_id(id)
      assert(b, `Belief ${id} not found`)
      return b
    })

    return timeless
  }

  toJSON() {
    return {
      _type: 'Timeless',  // ✅ Different type marker
      _id: this._id,
      // ... rest same as State
    }
  }
}
```

---

## How This Solves Everything

### ✅ No Circular Dependencies
- State doesn't need to `import { Timeless }`
- Just checks `data._type === 'Timeless'` or `ground_state._type === 'Timeless'`
- Timeless can freely `import { State }` and `extends State`

### ✅ Single Source of Truth
- All properties declared in State class
- All initialization logic in `_init_properties()` method
- Both `new State()` and `State.from_json()` use same initialization

### ✅ Works with Deserialization
- `from_json` uses `Object.create()` to bypass constructor
- Calls same `_init_properties()` as constructor
- No property duplication

### ✅ Type Safety Preserved
- JSDoc types on all properties
- TypeScript understands the structure
- Runtime validation with asserts

### ✅ Extensible
- New subclasses just override `_type` property
- Can add more specific validation in constructor
- Can override `from_json` for special deserialization needs

### ✅ Consistent Pattern
- Same pattern for Mind/Logos/Eidos
- Same pattern for State/Timeless/UnionState
- Same pattern for Belief (already uses this!)

---

## Type Checking: `_type` vs Duck Typing

You asked: "Is the general solution to use object properties for detecting the class of objects?"

**Answer: Yes, and you're already doing it!**

### Use `_type` Property (Explicit)
```javascript
if (ground_state._type === 'Timeless') {
  // Explicit type checking
}

// Or for duck typing specific to your domain:
if (ground_state.tt === null && ground_state.vt === null) {
  // This is a timeless state
}
```

### When to Use Each

**Use `_type` when:**
- Dispatching to different handlers (like from_json)
- Serialization/deserialization
- Clear type discrimination needed
- Working across module boundaries

**Use duck typing when:**
- Checking semantic properties (is this timeless? → tt=null AND vt=null)
- Performance critical (avoid string comparison)
- The property IS the distinguishing feature

**For your specific question about `ground_state?.tt`:**
You noted that any state can have `vt=null`. Looking at Timeless, it has:
- `tt = null`
- `vt = null`

So the duck-type check for "is this timeless?" is:
```javascript
if (ground_state.tt === null && ground_state.vt === null) {
  // This is a timeless state
}
```

But using `_type` is clearer:
```javascript
if (ground_state._type === 'Timeless') {
  // Explicit and self-documenting
}
```

---

## Same Pattern for Mind/Logos

```javascript
// mind.mjs
export class Mind {
  /** @type {string} */ _type = 'Mind'
  /** @type {number} */ _id
  /** @type {Mind|null} */ _parent
  // ... ALL properties

  constructor(parent_mind, label = null, self = null) {
    // Allow null parent for Logos
    if (parent_mind !== null) {
      assert(parent_mind._type === 'Mind' || parent_mind._type === 'Logos',
             'parent_mind must be a Mind')
    }

    this._init_properties(parent_mind, label, self)
  }

  _init_properties(parent_mind, label, self) {
    this._id = next_id()
    this._parent = parent_mind
    this.label = label
    this.self = self
    this._child_minds = new Set()
    this._states = new Set()
    this._states_by_ground_state = new Map()
    this.state = null

    if (parent_mind !== null) {
      parent_mind._child_minds.add(this)
    }

    DB.register_mind(this)
  }

  static from_json(data, parent_mind) {
    if (data._type === 'Logos') {
      return Logos.from_json(data)
    }
    if (data._type === 'Eidos') {
      return Eidos.from_json(data)
    }

    // ... regular Mind deserialization
  }
}

// logos.mjs
import { Mind } from './mind.mjs'

export class Logos extends Mind {
  _type = 'Logos'

  constructor() {
    super(null, 'logos', null)  // ✅ Clean extends!
    this.origin_state = new Timeless(this)
  }

  get parent() {
    return null
  }

  static from_json(data) {
    const logos_instance = Object.create(Logos.prototype)
    logos_instance._init_properties(null, 'logos', null)
    // ... restore state
    return logos_instance
  }
}
```

---

## Summary: Not a Hack, But JavaScript Best Practice

This pattern is used by:
- Redux (action.type discrimination)
- JSON:API specification (_type field)
- TypeScript discriminated unions (kind property)
- GraphQL (__typename field)

**It's the standard way to handle:**
- Polymorphism without instanceof
- Deserialization with type information
- Cross-module type checking
- Avoiding circular dependencies

**Your checklist:**
1. ✅ Every class has `_type` property
2. ✅ Use `_type` for type checking (not instanceof)
3. ✅ Share initialization via `_init_properties()` protected method
4. ✅ Both constructor and `from_json` use same initialization
5. ✅ Properties declared once in base class
6. ✅ No circular imports needed

**This is not async, not a hack, and will scale as you add more classes.**

---

## Migration Path

### Phase 1: Add `_type` Properties (5 minutes)
```javascript
// state.mjs
export class State {
  _type = 'State'
  // ... existing code
}

// timeless.mjs
export class Timeless {
  _type = 'Timeless'
  // ... existing code
}
```

### Phase 2: Replace instanceof with _type Checks (10 minutes)
```javascript
// Find all: ground_state instanceof Timeless
// Replace with: ground_state._type === 'Timeless'
// Or: ground_state.tt === null && ground_state.vt === null
```

### Phase 3: Extract Shared Initialization (30 minutes)
```javascript
// Create _init_properties() method
// Have constructor use it
// Have from_json use it
```

### Phase 4: Clean Up Timeless (15 minutes)
```javascript
// Remove Object.setPrototypeOf hack
// Use clean extends State
// Remove _setup_timeless_inheritance callback
```

### Phase 5: Same for Mind/Logos (20 minutes)

**Total: ~90 minutes for complete migration**

---

## The Answer to Your Questions

> Is there no general way to do these things in a safe and extendable way?

**Yes:** Use `_type` property + shared initialization pattern (shown above)

> Is adding async everywhere a general purpose solution?

**No:** Not needed. The `_type` pattern is synchronous and cleaner.

> Is the general solution to use object properties for detecting the class of objects?

**Yes:** Use `_type` property (explicit) or duck typing (semantic properties like tt/vt)

> Or ground_state?.tt?

**Option 1:** `ground_state._type === 'Timeless'` (explicit, clear)
**Option 2:** `ground_state.tt === null && ground_state.vt === null` (duck typing)

Both work. `_type` is more maintainable long-term.
