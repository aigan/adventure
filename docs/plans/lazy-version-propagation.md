# Lazy Version Propagation with Branching Resolution

**Goal**: Enable efficient updates to shared cultural beliefs without cascading version creation across millions of NPCs. Beliefs lazily resolve inherited traits through branch detection and state-based resolution, only materializing new versions when explicitly created.

**Related**:
- docs/notes/version_propagation.md - Core design sketch from Claude Opus discussion
- docs/SPECIFICATION.md - Data model specification
- CURRENT.md (backlog) - Clarify shared belief architecture

## Current Status (December 2024)

**Implemented:**
- ✅ `Fuzzy` class (`public/worker/fuzzy.mjs`) - uncertain trait values with alternatives
- ✅ `Notion` class (`public/worker/notion.mjs`) - materialized belief view for a subject
- ✅ `unknown()` singleton - represents undetermined value (Fuzzy with no alternatives)
- ✅ `Mind.recall()` returns Notion with Fuzzy trait values when uncertain
- ✅ Path certainty computation with caching (`Mind._compute_path_certainty()`)
- ✅ Promotion tracking on Beliefs (Phase 1)
- ✅ State resolver interface `pick_promotion()` (Phase 2)
- ✅ Trait resolution walks promotions (Phase 3)
- ✅ Materialization on creation - Eidos-only constraint + opportunistic flattening (Phase 4)

**Not Yet Implemented:**
- Phase 6: Superposition handling (`collapse_trait()` for explicit collapse)
- Phase 7: Documentation and examples

## Context

When country-level cultural knowledge updates (e.g., "it's winter now"), thousands of NPCs inherit this knowledge through city → country belief chains. Current architecture would require creating new versions for every intermediate node (cities, NPCs), causing version cascade.

**The Problem**:
```
country_v1 → country_v2 (winter arrives)

Without lazy propagation:
- Must create city_v2 for each city (100 versions)
- Must create npc_v2 for each NPC (millions of versions)
- Total: millions of new belief objects

With lazy propagation:
- Create only country_v2 (1 version)
- Cities/NPCs query traits → resolver walks to country_v2
- Only materialize intermediate versions when NPCs explicitly diverge
- Total: O(changes) not O(NPCs)
```

**Key insight**: Only the updated node has branches (is "dirty"). City beliefs remain clean - they inherit from a node that has branches. Trait resolution walks the chain and uses the state's resolver to pick the appropriate branch.

## Core Design Principles

1. **Beliefs are never dirty** - only nodes with branches need resolver evaluation
2. **Single belief per subject** - `get_belief_by_subject()` returns one belief
3. **Traits may be uncertain** - `recall()` returns `Notion` with `Fuzzy` values when uncertain
4. **Lazy materialization** - only create versions when explicitly requested
5. **Resolver decides or defers** - temporal/spatial cases return concrete values, probability cases return `Fuzzy`
6. **Materialization on explicit creation** - creating new belief version walks bases and materializes dirty intermediate nodes

### Implemented Classes

**Fuzzy** (`public/worker/fuzzy.mjs`):
- Represents uncertain trait values with weighted alternatives
- `alternatives: Array<{value: any, certainty: number}>` - possible values
- `is_unknown` getter - true when no alternatives (undetermined value)
- `unknown()` singleton - standard way to express "not yet determined"

**Notion** (`public/worker/notion.mjs`):
- Materialized view of what a Mind believes about a subject
- `subject: Subject` - what entity this notion is about
- `traits: Map<Traittype, null|*|Fuzzy>` - trait values (null, concrete, or Fuzzy)
- Created by `Mind.recall()` to answer questions like "where is the black hammer?"

## Architecture Overview

### Promotion Tracking

**Terminology**: "Promotions" are beliefs that propagate to children of their base. This is distinct from general "branching" (any belief with bases). Promotions enable lazy version propagation.

```javascript
BeliefNode {
  subject: Subject           // Identity (shared across versions)
  _id: number               // Version ID (unique per version)
  traits: Map<string, value>
  bases: Set<Belief|Archetype>
  promotions: Set<Belief>   // Beliefs that propagate to children of this belief

  // Direct properties (instead of branch_metadata sub-object):
  origin_state: State|null  // State where this was created (for temporal filtering)
  certainty: number|null    // Probability weight (null = not a probability promotion)
  constraints: Object       // Future: exclusion rules, validity periods
}
```

