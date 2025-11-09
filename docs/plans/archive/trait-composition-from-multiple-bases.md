# Trait Composition from Multiple Bases

**Status**: Archived - Array composition implemented 2025-01-09, Mind composition pending
**Created**: 2025-01-08
**Context**: Discovered during UnionState implementation (P1.1 test failure)

**Implementation Note**: This design doc explored multiple options. The implemented solution follows **Option E (Traittype-defined Strategy)** with **Option B (Composable marker)** for the interface. Each traittype with a class (Mind, etc.) implements its own `compose()` method, and `Traittype` delegates to it. Array container types use built-in composition logic in `Traittype.compose()`.

## Problem Statement

When a belief has multiple bases that each provide the same trait, how should `get_trait()` resolve the value?

**Example scenario:**
```javascript
// Both Villager and Blacksmith have 'mind' traits
bases: ['Villager', 'Blacksmith']
traits: {}  // No explicit mind provided
```

**Current behavior:**
- `Belief.get_trait()` walks bases left-to-right, returns first match
- VillageBlacksmith would only get Villager's mind
- Blacksmith's mind is ignored

**Test expectation (P1.1):**
- VillageBlacksmith should have knowledge from BOTH Villager and Blacksmith minds
- UnionState created to merge both component_states

## Design Questions

### 1. Composition Strategy

**When should trait composition happen?**

**Option A: First Wins (current)**
- Simple, predictable
- Con: Later bases ignored (information loss)
- Con: No way to compose multiple values

**Option B: Last Wins**
- Simple override pattern
- Con: Still loses earlier bases
- Con: No way to compose all values

**Option C: Opt-in Composition**
- Explicit trait in template triggers composition
- `bases: ['V', 'B']` → first wins
- `bases: ['V', 'B'], mind: {}` → compose both
- Pro: Clear intent, no magic
- Con: Verbose, easy to forget

**Option D: Automatic Composition**
- Detect multiple values, compose automatically
- Pro: DRY, natural behavior
- Con: May be surprising, needs composition rules

**Option E: Traittype-defined Strategy** ✓ **IMPLEMENTED**
- Each traittype declares composition behavior
- Some types compose (Mind), others override (location)
- Pro: Flexible, semantic
- Con: Complex, requires infrastructure

### 2. Mind Traittype Composition

**For the specific case of Mind traits:**

**Scenario 1: No mind trait provided**
```javascript
bases: ['Villager', 'Blacksmith']
traits: {}
```
Options:
- A: Inherit Villager's mind only (first wins)
- B: Create UnionState from both minds automatically ✓ **IMPLEMENTED**
- C: Error - ambiguous, must specify

**Scenario 2: Empty mind template**
```javascript
bases: ['Villager', 'Blacksmith']
traits: {mind: {}}
```
Options:
- A: Create empty mind (override, ignore bases)
- B: Create UnionState from both bases ✓ **IMPLEMENTED**
- C: Same as scenario 1 (empty template = no template)

**Scenario 3: Mind template with new knowledge**
```javascript
bases: ['Villager', 'Blacksmith']
traits: {mind: {foo: ['bar']}}
```
Options:
- A: Create new mind, learn foo, ignore bases
- B: Create UnionState from bases, then learn foo ✓ **IMPLEMENTED**
- C: Inherit first base, extend with foo (current for single base)

### 3. General Trait Composition

**Should composition be generalized beyond Mind?**

Examples:
- `inventory: [items]` - Merge arrays from multiple bases? ✓ **IMPLEMENTED**
- `skills: {name: level}` - Merge skill maps?
- `color: 'red'` - Can't compose primitives, must override

**Composition Interface Options:**

**Option A: No generalization**
- Mind trait is special-cased
- Other traits use first-wins
- Pro: Simple, focused
- Con: Not extensible

**Option B: Composable marker** ✓ **IMPLEMENTED**
- Traittypes declare `composable: true`
- Must implement `compose(values[]) → value`
- Pro: Extensible, opt-in
- Con: Adds complexity

**Option C: Container-aware**
- Arrays automatically concatenate
- Objects automatically merge
- Primitives override (last wins)
- Pro: Intuitive for common cases
- Con: May not match semantic intent

## Current Test Expectations

**P1.1 test** (integration.test.mjs:404-523):
```javascript
// Create Villager with mind knowing tavern
Villager: {mind: {tavern: ['location']}}

// Create Blacksmith with mind knowing workshop
Blacksmith: {mind: {workshop: ['location']}}

// Create VillageBlacksmith from both
VillageBlacksmith: {
  bases: ['Villager', 'Blacksmith']
  // No explicit mind trait
}

// EXPECTS:
// - vb_mind.origin_state is UnionState
// - vb_state.get_beliefs() returns knowledge from BOTH bases
// - No duplication
```

## Implementation Considerations

### Traittype Resolution Location

Currently `Mind.resolve_trait_value_from_template()` detects multiple base minds and creates UnionState. This happens during trait resolution.

**Question**: Should composition logic live in:
- A: Individual trait resolution (Mind.resolve_trait_value_from_template)
- B: Belief.get_trait() (lookup time) ✓ **IMPLEMENTED**
- C: Belief.from_template() (creation time) ✓ **IMPLEMENTED**
- D: Traittype infrastructure (general pattern) ✓ **IMPLEMENTED**

**Answer**: Both B and C. Composition happens in two places:
- **Creation time** (C): `Belief.add_trait_from_template()` composes when adding trait
- **Lookup time** (B): `Belief.get_trait()` composes and caches when accessing trait

### Backwards Compatibility

- Existing single-base beliefs must continue working
- `mind: {}` currently creates empty mind with base inheritance
- Cannot break existing behavior

## Implemented Design

**Chosen strategy**: Option E (Traittype-defined) + Option B (Composable marker)

**Key decisions**:
1. Traittypes opt-in via `composable: true` flag
2. Type classes implement `static compose(values)` method
3. `Traittype.compose()` delegates to type class if available, else uses Array logic
4. Composition happens at both creation and lookup time
5. Explicit `null` blocks composition from that branch
6. Empty arrays/templates don't block composition

**Implementation files**:
- `public/worker/traittype.mjs` - Delegation in `compose()`
- `public/worker/belief.mjs` - Composition at creation and lookup
- `public/worker/mind.mjs` - `Mind.compose()` method (pending)
- `test/composable_traits.test.mjs` - Array composition tests
- `test/integration.test.mjs` - P1.1 test (currently skipped, pending Mind.compose())

## Implementation Plan (After Design Decision)

1. ✓ Document chosen strategy in SPECIFICATION.md
2. ✓ Update Traittype interface (composable flag, compose method delegation)
3. ✓ Implement Array composition in Traittype.compose()
4. ⏳ Implement Mind.compose() static method
5. ⏳ Update P1.1 test to unskip
6. ✓ Test edge cases (deduplication, null blocking, temporal composition)

## Related

- `docs/plans/union-state.md` - UnionState for multi-parent minds
- `CURRENT.md` - UnionState backlog item
- `test/integration.test.mjs:404` - P1.1 test expecting composition
