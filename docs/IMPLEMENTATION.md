# Implementation

## Project Vision

**What it is**: A single-player systemic story game where narrative emerges from simulated agents and constraint-based generation, rather than pre-authored content. Think NetHack/Dwarf Fortress narrative depth meets detective game investigation, with Wildermyth-style adaptive story arcs.

**How it works**:
- **Agent simulation**: NPCs with memory, beliefs, planning, psychology
- **Wavefunction collapse for story**: Unobserved game state exists as possibilities, collapses to coherent outcomes when the player engages with it
- **Multi-resolution simulation**: Abstract when unobserved, detailed when the player looks
- **Thread weaving**: Multiple overlapping story threads that connect based on what the player chooses to engage with

## Design Principles

### Core Philosophy

**No Objective Truth**: The system operates on the principle that no objective truth exists - only collections of possibilities that exist from different perspectives. Story emerges from the interaction of these possibility spaces rather than pre-written content.

**Uncertainty Until Observation**: Like skilled game masters and television writers, the system keeps story elements in superposition until dramatic necessity requires collapse. Player observations create constraints that filter possibility distributions.

**Belief-Based Reality**: Everything exists as beliefs in minds (world_mind, NPC minds, player mind). The same entity can have different properties from different observers' perspectives.

### Game Design Principles

- **Turn-based tactical gameplay** with high stakes
- **No failed quests** - world adapts to player actions
- **Detective/investigation focus** with meaningful choices
- **Immersive single-player experience**
- **Emergent narrative** from agent simulation and constraint-based generation

### Technical Principles

- **Immutability**: Objects never change, only new versions created with `base` inheritance
- **Multi-resolution simulation**: Abstract when unobserved, detailed when the player looks
- **Constraint-based generation**: Possibilities filtered by observations, never forced collapse
- **Retroactive significance**: Mundane elements can become important based on player attention

## System Architecture

### Client-Server Model with Web Workers

The application uses a **Web Worker architecture** to separate game logic from UI:

- **Client** (`public/client.mjs`): Entry point that initializes GUI and establishes worker communication
- **Worker** (`public/worker/worker.mjs`): Runs game logic in a separate thread, handles message dispatch
- **Communication** (`public/lib/message.mjs`): Bidirectional message passing with promise-based async responses using acknowledgment IDs

### Data Architecture

**Mind/Belief Database** (`public/worker/db.mjs`):
- **Universal belief structure**: All entities (world, player, NPCs) use identical data structures for beliefs
- **Immutable beliefs**: Changes create new versions via `base` inheritance (like prototype chains)
- `Mind`: Container for beliefs with label-based lookup and nested mind support
- `Belief`: Represents game entities with archetypes and traits
- `State`: Immutable state snapshots with tick-based progression
  - States track `insert`, `remove`, `replace` operations (differential updates)
  - Multiple states can exist at same tick (superposition/branching)
  - States inherit via `base` from any previous state
  - `State.resolve_template()` constructs states declaratively with learning specs

**Archetype Composition**:
- Entities inherit traits from multiple archetypes via `bases` array
- Example: Player = Actor + Mental, which inherit from ObjectPhysical
- Traits are typed via `Traittype` registry

**Hierarchical Minds**:
- `world_mind` contains all "ground truth" (what actually happened)
- `npc_mind` contains NPC's beliefs (may differ from world_mind)
- `npc_model_of_other_npc` - beliefs about other entities' beliefs (theory of mind)
- `facade_for_player` - what NPC wants player to believe (deception)

**Serialization Modes**:
- `toJSON()`: Deep serialization for complete data dumps (nested Mind/State/Belief expansion)
- `inspect()`: Shallow serialization with references (returns `{_ref, _type, label}` for relationships)

### Data Schema

**Registry Structure** (`public/worker/cosmos.mjs`):

All entities are stored in global registries for efficient lookup:

```javascript
{
  mind_by_id: Map<number, Mind>,
  mind_by_label: Map<string, Mind>,
  belief_by_id: Map<number, Belief>,        // Version-based lookup
  belief_by_sid: Map<number, Set<Belief>>,  // Subject-based lookup (all versions)
  label_by_sid: Map<number, string>,         // Labels belong to subjects
  sid_by_label: Map<string, number>,         // Reverse lookup
  archetype_by_label: Map<string, Archetype>
}
```