**Certainty semantics:**
- `certainty: null` (default) — Not a probability state. The timeline/branch may still be uncertain for other reasons, but not probability-weighted.
- `certainty: <number>` — Probability state. Must be > 0 and < 1. Represents genuine uncertainty about which branch is true, with this weight.
  - Values at boundaries (0 or 1) indicate impossible/certain branches, which should be handled differently (pruned or promoted)
  - assert(certainty > 0 && certainty < 1) when setting non-null certainty

**Separation of concerns:**
- `promote: true` — registers in `parent.promotions`, will propagate to children of parent
- `certainty` — probability weight (orthogonal to promotion)
- `origin_state` — temporal filtering (always = state parameter, not configurable)
- `replace()` — handles removal, NOT `branch()`

### Resolution Flow

```
Query: npc_belief.get_trait(state, 'season')

1. Check npc_belief.traits.season → not found
2. Walk bases: npc_belief → city_belief
3. Check city_belief.traits.season → not found
4. Walk bases: city_belief → country_culture_v1
5. Check country_culture_v1.promotions → [country_v2@T110, country_v3@T150]
6. Call state.pick_promotion([v2, v3], context)
7. Resolver filters by timestamp:
   - state.tt = T110
   - v2.origin_state.tt = T110 ✓
   - v3.origin_state.tt = T150 ✗
8. Resolver returns country_v2 (single choice)
9. Continue: country_v2.traits.season → 'winter'
10. Return 'winter' (concrete value)
```

### Superposition Flow

```
Query: mind.recall(state, subject, ['king_status'])

1-4. Same walk to country_culture_v1
5. Check promotions → [v2a@T110 (p=0.6), v2b@T110 (p=0.4)]
6. Call state.pick_promotion([v2a, v2b], context)
7. Resolver sees both valid (same timestamp, probability-weighted)
8. Resolver returns superposition (can't decide)
9. Return Notion with Fuzzy trait:
   Notion {
     subject: king_subject,
     traits: Map {
       king_status => Fuzzy {
         alternatives: [
           {value: 'dead', certainty: 0.6},
           {value: 'alive', certainty: 0.4}
         ]
       }
     }
   }
```

### Superposition with Same Values

When multiple promotions yield the **same value**, `Mind.recall()` aggregates them into a single Fuzzy with combined alternatives:

```javascript
// Branch A (0.6): hammer.location = workshop (from belief_a)
// Branch B (0.4): hammer.location = workshop (from belief_b)

// recall() returns Notion with Fuzzy containing both alternatives:
Notion {
  subject: hammer,
  traits: Map {
    location => Fuzzy {
      alternatives: [
        {value: workshop, certainty: 0.6},  // from belief_a
        {value: workshop, certainty: 0.4}   // from belief_b
      ]
    }
  }
}
```

**Current implementation** (`mind.mjs:805-830`): Collects values into a Map, creates Fuzzy when multiple alternatives exist. Same values from different sources remain as separate alternatives (preserving provenance).

**Caller aggregation example**:
```javascript
const notion = mind.recall(state, hammer, ['location'])
const location = notion.get(location_tt)  // Fuzzy or concrete
if (location instanceof Fuzzy) {
  // Sum certainties for same value if needed
  const by_value = Map.groupBy(location.alternatives, a => a.value?.sid ?? a.value)
  // by_value.get(workshop_sid) → [{certainty: 0.6}, {certainty: 0.4}]
  // Sum: 1.0 = certain
}
```

### Materialization Flow

```
Creating new NPC version:

npc_v2 = Belief.from_template(npc_mind, {
  sid: npc_v1.subject.sid,
  bases: [npc_v1],
  traits: {opinion: 'I disagree'}  // New personal trait
})

Materialization process:
1. Walk npc_v1 → city_v1 → country_v1
2. Detect country_v1.promotions → [country_v2]
3. Resolver picks country_v2 (temporal filter)
4. Create city_v2 {sid: city_v1.sid, bases: [city_v1, country_v2]}
5. Update npc_v2.bases = [npc_v1, city_v2]
6. Insert city_v2 and npc_v2 into state

Next NPC:
1. Walk npc2_v1 → city_v1 → country_v1
2. Detect country_v1.promotions → [country_v2]
3. Resolver picks country_v2
4. Find existing city_v2 (same subject, inherits from country_v2)
5. Reuse city_v2! Update npc2_v2.bases = [npc2_v1, city_v2]
6. Insert only npc2_v2 (city_v2 already materialized)
```

