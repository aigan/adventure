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

**Not Yet Implemented:**
- Branch tracking on Beliefs (Phase 1)
- State resolver interface (Phase 2)
- Materialization on creation (Phase 4)
- `get_branch_heads()` API (Phase 6)

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

### Branch Tracking

```javascript
BeliefNode {
  subject: Subject           // Identity (shared across versions)
  _id: number               // Version ID (unique per version)
  traits: Map<string, value>
  bases: Set<Belief|Archetype>
  branches: Set<Belief>     // NEW: Sibling versions (same subject)
  branch_metadata: {        // NEW: Why this branch exists
    origin_state: StateRef,
    certainty: null,        // null = not a probability state (DEFAULT)
                            // number = probability weight (0.0-1.0)
    constraints: {...}
  }
}
```

**Certainty semantics:**
- `certainty: null` (default) — Not a probability state. The timeline/branch may still be uncertain for other reasons, but not probability-weighted.
- `certainty: <number>` — Probability state. Must be > 0 and < 1. Represents genuine uncertainty about which branch is true, with this weight.
  - Values at boundaries (0 or 1) indicate impossible/certain branches, which should be handled differently (pruned or promoted)
  - assert(certainty > 0 && certainty < 1) when setting non-null certainty

### Resolution Flow

```
Query: npc_belief.get_trait(state, 'season')

1. Check npc_belief.traits.season → not found
2. Walk bases: npc_belief → city_belief
3. Check city_belief.traits.season → not found
4. Walk bases: city_belief → country_culture_v1
5. Check country_culture_v1.branches → [country_v2@T110, country_v3@T150]
6. Call state.pick_branch([v2, v3], context)
7. Resolver filters by timestamp:
   - state.timestamp = T110
   - v2.origin_state.timestamp = T110 ✓
   - v3.origin_state.timestamp = T150 ✗
8. Resolver returns country_v2 (single choice)
9. Continue: country_v2.traits.season → 'winter'
10. Return 'winter' (concrete value)
```

### Superposition Flow

```
Query: mind.recall(state, subject, ['king_status'])

1-4. Same walk to country_culture_v1
5. Check branches → [v2a@T110 (p=0.6), v2b@T110 (p=0.4)]
6. Call state.pick_branch([v2a, v2b], context)
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

When multiple branches yield the **same value**, `Mind.recall()` aggregates them into a single Fuzzy with combined alternatives:

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
2. Detect country_v1.branches → [country_v2]
3. Resolver picks country_v2 (temporal filter)
4. Create city_v2 {sid: city_v1.sid, bases: [city_v1, country_v2]}
5. Update npc_v2.bases = [npc_v1, city_v2]
6. Insert city_v2 and npc_v2 into state

Next NPC:
1. Walk npc2_v1 → city_v1 → country_v1
2. Detect country_v1.branches → [country_v2]
3. Resolver picks country_v2
4. Find existing city_v2 (same subject, inherits from country_v2)
5. Reuse city_v2! Update npc2_v2.bases = [npc2_v1, city_v2]
6. Insert only npc2_v2 (city_v2 already materialized)
```

## Implementation Phases

### Phase 1: Add Branch Tracking to Beliefs

**Files**: `public/worker/belief.mjs`

**Changes**:
- Add `branches: Set<Belief>` to Belief class
- Add `branch_metadata: {origin_state, certainty, constraints}` to Belief class
  - `certainty` defaults to `null` (not a probability state)
  - Set to number only for probability branches
  - assert(certainty === null || (certainty > 0 && certainty < 1)) when setting
- Modify `Belief.from_template()` to register as branch when creating version of existing subject
- Add `add_branch(belief, metadata)` method with certainty validation
- Add `get_branches()` method

**Tests**:
- Create belief v1, create v2 with same subject → v1.branches contains v2
- Branch metadata captures origin_state reference
- Multiple branches accumulate in set
- Branches are not included in bases traversal
- Setting certainty to 0 → throws assertion error
- Setting certainty to 1 → throws assertion error
- Setting certainty to 0.5 → valid
- Setting certainty to null → valid (default)

### Phase 2: Implement State Resolver Interface

**Files**: `public/worker/state.mjs`

**Changes**:
- Add `pick_branch(branches, context)` method to State class
- Implements temporal filtering (compare origin_state.timestamp with this.timestamp)
- Returns single belief (filtered) or array of beliefs (superposition)
- Context object includes query metadata for future extensions