**Design constraint**: Labels are globally unique across subjects and archetypes to prevent naming conflicts.

**Label semantics**: Labels identify subjects (stable identity), not versions (temporal variants). All versions of the same subject share the label. To lookup by label: `sid_by_label["hammer"]` → `sid = 100`, then `state.get_belief_by_subject(subject)` → appropriate version.

**Indexing strategy**: `belief_by_sid` enables efficient resolution queries like "find all versions of subject S" without scanning all beliefs.

**Mind Structure** (`public/worker/mind.mjs`):

```javascript
class Mind {
  _id: number                    // Unique identifier
  label: string|null             // Optional label for lookup
  state: Set<State>              // All states in this mind
  _states_by_ground_state: Map   // Index for ground_state lookups
}
```

**Key design decision**: Beliefs are NOT stored in minds. All beliefs live in the global registry (`belief_by_id`), with each belief maintaining an `in_mind` reference for ownership. This enables:
- Direct belief lookup without knowing which mind owns it
- Efficient queries across all beliefs (e.g., "find all beliefs about entity X")
- Consistent access patterns for all entity types

**State Structure** (`public/worker/state.mjs`):

```javascript
class State {
  _id: number                // Unique identifier
  in_mind: Mind              // Mind this state belongs to
  base: State|null           // Previous state (inheritance)
  ground_state: State|null   // External world state reference
  timestamp: number          // Tick number
  insert: Belief[]           // Beliefs added
  remove: Belief[]           // Beliefs removed
  branches: State[]          // Forward links to child states
  locked: boolean            // Whether state can be modified
  self: Subject|null         // Subject this state represents (for nested minds)
}
```

**Validation**: States can only contain beliefs from their owning mind.

**Query pattern**: To get all beliefs in a state, walk the `base` chain accumulating `insert` lists while tracking `remove` lists.

**Grounding**: When a nested mind creates states (e.g., NPC's model of another NPC's mind), the `ground_state` links back to the parent mind's state that created it. This tracks which version of reality the nested reasoning is based on.

**Branching**: The `branches` collection tracks forward links to all states created from this state, enabling navigation of possibility trees and planning scenarios.

**Belief Structure** (`public/worker/belief.mjs`):

```javascript
class Belief {
  _id: number                     // Version identifier (unique)
  subject: Subject                // Identity object (shared across versions)
  in_mind: Mind                   // Owning mind
  origin_state: State|null        // State that created this belief
  _bases: Set<Belief|Archetype>   // Inheritance
  branches: Set<Belief>           // Child belief versions
  branch_metadata: {              // Why this branch exists
    origin_state: State,
    probability: number|null,
    constraints: object
  }
  _traits: Map<string, any>       // Properties
  locked: boolean                 // Whether belief can be modified
  _resolved_cache: Map            // Cached trait resolutions
}
```

**Identity semantics**:
- `subject.sid` (subject ID) - stable integer identifier across versions
- `_id` - unique integer for this specific version
- Labels stored separately in global registry: `label_by_sid[sid] = "hammer"`
- All versions of same subject share same `sid` and label

**Ownership semantics**:
- `in_mind` points to owning mind
- `origin_state` determines when/how belief was created
- Shared cultural knowledge lives in template minds, referenced via `bases`

**Reference semantics**:
- Meta-traits (prefix `@`): `@about` stores Subject for cross-mind references
- Domain traits: store Subject for entity references, primitives for data
- Resolution happens at query time via state context

**Versioning**:
- Creating modified versions uses immutable pattern
- New belief with same `subject`, new `_id`
- Parent belief adds child to `branches`
- Child belief includes parent in `bases`

**Branch tracking**:
- `branches`: Set of child belief versions (same subject, different data)
- Used for temporal progression, probability distributions, spatial variations
- Enables lazy propagation through inheritance chains

**Archetype Structure** (`public/worker/archetype.mjs`):

```javascript
class Archetype {
  label: string                    // Unique identifier
  bases: Set<Archetype>            // Parent archetypes
  traits_template: Object          // Available trait definitions
  meta: Object                     // Archetype metadata
}
```