## Implementation Phases

### Phase 1: Add Promotion Tracking to Beliefs ✅ COMPLETE

**Files**: `public/worker/belief.mjs`

**Changes** (implemented with new terminology):
- Add `promotions: Set<Belief>` to Belief class
- Add direct properties instead of metadata object:
  - `origin_state: State|null` - state where promotion was created
  - `certainty: number|null` - probability weight (null = not probability)
  - `constraints: Object` - future extensibility
- Update `branch()` to support `promote: true` option:
  ```javascript
  branch(state, traits = {}, { promote, certainty, constraints } = {}) {
    const branched = new Belief(state, this.subject, [this])
    // ... add traits ...
    if (promote) {
      branched.origin_state = state
      branched.certainty = certainty ?? null
      branched.constraints = constraints ?? {}
      this.promotions.add(branched)
    }
    state.insert_beliefs(branched)
    return branched
  }
  ```
- Remove old `add_branch()` method and `branch_metadata` object

**Tests**:
- Create belief v1, branch with promote:true → v1.promotions contains v2
- Direct properties capture origin_state, certainty, constraints
- Multiple promotions accumulate in set
- Promotions are not included in bases traversal
- Setting certainty to 0 → throws assertion error
- Setting certainty to 1 → throws assertion error
- Setting certainty to 0.5 → valid
- Setting certainty to null → valid (default)

### Phase 2: Implement State Resolver Interface ✅ COMPLETE

**Files**: `public/worker/state.mjs`

**Changes**:
- Add `pick_promotion(promotions, context)` method to State class
- Implements temporal filtering (compare `origin_state.tt` with `this.tt`)
- Returns single belief (filtered) or array of beliefs (superposition)
- Context object includes query metadata for future extensions

**Resolver logic**:
```javascript
pick_promotion(promotions, context) {
  // Temporal filtering - uses direct property
  const valid = [...promotions].filter(b => {
    const origin = b.origin_state
    if (!origin || origin.tt === null || this.tt === null) return false
    return origin.tt <= this.tt
  })

  if (valid.length === 0) return null
  if (valid.length === 1) return valid[0]

  // Multiple valid - check if any are probability states
  const is_probability = valid.some(b => b.certainty !== null)

  if (is_probability) {
    // Probability promotions - return all, caller handles via recall()
    return valid
  }

  // Not probability states - pick most recent by default
  return valid.sort((a, b) => {
    const a_tt = a.origin_state?.tt ?? 0
    const b_tt = b.origin_state?.tt ?? 0
    return b_tt - a_tt
  })[0]
}
```

**Tests**:
- Query with temporal promotions → filters by timestamp
- Query with probability promotions → returns array (superposition)
- Query with spatial constraints → resolver can use context
- Empty promotion set → returns null

### Phase 3: Update Trait Resolution to Walk Promotions ✅ COMPLETE

**Files**: `public/worker/belief.mjs`

**Changes**:
- Modify `_get_inherited_trait(state, traittype)` to detect promotions during traversal
- Walk bases chain, check each belief for non-empty `promotions` set
- Call `state.pick_promotion(belief.promotions, context)` when found
- If resolver returns single belief, continue down that path
- If resolver returns array, collect into `Fuzzy` via `_collect_fuzzy_from_promotions()`
- Add `skip_promotions: Set<Belief>` parameter to prevent infinite recursion

**Key implementation**:
```javascript
_get_inherited_trait(state, traittype, skip_promotions = new Set()) {
  for (const base of this._bases) {
    if (base instanceof Belief && base.promotions.size > 0 && !skip_promotions.has(base)) {
      const resolved = state.pick_promotion(base.promotions, {})
      if (Array.isArray(resolved)) {
        const new_skip = new Set(skip_promotions)
        new_skip.add(base)
        const fuzzy = this._collect_fuzzy_from_promotions(state, resolved, traittype, new_skip)
        if (fuzzy.alternatives.length > 0) {
          return fuzzy
        }
        // Fall through to continue searching archetypes
      } else if (resolved) {
        const value = resolved._get_trait_skip_promotions(state, traittype, skip_promotions)
        if (value !== undefined) return value
      }
    }
    // ... continue with archetype lookup
  }
}
```

