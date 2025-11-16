# Trait Inheritance - Test Coverage Summary

## Quick Reference

This document provides a high-level overview of trait inheritance permutations and test coverage status.

## What is Trait Inheritance?

Traits can be inherited through multiple paths:
- **Archetypes**: Type definitions (e.g., `Person`, `PortableObject`)
- **Belief Bases**: Previous versions or parent beliefs
- **Shared Beliefs**: Prototypes in Eidos (cultural/shared knowledge)
- **Multiple Bases**: Diamond inheritance from multiple sources

## Coverage Overview

| Priority | Category | Tests | Status |
|----------|----------|-------|--------|
| **P1** | Simple non-composable traits | 8 | ✅ **100%** |
| **P1** | Composable arrays (basic) | 5 | ✅ **100%** |
| **P1** | Subject references | 4 | ⚠️  **25%** - Missing 3 |
| **P1** | Composable edge cases | 4 | ❌ **0%** - Missing all |
| **P2** | Diamond inheritance | 2 | ❌ **0%** |
| **P2** | Mixed sources | 1 | ❌ **0%** |
| **P3** | Mind/State from archetypes | 2 | ⚠️  **50%** |

**Overall: 22/42 cases tested (52%)**

---

## Critical Missing Tests (Priority 1)

### 1. Composable null blocking (NOT TESTED)
**What**: Does `null` prevent composition from bases?

```javascript
warrior.inventory = [sword]
pacifist.bases = [warrior]
pacifist.inventory = null  // Block inheritance?

pacifist.get_trait(state, 'inventory')
// → null (blocks) OR [sword] (composes anyway)?
```

**Where**: `tmp/trait_inheritance_comprehensive.test.mjs` test 3.6

### 2. Composable empty array (NOT TESTED)
**What**: How does `[]` behave in composable traits?

```javascript
warrior.inventory = [sword]
stripped.bases = [warrior]
stripped.inventory = []

stripped.get_trait(state, 'inventory')
// → [] (blocks) OR [sword] (empty contribution)?
```

**Where**: `tmp/trait_inheritance_comprehensive.test.mjs` test 3.7

### 3. Non-composable Subject arrays (NOT TESTED)
**What**: Arrays that shadow instead of compose

```javascript
children: {
  type: 'Person',
  container: Array,
  composable: false  // ← Shadows like primitives
}

parent1.children = [child1]
parent2.children = [child2]
combined.bases = [parent1, parent2]

combined.get_trait(state, 'children')
// → [child1] (first wins, doesn't compose)
```

**Where**: `tmp/trait_inheritance_comprehensive.test.mjs` test 2.4

### 4. Archetype with Subject defaults (NOT TESTED)
**What**: Can archetypes have default belief references?

```javascript
Archetype: Blacksmith {
  traits: {
    workplace: 'DefaultForge'  // Subject reference default
  }
}

blacksmith.bases = ['Blacksmith']
blacksmith.get_trait(state, 'workplace')
// → DefaultForge subject
```

**Where**: `tmp/trait_inheritance_comprehensive.test.mjs` test 2.2 & 6.3

---

## Important Edge Cases (Priority 2)

### 5. Diamond archetype conflict (PARTIAL)
**What**: Same trait defined in multiple archetype paths

```javascript
Magical { combat_style: 'defensive' }
Physical { combat_style: 'offensive' }
Spellblade.bases = ['Magical', 'Physical']

spellblade.get_trait(state, 'combat_style')
// → 'defensive' (first base wins)
```

**Status**: Archetype diamond tested, but not explicit conflicts
**Where**: `tmp/trait_inheritance_comprehensive.test.mjs` test 1.6

### 6. Composable diamond dedup (NOT TESTED)
**What**: Same item via multiple inheritance paths

```javascript
Base.inventory = ['token']
Left.bases = ['Base'], inventory = ['sword']
Right.bases = ['Base'], inventory = ['shield']
Diamond.bases = ['Left', 'Right']

diamond.get_trait(state, 'inventory')
// → [token, sword, shield] - token only once!
```

**Where**: `tmp/trait_inheritance_comprehensive.test.mjs` test 3.8

### 7. Mixed archetype + belief composition (NOT TESTED)
**What**: Composing from both archetype and belief sources

```javascript
Archetype: Villager { inventory: ['token'] }
guard_proto (belief).inventory = ['sword']
guard.bases = ['Villager', guard_proto]

guard.get_trait(state, 'inventory')
// → [token, sword]
```

**Where**: `tmp/trait_inheritance_comprehensive.test.mjs` test 3.9