Archetypes define the "types" of beliefs (Object, Event, Location, etc.) and what traits they can have.

### Possibility Spaces

- Properties can return probability distributions rather than single values
- Observations create constraints that filter possibility distributions
- Multiple valid resolutions maintained until evidence forces collapse
- **Branching on Uncertainty**: Multiple states can exist at same tick with different `certainty` levels (certain, common, unusual, rare)
- **Conflict tracking**: Beliefs can track `conflicts_with` when observations contradict

## Key Implementation Patterns

### State Immutability
- States are immutable - changes create new state via `state.tick({insert, remove, replace})`
- Objects never change, only new versions created with `base` inheritance
- Property lookup follows prototype chain: `hammer_1 → hammer_1_v2 → hammer_1_v3`

### Message Flow
1. Client sends message via `Message.send(cmd, data)` → returns Promise
2. Worker receives in message handler → dispatches to registered handler
3. Worker responds with `postMessage(['ack', ackid, result])`
4. Client resolves promise with result

### Archetype Composition
- Entities inherit traits from multiple archetypes via `bases` array
- Example: Player has bases ['Actor', 'Mental'], which themselves inherit from ObjectPhysical
- Traits are typed via `Traittype` registry (e.g., location: 'Location', mind_states: {type: 'State', container: Array})

### Declarative Mind Construction
- States can be created declaratively using `{_type: 'State', learn: {...}, ground_state: ...}` specs
- Supports prototype templates via `State.by_label` registry
- Learning spec format: `{belief_label: [trait_names]}` - empty array learns nothing
- Automatically dereferences belief references in learned traits
- Used for NPC and player mind initialization

### Lazy Version Propagation

**Problem**: When shared cultural beliefs update (e.g., country announces winter), thousands of NPCs inherit this knowledge. Eager propagation would require creating new versions for every intermediate node (cities, NPCs), causing version cascade explosion.

**Solution**: Lazy resolution with branch tracking. Only the updated node creates a new version; dependent beliefs discover updates via trait resolution at query time.

**Architecture**:

1. **Branch Tracking** (`Belief.branches`):
   - Parent belief maintains Set of child versions
   - All children share same `subject.sid`
   - Branch metadata tracks `origin_state`, `probability`, `constraints`

2. **State Resolver** (`State.resolve_branches()`):
   - Takes array of branch candidates
   - Filters by temporal constraints (compare `origin_state.timestamp` with query timestamp)
   - Returns single belief (decided) or array (superposition)
   - Decision logic:
     - Temporal: Pick most recent branch <= query timestamp
     - Probability: Return array for caller to select
     - Spatial/custom: Extensible via state subclassing

3. **Lazy Trait Resolution** (`Belief.get_trait()`):
   - Walk bases chain looking for trait
   - When belief with branches encountered, call `state.resolve_branches()`
   - If resolver returns single belief, continue traversal
   - If resolver returns array, return `{type: 'superposition', branches: [...]}`
   - Cache concrete resolutions in `_resolved_cache[state_id][trait_name]`

4. **Materialization** (`Belief.from_template()`, `State.tick()`):
   - When explicitly creating new belief version, walk bases chain
   - Detect branches and resolve via state
   - Create intermediate materialized nodes as needed
   - Reuse existing materialized nodes (query by subject + bases match)
   - Update new belief's bases to point to materialized intermediate

**Performance Characteristics**:

- **Update cost**: O(1) - create one new belief with branches
- **Query cost**: O(inheritance depth) - walk bases, resolve branches
- **Cache hit**: O(1) - return cached resolution
- **Materialization**: O(depth × changes) - only when explicitly creating versions
- **Memory**: O(changes + materialized) not O(NPCs)

**Example Flow**:

