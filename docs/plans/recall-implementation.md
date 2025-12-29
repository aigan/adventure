# Recall Implementation Plan

## Overview

This plan implements recall functions to query what a mind knows, returning `Trait` objects with certainty. Replaces `query_possibilities()` and `query_beliefs()`.

**Design Reference**: `docs/notes/combinatorial-explosion-components.md`

**Key insight**: Recall returns reified `Trait` objects that carry context (subject, source belief, certainty). Two functions serve different lookup patterns:

```javascript
// Direct lookup by subject - returns array of requested traits
mind.recall_by_subject(ground_state, subject, vt, request_traits?) → Trait[]

// Search by archetype - returns iterator grouped by subject
mind.recall_by_archetype(ground_state, archetype, vt, request_traits) → Iterator<[Subject, Trait[]]>
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

### Phase 2: recall_by_subject (Direct Lookup)

**File**: `public/worker/mind.mjs`

```javascript
recall_by_subject(ground_state, subject, vt, request_traits?) → Trait[]
```

Returns requested traits for a known subject. If superposition exists (multiple beliefs for same subject), returns multiple Traits of same type with different values/certainties.

**Tasks**:
- [ ] Find states at ground_state + vt
- [ ] Get belief(s) for subject across states
- [ ] Build Trait for each requested trait (or all if omitted)
- [ ] Compute combined certainty (path x belief)
- [ ] Handle superposition (multiple beliefs → multiple Traits)

**Tests**: `test/recall.test.mjs`
- [ ] Single belief, single trait
- [ ] Single belief, multiple traits
- [ ] Superposition: two beliefs → two Traits for same type
- [ ] Missing subject → empty array
- [ ] Omit request_traits → all traits returned

### Phase 3: recall_by_archetype (Search + Recall)

**File**: `public/worker/mind.mjs`

```javascript
*recall_by_archetype(ground_state, archetype, vt, request_traits) → Iterator<[Subject, Trait[]]>
```

Searches for beliefs by archetype, groups by subject, returns requested traits for each.

**Tasks**:
- [ ] Find states at ground_state + vt (ordered by certainty)
- [ ] Get beliefs by archetype across states
- [ ] Group by subject
- [ ] For each subject, build Trait[] for requested traits
- [ ] Yield [Subject, Trait[]] pairs

**Tests**:
- [ ] Find tools, get color/location traits
- [ ] Multiple subjects of same archetype
- [ ] Superposition within subject
- [ ] No matches → empty iterator

### Phase 4: Path Certainty

**Tasks**:
- [ ] Compute path_certainty by walking state base chain
- [ ] Cache path_certainty on locked states
- [ ] Combined: path_certainty × belief_certainty

**Tests**:
- [ ] Certain state → certainty 1.0
- [ ] Branched state with 0.7 → traits have 0.7
- [ ] Nested branches → certainty multiplies

### Phase 5: Component Flattening (Optional)

Handle @about refs to include component traits.

**Tasks**:
- [ ] Detect Subject trait values with @about pattern
- [ ] Recurse into component beliefs
- [ ] Include component traits in result (with component's subject)

**Tests**:
- [ ] Hammer with handle/head → includes handle.color, head.material

---

## API Design

### recall_by_subject

```javascript
// What do I know about the hammer's location?
const traits = mind.recall_by_subject(ground, hammer_subject, vt, ['location'])
// → [Trait{location, workshop, 0.7}, Trait{location, shed, 0.3}]

// All traits about hammer
const traits = mind.recall_by_subject(ground, hammer_subject, vt)
// → [Trait{color, black, 1.0}, Trait{weight, 2, 1.0}, ...]
```

### recall_by_archetype

```javascript
// Find tools, get their color and location
for (const [subject, traits] of mind.recall_by_archetype(ground, 'Tool', vt, ['color', 'location'])) {
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
| `public/worker/mind.mjs` | Add recall methods | 2-4 |
| `test/recall.test.mjs` | Create | 2-4 |

## Completion Checklist

- [x] Phase 1: Trait class
- [ ] Phase 2: recall_by_subject
- [ ] Phase 3: recall_by_archetype
- [ ] Phase 4: Path certainty
- [ ] Phase 5: Component flattening (optional)
- [ ] Update CHANGELOG.md
- [ ] Remove deprecated query_possibilities/query_beliefs