**Tests**:
- Trait inherits from belief with temporal promotion → returns concrete value from correct promotion
- Trait inherits from belief with probability promotions → returns `Fuzzy`
- Infinite recursion prevented via skip_promotions Set
- Falls through to archetypes when promotions don't have the trait
- Deep inheritance (5+ levels) resolves correctly

### Phase 4: Materialization on Explicit Version Creation ✅ COMPLETE

**Files**: `public/worker/belief.mjs`

**Implemented** (December 2024):

Phase 4 is split into two parts:
- **Phase 4a**: Eidos-only constraint for promotions
- **Phase 4b**: Opportunistic flattening when creating promotions

**Phase 4a: Eidos-only Constraint**
- Promotions can only be created in Eidos hierarchy (shared beliefs)
- Assertion in `replace()` checks `this.in_mind?.in_eidos`
- Tests in `test/promotion_constraints.test.mjs` (13 tests)

**Phase 4b: Opportunistic Flattening**
- `_find_first_promotion(state, node, path, visited)` - DFS to find first promotion in bases chain
- `_materialize_promotion_chain(state)` - Creates intermediate versions bottom-up when gaps exist
- Called when creating promotions via `replace(..., {promote: true})`
- Future optimization: could also be called when creating any new belief in Eidos

**Algorithm**:
```javascript
// Example: city → country → region, where ONLY region has promotion → region_v2
// When city creates a promotion:
// 1. Walk bases: country → region
// 2. Find region has promotion → region_v2
// 3. Create country_v2 = [country, region_v2]
// 4. Return country_v2 (so city_v2.bases = [city, country_v2])

static _find_first_promotion(state, node, path, visited) {
  if (visited.has(node)) return null
  visited.add(node)

  if (node.promotions.size > 0) {
    const resolved = state.pick_promotion(node.promotions, {})
    if (!Array.isArray(resolved) && resolved) {
      return { resolved, path: [...path, node] }
    }
  }

  for (const base of node._bases) {
    if (base instanceof Belief) {
      const result = Belief._find_first_promotion(state, base, [...path, node], visited)
      if (result) return result
    }
  }
  return null
}

_materialize_promotion_chain(state) {
  const visited = new Set()
  for (const base of this._bases) {
    if (!(base instanceof Belief)) continue

    const result = Belief._find_first_promotion(state, base, [], visited)
    if (!result) continue

    const { resolved, path } = result

    // Create intermediate versions bottom-up
    let current_resolved = resolved
    for (let i = path.length - 2; i >= 0; i--) {
      const intermediate = path[i]
      const intermediate_v2 = new Belief(state, intermediate.subject, [intermediate, current_resolved])
      state.insert_beliefs(intermediate_v2)
      current_resolved = intermediate_v2
    }
    return current_resolved
  }
  return null
}
```

**Tests** (`test/promotion_flattening.test.mjs`, 11 tests):
- Gap scenario: only deep base has promotion → creates intermediate versions
- Trait resolution works through materialized chain
- Chained promotions to get fully resolved bases
- Skips archetypes - only resolves Belief bases
- Skips superposition - cannot flatten probability branches
- Does not flatten when base has no promotions
- Private beliefs (non-Eidos) do not flatten

### Phase 5: Update `get_belief_by_subject()` with Resolver — NOT NEEDED

**Reason**: When `replace(..., {promote: true})` is called, the original belief is removed from state via `state.remove_beliefs(this)`. So `get_belief_by_subject()` naturally returns the latest version because:
- Original belief (with `promotions` set) is removed from state
- Promotion is inserted into state
- Query by subject → returns the promotion directly

No changes to `get_belief_by_subject()` are required.

### Phase 6: Superposition Handling in State Operations

**Files**: `public/worker/state.mjs`

**Changes**:
- Add `collapse_trait(belief, trait_name, selected_promotion)` method
- Creates new belief version inheriting from selected promotion path
- Calls `materialize_path()` to ensure clean inheritance
- If state locked, branches state; if unlocked, inserts into current state

**Implementation**:
```javascript
collapse_trait(belief, trait_name, selected_promotion) {
  assert(!this.locked, 'Cannot collapse in locked state without branching')

  // Create new belief inheriting from selected promotion
  const new_belief = Belief.from_template(this.in_mind, {
    sid: belief.subject.sid,
    bases: [selected_promotion.path]
  }, this)

  // Materialize intermediate nodes
  const materialized = materialize_path(new_belief, this)

  // Insert into state
  this.insert_beliefs(materialized)

  return materialized
}
```

