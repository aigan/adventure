# Implementation Plan: Inheritance Pattern Refactor

## Overview

This document provides step-by-step instructions to refactor the worker modules to use the inheritance pattern defined in `docs/INHERITANCE_PATTERN.md`.

**Goal:** Eliminate circular dependencies and inheritance hacks while maintaining type safety and single source of truth for properties.

**Estimated Time:** 2-3 hours
**Risk Level:** Medium (affects core classes, but changes are mechanical)

---

## Reference Files

- **Pattern Documentation:** `docs/INHERITANCE_PATTERN.md`
- **Refactored Examples:** `tmp/state_refactored.mjs`, `tmp/timeless_refactored.mjs`, `tmp/mind_refactored.mjs`, `tmp/logos_refactored.mjs`
- **General Solution:** `GENERAL_SOLUTION.md`

---

## Phase 1: Refactor State Class (~45 minutes)

### File: `public/worker/state.mjs`

### Changes Needed:

#### 1. Add `_type` property (after line 68)
```javascript
// Add after existing property declarations
/** @type {string} - Type discriminator for polymorphism */
_type = 'State'
```

#### 2. Remove Timeless import (line 30)
```javascript
// DELETE:
import { Timeless } from './timeless.mjs'
```

#### 3. Update StateJSON typedef (line 39)
```javascript
// CHANGE:
@property {string} _type - "State" or "UnionState"

// TO:
@property {string} _type - "State", "Timeless", or "UnionState"
```

#### 4. Update ground_state property declaration (line 76)
```javascript
// CHANGE:
/** @type {State} */ ground_state

// TO:
/** @type {State|null} */ ground_state  // Null only for Timeless (Logos bootstrap)
```

#### 5. Update constructor parameter type (line 88)
```javascript
// CHANGE:
@param {State} ground_state - Required (except logos_state which bypasses constructor)

// TO:
@param {State|null} ground_state - Ground state (null only for Timeless with Logos)
```

#### 6. Update constructor validation (lines 98-111)
```javascript
// CHANGE:
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

// TO:
// Allow null ground_state for Timeless (Logos bootstrap)
if (ground_state !== null) {
  // Use _type property instead of instanceof
  assert(
    ground_state._type === 'State' ||
    ground_state._type === 'Timeless' ||
    ground_state._type === 'UnionState',
    'ground_state must be a State',
    { ground_type: ground_state?._type }
  )

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
```

#### 7. Update tt derivation (line 115)
```javascript
// CHANGE:
const tt = tt_option ?? ground_state.vt

// TO:
const tt = tt_option ?? ground_state?.vt ?? null
```

#### 8. Replace instanceof Timeless check (lines 118-124)
```javascript
// CHANGE:
if (tt_option != null) {
  assert(
    ground_state instanceof Timeless,
    'tt can only be provided explicitly when ground_state is Timeless (timeless state)',
    {provided_tt: tt_option, is_timeless_ground: ground_state instanceof Timeless}
  )
}

// TO:
if (tt_option != null && ground_state !== null) {
  assert(
    ground_state.vt === null,
    'tt can only be provided explicitly when ground_state is timeless (vt === null)',
    { provided_tt: tt_option, ground_vt: ground_state.vt }
  )
}
```

#### 9. Update self belief check (line 137)
```javascript
// CHANGE:
if (effective_self !== null && base === null && !derivation) {
  const self_belief = ground_state.get_belief_by_subject(effective_self)
  assert(self_belief === null || !self_belief.locked, 'Cannot create state for locked self')
}

// TO:
if (effective_self !== null && base === null && !derivation && ground_state !== null) {
  const self_belief = ground_state.get_belief_by_subject(effective_self)
  assert(self_belief === null || !self_belief.locked, 'Cannot create state for locked self')
}
```

