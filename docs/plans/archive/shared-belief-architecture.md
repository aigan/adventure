# Shared Belief Architecture - Limbo with @timestamp

**Goal**: Implement proper architecture for shared cultural/template beliefs using "limbo" (null ownership) with `@timestamp` meta-trait for temporal tracking.

**Related**:
- CURRENT.md backlog - "Clarify shared belief architecture"
- docs/SPECIFICATION.md - Shared cultural knowledge
- docs/plans/lazy-version-propagation.md - Lazy propagation depends on this

## Context

Currently there's confusion about shared beliefs without minds/states. The codebase has workarounds for beliefs with `in_mind = null` and `origin_state = null`, but lacks proper temporal tracking and scoping.

**Current issues**:
- No temporal tracking for shared beliefs
- No scoping mechanism (which parent can access which shared beliefs)
- Inconsistent resolution patterns
- No clear semantics for "shared" vs "regular" beliefs

**New approach**: Embrace limbo (null ownership) as intentional design, add proper temporal tracking via `@timestamp` meta-trait, and implement scoping via `@scope` meta-trait.

## Design Principles

1. **Shared beliefs have null ownership** - Intentional design: `in_mind = null`, `origin_state = null`
2. **Temporal tracking via @timestamp** - Meta-trait stores creation time
3. **Scoping via @scope** - Meta-trait identifies which parent mind can access
4. **Unified interface** - `belief.get_timestamp()` works for both shared and regular beliefs
5. **Clear semantics** - Null ownership means "shared template", not "broken belief"

## Architecture Overview

```
world_mind (parent)
  ├─ beliefs: [world entities - hammer, workshop, etc.]
  ├─ states: [world timeline - state_100, state_110, ...]
  └─ nested minds:
       ├─ npc1_mind
       │    └─ beliefs: [{bases: ['country_culture'], ...}]
       └─ npc2_mind
            └─ beliefs: [{bases: ['country_culture'], ...}]

Shared beliefs (in limbo - not in any mind):
  country_culture_v1 {
    in_mind: null,
    origin_state: null,
    traits: {
      '@timestamp': 100,
      '@scope': world_mind._id,
      season: 'autumn'
    }
  }
  country_culture_v2 {
    in_mind: null,
    origin_state: null,
    bases: [country_culture_v1],
    traits: {
      '@timestamp': 110,
      '@scope': world_mind._id,
      season: 'winter'
    }
  }

player_mind (different parent)
  └─ Cannot access world's shared beliefs (@scope doesn't match)
```