**Tests**:
- Collapse superposition → creates new belief with selected promotion
- Collapsed belief materializes intermediate nodes
- Multiple collapses reuse materialized intermediates
- Locked state handling (future: branch state)

### Phase 7: Documentation and Examples

**Files**: `docs/notes/version_propagation.md` (update), new example tests

**Documentation updates**:
- Add implementation details to version_propagation.md
- Document resolver interface and customization points
- Document superposition return format
- Add diagrams showing resolution flow

**Example scenarios**:
1. **Temporal update**: Country announces winter
   - Create country_v2 with season='winter' via `branch(state, {season: 'winter'}, {promote: true})`
   - Query NPC → resolver picks v2 based on timestamp
   - No materialization needed

2. **Probability promotion**: King dies with p=0.6
   - Create country_v2a (dead, p=0.6) and country_v2b (alive, p=0.4) via `branch(state, {...}, {promote: true, certainty: 0.6})`
   - Query NPC → returns superposition (Fuzzy)
   - Story template picks dramatic promotion
   - Materialize city/NPC versions for that promotion

3. **Multiple NPCs**: 100 NPCs in same city
   - First NPC materializes city_v2
   - Remaining 99 NPCs reuse city_v2
   - Memory: O(1) city + O(100) NPCs, not O(100 × full chain)

**Tests**:
- Full integration test: country update → query NPCs → verify lazy resolution
- Performance test: measure memory with 1000 NPCs inheriting from 1 country update
- Verify O(changes) memory usage, not O(NPCs)

## Migration Strategy

### Backward Compatibility

**No breaking changes**:
- Existing code without promotions continues to work unchanged
- `get_trait()` returns concrete values for beliefs without promotions
- New promotion tracking is additive (empty set = no promotions)
- Resolution cache is transparent optimization

**Gradual adoption**:
1. Phases 1-2: Add infrastructure (no behavior change yet)
2. Phase 3: Enable lazy resolution (transparent to existing code)
3. Phase 4-6: Add explicit materialization (new features, opt-in)
4. Phase 7: Documentation and examples

### Integration Points

**Where promotions are created**:
- Story template creates probability promotions for narrative choices via `branch(..., {promote: true, certainty})`
- Time progression creates temporal promotions for knowledge updates via `branch(..., {promote: true})`
- Defragmentation process creates optimized intermediate nodes

**Where superposition is handled**:
- Story templates examine and select from promotions
- NPC reasoning may sample probabilistically
- Player observation forces collapse to single timeline

## Current Status

### Foundation (Implemented)
- [x] **Fuzzy class** - `public/worker/fuzzy.mjs` - uncertain trait values
- [x] **Notion class** - `public/worker/notion.mjs` - materialized belief view
- [x] **unknown() singleton** - represents undetermined values
- [x] **Mind.recall()** - returns Notion with Fuzzy values for uncertainty
- [x] **Path certainty** - `Mind._compute_path_certainty()` with caching

### Phases
- [x] Phase 1: Add promotion tracking to beliefs ✅ (December 2024)
- [x] Phase 2: Implement state resolver interface ✅ (December 2024)
- [x] Phase 3: Update trait resolution to walk promotions ✅ (December 2024)
- [x] Phase 4: Materialization on explicit version creation ✅ (December 2024)
- [x] Phase 5: NOT NEEDED — `replace()` removes original from state, so queries return latest
- [ ] Phase 6: Superposition handling in state operations (uses Fuzzy/Notion)
- [ ] Phase 7: Documentation and examples

## Success Criteria

1. **No cascade**: Adding promotion to country_culture creates 1 new belief, not thousands
2. **Lazy resolution**: NPCs get updated knowledge without materializing intermediate versions
3. **Explicit control**: Materialization only happens on explicit belief creation
4. **Superposition support**: Probability promotions return superposition for caller to decide
5. **Performance**: Memory usage O(changes) not O(NPCs), resolution cached efficiently
6. **Backward compatible**: Existing code works unchanged, new features are opt-in

## Notes

**Key clarification from discussion**:
- Only nodes with promotions are "dirty" (need resolution)
- Intermediate nodes (cities) are NOT dirty - they inherit from dirty nodes
- This prevents cascade while enabling lazy propagation

**Resolver can decide or defer**:
- Common case (temporal): Resolver picks version, returns concrete value
- Special case (probability): Resolver returns superposition, caller decides

