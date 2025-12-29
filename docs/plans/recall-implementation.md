# Recall Implementation Plan

## Overview

This plan implements recall functions to query what a mind knows, returning `Trait` objects with certainty. Replaces `query_possibilities()` and `query_beliefs()`.

**Design Reference**: `docs/notes/combinatorial-explosion-components.md`

**Key insight**: Recall returns reified `Trait` objects that carry context (subject, source belief, certainty). Two functions serve different lookup patterns:

**Time terminology**:
- `tt` = transaction time: when the mind recorded the belief (what mind knows at this moment)
- `vt` = valid time: what time period the belief is about (past memories, future expectations)

```javascript
// Direct lookup by subject - yields traits (iterator for early exit)
*mind.recall_by_subject(ground_state, subject, tt, request_traits?) → Iterator<Trait>

// Search by archetype - yields [subject, traits] pairs grouped by subject
*mind.recall_by_archetype(ground_state, archetype, tt, request_traits) → Iterator<[Subject, Trait[]]>
```

---

## Implementation Order

### Phase 1: Trait Class (Foundation) ✅

**File**: `public/worker/trait.mjs`

```javascript
class Trait {
  subject    // Subject - what entity this is about
  type       // Traittype - what kind of trait
  value      // any - the actual value
  source     // Belief - where this came from
  certainty  // number (0.0-1.0) - combined path x belief certainty
}
```

**Tasks**:
- [x] Create Trait class with constructor
- [x] Add sysdesig() for debugging
- [x] Add toJSON() for serialization
- [x] Export from cosmos.mjs

**Tests**: `test/trait.test.mjs` (8 tests) ✅

### Phase 2: recall_by_subject (Direct Lookup) ✅

**File**: `public/worker/mind.mjs`

```javascript
*recall_by_subject(ground_state, subject, tt, request_traits?) → Iterator<Trait>
```

Yields requested traits for a known subject (iterator allows early exit). If superposition exists (multiple beliefs for same subject), returns multiple Traits of same type with different values/certainties.

**Tasks**:
- [x] Find states at ground_state + tt
- [x] Get belief(s) for subject across states
- [x] Build Trait for each requested trait (or all if omitted)
- [x] Compute combined certainty (path certainty only for now)
- [x] Handle superposition (multiple beliefs → multiple Traits)

**Tests**: `test/recall.test.mjs` (8 tests, + 4 for recall_by_archetype = 12 total) ✅
- [x] Single belief, single trait
- [x] Single belief, multiple traits
- [x] Superposition: two beliefs → two Traits for same type
- [x] Missing subject → empty array
- [x] Omit request_traits → all traits returned
- [x] Path certainty tests (certain, branched, nested)

### Phase 3: recall_by_archetype (Search + Recall) ✅

**File**: `public/worker/mind.mjs`

```javascript
*recall_by_archetype(ground_state, archetype, tt, request_traits) → Iterator<[Subject, Trait[]]>
```

Searches for beliefs by archetype, groups by subject, returns requested traits for each.

**Tasks**:
- [x] Find states at ground_state + tt (uses states_at_tt)
- [x] Get beliefs by archetype across states
- [x] Group by subject
- [x] For each subject, build Trait[] for requested traits
- [x] Yield [Subject, Trait[]] pairs

**Tests**: `test/recall.test.mjs` (4 tests) ✅
- [x] Find tools, get color/location traits
- [x] Multiple subjects of same archetype
- [x] Superposition within subject
- [x] No matches → empty iterator

### Phase 4: Path Certainty ✅

**Tasks**:
- [x] Compute path_certainty by walking state base chain
- [x] Cache path_certainty on locked states
- [x] Combined: path_certainty × belief_certainty

**Tests**: `test/recall.test.mjs` (path certainty + belief certainty sections)
- [x] Certain state → certainty 1.0
- [x] Branched state with 0.7 → traits have 0.7
- [x] Nested branches → certainty multiplies

### Phase 5: Component Trait Path Access ✅