#### 10. Rename and consolidate initialization methods (lines 142-195)
```javascript
// CHANGE: Keep _init_state_properties() but add a wrapper _init_properties()

// After line 156, ADD NEW METHOD:
/**
 * Shared initialization - SINGLE SOURCE OF TRUTH for property assignment
 * Used by both constructor and from_json
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
  // Initialize ALL properties (consolidate constructor lines 143-152)
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

  // Call existing _init_state_properties for collections
  this._init_state_properties()
}

// THEN UPDATE constructor (lines 142-155):
// Replace lines 143-155 with:
this._init_properties(mind, ground_state, base, tt, effective_vt, effective_self, about_state)
```

#### 11. Update toJSON() to include _type (find toJSON method)
```javascript
// Add _type as first property:
toJSON() {
  return {
    _type: this._type,  // ADD THIS LINE
    _id: this._id,
    tt: this.tt,
    vt: this.vt,
    base: this.base?._id ?? null,
    ground_state: this.ground_state?._id ?? null,  // Can be null now
    self: this.self?.sid ?? null,
    about_state: this.about_state?._id ?? null,
    insert: this._insert.map(b => b._id),
    remove: this._remove.map(b => b._id),
    in_mind: this.in_mind._id
  }
}
```

#### 12. Update from_json() dispatch (line 888-892)
```javascript
// ADD after line 889:
if (data._type === 'Timeless') {
  // Dispatch to Timeless.from_json (will be added in Phase 3)
  return Cosmos.Timeless.from_json(mind, data)
}
```

#### 13. Update from_json() to use _init_properties
Find the from_json method and refactor it to use Object.create + _init_properties pattern (see tmp/state_refactored.mjs lines 166-235 for complete example).

#### 14. Remove _setup_timeless_inheritance calls (lines 985-986)
```javascript
// DELETE:
import { _setup_timeless_inheritance } from './timeless.mjs'
_setup_timeless_inheritance(State)
```

### Test After Phase 1:
```bash
# This will likely fail because Timeless still uses old pattern
# But verify no syntax errors
node --check public/worker/state.mjs
```

---

## Phase 2: Refactor Mind Class (~30 minutes)

### File: `public/worker/mind.mjs`

### Changes Needed:

#### 1. Add `_type` property (after line 59)
```javascript
/** @type {string} - Type discriminator for polymorphism */
_type = 'Mind'
```

#### 2. Update MindJSON typedef (line 41)
```javascript
// CHANGE:
@property {string} _type - Always "Mind"

// TO:
@property {string} _type - "Mind", "Logos", "Eidos", or "TemporalMind"
```

#### 3. Update constructor to allow null parent (line 70-72)
```javascript
// CHANGE:
assert(parent_mind instanceof Mind, 'parent_mind must be Mind instance', {label, parent_mind})

// TO:
// Allow null parent for Logos (primordial mind)
if (parent_mind !== null) {
  // Use _type property instead of instanceof
  assert(
    parent_mind._type === 'Mind' ||
    parent_mind._type === 'Logos' ||
    parent_mind._type === 'Eidos' ||
    parent_mind._type === 'TemporalMind',
    'parent_mind must be a Mind',
    { label, parent_type: parent_mind?._type }
  )
}
```

#### 4. Add _init_properties method (after constructor)
```javascript
/**
 * Shared initialization - SINGLE SOURCE OF TRUTH for property assignment
 * Used by both constructor and from_json
 * @protected
 * @param {Mind|null} parent_mind
 * @param {string|null} label
 * @param {Belief|null} self
 */
_init_properties(parent_mind, label, self) {
  // Initialize ALL properties
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

  // Register with DB
  DB.register_mind(this)
}
```

#### 5. Update constructor to use _init_properties
```javascript
// In constructor, REPLACE lines 74-87 (property assignments) with:
this._init_properties(parent_mind, label, self)

// REMOVE the separate parent registration and DB.register_mind calls
```

#### 6. Update toJSON() to include _type
```javascript
// Add _type as first property in toJSON():
toJSON() {
  return {
    _type: this._type,  // ADD THIS LINE
    _id: this._id,
    label: this.label,
    // ... rest
  }
}
```