**Multi-stage resolution**:
- Not JavaScript async/await
- Means caller can query, examine superposition, query more, then request materialization
- Enables narrative-driven collapse instead of arbitrary selection

**Design trade-offs**:
- Adds complexity to trait resolution (walk + resolve promotions)
- Resolution cache mitigates performance impact
- Superposition return values require caller awareness
- But enables scaling to millions of NPCs without version explosion

---

## Relationship to @resolution (December 2024 Update)

### Separation of Concerns

**Lazy propagation** and **@resolution** are orthogonal systems:

| Aspect | Lazy Propagation | @resolution |
|--------|------------------|-------------|
| **Purpose** | Efficient shared belief updates | Record collapse of possibility space |
| **Trigger** | Every trait query | Only when collapse happens |
| **Storage** | `promotions` Set on belief | `@resolution` trait + `Subject.resolutions` index |
| **Persistence** | Computed at query time | Permanent record |
| **Legacy support** | N/A | Yes - visible across timelines via Session.legacy |

### Query Flow with Both Systems

```
Query: npc.get_trait(state, 'king_status')

1. CHECK FOR RECORDED COLLAPSE (@resolution)
   - Look up Subject.resolutions for this subject
   - Check if resolution visible from current state (ancestry OR Session.legacy)
   → If found: return resolved value, DONE

2. NO COLLAPSE RECORDED → LAZY PROPAGATION
   - Walk bases chain: npc → city → country
   - Find promotions on country
   - Call state.pick_promotion()

3. RESOLVER DECISION
   - Temporal promotions (different timestamps) → pick by timestamp
   - Probability promotions (same timestamp) → return superposition

4. SUPERPOSITION RETURNED TO CALLER
   - Caller can examine possibilities
   - Caller can trigger collapse (creates @resolution record)
```

### When Each System Activates

**Lazy propagation only** (no @resolution needed):
- "Winter arrived" → temporal promotion, resolver picks by timestamp
- No uncertainty, just version selection

**@resolution needed** (after lazy prop returns superposition):
- "King might be dead" → probability promotions at same timestamp
- Lazy prop returns superposition
- Player observation triggers collapse
- @resolution records the decision permanently

### Updated Phase 6: Collapse Creates @resolution

The `collapse_trait()` method should create a @resolution record:

```javascript
collapse_trait(belief, trait_name, selected_promotion) {
  // Create resolution belief with @resolution pointing to selected
  const resolution = this.add_belief_from_template({
    sid: belief.subject.sid,
    bases: [belief],  // Links to original (with promotions)
    traits: {
      '@resolution': selected_promotion  // Points to selected promotion
    }
  })

  // Update Subject.resolutions index for O(1) lookup
  belief.subject.resolutions.set(
    this._id,  // Query state
    resolution._id  // Resolution belief
  )

  // Materialize intermediate nodes if needed
  return materialize_path(resolution, this)
}
```

---

## Interaction Matrix

### Feature × Feature Interactions

| | Lazy Prop | @resolution | @tracks | Session.legacy | Convergence |
|---|:---:|:---:|:---:|:---:|:---:|
| **Lazy Prop** | - | Sequential¹ | Orthogonal² | N/A | Compatible³ |
| **@resolution** | Sequential¹ | - | Compatible⁴ | Required⁵ | Unified⁶ |
| **@tracks** | Orthogonal² | Compatible⁴ | - | Compatible⁷ | Separate⁸ |
| **Session.legacy** | N/A | Required⁵ | Compatible⁷ | - | Via @resolution |
| **Convergence** | Compatible³ | Unified⁶ | Separate⁸ | Via @resolution | - |

**Notes:**
1. Lazy prop returns superposition → @resolution records collapse
2. @tracks is for timeline fallback, lazy prop is for shared beliefs
3. Convergence can contain beliefs with branches
4. Theory timelines can have @resolution for collapsed possibilities
5. @resolution enables legacy queries (cross-timeline resolution)
6. Convergence collapse uses @resolution to record which branch
7. Legacy can track @tracks timeline
8. Convergence uses BFS, @tracks uses depth-first

### Feature × Uncertainty Type Interactions

| | State Uncertainty | Belief Uncertainty | Trait Uncertainty (UNKNOWN) |
|---|:---:|:---:|:---:|
| **Lazy Prop** | Via Convergence | promotions Set | N/A (no value to branch) |
| **@resolution** | Points to state | Points to belief | Points to belief with value |
| **@tracks** | Fallback timeline | N/A | Query falls through |
| **Session.legacy** | Check ancestry | Check ancestry | Check ancestry |
| **Subject.resolutions** | Map<state_id, state_id> | Same | Same |