**Resolver logic**:
```javascript
pick_branch(branches, context) {
  // Temporal filtering
  const valid = [...branches].filter(b =>
    b.branch_metadata.origin_state.timestamp <= this.timestamp
  )

  if (valid.length === 0) return null
  if (valid.length === 1) return valid[0]

  // Multiple valid branches - check if any are probability states
  const is_probability = valid.some(b => b.branch_metadata.certainty !== null)

  if (is_probability) {
    // Probability branches - return all, caller handles via recall()
    return valid
  }

  // Not probability states - pick most recent by default
  return valid.sort((a, b) =>
    b.branch_metadata.origin_state.timestamp -
    a.branch_metadata.origin_state.timestamp
  )[0]
}
```

**Tests**:
- Query with temporal branches → filters by timestamp
- Query with probability branches → returns array (superposition)
- Query with spatial constraints → resolver can use context
- Empty branch set → returns null

### Phase 3: Update Trait Resolution to Walk Branches

**Files**: `public/worker/belief.mjs`

**Changes**:
- Modify `get_trait(state, trait_name)` to detect branches during traversal
- Walk bases chain, check each belief for non-empty `branches` set
- Call `state.pick_branch(belief.branches, context)` when found
- If resolver returns single belief, continue down that path
- If resolver returns array, return superposition object
- Add resolution caching with `_resolved_cache: Map<StateID, Map<trait_name, value>>`

**Cache strategy**:
- Cache concrete values only (superpositions are context-dependent)
- Invalidate when new branch added to any belief in inheritance chain
- Cache per state ID (different states may resolve differently)

**Tests**:
- Trait inherits from belief with temporal branch → returns concrete value from correct branch
- Trait inherits from belief with probability branches → returns `{type: 'superposition', ...}`
- Resolution cache returns same result on repeated queries
- Cache invalidates when new branch added
- Deep inheritance (5+ levels) resolves correctly

### Phase 4: Materialization on Explicit Version Creation

**Files**: `public/worker/belief.mjs`, `public/worker/state.mjs`

**Changes**:
- Add `materialize_path(belief, state)` helper function
- Walks bases chain and resolves all branches
- Creates intermediate beliefs if needed
- Returns materialized belief with clean inheritance chain
- Modify `Belief.from_template()` to call `materialize_path()` when creating versioned belief

**Materialization algorithm**:
```javascript
materialize_path(belief, state) {
  const chain = []

  // Walk bases and collect resolution decisions
  for (let current = belief; current; current = get_next_base(current)) {
    if (current.branches.size > 0) {
      const resolved = state.pick_branch(current.branches, {})
      if (Array.isArray(resolved)) {
        throw new Error('Cannot materialize superposition - caller must collapse first')
      }
      chain.push({base: current, resolved})
    } else {
      chain.push({base: current, resolved: null})
    }
  }

  // Create materialized intermediate nodes bottom-up
  const materialized = []
  for (const {base, resolved} of chain.reverse()) {
    if (resolved) {
      // Check if materialized version already exists
      const existing = state.get_belief_by_subject(base.subject)
      if (existing && existing.bases.has(resolved)) {
        materialized.push(existing)
      } else {
        // Create new materialized belief
        const new_belief = Belief.from({...})
        materialized.push(new_belief)
      }
    }
  }

  return materialized[0]
}
```

**Tests**:
- Creating npc_v2 when country has branch → creates city_v2 inheriting from country_v2
- Multiple NPCs creating versions → reuse same city_v2
- Materialization respects resolver decisions (temporal filtering)
- Attempting to materialize superposition → throws error
- Materialized beliefs are inserted into state

### Phase 5: Update `get_belief_by_subject()` with Resolver

**Files**: `public/worker/state.mjs`

**Changes**:
- Modify `get_belief_by_subject()` to check for branches
- If belief has branches, call resolver
- Return resolved belief instead of base belief
- Maintain backward compatibility (no branches → return as before)

**Implementation**:
```javascript
get_belief_by_subject(subject) {
  for (const belief of this.get_beliefs()) {
    if (belief.subject === subject) {
      // Check if this belief has branches
      if (belief.branches.size > 0) {
        const resolved = this.pick_branch(belief.branches, {})
        if (!Array.isArray(resolved)) {
          return resolved  // Resolver decided
        }
        // Resolver returned superposition - return base belief
        // Caller will discover superposition at trait level
      }
      return belief
    }
  }
  return null
}
```

**Tests**:
- Query subject with temporal branches → returns appropriate version
- Query subject in different state timestamps → returns different versions
- Query subject with probability branches → returns base (defers to trait level)
- Query subject without branches → works as before

