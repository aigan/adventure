# Lazy Version Propagation with Branching Resolution

**Goal**: Enable efficient updates to shared cultural beliefs without cascading version creation across millions of NPCs. Beliefs lazily resolve inherited traits through branch detection and state-based resolution, only materializing new versions when explicitly created.

**Related**:
- docs/notes/version_propagation.md - Core design sketch from Claude Opus discussion
- docs/SPECIFICATION.md - Data model specification
- CURRENT.md (backlog) - Clarify shared belief architecture

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
3. **Traits may have superposition** - `get_trait()` may return `{type: 'superposition', branches: [...]}`
4. **Lazy materialization** - only create versions when explicitly requested
5. **Resolver decides or defers** - temporal/spatial cases return concrete values, probability cases return superposition
6. **Materialization on explicit creation** - creating new belief version walks bases and materializes dirty intermediate nodes

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
    probability: number,
    constraints: {...}
  }
}
```

### Resolution Flow

```
Query: npc_belief.get_trait(state, 'season')

1. Check npc_belief.traits.season → not found
2. Walk bases: npc_belief → city_belief
3. Check city_belief.traits.season → not found
4. Walk bases: city_belief → country_culture_v1
5. Check country_culture_v1.branches → [country_v2@T110, country_v3@T150]
6. Call state.resolve_branches([v2, v3], context)
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
Query: npc_belief.get_trait(state, 'king_status')

1-4. Same walk to country_culture_v1
5. Check branches → [v2a@T110 (p=0.6), v2b@T110 (p=0.4)]
6. Call state.resolve_branches([v2a, v2b], context)
7. Resolver sees both valid (same timestamp, probability-weighted)
8. Resolver returns superposition (can't decide)
9. Return {
     type: 'superposition',
     branches: [
       {path: v2a, value: 'dead', probability: 0.6},
       {path: v2b, value: 'alive', probability: 0.4}
     ]
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
- Add `branch_metadata: {origin_state, probability, constraints}` to Belief class
- Modify `Belief.from_template()` to register as branch when creating version of existing subject
- Add `add_branch(belief, metadata)` method
- Add `get_branches()` method

**Tests**:
- Create belief v1, create v2 with same subject → v1.branches contains v2
- Branch metadata captures origin_state reference
- Multiple branches accumulate in set
- Branches are not included in bases traversal

### Phase 2: Implement State Resolver Interface

**Files**: `public/worker/state.mjs`

**Changes**:
- Add `resolve_branches(branches, context)` method to State class
- Implements temporal filtering (compare origin_state.timestamp with this.timestamp)
- Returns single belief (filtered) or array of beliefs (superposition)
- Context object includes query metadata for future extensions

**Resolver logic**:
```javascript
resolve_branches(branches, context) {
  // Temporal filtering
  const valid = [...branches].filter(b =>
    b.branch_metadata.origin_state.timestamp <= this.timestamp
  )

  if (valid.length === 0) return null
  if (valid.length === 1) return valid[0]

  // Multiple valid branches - check if we can decide
  const probabilities = valid.map(b => b.branch_metadata.probability)
  if (probabilities.some(p => p != null)) {
    // Probability branches - return superposition
    return valid
  }

  // Pick most recent by default
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
- Call `state.resolve_branches(belief.branches, context)` when found
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
      const resolved = state.resolve_branches(current.branches, {})
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
        const resolved = this.resolve_branches(belief.branches, {})
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

- [ ] Phase 1: Add branch tracking to beliefs
- [ ] Phase 2: Implement state resolver interface
- [ ] Phase 3: Update trait resolution to walk branches
- [ ] Phase 4: Materialization on explicit version creation
- [ ] Phase 5: Update get_belief_by_subject() with resolver
- [ ] Phase 6: Superposition handling in state operations
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