### Uncertainty Type Details

**State Uncertainty** (Convergence - multiple world branches):
```
world_state_5a: {certainty: 0.6, king: 'dead'}
world_state_5b: {certainty: 0.4, king: 'alive'}
convergence: [state_5a, state_5b]

Resolution: @resolution → state_5a
```

**Belief Uncertainty** (multiple beliefs, same subject/vt):
```
belief_A: {subject: hammer, location: workshop}
belief_B: {subject: hammer, location: shed}
Both at same vt, same subject

Resolution: new belief with @resolution → belief_A
```

**Trait Uncertainty** (UNKNOWN value):
```
belief_v1: {subject: cell, exit: UNKNOWN}

Resolution: belief_v2 with {
  base: belief_v1,
  exit: 'north',
  @resolution: belief_v1  // "resolves the unknown in v1"
}
```

---

## Test Matrix

### Lazy Propagation Tests

| Scenario | Setup | Action | Expected |
|----------|-------|--------|----------|
| LP-1: Temporal promotion | country_v1 → country_v2 at T2 | Query at T1 | v1 traits |
| LP-2: Temporal promotion | country_v1 → country_v2 at T2 | Query at T2 | v2 traits |
| LP-3: Multiple promotions | v1 → v2@T2, v3@T3 | Query at T2 | v2 traits |
| LP-4: Probability promotion | v1 → v2a(p=0.6), v2b(p=0.4) | Query | Superposition |
| LP-5: Materialization | NPC creates opinion | Walk chain | Intermediates created |
| LP-6: Reuse materialized | Second NPC, same city | Walk chain | Reuse city_v2 |
| LP-7: Chained promotions | merchant_location → v2 (promote) → v3 (promote) | Query wandering_merchant | v3 → v2 → base |
| LP-8: Chained with trait | v2 has trait, v3 doesn't | Query wandering_merchant | v2's trait value |

### @resolution Tests

| Scenario | Setup | Action | Expected |
|----------|-------|--------|----------|
| RES-1: Collapse state | Convergence[5a, 5b] | Collapse to 5a | @resolution → 5a |
| RES-2: Collapse belief | beliefs A, B same subject | Collapse to A | @resolution → A |
| RES-3: Resolve unknown | belief with UNKNOWN trait | Resolve to value | @resolution → original |
| RES-4: Query after collapse | After RES-1 | Query same state | Returns resolved |
| RES-5: Query from legacy | After RES-1, new timeline | Query with legacy | Returns resolved |
| RES-6: Query without legacy | After RES-1, fresh session | Query | Returns superposition |

### @tracks + Timeline Tests

| Scenario | Setup | Action | Expected |
|----------|-------|--------|----------|
| TRK-1: Local wins | new_state with local trait | Query | Local value |
| TRK-2: Fallback | new_state without trait | Query | @tracks value |
| TRK-3: Advance tracked | new_state, advance time | advance_tracked_timeline() | @tracks updated |
| TRK-4: @tracks + lazy prop | Tracked state has promotions | Query | Resolve via tracked |

### Combined Feature Tests

| Scenario | Features | Setup | Expected |
|----------|----------|-------|----------|
| COMB-1 | LP + @resolution | Probability promotion → collapse | @resolution recorded, lazy query returns resolved |
| COMB-2 | LP + @tracks | Shared belief in tracked timeline | Query walks @tracks, then resolves promotions |
| COMB-3 | @resolution + legacy | Collapse in old run, query in new | Legacy enables resolution lookup |
| COMB-4 | LP + @resolution + @tracks | Theory with collapsed shared belief | Theory inherits via @tracks, sees resolved value |
| COMB-5 | All + State uncertainty | Convergence with promoted beliefs | Convergence collapse + belief promotion resolution |
| COMB-6 | All + UNKNOWN | Unknown in shared belief, theory | Resolution propagates via lazy + @tracks |

### Edge Cases