### Phase 6: Superposition Handling in State Operations

**Files**: `public/worker/state.mjs`

**Changes**:
- Add `collapse_trait(belief, trait_name, selected_branch)` method
- Creates new belief version inheriting from selected branch path
- Calls `materialize_path()` to ensure clean inheritance
- If state locked, branches state; if unlocked, inserts into current state

**Implementation**:
```javascript
collapse_trait(belief, trait_name, selected_branch) {
  assert(!this.locked, 'Cannot collapse in locked state without branching')

  // Create new belief inheriting from selected branch
  const new_belief = Belief.from_template(this.in_mind, {
    sid: belief.subject.sid,
    bases: [selected_branch.path]
  }, this)

  // Materialize intermediate nodes
  const materialized = materialize_path(new_belief, this)

  // Insert into state
  this.insert_beliefs(materialized)

  return materialized
}
```

**Tests**:
- Collapse superposition → creates new belief with selected branch
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
   - Create country_v2 with season='winter'
   - Query NPC → resolver picks v2 based on timestamp
   - No materialization needed

2. **Probability branch**: King dies with p=0.6
   - Create country_v2a (dead, p=0.6) and country_v2b (alive, p=0.4)
   - Query NPC → returns superposition
   - Story template picks dramatic branch
   - Materialize city/NPC versions for that branch

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
- Existing code without branches continues to work unchanged
- `get_trait()` returns concrete values for beliefs without branches
- New branch tracking is additive (empty set = no branches)
- Resolution cache is transparent optimization

**Gradual adoption**:
1. Phases 1-2: Add infrastructure (no behavior change yet)
2. Phase 3: Enable lazy resolution (transparent to existing code)
3. Phase 4-6: Add explicit materialization (new features, opt-in)
4. Phase 7: Documentation and examples

### Integration Points

**Where branches are created**:
- Story template creates probability branches for narrative choices
- Time progression creates temporal branches for knowledge updates
- Defragmentation process creates optimized intermediate nodes

**Where superposition is handled**:
- Story templates examine and select from branches
- NPC reasoning may sample probabilistically
- Player observation forces collapse to single timeline

## Current Status

### Foundation (Implemented)
- [x] **Fuzzy class** - `public/worker/fuzzy.mjs` - uncertain trait values
- [x] **Notion class** - `public/worker/notion.mjs` - materialized belief view
- [x] **unknown() singleton** - represents undetermined values
- [x] **Mind.recall()** - returns Notion with Fuzzy values for uncertainty
- [x] **Path certainty** - `Mind._compute_path_certainty()` with caching

### Phases (Pending)
- [x] Phase 1: Add branch tracking to beliefs ✅ (December 2024)
- [ ] Phase 2: Implement state resolver interface
- [ ] Phase 3: Update trait resolution to walk branches
- [ ] Phase 4: Materialization on explicit version creation
- [ ] Phase 5: Update get_belief_by_subject() with resolver
- [ ] Phase 6: Superposition handling in state operations (uses Fuzzy/Notion)
- [ ] Phase 7: Documentation and examples

## Success Criteria

1. **No cascade**: Adding branch to country_culture creates 1 new belief, not thousands
2. **Lazy resolution**: NPCs get updated knowledge without materializing intermediate versions
3. **Explicit control**: Materialization only happens on explicit belief creation
4. **Superposition support**: Probability branches return superposition for caller to decide
5. **Performance**: Memory usage O(changes) not O(NPCs), resolution cached efficiently
6. **Backward compatible**: Existing code works unchanged, new features are opt-in

## Notes

**Key clarification from discussion**:
- Only nodes with branches are "dirty" (need resolution)
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
- Adds complexity to trait resolution (walk + resolve branches)
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
| **Storage** | `branches` Set on belief | `@resolution` trait + `Subject.resolutions` index |
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
   - Find branches on country
   - Call state.pick_branch()

3. RESOLVER DECISION
   - Temporal branches (different timestamps) → pick by timestamp
   - Probability branches (same timestamp) → return superposition

4. SUPERPOSITION RETURNED TO CALLER
   - Caller can examine possibilities
   - Caller can trigger collapse (creates @resolution record)