**Key properties**:
- Shared beliefs exist in global registry only (not in any mind)
- `@timestamp` tracks when belief was created (maps to parent's timeline)
- `@scope` identifies which parent mind's children can access this belief
- NPCs reference via `bases: ['country_culture']` - label lookup finds shared belief
- Resolution filters by timestamp and scope

## Implementation Phases

### Phase 1: Add get_timestamp() Method to Belief ✅ COMPLETE

**Goal**: Unified interface for getting timestamp from both shared and regular beliefs.

**Changes**:
- ✅ Add `get_timestamp()` method to Belief class
- ✅ Check for `@timestamp` meta-trait first
- ✅ Fall back to `origin_state?.timestamp ?? 0`
- ✅ Added `Temporal` archetype for ontological modeling
- ✅ Tests added and passing

**Implementation**:
```javascript
class Belief {
  get_timestamp() {
    // Check meta-trait first (for shared beliefs)
    const timestamp_trait = this.traits.get('@timestamp')
    if (timestamp_trait !== undefined) {
      return timestamp_trait
    }

    // Fall back to origin_state (for regular beliefs)
    return this.origin_state?.timestamp ?? 0
  }
}
```

**Tests**:
- Regular belief with origin_state returns correct timestamp
- Shared belief with @timestamp meta-trait returns correct timestamp
- Belief without either returns 0
- Update all tests using origin_state.timestamp directly

**Migration**: Fully backward compatible (additive only)

### Phase 2: Add Parent Mind Tracking

**Goal**: Enable minds to identify their parent for scoping shared beliefs.

**Changes**:
- Add `parent: Mind|null` property to Mind class
- Set during mind creation (constructor parameter or setter)
- Can be derived from ground_state if not set explicitly
- Add helper: `get_parent_mind(mind, state)` - checks property, falls back to ground_state

**Implementation**:
```javascript
class Mind {
  constructor(label, parent = null) {
    this.parent = parent
    // ...
  }
}

function get_parent_mind(mind, state) {
  if (mind.parent) return mind.parent
  if (state?.ground_state) return state.ground_state.in_mind
  return null
}
```

**Tests**:
- Set parent explicitly during creation
- Derive parent from ground_state
- get_parent_mind returns correct parent
- Serialization handles parent (skip to avoid circular refs)

**Migration**: Existing minds get `parent = null` (backward compatible)

### Phase 3: Update Base Resolution to Include Shared Beliefs

**Goal**: When resolving bases by label, check for shared beliefs with appropriate scope.

**Changes**:
- Update `Belief.from_template()` base resolution logic
- Add lookup order: Archetype → Shared beliefs → Current mind
- Implement `resolve_base_label(label, mind, state)` helper
- Filter shared beliefs by `@scope` (matches parent mind)
- Filter shared beliefs by `@timestamp` (≤ query timestamp)
- Apply resolver to handle branches in shared beliefs

**Resolution logic**:
```javascript
function resolve_base_label(label, mind, state) {
  // 1. Check if label is archetype (global)
  const archetype = DB.get_archetype_by_label(label)
  if (archetype) return archetype

  // 2. Check shared beliefs (null ownership)
  const subject = Subject.get_by_label(label)
  if (subject) {
    const parent = get_parent_mind(mind, state)
    const candidates = DB.get_beliefs_by_subject(subject)
      .filter(b => b.in_mind === null)  // Shared only
      .filter(b => b.traits.get('@scope') === parent?._id)  // Scope match
      .filter(b => b.get_timestamp() <= state.timestamp)  // Temporal match

    if (candidates.length > 0) {
      // Apply resolver to pick appropriate version/handle branches
      return resolve_shared_belief(candidates, state)
    }
  }

  // 3. Fall back to current mind/state lookup
  const belief = state.get_belief_by_subject(subject)
  if (belief) return belief

  throw new Error(`Base not found: ${label}`)
}
```

**Tests**:
- Create shared belief with @timestamp and @scope
- Create NPC belief with bases: ['shared_belief_label']
- Verify NPC belief resolves to shared belief
- Verify temporal resolution (different timestamps get different versions)
- Verify scope filtering (wrong parent can't access)
- Verify branch resolution works for shared beliefs

### Phase 4: Add Shared Belief Creation Helper

**Goal**: Standardize creation of shared beliefs with proper meta-traits.

**Changes**:
- Add `Belief.create_shared(label, parent_mind, timestamp, {bases, traits})` static method
- Automatically sets `in_mind = null`, `origin_state = null`
- Automatically adds `@timestamp` and `@scope` meta-traits
- Registers in global registry

**Implementation**:
```javascript
class Belief {
  static create_shared(label, parent_mind, timestamp, {bases = [], traits = {}}) {
    const belief = new Belief(null, {
      bases,
      traits: {
        '@timestamp': timestamp,
        '@scope': parent_mind._id,
        ...traits
      }
    }, null)

    DB.set_label(belief.subject, label)
    return belief
  }
}
```

**Tests**:
- Create shared belief with helper
- Verify meta-traits are set correctly
- Verify null ownership
- Verify it's findable by label and subject

**Usage**:
```javascript
const country_v2 = Belief.create_shared(
  'country_culture',
  world_mind,
  110,
  {
    bases: [country_v1],
    traits: {season: 'winter'}
  }
)
```

### Phase 5: Update Documentation

**Goal**: Document the shared belief pattern with limbo and meta-traits.

**Changes**:
- Update SPECIFICATION.md:
  - Document shared beliefs with null ownership (intentional design)
  - Add `@timestamp` and `@scope` meta-trait explanations
  - Update example showing shared belief usage
- Update IMPLEMENTATION.md:
  - Document `belief.get_timestamp()` method
  - Document Mind.parent property
  - Document shared belief creation pattern
  - Document base resolution order: Archetype → Shared → Current
- Add example to world.mjs showing shared belief setup

**Documentation sections**:
- How to create shared beliefs (use `Belief.create_shared()`)
- How `@timestamp` provides temporal tracking
- How `@scope` enforces parent-based access control
- How NPCs inherit from shared beliefs via bases
- How temporal resolution filters shared beliefs
- Scoping rules (only children of same parent can access)

### Phase 6: Integration with Lazy Version Propagation

**Goal**: Ensure shared beliefs work seamlessly with lazy propagation.

**Changes**:
- Verify branch tracking works for shared beliefs
- Verify state resolver picks appropriate shared belief versions
- Verify materialization reuses shared beliefs correctly
- Add tests for full integration scenario
- Ensure `get_timestamp()` works correctly in resolver

**Test scenario**:
```
1. Create country_culture_v1 (shared, @timestamp=100)
2. Create country_culture_v2 (shared, @timestamp=110, branch of v1)
3. Create 1000 NPC beliefs with bases: ['country_culture']
4. Query NPCs at T100 → get v1 data (via @timestamp filter)
5. Query NPCs at T110 → get v2 data (lazy resolution)
6. Create explicit NPC version → materializes shared belief chain
7. Verify only 1 materialized city version for all NPCs
```

**Success criteria**:
- Shared beliefs participate in lazy propagation
- No cascade when updating shared beliefs
- Materialization reuses shared belief nodes correctly
- Temporal filtering via `@timestamp` works correctly
- Scope filtering via `@scope` prevents cross-parent access

## Migration Strategy

**Backward compatibility**:
- Phase 1-2: Additive only (existing code works)
- Phase 3-4: Additive (new features, doesn't break existing)
- Phase 5-6: Documentation and validation

**No breaking changes**: Limbo approach is already partially in use, we're just formalizing it with proper meta-traits and resolution logic.

**For existing shared beliefs**:
1. Any beliefs with `in_mind = null` but missing `@timestamp` get default timestamp 0
2. Add `@scope` meta-trait based on which minds reference them
3. No structural changes needed - just add missing meta-traits

**Pre-alpha consideration**:
- Not a concern yet - no production saves exist
- Limbo approach already partially used in codebase

## Current Status

- [x] Phase 1: Add get_timestamp() method to Belief
- [x] Phase 2: Add parent mind tracking
- [x] Phase 3: Update base resolution to include shared beliefs
- [x] Phase 4: Add shared belief creation helper (create_shared_from_template exists)
- [x] Phase 5: Add ground_mind scoping to shared beliefs (prevent cross-parent access)
- [ ] Phase 6: Update documentation
- [ ] Phase 7: Integration with lazy version propagation

**Notes:**
- Phases 1-5 implemented
- Phase 5 implemented with `Subject.ground_mind` property (not @parent_mind trait)
- Global shared beliefs (ground_mind=null) accessible from any context
- Scoped shared beliefs (ground_mind set) only accessible within parent hierarchy
- Base resolution filters by parent scope correctly
- Remaining: Documentation (Phase 6) and lazy propagation integration (Phase 7)

## Success Criteria

1. **Null ownership is intentional**: Shared beliefs explicitly have `in_mind = null`, `origin_state = null`
2. **Temporal tracking works**: `@timestamp` meta-trait + `get_timestamp()` method
3. **Scoping works**: `@scope` meta-trait enforces parent-based access control
4. **Resolution works**: Base label lookup finds shared beliefs with filtering
5. **No confusion**: Clear semantics - null ownership means "shared template"
6. **Tests pass**: Full integration with lazy propagation
7. **Clean code**: Proper handling of null ownership, no workarounds

## Notes

**Why limbo (null ownership) vs template minds**:
- Simpler: No fake states needed
- Honest: Shared beliefs are different from normal beliefs
- Timeline: `@timestamp` directly references parent timeline, no indirection
- Flexible: Can add more meta-traits as needed

**Why @timestamp instead of states**:
- Shared beliefs track parent's timeline, not their own
- No explosion of states for every possible timestamp
- Direct temporal comparison without state lookup
- Can still participate in lazy propagation via branches

**Meta-trait pattern**:
- `@timestamp`: When this belief version was created (maps to parent timeline)
- `@scope`: Which parent mind's children can access (scoping)
- Future: `@priority`, `@certainty`, etc. as needed
- `@` prefix clearly distinguishes system metadata from domain traits

**Relationship to lazy propagation**:
- Shared beliefs are where cultural knowledge branches live
- NPCs inherit via bases, resolver picks appropriate version
- Temporal filtering via `@timestamp` instead of origin_state.timestamp
- Materialization happens only when NPCs create explicit versions
- This architecture enables lazy propagation to work correctly