| Scenario | Setup | Expected |
|----------|-------|----------|
| EDGE-1: Chained promotions | base → v2 (promote) → v3 (promote) | Resolver walks: v3 → v2 → base |
| EDGE-2: Divergent promotions | v1 → v2a, v1 → v2b (same time, no prob) | Error or pick one |
| EDGE-3: Resolution of resolution | Collapse A, then collapse again | Second resolution recorded |
| EDGE-4: Materialization with @resolution | Materialize path with existing collapse | Use resolved path |
| EDGE-5: @tracks chain with promotions | @tracks → @tracks → state with promotions | Full resolution |
| EDGE-6: Legacy + new promotions | Legacy collapse, new timeline adds promotions | Legacy resolution still valid |
| EDGE-7: Promotion with promotion | v2 has promotion v3, child inherits | Walk: child → v3 → v2 → base |
| EDGE-8: Trait in middle promotion | v2 has trait, v3 doesn't | Return v2's trait, not continue to base |

---

## Open Questions for Test Design

1. **Promotion ordering**: When multiple non-probability promotions exist at same timestamp, which wins?
   - Current: "most recent by default" - but what defines "recent" if same timestamp?

2. **Cascading @resolution**: If A resolves to B, and B has promotions, is that a new resolution?
   - Proposal: Yes, each uncertainty point gets its own @resolution

3. **@resolution vs materialization**: Does @resolution require materialization?
   - Proposal: No - @resolution is just a pointer, materialization is separate

4. **Convergence + lazy prop**: Can Convergence components have promotions?
   - Proposal: Yes, query resolves promotions within each component

5. **Subject.resolutions cleanup**: When are old resolutions garbage collected?
   - Deferred to promotion lifecycle work

6. **Chained promotions resolution order**: When v2 has promotion v3, should child see v3's traits first?
   - Yes: walk promotions before continuing to base (v3 → v2 → base)

---

## Updated Success Criteria

Original criteria (still valid):
1. ✅ No cascade: Adding promotion creates 1 belief, not thousands
2. ✅ Lazy resolution: NPCs inherit without materialization
3. ✅ Explicit control: Materialization only on explicit creation
4. ✅ Superposition support: Probability promotions return superposition
5. ✅ Performance: O(changes) not O(NPCs)
6. ✅ Backward compatible: Existing code unchanged

New criteria (December 2024):
7. ✅ @resolution separation: Lazy prop and @resolution are orthogonal
8. ✅ Legacy support: @resolution visible via Session.legacy
9. ✅ All uncertainty types: State, Belief, and UNKNOWN trait resolution
10. ✅ @tracks compatibility: Works with timeline tracking
11. ✅ Test coverage: All matrix scenarios have tests
12. ✅ Chained promotions: Promotions that have promotions resolve correctly

---

## TODO

### Documentation

- [ ] Update SPECIFICATION.md to document promotions purpose and semantics:
  - Promotions are for shared/cultural beliefs that evolve over time
  - Primary use case: eidos beliefs (universals) that change (e.g., village event becomes common knowledge)
  - Common case: temporal promotions resolve to **concrete values** (not Fuzzy)
  - Special case: probability promotions (with certainty values) resolve to Fuzzy
  - The original belief is removed from state; promotions are visible
  - Trait resolution walks bases, encounters promotions, resolver picks appropriate version

- [ ] Update IMPLEMENTATION.md with promotion mechanics:
  - `replace(..., {promote: true})` removes original, inserts promotion, registers in `promotions` Set
  - Trait resolution walks bases, encounters belief with promotions, calls `pick_promotion()`
  - Temporal promotions: resolver filters by timestamp, returns single concrete value
  - Probability promotions: `_collect_fuzzy_from_promotions()` gathers alternatives into Fuzzy

- [ ] Add clear summary of how to use promotion to respective function in code

### Missing Save/Load Tests

Cross-reference with Test Matrix (LP-* scenarios):

- [ ] LP-1/LP-2: Temporal promotion resolves to concrete value after save/load
  - Create promotion at T2, query at T1 → v1 traits, query at T2 → v2 traits
  - This is the **common case** - most promotions are temporal, not probability

- [ ] LP-3: Multiple temporal promotions at different timestamps after save/load
  - v1 → v2@T2, v3@T3, query at T2 → v2 traits

- [ ] LP-7/LP-8: Chained promotions work after save/load
  - base → v2 (promote) → v3 (promote), trait in middle promotion

- [ ] Eidos → Materia inheritance pattern after save/load
  - Shared belief in eidos with promotion
  - Particular in materia inherits from eidos belief
  - After save/load, particular still resolves traits through eidos promotion

- [ ] Single probability promotion edge case (currently returns Fuzzy incorrectly for archetype traits)