```

### When Each System Activates

**Lazy propagation only** (no @resolution needed):
- "Winter arrived" → temporal branch, resolver picks by timestamp
- No uncertainty, just version selection

**@resolution needed** (after lazy prop returns superposition):
- "King might be dead" → probability branches at same timestamp
- Lazy prop returns superposition
- Player observation triggers collapse
- @resolution records the decision permanently

### Updated Phase 6: Collapse Creates @resolution

The `collapse_trait()` method should create a @resolution record:

```javascript
collapse_trait(belief, trait_name, selected_branch) {
  // Create resolution belief with @resolution pointing to selected
  const resolution = this.add_belief_from_template({
    sid: belief.subject.sid,
    bases: [belief],  // Links to original (with branches)
    traits: {
      '@resolution': selected_branch  // Points to selected branch
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
| **Lazy Prop** | Via Convergence | branches Set | N/A (no value to branch) |
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
| LP-1: Temporal branch | country_v1 → country_v2 at T2 | Query at T1 | v1 traits |
| LP-2: Temporal branch | country_v1 → country_v2 at T2 | Query at T2 | v2 traits |
| LP-3: Multiple branches | v1 → v2@T2, v3@T3 | Query at T2 | v2 traits |
| LP-4: Probability branch | v1 → v2a(p=0.6), v2b(p=0.4) | Query | Superposition |
| LP-5: Materialization | NPC creates opinion | Walk chain | Intermediates created |
| LP-6: Reuse materialized | Second NPC, same city | Walk chain | Reuse city_v2 |

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
| TRK-4: @tracks + lazy prop | Tracked state has branches | Query | Resolve via tracked |

### Combined Feature Tests

| Scenario | Features | Setup | Expected |
|----------|----------|-------|----------|
| COMB-1 | LP + @resolution | Probability branch → collapse | @resolution recorded, lazy query returns resolved |
| COMB-2 | LP + @tracks | Shared belief in tracked timeline | Query walks @tracks, then resolves branches |
| COMB-3 | @resolution + legacy | Collapse in old run, query in new | Legacy enables resolution lookup |
| COMB-4 | LP + @resolution + @tracks | Theory with collapsed shared belief | Theory inherits via @tracks, sees resolved value |
| COMB-5 | All + State uncertainty | Convergence with branched beliefs | Convergence collapse + belief branch resolution |
| COMB-6 | All + UNKNOWN | Unknown in shared belief, theory | Resolution propagates via lazy + @tracks |

### Edge Cases

| Scenario | Setup | Expected |
|----------|-------|----------|
| EDGE-1: Double branch | country → v2 → v3 (sequential) | Resolver walks to v3 |
| EDGE-2: Divergent branches | v1 → v2a, v1 → v2b (same time, no prob) | Error or pick one |
| EDGE-3: Resolution of resolution | Collapse A, then collapse again | Second resolution recorded |
| EDGE-4: Materialization with @resolution | Materialize path with existing collapse | Use resolved path |
| EDGE-5: @tracks chain with branches | @tracks → @tracks → state with branches | Full resolution |
| EDGE-6: Legacy + new branches | Legacy collapse, new timeline adds branches | Legacy resolution still valid |

---

## Open Questions for Test Design

1. **Branch ordering**: When multiple non-probability branches exist at same timestamp, which wins?
   - Current: "most recent by default" - but what defines "recent" if same timestamp?

2. **Cascading @resolution**: If A resolves to B, and B has branches, is that a new resolution?
   - Proposal: Yes, each uncertainty point gets its own @resolution

3. **@resolution vs materialization**: Does @resolution require materialization?
   - Proposal: No - @resolution is just a pointer, materialization is separate

4. **Convergence + lazy prop**: Can Convergence components have branches?
   - Proposal: Yes, query resolves branches within each component

5. **Subject.resolutions cleanup**: When are old resolutions garbage collected?
   - Deferred to branch lifecycle work

---

## Updated Success Criteria

Original criteria (still valid):
1. ✅ No cascade: Adding branch creates 1 belief, not thousands
2. ✅ Lazy resolution: NPCs inherit without materialization
3. ✅ Explicit control: Materialization only on explicit creation
4. ✅ Superposition support: Probability branches return superposition
5. ✅ Performance: O(changes) not O(NPCs)
6. ✅ Backward compatible: Existing code unchanged

New criteria (December 2024):
7. ✅ @resolution separation: Lazy prop and @resolution are orthogonal
8. ✅ Legacy support: @resolution visible via Session.legacy
9. ✅ All uncertainty types: State, Belief, and UNKNOWN trait resolution
10. ✅ @tracks compatibility: Works with timeline tracking
11. ✅ Test coverage: All matrix scenarios have tests
