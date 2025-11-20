# Circular Dependency Solution Plan

## Executive Summary

I've identified 13 circular dependency chains affecting 18 of 20 modules. The good news: **most can be fixed with simple, elegant changes** that work with JSDoc/tsc without async or hacks.

## Solution Strategy

Three tiers of fixes, ordered by impact and simplicity:

### Tier 1: Simple Import Redirects (Breaks 90% of cycles)
**Impact**: Eliminates the central hub, breaking most dependency chains
**Effort**: 15 minutes
**Risk**: Very low

### Tier 2: Remove Unused Imports (Cleanup)
**Impact**: Eliminates 2 direct cycles
**Effort**: 5 minutes
**Risk**: None

### Tier 3: Strategic Refactoring (Optional, for remaining cycles)
**Impact**: Eliminates final 2 direct cycles
**Effort**: 30-60 minutes
**Risk**: Low to medium (design changes)

---

## Tier 1: Fix cosmos ↔ db Hub (CRITICAL - DO THIS FIRST)

### Problem
```
cosmos.mjs ──imports─→ db.mjs ──imports─→ cosmos.mjs
```

This single cycle pulls 18 modules into circular dependencies.

### Root Cause Analysis
**cosmos.mjs line 6:**
```javascript
import * as DB from './db.mjs'  // Only used to re-export
export { DB }  // Line 20
```

**db.mjs line 17:**
```javascript
import { logos, logos_state, eidos, _reset_singletons } from './cosmos.mjs'
```

**Why this exists**: db.mjs needs these singletons for backward compatibility wrappers and reset functionality.

### Solution: Import from Source

**Step 1: Update db.mjs** - Import directly from source files instead of cosmos.mjs

```javascript
// db.mjs - Change line 17
// OLD:
import { logos, logos_state, eidos, _reset_singletons } from './cosmos.mjs'

// NEW:
import { logos, logos_state, _reset_logos } from './logos.mjs'
import { eidos, _reset_eidos } from './eidos.mjs'

// Add after line 18:
/**
 * Reset all singletons (for testing)
 * @internal
 */
export function _reset_singletons() {
  _reset_logos()
  _reset_eidos()
}
```

**Step 2: Update cosmos.mjs** - Remove db.mjs import

```javascript
// cosmos.mjs - Remove lines 6 and 20
// DELETE:
import * as DB from './db.mjs'
export { DB }

// Users should import DB directly:
// import * as DB from './db.mjs'
```

### Impact
- ✅ Breaks the central hub
- ✅ Eliminates 9+ circular chains
- ✅ No behavior changes
- ✅ Backward compatible (users import DB directly)

### Testing
```bash
npm test  # Should pass unchanged
```

---

## Tier 2: Remove Unused Imports

### Fix 2a: archetype.mjs ↔ db.mjs

**Problem**: archetype.mjs imports DB but doesn't use it

**Verification**:
```bash
grep 'DB\.' public/worker/archetype.mjs
# Only appears in comments/error messages
```

**Solution**:
```javascript
// archetype.mjs line 22
// DELETE:
import * as DB from './db.mjs'
```

### Fix 2b: Check other DB imports

Audit remaining files that import DB but may not need the full module:

```bash
# Find all DB imports
grep -n "import.*from.*db\.mjs" public/worker/*.mjs

# For each, verify actual usage:
grep 'DB\.' <file>
```

**Candidates for removal** (imports only for types):
- Files that only use `@typedef {import('./db.mjs').X}` patterns
- Files that call DB functions but could use dependency injection

---

## Tier 3: Remaining Cycles (Optional - Design Decisions Required)

After Tier 1-2, two genuine circular dependencies remain:

### 3a: belief.mjs ↔ subject.mjs

**Why genuine**:
- subject.mjs uses `instanceof Belief` (line 142, 264)
- belief.mjs uses `new Subject()` and Subject methods
- Both need the actual class constructor, not just types

**Options** (ranked by cleanliness):

#### Option 1: Duck Typing (Cleanest, No Cycles)
Replace `instanceof` checks with duck typing:

```javascript
// subject.mjs
// OLD:
assert(belief instanceof Belief, 'Subject must have belief...')

// NEW:
assert(belief?._type === 'Belief', 'Subject must have belief...')
```

**Pros**:
- ✅ Eliminates import entirely
- ✅ Works with JSDoc
- ✅ More flexible (works with deserialized objects)

**Cons**:
- ⚠️  Less type-safe than instanceof
- ⚠️  Requires _type property on all Beliefs (already exists)

#### Option 2: Merge Modules (Simple, No Cycles)
Combine belief.mjs and subject.mjs into single file:

```javascript
// belief-and-subject.mjs
export class Subject { ... }
export class Belief { ... }
```

**Pros**:
- ✅ No circular dependency
- ✅ Co-locates related classes
- ✅ No behavior changes

**Cons**:
- ⚠️  Large file (~1200 lines)
- ⚠️  Breaks module separation

#### Option 3: Lazy Import (Works, Slightly Hacky)
Import inside functions instead of module top-level:

```javascript
// subject.mjs
// Remove: import { Belief } from './belief.mjs'

is_descendant_of(descendant, ancestor) {
  const { Belief } = await import('./belief.mjs')  // Lazy
  if (base instanceof Belief) { ... }
}
```

**Pros**:
- ✅ Breaks cycle
- ✅ Minimal changes

**Cons**:
- ❌ Requires async (you wanted to avoid this)
- ❌ Performance overhead

#### Option 4: Extract Type Checking Utility (Clean, More Work)
Create separate module for type checks:

```javascript
// type-guards.mjs
export function isBelief(obj) {
  return obj?._type === 'Belief'
}

export function isSubject(obj) {
  return obj?.sid != null && obj?.ground_mind != null
}

// subject.mjs
import { isBelief } from './type-guards.mjs'
assert(isBelief(belief), ...)
```

**Pros**:
- ✅ Clean separation
- ✅ Reusable across codebase
- ✅ No cycles

**Cons**:
- ⚠️  New file/concept
- ⚠️  More abstraction

**Recommendation**: **Option 1 (Duck Typing)** - cleanest, already using `_type` property

### 3b: traittype.mjs multi-way cycles

**Problem**: traittype.mjs imports Mind, State, Belief (lines 30-32) and they all import Traittype

**Why genuine**:
- traittype.mjs has `type_class_by_name` map (line ~200) that needs actual constructors
- Used for runtime type resolution and validation

**Options**:

#### Option 1: Lazy Initialization (Clean)
Initialize the type map lazily instead of at module load:

```javascript
// traittype.mjs
let _type_class_by_name = null

function get_type_class_by_name() {
  if (!_type_class_by_name) {
    const { Mind } = require('./mind.mjs')  // or await import()
    const { State } = require('./state.mjs')
    const { Belief } = require('./belief.mjs')

    _type_class_by_name = {
      Mind, State, Belief
      // ... etc
    }
  }
  return _type_class_by_name
}
```

**Pros**:
- ✅ Breaks cycles
- ✅ Minimal behavior change

**Cons**:
- ⚠️  Requires either CommonJS require() or async import()
- ⚠️  Slightly more complex

#### Option 2: Dependency Injection (Cleanest Architecture)
Have classes register themselves with traittype:

```javascript
// traittype.mjs
const type_class_by_name = {}

export function register_type_class(name, constructor) {
  type_class_by_name[name] = constructor
}

// mind.mjs
import { register_type_class } from './traittype.mjs'

export class Mind { ... }

// Self-register after class definition
register_type_class('Mind', Mind)
```

**Pros**:
- ✅ No circular imports
- ✅ Works with JSDoc/tsc
- ✅ No async needed
- ✅ Extensible pattern

**Cons**:
- ⚠️  Registration must happen before use
- ⚠️  Slightly more boilerplate

**Recommendation**: **Option 2 (Dependency Injection)** - most elegant, no hacks

---

## Implementation Plan

### Phase 1: Quick Wins (15 minutes)
1. Apply Tier 1 fix (cosmos ↔ db)
2. Apply Tier 2 fixes (remove unused imports)
3. Run tests
4. **Result**: 90% of cycles eliminated

### Phase 2: Remaining Cycles (30-60 minutes, optional)
1. Apply belief ↔ subject fix (duck typing)
2. Apply traittype fix (dependency injection)
3. Run tests
4. **Result**: 100% of cycles eliminated

### Phase 3: Verification
```bash
# Create script to detect circular dependencies
# (I can create this for you)
npm test  # All tests should pass
```

---

## Why This Works with JSDoc/TypeScript

All solutions preserve type information:

### Duck Typing
```javascript
/** @type {Belief|null} */
const belief = subject.get_belief_by_state(state)
assert(belief?._type === 'Belief', ...)  // Runtime check
```
JSDoc types unchanged, runtime check is simpler.

### Dependency Injection
```javascript
// type-registry.mjs
/** @typedef {import('./mind.mjs').Mind} Mind */

/**
 * @param {string} name
 * @param {new (...args: any[]) => any} constructor
 */
export function register_type_class(name, constructor) { ... }
```
Full type safety maintained, just delayed binding.

---

## Summary Table

| Fix | Impact | Effort | Risk | Recommendation |
|-----|--------|--------|------|----------------|
| Tier 1: cosmos↔db redirect | Breaks 9+ cycles | 15 min | Very Low | **DO IMMEDIATELY** |
| Tier 2: Remove unused imports | Breaks 1-2 cycles | 5 min | None | **DO IMMEDIATELY** |
| Tier 3a: belief↔subject duck typing | Breaks 1 cycle | 15 min | Low | **RECOMMENDED** |
| Tier 3b: traittype DI pattern | Breaks multi-way | 30 min | Low | **RECOMMENDED** |

**Total effort for 100% fix**: ~60-75 minutes
**Effort for 90% fix**: ~20 minutes

---

## Next Steps

**I recommend**:
1. Start with Tier 1 + 2 (20 minutes, huge impact)
2. Run tests to verify
3. Decide if you want to tackle Tier 3 now or later

**Would you like me to**:
- Implement Tier 1 fixes immediately?
- Create all fixes in a single pass?
- Create a circular dependency detection script first?

Let me know your preference!