#### 7. Update from_json() dispatch
```javascript
// ADD at beginning of from_json:
if (data._type === 'Logos') {
  return Cosmos.Logos.from_json(data)
}
if (data._type === 'Eidos') {
  return Cosmos.Eidos.from_json(data, parent_mind)
}
```

#### 8. Update from_json() to use _init_properties
Refactor to use Object.create + _init_properties pattern (see tmp/mind_refactored.mjs for example).

### Test After Phase 2:
```bash
node --check public/worker/mind.mjs
```

---

## Phase 3: Refactor Timeless Class (~20 minutes)

### File: `public/worker/timeless.mjs`

**Replace entire file contents** with tmp/timeless_refactored.mjs, adjusting only:
- Import paths (ensure they're correct)
- Any missing methods from original (unlikely, Timeless is simple)

### Key Changes:
- Clean `extends State` inheritance
- Override `_type = 'Timeless'`
- Use `super()` instead of manual initialization
- Add `from_json()` static method
- Add `toJSON()` override
- **Remove** `_init()` method
- **Remove** `_setup_timeless_inheritance()` export

### Test After Phase 3:
```bash
npm test
```

---

## Phase 4: Refactor Logos Class (~20 minutes)

### File: `public/worker/logos.mjs`

**Replace entire file contents** with tmp/logos_refactored.mjs, adjusting only:
- Import paths
- Any missing methods from original

### Key Changes:
- Clean `extends Mind` inheritance
- Override `_type = 'Logos'`
- Use `super(null, 'logos', null)` instead of manual initialization
- Add `from_json()` static method
- **Remove** manual property initialization
- **Remove** `Object.setPrototypeOf(Logos.prototype, Mind.prototype)`

### Test After Phase 4:
```bash
npm test
```

---

## Phase 5: Update cosmos.mjs (~5 minutes)

### File: `public/worker/cosmos.mjs`

Need to export Timeless (if not already):

```javascript
export { Timeless } from './timeless.mjs'
```

This allows `Cosmos.Timeless` to be used in State.from_json dispatch.

---

## Phase 6: Search and Replace instanceof Checks (~15 minutes)

### Find all instanceof checks that create circular dependencies:

```bash
# Find all instanceof checks in worker files
grep -n "instanceof Timeless" public/worker/*.mjs
grep -n "instanceof Logos" public/worker/*.mjs
```

### Replace patterns:

#### Pattern 1: Type checking
```javascript
// CHANGE:
if (obj instanceof Timeless) { ... }

// TO:
if (obj._type === 'Timeless') { ... }
```

#### Pattern 2: Type guard in assertions
```javascript
// CHANGE:
assert(obj instanceof Mind, 'must be Mind')

// TO:
assert(obj._type === 'Mind' || obj._type === 'Logos' || obj._type === 'Eidos', 'must be Mind')
```

### Files to Check:
- `public/worker/state.mjs` (already done in Phase 1)
- `public/worker/mind.mjs` (already done in Phase 2)
- `public/worker/db.mjs`
- `public/worker/serialize.mjs` (should already use _type)
- `public/worker/subject.mjs`
- Any other files that import Timeless or Logos

---

## Phase 7: Verify and Test (~30 minutes)

### 1. Check for Circular Dependencies

Create verification script:

```javascript
// tmp/check-circular-deps.mjs
import { State } from '../public/worker/state.mjs'
import { Timeless } from '../public/worker/timeless.mjs'
import { Mind } from '../public/worker/mind.mjs'
import { Logos, logos } from '../public/worker/logos.mjs'
import { Eidos, eidos } from '../public/worker/eidos.mjs'

console.log('✅ No circular dependency errors during import!')

// Verify inheritance
console.log('Timeless extends State:', Timeless.prototype instanceof State)
console.log('Logos extends Mind:', Logos.prototype instanceof Mind)
console.log('Eidos extends Mind:', Eidos.prototype instanceof Mind)

// Verify singletons
const l = logos()
const e = eidos()
console.log('Logos is Mind:', l instanceof Mind)
console.log('Logos parent is null:', l.parent === null)
console.log('Logos origin_state is Timeless:', l.origin_state instanceof Timeless)
console.log('Eidos is Mind:', e instanceof Mind)
console.log('Eidos parent is Logos:', e.parent === l)

console.log('\n✅ All inheritance checks passed!')
```

Run:
```bash
node tmp/check-circular-deps.mjs
```

### 2. Run All Tests

```bash
npm test
```

### 3. Check for Remaining Hacks

```bash
# Should find ZERO results:
grep -r "Object.setPrototypeOf" public/worker/
grep -r "_setup_.*_inheritance" public/worker/
```

### 4. Verify Type Checks

```bash
# Should find ZERO results in State/Mind/Timeless/Logos:
grep "instanceof Timeless" public/worker/state.mjs
grep "instanceof Logos" public/worker/mind.mjs
```

---

## Phase 8: Documentation and Cleanup (~15 minutes)

### 1. Update CHANGELOG.md

Add entry:
```markdown
## [Unreleased] - 2025-XX-XX

### Changed
- **BREAKING:** Refactored State/Mind/Timeless/Logos to use clean inheritance pattern
  - Eliminated circular dependencies between State ↔ Timeless
  - Removed Object.setPrototypeOf hacks in Logos and Timeless
  - All classes now use `_type` property for polymorphic type checking
  - Consolidated property initialization in `_init_properties()` methods
  - See docs/INHERITANCE_PATTERN.md for pattern documentation

### Internal
- State and Mind now allow null parameters (ground_state and parent_mind respectively)
- Timeless and Logos use clean `extends` + `super()` inheritance
- Deserialization uses `Object.create()` + shared `_init_properties()`
- All instanceof checks replaced with `_type` property checks where needed
```

### 2. Remove temporary files

```bash
rm tmp/state_refactored.mjs
rm tmp/mind_refactored.mjs
rm tmp/timeless_refactored.mjs
rm tmp/logos_refactored.mjs
rm tmp/check-circular-deps.mjs  # After testing
```

### 3. Update CURRENT.md (if applicable)

Note the completion of this refactor.

---

## Rollback Plan

If tests fail and fixes aren't obvious:

### 1. Git Revert
```bash
git diff public/worker/state.mjs > state.patch
git diff public/worker/mind.mjs > mind.patch
git diff public/worker/timeless.mjs > timeless.patch
git diff public/worker/logos.mjs > logos.patch

git checkout public/worker/state.mjs
git checkout public/worker/mind.mjs
git checkout public/worker/timeless.mjs
git checkout public/worker/logos.mjs

npm test  # Verify we're back to working state
```

### 2. Debug and Reapply

Review patches, fix issues, reapply incrementally.

---

## Success Criteria

✅ All tests pass
✅ No circular dependency errors during import
✅ No `Object.setPrototypeOf` hacks remain
✅ No `_setup_*_inheritance` callbacks remain
✅ Timeless uses `extends State`
✅ Logos uses `extends Mind`
✅ All classes have `_type` property
✅ State doesn't import Timeless
✅ Mind doesn't import Logos (except for construction)
✅ `tmp/check-circular-deps.mjs` passes all checks

---

## Estimated Timeline

| Phase | Task | Time |
|-------|------|------|
| 1 | Refactor State | 45 min |
| 2 | Refactor Mind | 30 min |
| 3 | Refactor Timeless | 20 min |
| 4 | Refactor Logos | 20 min |
| 5 | Update cosmos.mjs | 5 min |
| 6 | Replace instanceof checks | 15 min |
| 7 | Verify and test | 30 min |
| 8 | Documentation and cleanup | 15 min |
| **Total** | | **~3 hours** |

---

## Next Steps (Future Work)

After this refactor is complete and tested, you can add:

1. **TemporalState** class - strict subclass that requires non-null ground_state
2. **TemporalMind** class - strict subclass that requires non-null parent
3. Gradually migrate normal usage to TemporalState/TemporalMind for stronger type checking
4. Update method signatures to use TemporalState/TemporalMind where appropriate

This can be done incrementally without breaking existing code, since they'll just be stricter versions of State/Mind.