### 8. Null vs absence (NOT EXPLICITLY TESTED)
**What**: Can we distinguish `color: null` from not setting color?

```javascript
obj._traits.has(color_traittype)
// true if explicitly set to null
// false if never set
```

**Where**: `tmp/trait_inheritance_comprehensive.test.mjs` test 1.8

---

## Files Created

1. **`tmp/trait_inheritance_matrix.md`** (16KB)
   - Complete permutation matrix with 42 test cases
   - Organized by inheritance source, trait type, composition behavior
   - Includes test case IDs and references

2. **`tmp/trait_inheritance_comprehensive.test.mjs`** (24KB)
   - Comprehensive test suite for missing permutations
   - Organized by priority (P1, P2, P3)
   - Ready to run (uses existing test helpers)

3. **`tmp/TRAIT_INHERITANCE_SUMMARY.md`** (this file)
   - Quick reference for developers
   - High-level overview of gaps

---

## How to Use These Files

### For Understanding the System
1. Read this summary for high-level gaps
2. Check `trait_inheritance_matrix.md` for complete catalog
3. Look at existing tests referenced in the matrix

### For Adding Tests
1. Copy tests from `trait_inheritance_comprehensive.test.mjs`
2. Move to appropriate existing test file OR
3. Create new test file in `test/` directory
4. Run: `npm test`

### For Verifying Behavior
Many missing tests are actually **behavior verification** tests - we don't know the answer until we run them!

**Example**: Does `null` block composition?
- The code suggests yes (line 206 in `belief.mjs`: `if (value !== null)`)
- But no test explicitly verifies this behavior
- Test will document the actual behavior

---

## Next Steps

### Immediate (P1)
1. **Run the comprehensive test suite** to see which tests pass
2. **Fix failing tests** OR document actual behavior
3. **Answer open questions**:
   - Does null block composition? (Expected: yes)
   - Does [] block composition? (Expected: no, empty contribution)
   - Are non-composable arrays supported? (Expected: yes)

### Short-term (P2)
1. Add diamond deduplication test
2. Add mixed composition test
3. Document conflict resolution order

### Long-term (P3)
1. Document Mind/State trait inheritance fully
2. Add edge case tests for completeness
3. Consider whether composable Mind arrays make sense

---

## Questions for Implementation Review

1. **Null blocking**: Confirmed behavior? Test suggests yes, but not verified.

2. **Empty array**: Should `[]` be treated as:
   - Empty contribution (composes to base values)
   - Blocking value (like null)
   - Distinguish from undefined?

3. **Non-composable arrays**: Is this a real use case?
   - Code supports it (`composable: false` on array types)
   - No tests verify shadowing behavior
   - Are there any real-world examples?

4. **Archetype defaults**: Can/should archetypes have Subject defaults?
   - Code allows it (string labels in archetype traits)
   - Circular dependency issues?
   - Initialization order?

5. **Conflict resolution**: Document the breadth-first search order
   - First base in `bases` array wins
   - This is subtle and should be documented

---

## Test Statistics

**Current Coverage**: 22/42 test cases (52%)

**By Priority**:
- P1 (Critical): 13/21 cases (62%)
- P2 (Important): 0/11 cases (0%)
- P3 (Documentation): 9/10 cases (90%)

**By Category**:
- Simple traits: 8/8 (100%)
- Subject references: 1/4 (25%)
- Composable arrays: 7/9 (78%)
- Mind traits: 1/4 (25%)
- State traits: 1/3 (33%)
- Archetypes: 2/4 (50%)
- Edge cases: 2/10 (20%)

**Most Critical Gaps**:
1. Composable blocking (null, [])
2. Non-composable arrays
3. Diamond deduplication
4. Mixed composition

---

## Implementation Notes

The trait inheritance system uses **breadth-first search** through the `_bases` chain:

```javascript
// From belief.mjs:369
const queue = [...this._bases]
while (queue.length > 0) {
  const base = queue.shift()
  const value = base.get_own_trait_value(traittype)
  if (value !== undefined) return value
  queue.push(...base._bases)
}
```

**Composable traits** collect values from ALL bases before composing:

```javascript
// From belief.mjs:384
collect_latest_value_from_all_bases(traittype) {
  const values = []
  // Walk all bases, collect one value per base chain
  return values
}
```

**Deduplication** happens via Set in composition:

```javascript
// From traittype.mjs (composable_subjects)
const seen = new Set()  // Dedup by Subject reference
```

These implementation details should guide test expectations.
