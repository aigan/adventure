# Circular Dependencies Guide

How to structure ES modules to avoid circular dependency issues.

## The Problem

ES modules resolve imports at load time. When module A imports B and B imports A, one of them will see an incomplete export object. This causes subtle bugs like `undefined` classes or missing methods.

**Symptoms of circular dependency issues:**
- `TypeError: X is not a constructor`
- `undefined` when accessing imported values
- Tests pass but browser fails (different load order)
- `Object.setPrototypeOf` hacks to fix inheritance

## Core Principle: Modules Define, Functions Execute

**At module load time:** Only define classes, constants, and function signatures.

**At runtime (inside functions):** Construct objects, call methods, resolve references.

```javascript
// ✅ GOOD - Schema registration is pure data, safe at module level
DB.register(traittypes, archetypes, prototypes)

// ✅ GOOD - Factory function, called at runtime
export function init_world() {
  const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
  // ... construct objects here
  return { world_state, player_body }
}

// ❌ BAD - Construction at module level
export const world_state = new Cosmos.Materia(...)  // May fail if Materia not loaded yet
```

## The `_type` and `_kind` Properties

Every class has two string properties for runtime type discrimination:

- **`_type`** - The specific/concrete class: `'Temporal'`, `'Timeless'`, `'Materia'`, `'Logos'`
- **`_kind`** - The base class family: `'State'`, `'Mind'`

```javascript
export class State {
  _type = 'State'
  _kind = 'State'
}

export class Temporal extends State {
  _type = 'Temporal'  // Override - specific type
  // _kind = 'State'  // Inherited - same family
}
```

**Use `_kind` to check "is this any State?" and `_type` for specific types:**

```javascript
// ❌ BAD - Requires importing Timeless, may create circular dep
import { Timeless } from './timeless.mjs'
if (state instanceof Timeless) { ... }

// ❌ UGLY - Listing all subtypes is error-prone
if (state._type === 'State' || state._type === 'Temporal' || state._type === 'Timeless') { ... }

// ✅ GOOD - Check base class family
if (state._kind === 'State') { ... }

// ✅ GOOD - Check specific type
if (state._type === 'Timeless') { ... }
```

**When `instanceof` IS okay:**
- Within the same file
- For classes that don't import each other
- For built-in types (Array, Map, Set)

## When to Import a Class

| Need | Import Required? | Pattern |
|------|------------------|---------|
| Type checking | ❌ No | `obj._type === 'ClassName'` |
| Construction | ✅ Yes | `new ClassName(...)` |
| Inheritance | ✅ Yes | `class X extends ClassName` |
| JSDoc type only | ⚠️ Typedef | `@typedef {import('./x.mjs').X} X` |
| Static method | ✅ Yes | `ClassName.method()` |
| Method call on instance | ❌ No | `obj.method()` |

## Deferred Construction Pattern

When a module needs to export constructed objects, use a factory function:

```javascript
// world.mjs

// ✅ Safe at module level - pure data registration
DB.register(traittypes, archetypes, prototypes)

// ✅ Factory function - construction happens when called
export function init_world() {
  const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
  let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})
  // ... build world ...
  return { world_state: state, player_body: player }
}

// Caller (session.mjs)
async load_world() {
  const { init_world } = await import("./world.mjs")
  const { world_state, player_body } = init_world()  // Construction at runtime
}
```

## Shared Initialization Pattern

For deserialization, use `Object.create()` + shared `_init_properties()`:

```javascript
export class State {
  // All properties declared here - SINGLE SOURCE OF TRUTH
  /** @type {number} */ _id
  /** @type {Mind} */ in_mind
  // ...

  constructor(mind, ground_state, base, options) {
    // Validation...
    this._init_properties(mind, ground_state, base, tt, vt, self, about_state)
  }

  // Shared initialization for constructor and from_json
  _init_properties(in_mind, ground_state, base, tt, vt, self, about_state, id = null) {
    this._id = id ?? next_id()
    this.in_mind = in_mind
    // ... set all properties
    DB.register_state(this)
  }

  static from_json(mind, data) {
    // Dispatch to subclass based on _type
    if (data._type === 'Temporal') {
      return Temporal.from_json(mind, data)
    }

    // Bypass constructor validation
    const state = Object.create(State.prototype)
    state._init_properties(resolved_mind, ground_state, base, data.tt, vt, self, about_state, data._id)
    return state
  }
}
```

