# Combinatorial Explosion: Components & Mitigations

A design reference for Adventure Alpha's belief-based architecture, documenting how the system manages possibility explosion across multiple dimensions.

**For Claude Code**: Start with "Key Insight" for the three core patterns, then dive into specific sections as needed. Check "Implementation Status" for what's ready to build.

## Contents

- **[Key Insight: Unified Patterns](#key-insight-unified-patterns)** — Start here: @resolution, Trait, @tracks
- **Axes 1-6** — The six dimensions of explosion and their mitigations
- **Cross-Cutting** — Shared mechanisms (Resolution, Tracking, Traits, Uncertainty, LOD, Flyweight)
- **Status** — Interaction Matrix, Implementation Status, Remaining Questions

---

## The Core Problem

The system maintains beliefs in nested minds with temporal versioning. Explosion occurs along multiple axes:

1. **World uncertainty** - Multiple possible world states (king alive/dead, hammer location)
2. **Theory of mind nesting** - NPC1's model of NPC2's model of NPC1...
3. **Temporal branching** - States fork at each tick with uncertainty
4. **Cultural propagation** - Shared beliefs cascading to millions of entities
5. **Timeline navigation** - Going back with/without preserving discoveries
6. **Theory timelines** - NPCs maintaining multiple theories about events

Each axis multiplies the others. Without mitigation, a simple scenario quickly becomes intractable.

---
## Key Insight: Unified Patterns

### @resolution as Universal Selector

The `@resolution` pattern handles multiple concerns:

1. **Convergence → branch**: Which world-state branch is real
2. **Multi-base belief → single base**: Which uncertain belief is true  
3. **Unknown → known**: Which belief resolves an unknown trait

All use the same mechanism: `@resolution` as belief reference, indexed for lookup, filtered by legacy/ancestry.

### Trait as Universal Result

The `Trait` object standardizes query results:

1. **recall()** → Trait iterator (what do I remember?)
2. **observe()** → Trait iterator (what do I perceive?)
3. **compare()** → Trait iterator (what differs?)
4. **template.match()** → Trait iterator (what fits?)

All return the same structure with subject, type, value, source, certainty.

### Promotions as Universal Efficiency

The promotion pattern (from belief.mjs) applies across axes:

1. **Cultural inheritance**: Query resolves through chain, no eager cascade
2. **Timeline tracking**: @tracks fallback to tracked timeline
3. **Theory updates**: Core observations accessible without copying

All use: inherit by default, materialize only on deviation. Cache when locked, keyed by tt.

### @tracks and alts

Timeline relationships are bidirectional and relative:

| Property | Direction | Cardinality | Purpose |
|----------|-----------|-------------|---------|
| `@tracks` | back | singular | Content fallback - "what timeline am I tracking?" |
| `alts` | forward | plural | Possibilities - "what alternatives branch from me?" |

**Core is relative**: Whatever timeline you're on is "core". Alts are alternatives from your perspective. Jumping to an alt makes it the new core.

### Three Mechanisms for Multi-Source Data

| Use case | Mechanism | Resolution |
|----------|-----------|------------|
| Timeline tracking | `@tracks` meta-property | Depth-first: local base chain, then @tracks |
| Prototype composition | Multiple `bases` | First-found (composable traits merge) |
| World uncertainty | `alts` + `@uncertainty` | Superposition across alts |

### Certainty Without Propagation

- @certainty only at split points
- Children inherit nothing
- Combined certainty = path_certainty × belief_certainty
- Cache on demand when state locked

---

---

---


## Axis 1: World Uncertainty (Horizontal Branching)

### Nature of the Problem
Multiple possible states exist simultaneously at the same tick:
- `state_3a`: NPC2 saw NPC1 take hammer (certainty: unusual)
- `state_3b`: NPC2 didn't see anything (certainty: common)

Each branch can spawn further branches. Unconstrained, this is O(2^n) per tick.

### Current Mitigation: Certainty Levels
Discrete levels: `certain`, `common`, `unusual`, `rare`

Branches carry probability weights. Constraint satisfaction can prune unlikely branches when observations contradict them.

### Current Mitigation: Observation-Driven Collapse
Only player observations force collapse. Internal simulation keeps possibilities open until dramatically necessary.

> "Like a DM keeping options" - collapse happens based on narrative need, not simulation eagerness

### Current Mitigation: Conflict Tracking
```yaml
belief_x:
  conflicts_with: [observation_y]
```
Explicit conflict markers enable constraint propagation without immediate collapse.

### Deferred Questions
- Branch pruning/merging and cleanup phases → see Branch lifecycle in Open topics

---

## Axis 2: Theory of Mind Nesting (Vertical Depth)

### Nature of the Problem
Minds contain beliefs that reference other minds:
```
world_mind
  └─ npc1_mind
       ├─ npc1_model_of_npc2  (what NPC1 thinks NPC2 knows)
       │    └─ npc2_model_of_npc1  (what NPC1 thinks NPC2 thinks NPC1 knows)
       └─ facade_for_player  (what NPC1 wants player to believe)
```

Each nesting level can have its own state timeline with branches. Depth 3-4 is common in social reasoning. Arbitrary depth is theoretically possible.

### Current Mitigation: Ground State Linking
```javascript
npc_mind.state_5.ground_state = world_mind.state_10
```
Child states reference parent context. Fork invariant: `child.tt = parent_state.vt`

This provides coordination without duplicating parent state.

### Current Mitigation: Structural Deception
Facade minds are separate belief containers, not merged with actual knowledge:
```yaml
npc1_mind:
  beliefs:
    facade_for_player:
      archetype: mind
      beliefs:
        false_hammer_location:
          location: workshop_1  # The lie
```

Deception is structural difference between minds, not flags on beliefs.

### Deferred Questions
- Practical depth limits → test empirically
- Prototype mind models → see Prototype minds for ToM in Open topics

---

## Axis 3: Temporal Branching (Timeline Divergence)

### Nature of the Problem
Each state can have multiple branches representing:
- Different time periods (seasons, news events)
- Alternative futures (planning scenarios)
- Past reconstructions (memory variations)

```yaml
state_2:
  branches: [state_3a, state_3b]

state_3a:
  branches: [state_4a, state_4b]  # Further divergence
```

Without pruning, timelines multiply indefinitely.

### Current Mitigation: Bi-temporal Semantics
- **Transaction Time (tt)**: When state was created
- **Valid Time (vt)**: What time the state is *about*

Enables temporal reasoning without duplicating state:
- Memory: `vt < tt` (thinking about past)
- Planning: `vt > tt` (thinking about future)
- Present: `vt = tt`

### Current Mitigation: State Differential Updates
States only track `insert` and `remove` operations, not full belief lists. Inheritance via `base` chain.

### Planned: Decision Time (DT)
Third temporal dimension for knowledge provenance:
- When was this information learned/decided?
- Enables testimony chains

### Deferred Questions
- Garbage collection and planning branch lifecycle → see Branch lifecycle in Open topics

---

## Axis 4: Cultural Propagation (Inheritance Cascade)

### Nature of the Problem
Shared beliefs (country → city → individual) could cascade updates to millions:
```
country_v1 (autumn)
  └─ city_paris (inherits)
       └─ npc_1 through npc_1000000 (all inherit)
```

Eager propagation when country changes to winter = O(n) new beliefs.

### Current Mitigation: Promotions
Only the source creates a new version. Dependents discover via promotion resolution:

```javascript
// Country updates (creates 1 belief with promotion)
country_v2 = {..., bases: [country_v1], traits: {season: 'winter'}}
country_v1.promotions.add(country_v2)

// City and NPC beliefs UNCHANGED
// Query resolves via promotions:
npc.get_trait(state, 'season')
  → walks: npc → city → country_v1
  → detects: country_v1.promotions
  → resolves: picks by tt
  → returns: 'winter'
```

Caching: safe when querying belief's tt >= promotion's tt (promotion is in past).

### Current Mitigation: Deferred Materialization
New intermediate versions only created when entity needs to record own state:
```javascript
// NPC forms opinion → triggers materialization
npc_v2 = new Belief({traits: {opinion: 'hate winter'}})
// System creates city_v2 pointing to country_v2
// npc_v2 points to city_v2
```

Second NPC reuses city_v2. 1000 NPCs = 1 country_v2 + 1 city_v2 + 1000 npc_v2.

### Deferred Questions
- Cache invalidation → implementation detail
- Materialization triggers → when NPC records personal deviation

---

## Axis 5: Timeline Navigation & Branching

### The Totality Problem

Need terminology for "all data at a conceptual moment" - all minds, all states, all beliefs. Current `State` class is per-mind. The totality is implicit (collection of states where `tt` matches) but has no explicit name or object.

**Terminology candidates** (avoiding conflict with State class):
- **Snapshot** - neutral, common in save/load
- **Chronicle** - emphasizes temporal accumulation  
- **Cosmos** - fits Logos/Eidos philosophical naming

Currently handled by serialize module but unnamed conceptually.

### Three Modes of "Going Back"

**1. Reload** (reset computational state)
- Load earlier snapshot
- All collapses undone
- Killer is back to uncertain
- Like rewinding tape - erases what came after

**2. Flashback** (change vt, preserve tt knowledge)
- Move to earlier valid-time
- Collapsed facts remain collapsed
- Killer is still Bob, experiencing events before reveal
- Read-only experiencing, not acting

**3. Committed Branch** (new timeline with locked constraints)
- Branch from earlier tick
- Observations up to branch point are locked
- Future is inherited but recalculable
- Player can act, butterfly effect applies

### What Carries Into Branched Timeline

**Locked (observations):**
- Direct perceptions up to branch point
- Discovered entities/locations
- Established character traits/psychology

**NOT locked (outcomes):**
- Future observations (haven't happened in new branch)
- Future NPC decisions (recalculated from psychology + circumstances)
- Any predetermined "fate"

### NPC Behavior Recalculation

**Observations** lock what you directly perceived:
- Bob was in workshop at tick 3
- Hammer was in drawer at tick 2

**NPC decisions** regenerate from psychology + situation:
- Bob took hammer *because* angry at Alice
- Different branch: defuse argument → Bob not angry → Bob doesn't take hammer

Key insight: You're not locking "Bob took hammer" - you're locking "Bob was capable/motivated under those conditions." The *why* remains flexible for story generation.

**GM move for consistency**: If observation seems to conflict with changed circumstances, system finds compatible causation. Bob still takes hammer but for different reason that fits new situation.

### No Fate / No Railroading

This is a core design constraint, not optional:

> "If the DM/game tries to make the same thing happen regardless of player action, it would be exactly the same type of frustrating unsatisfactory thing that plague many current games."

Player actions cause butterfly effects. Future is not predetermined. Outcomes emerge from NPC psychology + circumstances, recalculated when circumstances change.

### Timeline Inheritance (Forward via Promotions)

New branch inherits parent timeline's future as default:

```
Timeline A: tick 1 ──────────────────────► tick 50
                         │
            branch at tick 5
                         │
Timeline B: tick 5 ───(inherited from A)───► tick 50
                              │
                    only recalculate at deviation points
```

NOT "fresh uncertainty regenerated" but inherited default that only changes where butterfly effect applies.

**Efficiency insight**: Like promotions for inheritance chains, but applied temporally. Future states aren't regenerated, they're inherited via @tracks. Computation only at deviation points.

**Implementation**: States use @tracks to reference parent timeline. Query falls back to @tracks when local chain has no value. Copy-on-write - states only materialize when they differ.

---

## Axis 6: Theory Timelines & Core/Overlay Structure

### Fundamental Symmetry

World uncertainty and mind uncertainty use the same mechanism:
- World having possibility superposition = person having multiple theories
- Timeline = series of states in progressive vt
- Planning/scenarios exist as separate timelines in mind

### Theories Track Core via @tracks

Theories use same @tracks pattern as timeline tracking. No diamond inheritance needed.

```
core_state_5:
  bob.expression = nervous

theory_A_state_5:
  base: null                    # start of theory chain
  @tracks: core_state_5         # observations from core
  insert: [bob.guilty = true]   # local interpretation

core_state_8 (base: core_state_5):
  bob.expression = calm         # new observation

theory_A_state_8:
  base: theory_A_state_5        # local chain continues
  @tracks: core_state_8         # tracks advanced core
  insert: []                    # no new interpretation yet
```

**Query "Bob's expression?" from theory_A_state_8:**
1. Walk local base chain → nothing
2. Fall back to @tracks → core_state_8 → calm ✓

**Query "is Bob guilty?" from theory_A_state_8:**
1. Walk local base chain → theory_A_state_5 → guilty = true ✓

### Three Layers in Theory States

1. **Inherited from core** (via @tracks): Raw observations, automatic
2. **Interpretive overlay** (local chain): Meaning assigned to observations
3. **Derived beliefs** (local chain): Consequences of interpretation

### Theory Update via advance_tracked_timeline()

Same pattern as timeline tracking - use `advance_tracked_timeline(theory_state, target_vt)` to advance @tracks to appropriate core state.

Theory automatically sees new observations. Interpretations persist until explicitly updated.

### Contradiction Handling (Deferred)

Stale interpretations may conflict with new observations (e.g., "Bob is guilty because nervous" but Bob now calm). Detection and handling belong to psychology (Alpha 4):
- Cognitive dissonance
- Stress from contradictions
- Re-evaluation triggers

### Deferred Questions

- Theory creation triggers → template/situation driven
- Theory pruning → psychology domain, branch lifecycle
- Querying theories by belief → index by key beliefs

---


---

---


## Cross-Cutting: Resolution Lookup Efficiency

### Change vs Discovery Semantics

The data must distinguish:

**Change**: "Tree was standing, now fell" → new trait value, different vt
**Discovery**: "Tree was uncertain, now we know it was always standing" → resolution of past

Without this distinction, can't correctly answer "what was tree's state at tick 5?" after discovering at tick 20.

### Unified Resolution Pattern: @resolution as Belief Reference

Resolution is a trait (`@resolution`) that points to a belief. No wrapper object needed.

**Unknown trait resolution:**
```
obs_A1 (tt=1):
  subject: cell_A1
  exit_direction: unknown

obs_A1_v2 (tt=2):
  subject: cell_A1
  base: obs_A1
  exit_direction: not_E
  @resolution: obs_A1
```
- Points to belief whose unknown trait is now known
- New belief provides the value

**Multiple belief resolution:**
```
obs_A1_alt1 (tt=1):
  subject: cell_A1
  exit_direction: E

obs_A1_alt2 (tt=1):
  subject: cell_A1
  exit_direction: S

obs_A1_resolved (tt=2):
  subject: cell_A1
  bases: [obs_A1_alt1, obs_A1_alt2]
  @resolution: obs_A1_alt2
```
- Points to which base to follow
- Value comes from selected base (no duplication)

**Traversal logic:**
- Does `@resolution` match one of my bases? → Follow it for traits
- Otherwise → Resolving an unknown trait in that belief

### Subject Index for Backward Navigation

Subject holds resolution map:

```
subject cell_A1:
  sid: 100
  resolutions: Map<state_id, state_id>
    state_1 → state_2   # "uncertainty at state_1 resolved in state_2"
```

The map says: "if looking at state_1 and state_2 is in your timeline, jump to state_2 for the answer."

### Session with Legacy

```
Session:
  world: world_mind
  state: state_1        # current position in timeline
  avatar: player
  legacy: state_2       # committed discoveries from previous run
```

**Legacy** is the committed state from a previous run. It carries forward player discoveries across timeline navigation.

**Backward navigation with legacy:**
1. Query beliefs about subject at current state
2. Check subject.resolutions against legacy (not just current ancestry)
3. If legacy state is in resolutions → resolution applies
4. Get resolved value even though "before" the discovery

**New run from tick 1 with legacy:**
- state: state_1 (reset position)
- legacy: state_2 (keeps discoveries)
- Player "knows" answers from previous run

**True reload (no legacy):**
- state: state_1
- legacy: null
- Uncertainty restored, all possibilities open

### Symmetry Across Uncertainty Types

| Type | Uncertainty | Resolution |
|------|-------------|------------|
| State | Convergence (explicit container) | `@resolution` → branch |
| Belief | Multiple beliefs, same subject/vt | `@resolution` → selected belief |
| Trait | Unknown value | `@resolution` → belief being resolved, new belief has value |

All use same:
- `@resolution` as belief/state reference
- Subject index for backward lookup
- Legacy check for committed branch navigation

### Efficiency Analysis

**Same session, normal play:**
- Few resolutions (only what player observed)
- All resolutions in current state ancestry
- O(1) lookup via subject index

**Committed branch with legacy:**
- Check resolutions against legacy state
- Same O(1) lookup
- Resolution applies across timeline navigation

**Cross-session / different legacy:**
- Different player's save has different legacy
- Their resolutions don't apply to your timeline
- Superposition remains for you

---

## Cross-Cutting: State Tracking & Convergence

### Unified Base Resolution

States can have multiple bases. Resolution rule is simple:

- **Has @uncertainty** → return superposition (needs @resolution)
- **Otherwise** → first-found wins (priority)

No mode field needed. Uncertainty is the special case.

### Timeline Tracking via @tracks

New timeline tracks another timeline via `@tracks` meta-property. Uses **overlay semantics**: local beliefs take precedence by subject, @tracks provides content for unhandled subjects.

**Key concept:** `@tracks` is a **timeline reference**, not a specific state. The resolver navigates forward via `_branches` to find the appropriate state for the query vt.

**Timeline structure:**
```
core: state_5 → state_6 → state_7 → ... → state_50
         ↓ _branches  ↓ _branches
       [state_6]    [state_7]   (forward links exist)
```

**Alt timeline with base:null + @tracks:**
```
alt_state_6:
  base: null              # NO shared base with core
  @tracks: state_5        # entry point into tracked timeline (≤ own vt)
  _insert: [belief_bob_forest]  # local deviation

alt_state_8:
  base: alt_state_6       # own chain continues
  @tracks: state_5        # same entry point, resolver advances
  _insert: []
```

**Query algorithm (overlay with handled_subjects):**
```javascript
*get_beliefs_with_tracks(query_vt) {
  const handled_subjects = new Set()

  // Walk local chain first - collect handled subjects
  for (let s = this; s; s = s.base) {
    for (const belief of s._remove) {
      handled_subjects.add(belief.subject)  // removed = handled
    }
    for (const belief of s._insert) {
      handled_subjects.add(belief.subject)  // inserted = handled
      yield belief
    }
  }

  // Navigate @tracks forward to query_vt, yield unhandled subjects
  if (this.@tracks) {
    const tracked_state = advance_to_vt(this.@tracks, query_vt)
    for (const belief of tracked_state.get_beliefs()) {
      if (!handled_subjects.has(belief.subject)) {
        yield belief
      }
    }
  }
}
```

**Local wins by subject:** If local chain has ANY belief about a subject (insert or remove), @tracks belief for that subject is skipped. No automatic trait merging - use belief `_bases` for trait continuity.

**Navigating @tracks to query vt:**
```javascript
advance_to_vt(entry_state, target_vt):
  let current = entry_state

  // Follow _branches forward while vt <= target_vt
  while (current._branches.length >= 1) {
    const next = current._branches.find(b => b.vt <= target_vt)
    if (!next || next.vt > target_vt) break
    current = next
  }

  return current
```

Entry state must be ≤ tracking state's vt. Resolver walks forward via `_branches` to find state at query vt. Multiple branches filtering deferred (initially follow all that advance vt).

### Prototype Composition via Bases

Same multi-base structure, different use:

```
knight:
  bases: [warrior, defender]
```

First-found for singular traits. Composable traits merge via Traittype logic.

### World Uncertainty via Bases

```
convergence_tree:
  bases: [tree_standing, tree_fallen]
  @uncertainty: true
```

Returns superposition. Needs @resolution to collapse.

### Summary: Three Mechanisms

| Use case | Mechanism | Resolution |
|----------|-----------|------------|
| Timeline tracking | `@tracks` meta-property | Depth-first: local, then @tracks |
| Prototype composition | Multiple `bases` | First-found (composable traits merge) |
| World uncertainty | `alts` + `@uncertainty` | Superposition across alternatives |

### Alternative Timelines (alts)

Bidirectional relationship between core and alternative timelines:

```
core_state:
  alts: [alt_A, alt_B, alt_C]
  @uncertainty: true  # if alternatives are live possibilities

alt_A:
  @tracks: core_state  # content fallback
  base: previous_alt_A_state
```

**Properties:**
- `alts` (forward, plural) - "what alternatives branch from me?"
- `@tracks` (back, singular) - "what timeline am I tracking for content?"

**Core is relative**: Whatever timeline you're on is "core". Alts are alternatives from your perspective.

**Jumping to an alt:**
```
Before:
  Session.state = core_state
  core_state.alts = [alt_A, alt_B]
  alt_A.@tracks = core_state

After jump to alt_A:
  new_state = State {
    base: alt_A,
    alts: [old_core_as_alt],  # old reality as possibility
  }
  old_core_as_alt.@tracks = new_state  # inverts
  Session.state = new_state
```

Future observations happen in new_state. Old core demoted to alt.

### Adding Past Possibilities

To add a possibility branching in the past (e.g., "hammer was dropped at vt=2" added at tt=10):

**Problem**: Can't modify locked states. Adding alt to past state would change it.

**Solution**: Switch core timeline. Old core becomes an alt:

```
Before:
  core: obs_1 → obs_2 → obs_3 → obs_4
  core.alts: [alt_A, alt_B]

Want to add possibility C branching at vt=2.

After:
  new_core: (shared observations only)
  new_core.alts: [old_core_as_alt, alt_C]
  
  old_core_as_alt:
    @tracks: new_core
    # what was "certain" - now just one possibility
    
  alt_C:
    @tracks: new_core
    # the new past possibility
```

The "certain" past becomes uncertain. Old core demoted to alt. New core holds only what's truly shared across all possibilities.

**Caching**: Safe because locked nodes don't change. @tracks points to specific locked state. Cache keyed by tt - queries from before alt was added don't see it.

---

## Cross-Cutting: Trait as First-Class Object

### Reified Traits

Currently traits are key/value pairs embedded in beliefs. For query results, comparisons, and recall, we need traits as passable objects:

```
Trait:
  subject: Subject      # what entity this is about
  type: Traittype       # what kind of trait
  value: any            # the actual value
  source: Belief        # where it came from
  certainty: Certainty  # how certain
```

### Use Cases

Same structure works everywhere you need "a trait with its context":

```
recall(subject, vt, scope) → Trait iterator
observe(subject, state) → Trait iterator
compare(belief_a, belief_b) → {shared: Trait[], differ: Trait[]}
template.match(entity, required_traits) → Trait iterator
narrator.describe(Trait[]) → text
```

### recall() Function

Flattens container hierarchy, returns traits regardless of where they live:

```
recall(hammer_subject, vt=5) →
[
  Trait{type: 'color', subject: handle_subject, value: 'red', certainty: 'common', source: handle_belief_red},
  Trait{type: 'color', subject: handle_subject, value: 'blue', certainty: 'unusual', source: handle_belief_blue},
  Trait{type: 'material', subject: head_subject, value: 'iron', certainty: 'certain', source: head_belief},
  Trait{type: 'weight', subject: hammer_subject, value: 'heavy', certainty: 'certain', source: hammer_belief},
]
```

### Scoped Queries

For interview-style queries, recall takes scope:

```
recall(suspect_subject, vt, scope: 'appearance') →
[
  Trait{type: 'hair_color', value: 'dark', certainty: 'certain'},
  Trait{type: 'height', value: 'tall', certainty: 'common'},
]

recall(suspect_subject, vt, scope: 'relationships') →
[
  Trait{type: 'enemy', value: bob_subject, certainty: 'common'},
]

recall(self_subject, vt: yesterday_morning, scope: 'location') →
[
  Trait{type: 'location', value: workshop_subject, certainty: 'certain'},
]
```

Scope comes from archetype (trait categories) or query specification.

### Uncertainty in Results

- **Superposition**: Multiple Trait entries with same type+subject, different values
- **Unknown**: No Trait entry for that type, or explicit unknown value
- **Certain**: Single Trait entry with certainty: certain

Caller filters/groups as needed for presentation.

---

## Cross-Cutting: Superposition, Unknown Traits & Belief-Level Uncertainty

### Uncertainty Only at Split Point

Certainty metadata lives only where states split, not propagated to children:

```
state_5 (normal)
  │
  └─ splits:
       state_6a @certainty: common
       state_6b @certainty: unusual

state_6a (has certainty - this is the split point)
  └─ state_7a (normal, no certainty)
       └─ state_8a (normal)
```

Benefits:
- Most states have no uncertainty metadata
- No propagation logic
- Branch membership implicit in base chain
- Split point is single source of truth

### Certainty as Internal Float, External Keyword

Internally use numbers for combination (placeholder values - tune later):
```
certain  = 1.0
common   = 0.6   # placeholder
unusual  = 0.3   # placeholder
rare     = 0.1   # placeholder
```

Externally use keywords (no false precision):
```
Trait:
  certainty: unusual  # keyword in API
```

### Combined Certainty

Trait certainty = path_certainty × belief_certainty

```
state_A @certainty: 0.6 (common)
  └─ state_A1a @certainty: 0.6 (common)
       └─ belief_red @certainty: 1.0 (certain)

path_certainty = 0.6 × 0.6 = 0.36
trait_certainty = 0.36 × 1.0 = 0.36 → unusual
```

### Cached Path Certainty

Walking back through multiple splits on every query = expensive.

Cache at state level:
```
state_A1a:
  @path_certainty: 0.36  # product of state uncertainties above
```

Only recompute when new splits added above (rare).

recall() uses: cached_path_certainty × belief.@certainty

### Three Levels of "Not Known"

1. **Truly unknown** - no trait value, query returns nothing (or `unknown` marker)
2. **Constrained** - not X, but could be Y or Z  
3. **Superposition** - explicitly X or Y with certainties

Most traits start as (1). Many stay as (1) or move to known. Only narratively significant uncertainty needs (3).

Reserve belief-level superposition for things like "who is the killer" where the uncertainty itself is story-relevant.

### Belief-Level Uncertainty

Uncertainty lives in *which belief*, not *which value within belief*. Keeps trait lookup hot path simple.

```
hammer_belief_red (vt=5, base=hammer_base)
  handle_color: red
  @certainty: common

hammer_belief_blue (vt=5, base=hammer_base)
  handle_color: blue
  @certainty: unusual
```

Trait lookup on a belief: O(1), unchanged
Belief selection: where uncertainty surfaces

**Identification**: Multiple beliefs with same subject + same vt + same base = superposition

No explicit container needed (unlike Convergence for states). Subject provides identity grouping.

### Unknown Trait Pattern

For traits that simply aren't known yet:

```
obs_A1 (tt=1):
  subject: cell_A1
  exit_direction: unknown
```

Later discovery creates versioned belief:

```
obs_A1_v2 (tt=2):
  base: obs_A1
  exit_direction: not_E
  @resolution: obs_A1
```

No superposition needed - just unknown → known via normal versioning with `@resolution` marker.

### recall() Pattern

For querying what's known about a subject:
1. Find all beliefs about subject at vt
2. Single belief with known value → return it (with combined certainty)
3. Single belief with unknown → return unknown
4. Multiple beliefs with same base = superposition → return set with combined certainties
5. Consumer (template, narrator) decides presentation

Combined certainty = path_certainty (from state splits) × belief.@certainty

### Resolution via Multi-Base Collapse

When we discover which uncertain belief is true:

```
hammer_resolved:
  bases: [hammer_belief_red, hammer_belief_blue]
  @resolution: hammer_belief_red
```

`beliefs_at_tt(after_resolution)` → yields only `hammer_resolved` (outermost)
`beliefs_at_tt(before_resolution)` → yields both uncertain beliefs

Resolution collapses structurally. No data duplication - `@resolution` points to which base to follow.

### Superposition Return Format

When resolver can't pick a single value:

```javascript
{
  type: 'superposition',
  branches: [
    {belief: hammer_belief_red, value: 'red', certainty: 0.36},
    {belief: hammer_belief_blue, value: 'blue', certainty: 0.18}
  ]
}
```

Caller decides based on dramatic appropriateness, then creates resolution.

---

## Cross-Cutting: Level of Detail (LOD)

Simulation granularity varies with player proximity:

| LOD | Scope | Simulation |
|-----|-------|------------|
| 1 | Immediate surroundings | Full detail |
| 2-3 | Local area | Individual NPCs, simplified |
| 4-5 | Region | Groups, aggregate behavior |
| 6-7 | Distant lands | Abstract forces (war, famine) |

LOD intersects with possibility management:
- High LOD = more possibilities need tracking
- Low LOD = aggregate probabilities, fewer branches
- Transitioning LOD = "rez up" from possibilities to materialized entities

### Deferred Questions
All LOD questions deferred → see LOD + minds in Open topics

---

## Cross-Cutting: Flyweight/Prototype Pattern

Shared structure reduces per-entity cost:

```
Archetype: Villager
  └─ Cultural mind prototype (shared beliefs)
       └─ Individual NPC mind (personal variations only)
```

NPCs don't duplicate "wolves are dangerous" - they inherit it.

### Current Implementation
- Archetypes define trait structure
- Cultural beliefs live in prototype minds
- Instance minds inherit via `bases`
- Only personal deviations stored per-entity

### Deferred Questions
- Prototype minds for theory of mind → see Open topics
- Temporal updates use promotions

---

## Cross-Cutting: Version Control Analogy

Timeline branching resembles git. Key patterns now captured:
- Branch inherits parent → `base` chain + `@tracks`
- Only creates new on change → promotions
- Branch metadata → `@tracks` references

Remaining VC concepts for future consideration: merge, cherry-pick, rebase, reflog.

---


---

---


## Interaction Matrix

| Axis | Compounds With | Mitigation Interaction |
|------|----------------|------------------------|
| World uncertainty | Theory of mind | Each nested mind can have own branches |
| World uncertainty | Temporal | Branches × time points |
| World uncertainty | Cultural | Branch at top cascades lazily |
| World uncertainty | Timeline nav | Committed branch locks some, opens others |
| World uncertainty | Theory timelines | World superposition = mind's multiple theories |
| Theory of mind | Temporal | Each nesting level has own timeline |
| Theory of mind | Cultural | Nested models can inherit from prototypes |
| Theory of mind | Theory timelines | Theories are about other minds' beliefs |
| Temporal | Cultural | Season changes propagate lazily through time |
| Timeline nav | All axes | Inheritance as default reduces recalculation |
| Theory timelines | Cultural | Theories inherit shared knowledge via core |
| Theory timelines | Temporal | Theory versions track vt progression |

---

## Implementation Status

### Implemented
| Component | Location |
|-----------|----------|
| State branching | state.mjs |
| Ground state linking | state.mjs |
| Bi-temporal (tt/vt) | state.mjs |
| Snapshot serialization | serialize.mjs |
| Convergence (prototype composition) | convergence.mjs |

### Designed - Ready for Implementation
| Component | Location | Notes |
|-----------|----------|-------|
| Promotions | IMPLEMENTATION.md, belief.mjs | Core pattern established |
| Unified @resolution trait | This document | Simple belief reference, no wrapper |
| Belief-level uncertainty | This document | Multiple beliefs, same subject/vt |
| Unknown trait resolution | This document | New belief with value + @resolution marker |
| Superposition returns | IMPLEMENTATION.md | Returns set, consumer resolves |
| Multi-base collapse | This document | Resolved belief has uncertain beliefs as bases |
| Subject resolution index | This document | Map<state_id, state_id> for backward lookup |
| Session.legacy | This document | Committed state for cross-timeline resolution |
| Trait object | This document | Reified trait with subject, type, value, source, certainty |
| recall() function | This document | Returns iterator, flattens hierarchy |
| @tracks meta-property | This document | Fallback to parallel timeline, depth-first |
| advance_tracked_timeline() | This document | Follow branches to vt <= target |
| Theory tracking core | This document | Theories use @tracks for observations, local chain for interpretations |
| Certainty at split only | This document | No propagation to children |
| Combined certainty | This document | path_certainty × belief_certainty |
| alts property | This document | Forward links to alternative timelines |
| Relative core pattern | This document | Core = current, jumping inverts @tracks/alts |
| Past possibility addition | This document | Switch core, demote old core to alt |

### Specified - Needs Implementation Design
| Component | Location | Notes |
|-----------|----------|-------|
| Certainty levels | SPECIFICATION.md | Discrete levels → internal floats (values TBD) |
| Facade minds | SPECIFICATION.md | Structural deception |
| Convergence @uncertainty | This document | Extends existing convergence |

### Conceptual - Needs More Design
| Component | Notes |
|-----------|-------|
| Decision time (dt) | Third temporal dimension |
| LOD system | Orthogonal, distant mind compression |
| Branch lifecycle | Pruning, merging, garbage collection |

---

## Discussion Topics - Analyzed Status

### Resolved by @resolution + Promotions + Trait + @tracks

These concerns are addressed by the current design:

| Topic | How it's resolved |
|-------|-------------------|
| **World uncertainty collapse** | @resolution on convergence selects branch |
| **Belief uncertainty collapse** | @resolution on multi-base belief selects path |
| **Unknown trait discovery** | @resolution marks discovery, new belief has value |
| **Cultural propagation** | Promotions - O(1) update, O(depth) query |
| **Change vs discovery semantics** | @resolution is discovery; new belief at different vt is change |
| **Sparse independent uncertainty** | Belief-level: multiple beliefs, same subject/vt/base |
| **Structural correlated uncertainty** | State-level: convergence with @uncertainty |
| **Recall semantics** | recall() returns iterator of Trait, combined certainty |
| **Cross-timeline resolution visibility** | Legacy state check in subject.resolutions |
| **Forward navigation efficiency** | @resolution inherits normally, cached |
| **Backward navigation** | Subject index: Map<state_id, state_id> |
| **Theory core/overlay** | Theories use @tracks to follow core, local chain for interpretations |
| **Committed branch constraints** | Session.legacy carries resolutions across timeline resets |
| **Query/compare/observe results** | Trait object: reified trait with context |
| **Forward timeline inheritance** | @tracks meta-property, overlay semantics: local wins by subject |
| **Certainty propagation** | No propagation - @certainty only at split point |
| **Combined certainty** | path_certainty × belief_certainty |
| **Convergence modes** | Simplified: @uncertainty → superposition, else first-found |
| **Trait scope** | Handled by Traittype (trait.type) |
| **Diamond inheritance** | Eliminated - theories track core via @tracks, no multi-base needed |
| **Theory update flyweight** | @tracks advances via branches, local chain for interpretations |
| **Theory initialization** | base: null, @tracks: core_state - starts fresh, observations from @tracks |
| **Alternative timelines** | alts (forward plural) + @tracks (back singular), bidirectional |
| **Relative core** | Core = where you are, alts from your perspective, jumping inverts |
| **Past possibility addition** | Switch core timeline, old core becomes alt |
| **@tracks overlay semantics** | handled_subjects pattern: local insert/remove marks subject as handled, skip from @tracks |
| **Cross-timeline belief._bases** | Allowed if in accessible scope (own mind, Eidos, mind prototypes) |
| **@tracks resolver navigation** | Forward via _branches from entry point to query vt |
| **Trait continuity across timelines** | Via belief._bases inheritance, no automatic merging |

### Deferred - Not Needed for First Implementation

| Topic | Resolution |
|-------|------------|
| **Certainty float values** | Exact mapping not important yet |
| **@path_certainty cache** | Standard cache-on-lock pattern, skip for v1 |
| **recall() depth bounds** | Iterator - caller controls |
| **Contradiction detection** | Psychology domain - cognitive dissonance, stress |
| **Re-evaluation triggers** | Psychology domain - when does NPC reconsider beliefs |

### Open - Needs Design Work

| Topic | Nature of gap |
|-------|---------------|
| **Branch lifecycle** | When pruned? When merged? What triggers cleanup? |
| **Nested mind depth limits** | Practical performance question - may just be "test and see" |
| **LOD + minds** | Orthogonal system - can distant NPC minds be "dormant"? |
| **Prototype minds for ToM** | Shared "typical villager model" - inheritance pattern exists, specific design needed |
| **Butterfly effect scope** | How far forward does deviation ripple? Story-relevant only? Causally connected? |
| **Terminology (Snapshot/Chronicle/Cosmos)** | Naming decision needed for "all data at a moment" |
| **Decision time (dt)** | Third temporal dimension - still planned, not designed |

### Potentially Removed - May Not Be Issues

| Topic | Why it might not be an issue |
|-------|------------------------------|
| **Unified uncertainty levels** | Resolved: State (convergence) + Belief (multi-base). Trait level pushed to belief level. |
| **Superposition who decides** | Resolved: Template/observation creates @resolution. Structure holds ambiguity until then. |

---

## Remaining Architectural Questions

1. **@tracks and multiple branches in legacy**: When `tracked.branches.length > 1` during advance - deferred, use legacy resolutions for now.

2. **Alts during core advancement**: When core advances, need to update alts list to point to current tip of each alt timeline. Mechanism TBD.

---

*Last updated: Clarified @tracks overlay semantics (handled_subjects pattern), forward navigation via _branches, cross-timeline belief._bases allowed, trait continuity via inheritance not merging*
