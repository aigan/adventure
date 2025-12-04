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
  return { world_state, avatar }
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
  return { world_state: state, avatar: player }
}

// Caller (session.mjs)
async load_world() {
  const { init_world } = await import("./world.mjs")
  const { world_state, avatar } = init_world()  // Construction at runtime
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

## Registry Pattern for Critical Cycles

The most problematic circular dependencies (state ↔ mind ↔ subclasses) are resolved using the **registry pattern** instead of direct imports.

### Type Registry
Handles polymorphic deserialization and construction without imports:

```javascript
// State base class
static _type_registry = {}
static register_type(type_name, class_constructor) {
  this._type_registry[type_name] = class_constructor
}
static get_class(type_name) {
  return this._type_registry[type_name]
}

// Subclass registers itself at module load
State.register_type('Temporal', Temporal)

// Base class can construct subclass without importing
const TemporalClass = State.get_class('Temporal')
const state = new TemporalClass(mind, ground_state, base, options)
```

### Function Registry
Handles singleton/class access without imports:

```javascript
// Mind base class
static _function_registry = {}
static register_function(name, fn) {
  this._function_registry[name] = fn
}
static get_function(name) {
  return this._function_registry[name]
}

// Singletons register at module load
Mind.register_function('eidos', eidos)
Mind.register_function('logos', logos)
Mind.register_function('Materia', Materia)

// Access without import (use @ts-ignore for TypeScript)
const eidos = this.in_mind.constructor.get_function('eidos')
```

### Import Constraints

**state.mjs** cannot import:
- temporal, timeless, convergence (State subclasses)
- eidos, logos, materia (Mind subclasses)
- Use registries instead: `State.get_class()` or `Mind.get_function()`

**mind.mjs** cannot import:
- materia, logos, eidos (Mind subclasses)
- temporal, timeless, convergence (State subclasses)
- Use registries instead: `Mind.get_class()` or `Mind.get_function()`

**belief.mjs** cannot import:
- eidos (would create belief→eidos→mind→belief cycle)
- Use registry: `this.in_mind.constructor.get_function('eidos')`

**serialize.mjs** cannot import:
- logos (would create serialize→logos→mind→serialize cycle)
- Use registry: `Mind.get_function('logos')`

## Current Circular Dependencies (via dpdm)

As of 2025-01-XX, these circular import cycles exist but are handled safely:

### Critical Cycles (Resolved via Registry Pattern)
These previously caused runtime crashes, now handled via registries:

1. **state ↔ mind** (via serialize)
   - `state.mjs → serialize.mjs → mind.mjs → state.mjs`
   - **Resolution**: Mind registry for logos/Materia access

2. **belief ↔ state ↔ mind**
   - `belief.mjs → state.mjs → serialize.mjs → mind.mjs → belief.mjs`
   - **Resolution**: Mind registry for eidos access in belief.is_shared

3. **db ↔ eidos/logos**
   - `db.mjs → eidos.mjs → mind.mjs → db.mjs`
   - **Resolution**: Registry pattern prevents runtime issues

### Safe Cycles (No Runtime Issues)
These are static import cycles that JavaScript handles correctly:

4. **Core data model** (largest cycle)
   ```
   archetype ↔ db ↔ belief ↔ subject ↔ state ↔ serialize ↔ mind
   traittype ↔ archetype ↔ db ↔ belief ↔ state
   ```
   - JavaScript handles these fine due to lazy evaluation
   - Not ideal architecture but no crashes

5. **Type system**
   - `traittype.mjs ↔ archetype.mjs`
   - Safe: mutual import for type resolution

6. **Session/UI**
   - `session.mjs ↔ channel.mjs`
   - Safe but could be cleaned up

7. **Worker communication**
   - `worker.mjs → session.mjs → narrator.mjs → worker.mjs`
   - Safe but indicates tight coupling

### Full 22 Circular Dependency Chains

```
01) archetype → db
02) traittype → archetype → db
03) archetype → db → belief
04) db → belief
05) db → belief → subject
06) belief → subject
07) archetype → db → belief → subject
08) traittype → archetype → db → belief
09) db → belief → state
10) belief → state
11) db → belief → state → serialize → mind
12) state → serialize → mind
13) belief → state → serialize → mind
14) traittype → archetype → db → belief → state → serialize → mind
15) db → belief → state → serialize
16) traittype → archetype → db → belief → state
17) archetype → db → belief → state
18) db → eidos → timeless
19) db → eidos → logos
20) traittype ↔ archetype
21) session ↔ channel
22) worker → session → narrator → worker
```

### Dependency Tree (from worker entry point)

```
worker.mjs
├── session.mjs
│   ├── traittype.mjs
│   │   ├── archetype.mjs
│   │   │   ├── db.mjs
│   │   │   │   ├── archetype.mjs (cycle)
│   │   │   │   ├── traittype.mjs (cycle)
│   │   │   │   ├── belief.mjs
│   │   │   │   │   ├── subject.mjs
│   │   │   │   │   │   ├── belief.mjs (cycle)
│   │   │   │   │   ├── state.mjs
│   │   │   │   │   │   ├── serialize.mjs
│   │   │   │   │   │   │   ├── mind.mjs
│   │   │   │   │   │   │   │   ├── state.mjs (cycle)
│   │   │   │   ├── mind.mjs (cycle)
│   │   │   │   ├── state.mjs (cycle)
│   │   │   │   ├── eidos.mjs
│   │   │   │   │   ├── timeless.mjs
│   │   │   │   │   ├── logos.mjs
│   ├── world.mjs
│   │   ├── materia.mjs
│   │   │   ├── temporal.mjs
│   │   │   ├── convergence.mjs
│   ├── channel.mjs
│   │   ├── session.mjs (cycle)
│   ├── narrator.mjs
│       ├── worker.mjs (cycle)
```

### Analysis

**Status**: All critical runtime cycles resolved via registry pattern. Remaining cycles are safe static imports.

**Future cleanup candidates** (low priority):
- `session ↔ channel` - Extract interface
- `worker ↔ narrator` - Dependency injection
- `traittype ↔ archetype` - Consider merging or extracting shared types

**Not worth fixing** (fundamental data model):
- Core `db ↔ belief ↔ state ↔ mind` cycle - these are tightly coupled by design
- Type system cycles - acceptable for schema definitions