```javascript
// Country updates (1 new belief)
country_v2 = new Belief({subject: country_sid, bases: [country_v1], traits: {season: 'winter'}})
country_v1.branches.add(country_v2)
state.insert(country_v2)

// NPC queries season (lazy resolution)
npc_belief.get_trait(state, 'season')
  → walks: npc → city → country_v1
  → detects: country_v1.branches = [country_v2]
  → calls: state.resolve_branches([country_v2])
  → resolver: filters by timestamp, returns country_v2
  → returns: country_v2.traits.season = 'winter'
  → caches result

// No npc_v2 or city_v2 created!

// Later: NPC forms opinion (explicit version creation)
npc_v2 = new Belief({bases: [npc_v1], traits: {opinion: 'hate winter'}})
// Materialization process:
//   walks: npc_v1 → city_v1 → country_v1
//   detects branches: country_v2
//   creates: city_v2 {bases: [city_v1, country_v2]}
//   updates: npc_v2 {bases: [npc_v1, city_v2]}

// Second NPC opinion:
npc2_v2 = new Belief({bases: [city_v2], traits: {opinion: 'love winter'}})
// Reuses city_v2! Only creates npc2_v2
```

**Superposition Handling**:

When resolver cannot decide (probability branches, multiple valid options):

```javascript
belief.get_trait(state, 'king_status')
  → walks to country_v1
  → detects branches: [v2a (dead, p=0.6), v2b (alive, p=0.4)]
  → resolver: both valid at same timestamp
  → returns: {
      type: 'superposition',
      branches: [
        {path: v2a, value: 'dead', probability: 0.6},
        {path: v2b, value: 'alive', probability: 0.4}
      ]
    }

// Caller examines and selects:
if (result.type === 'superposition') {
  const selected = pick_dramatically_appropriate(result.branches)
  const collapsed = state.collapse_trait(belief, 'king_status', selected)
}
```

**Multi-Stage Resolution**:

Resolution is not JavaScript async, but conceptually multi-stage:

1. **Query**: Get trait value (may return superposition)
2. **Examine**: Caller looks at branches, queries related traits
3. **Select**: Caller chooses branch based on accumulated data
4. **Materialize**: Explicit request creates collapsed belief version

This enables narrative-driven collapse instead of arbitrary selection.

**Cache Invalidation**:

- Adding new branch: Clear resolver cache for that belief
- State locking: Resolution cache persists (immutable beliefs)
- Unlocking state: Clear cache (state can change)

**Integration Points**:

- `Belief.get_trait(state, name)`: Entry point for lazy resolution
- `State.resolve_branches(branches, context)`: Resolver interface
- `Belief.from_template()`: Triggers materialization
- `State.collapse_trait()`: Explicit superposition collapse

**See also**: `docs/plans/lazy-version-propagation.md` for implementation roadmap

## Future Architecture

### Template System (not yet implemented)
- Templates implement `is_applicable(template, belief_state)` returning fit quality
- Templates return iterators yielding `{state, events}` pairs
- Multi-template sampling and combination for story generation
- Variables can match against possibility distributions
- Hierarchical templates for theme and pacing coordination

### Constraint Satisfaction Engine (partially implemented)
- Constraints operate on possibility distributions, never single values
- Player observations automatically generate constraints that narrow possibilities
- Multi-perspective constraints evaluated from any entity's belief perspective
- Uncertainty preservation - no forced collapse unless dramatically necessary

### Planned Extensions
- NPC psychology and planning systems
- Dialogue system operating on belief states
- Social dynamics (relationships, reputation)
- Temporal decay and level-of-detail (LOD) systems
- Event log compression during "sleep cycles"
- Vector embeddings for semantic similarity matching

## References

**Implementation**:
- [STYLE.md](STYLE.md) - Code quality guidelines
- [ALPHA-1.md](ALPHA-1.md) - Alpha 1 development stages
- [public/worker/.CONTEXT.md](../public/worker/.CONTEXT.md) - Worker implementation details
- [test/.CONTEXT.md](../test/.CONTEXT.md) - Test structure

**Specification**:
- [SPECIFICATION.md](SPECIFICATION.md) - Language-agnostic data model specification
- [notes/observations.md](notes/observations.md) - Trait exposure system
- [notes/prototypes.md](notes/prototypes.md) - Prototype/flyweight pattern
- [notes/temporal-mind-states.md](notes/temporal-mind-states.md) - Temporal reasoning
- [requirements.md](requirements.md) - Detailed requirements

**External**:
- Blog: https://blog.jonas.liljegren.org/tag/systemic/