Dot notation access to nested component traits via `belief.get_trait_path(state, path)`.

**File**: `public/worker/belief.mjs`

```javascript
// Get trait value following a path through Subject references
// Returns Trait with combined certainty, or undefined if path broken
belief.get_trait_path(state, 'handle.color') → Trait
```

**Tasks**:
- [x] Add `get_trait_path(state, path)` to Belief class
- [x] Update `recall_by_subject()` to handle dot notation in request_traits
- [x] Update `recall_by_archetype()` to handle dot notation in request_traits

**Tests**: `test/recall.test.mjs` (8 get_trait_path tests + 3 path-based recall tests)
- [x] Single segment returns direct trait
- [x] Two segments follows Subject reference (e.g., 'handle.color')
- [x] Three segments follows nested references
- [x] Returns undefined for broken path
- [x] Accumulates certainty through path
- [x] recall_by_subject with dot notation
- [x] recall_by_archetype with dot notation

---

## API Design

### recall_by_subject

```javascript
// What do I know about the hammer's location? (spread to array)
const traits = [...mind.recall_by_subject(ground, hammer_subject, tt, ['location'])]
// → [Trait{location, workshop, 0.7}, Trait{location, shed, 0.3}]

// Early exit when first match found
for (const trait of mind.recall_by_subject(ground, hammer_subject, tt, ['color'])) {
  if (trait.value === 'black') break  // Found it, stop iterating
}

// All traits about hammer
const traits = [...mind.recall_by_subject(ground, hammer_subject, tt)]
// → [Trait{color, black, 1.0}, Trait{weight, 2, 1.0}, ...]
```

### recall_by_archetype

```javascript
// Find tools, get their color and location
for (const [subject, traits] of mind.recall_by_archetype(ground, 'Tool', tt, ['color', 'location'])) {
  const color = traits.find(t => t.type.label === 'color')
  if (color?.value === 'black') {
    // Found a black tool
  }
}
```

### Certainty

```
trait_certainty = path_certainty × belief_certainty

path_certainty = product of @certainty at state split points
belief_certainty = belief's own @certainty (default 1.0)
```

### Uncertainty Representation

- **Superposition**: Multiple Traits with same type, different values/certainties
- **Unknown**: No Trait for that type in result
- **Certain**: Single Trait with certainty 1.0

---

## Relation to Existing Code

| Function | Purpose | Returns | Status |
|----------|---------|---------|--------|
| `query_possibilities()` | Search by archetype+traits | Belief iterator | → migrate to `recall_by_archetype` |
| `query_beliefs()` | Single state search | Belief iterator | → migrate to `state.recall_by_subject` |
| `recall_by_subject()` | Lookup by subject | **Trait[]** | NEW |
| `recall_by_archetype()` | Search by archetype | **Iterator<[Subject, Trait[]]>** | NEW |

## Files to Modify/Create

| File | Action | Phase |
|------|--------|-------|
| `public/worker/trait.mjs` | Create | 1 ✅ |
| `public/worker/cosmos.mjs` | Add export | 1 ✅ |
| `test/trait.test.mjs` | Create | 1 ✅ |
| `public/worker/mind.mjs` | Add recall methods | 2-4 ✅ |
| `public/worker/state.mjs` | Add _cached_path_certainty | 4 ✅ |
| `public/worker/belief.mjs` | Add get_trait_path() | 5 ✅ |
| `test/recall.test.mjs` | Create | 2-5 ✅ |

## Completion Checklist

- [x] Phase 1: Trait class
- [x] Phase 2: recall_by_subject
- [x] Phase 3: recall_by_archetype
- [x] Phase 4: Path certainty (done as part of Phase 2)
- [x] Phase 4b: Belief certainty (combined certainty = path_certainty × belief_certainty)
- [x] Phase 5: Component trait path access (get_trait_path, dot notation)
- [ ] Update CHANGELOG.md
- [x] Remove deprecated query_possibilities/query_beliefs