## Permissive Base, Strict Subclass

Base classes allow special cases (null parent, null ground_state). Subclasses enforce stricter rules:

```javascript
// Base class - permissive for special subclasses
export class Mind {
  constructor(parent_mind, label, self) {
    // Allow null parent for Logos
    if (parent_mind !== null) {
      assert(parent_mind._type === 'Mind' || parent_mind._type === 'Materia' || ...)
    }
  }
}

// Normal subclass - strict
export class Materia extends Mind {
  constructor(parent_mind, label, self) {
    assert(parent_mind !== null, 'Materia requires parent')
    super(parent_mind, label, self)
  }
}

// Special subclass - uses permissive base
export class Logos extends Mind {
  constructor() {
    super(null, 'logos', null)  // Allowed because Mind permits null
  }
}
```

## Import Checklist

Before adding an import, verify:

1. **Does the target import this module?** → Use `_type` property instead
2. **Do I need to construct instances?** → Import is necessary
3. **Do I only need type checking?** → Use `_type`, don't import
4. **Do I only need JSDoc types?** → Use `@typedef` import (no runtime cost)
5. **Am I constructing at module level?** → Move to factory function

## Reset Hook Pattern

When modules need to register cleanup functions with a central registry (like `db.mjs`) but importing from that registry would create a circular dependency, use the hook pattern:

**The `reset.mjs` module:**
```javascript
// reset.mjs - standalone module with no dependencies
const hooks = []

export function register_reset_hook(fn) {
  hooks.push(fn)
}

export function reset_all_hooks() {
  for (const hook of hooks) hook()
}
```

**Modules register their own reset functions:**
```javascript
// archetype.mjs
import { register_reset_hook } from './reset.mjs'

export class Archetype {
  static reset_registry() { /* ... */ }
}

register_reset_hook(() => Archetype.reset_registry())
```

**reset.mjs owns the reset function:**
```javascript
// reset.mjs
export function reset_registries() {
  for (const hook of hooks) hook()
}
```

**db.mjs re-exports for backward compatibility:**
```javascript
// db.mjs
import { register_reset_hook, reset_registries } from './reset.mjs'
export { reset_registries }

// Register own cleanup
function reset_db_registries() {
  mind_by_id.clear()
  // ...
}
register_reset_hook(reset_db_registries)
```

**Benefits:**
- No circular dependencies - `reset.mjs` has no imports
- Each module owns its cleanup logic
- Tests use familiar `DB.reset_registries()` API
- New modules just register their hook - no coordination needed

## Anti-Patterns

❌ **Import for instanceof:**
```javascript
import { Timeless } from './timeless.mjs'
if (state instanceof Timeless) { ... }
```

❌ **Runtime prototype manipulation:**
```javascript
Object.setPrototypeOf(Logos.prototype, Mind.prototype)
```

❌ **Inheritance setup callbacks:**
```javascript
export function _setup_timeless_inheritance(StateClass) {
  Object.setPrototypeOf(Timeless.prototype, StateClass.prototype)
}
```

❌ **Module-level construction with cross-module dependencies:**
```javascript
export const world_state = new Materia(logos(), 'world')
```

## Class Hierarchy Reference

```
Mind (abstract, allows null parent for Logos)
├── Materia (normal minds, requires parent)
├── Logos (primordial, parent = null)
└── Eidos (realm of forms)

State (abstract, allows null ground_state for Timeless)
├── Temporal (normal states, requires ground_state)
├── Timeless (timeless states, ground_state can be null)
└── Convergence (composition of multiple states)
```

All subclasses use clean `extends` + `super()` inheritance. No hacks.
