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

#### Message Protocol

All messages between client and worker use array format for consistency.

**Client → Worker Messages:**
```javascript
['command', data, ackid]
```

- `command`: string - Command name ('start', 'ping', or action command)
- `data`: object - Command payload (ActionData for actions)
- `ackid`: number - Promise correlation ID

**Worker → Client Messages:**
```javascript
['ack', ackid, result]              // Promise resolution
['header_set', html]                // Update header text
['main_clear']                      // Clear main content
['main_add', ...parts]              // Add content (strings or TemplateTagResult)
['topic_update', SubjectData]       // Update existing subject
```

**Key Data Structures:**

**SubjectData** (Baked Observation - sent to GUI):
```javascript
{
  id: number,                    // Subject ID (sid)
  description_short: string,     // Display name
  actions: ActionData[],         // Available actions
  is: 'subject'                  // Type discriminator
}
```

**ActionData** (sent from GUI):
```javascript
{
  do: string,              // Command name
  target_blipp: number,    // Subject ID of target (temp name)
  subject_blopp: number,   // Subject ID of actor (temp name)
  label: string            // Display text
}
```
*Note: Field names `target_blipp`/`subject_blopp` are temporary and will be renamed.*

**TemplateTagResult** (Rich text with embedded subjects):
```javascript
{
  strings: TemplateStringsArray,   // Text parts
  values: SubjectData[]            // Embedded clickable subjects
}
```

**Example Flow:**
1. Worker creates observation with Subject instances
2. `narrator.bake_narration(obs)` converts to SubjectData format
3. `narrator.tt\`...\`` creates TemplateTagResult with embedded SubjectData
4. Worker sends via `postMessage(['main_add', templateResult])`
5. GUI renders with clickable subjects
6. User clicks action → GUI sends `['look', {do:'look', ...}, ackid]`
7. Worker processes and sends `['ack', ackid, result]`

**Promise-Based RPC:**
- `Message.send(cmd, data)` returns Promise
- Worker handlers return values, automatically sent via ack
- Example: `ping` returns `'pong'` → `['ack', ackid, 'pong']`

**Special Handling:**
- `start` command has special case: initializes Session, sends multiple messages before ack
- String-to-array conversion supported for backwards compatibility

**GUI Terminology:**
- **Locus**: Interactive GUI element (container)
- **locus.topic**: The data payload (SubjectData or ActionData)
- Avoids confusion with data model's `Subject` class

For message format details and examples, see tests:
- `test/message_protocol.test.mjs` - Message format validation
- `test/worker_mock.test.mjs` - Communication flow
- `test/worker_dispatch.test.mjs` - Real worker dispatch

### Data Architecture

**Mind/Belief Database** (`public/worker/db.mjs`):
- **Universal belief structure**: All entities (world, player, NPCs) use identical data structures for beliefs
- **Immutable beliefs**: Changes create new versions via `base` inheritance (like prototype chains)
- `Mind`: Container for beliefs with label-based lookup and nested mind support
- `Belief`: Represents game entities with archetypes and traits
- `State`: Immutable state snapshots with tick-based progression
  - States track `insert`, `remove` operations via differential updates (base chain)
  - Multiple states can exist at same tick (superposition/branching)
  - States inherit via `base` from any previous state
  - Declarative state construction via Mind templates with learning specs

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

### Index Architecture

All indexes are designed for scalability to billions of items with external DB (PostgreSQL, etc.). The system uses two-tier indexing:

- **Global registries** (`public/worker/db.mjs`): Primary keys, label lookups, and relationship indexes
- **Instance indexes** (`Mind`, `State` classes): Scoped indexes for hierarchy and caching

All current indexes are necessary and non-redundant - each serves distinct query patterns at O(1) or O(n) where n is the result size.

**Design constraints**:
- Labels are globally unique across subjects and archetypes to prevent naming conflicts
- Labels identify subjects (stable identity), not versions (temporal variants)
- All versions of same subject share the label

**For detailed index documentation**, see inline comments in:
- `public/worker/db.mjs` - Global registry indexes
- `public/worker/mind.mjs` - Mind instance indexes
- `public/worker/state.mjs` - State lazy caching
- `public/worker/CLAUDE.md` - Index architecture overview

**Core Data Structures**:

**Mind** - Abstract base class for belief containers
- **Hierarchy**:
  - `Mind` (abstract) - Base class, cannot be instantiated directly
  - `Logos` (singleton) - Primordial root mind with no parent
  - `Eidos` (singleton) - Realm of forms and shared beliefs (parent: Logos)
  - `Materia` - Time-aware minds for entities (worlds, NPCs, players)
- Nested hierarchy: world_mind contains npc_minds for theory of mind
- States track belief evolution over time
- **Key design**: Beliefs stored globally, not in minds (enables cross-mind queries)
- **Temporal methods**: `states_at_tt()`, `create_world()` only available on `Materia`

**State** - Immutable snapshot of beliefs at specific time/tick
- Differential updates: tracks `insert`, `remove` operations via `base` chain
- Grounding: `ground_state` links nested mind states to parent reality
- Branching: Supports possibility trees and planning scenarios
- Lazy caching: `_subject_index` built progressively on locked states

**Belief** - Represents game entities with versioning
- **Identity**: `subject.sid` stable across versions, `_id` unique per version
- **Inheritance**: Multiple bases via `bases` array (Archetypes + previous versions)
- **Versioning**: Immutable - changes create new version with same subject
- **Branch tracking**: Parent tracks child versions for lazy propagation
- **Traits**: Type-validated properties resolved at query time via state context

**Archetype** - Defines trait structure for entity types
- Multiple inheritance: Compose traits from multiple parents
- Example: Player = Actor + Mental → ObjectPhysical

For structure details, see source files in `public/worker/`

### Bi-Temporal Semantics

The implementation uses **bi-temporal database concepts** with Transaction Time (TT) and Valid Time (VT). Decision Time (DT) is planned but not yet implemented.

**State Properties:**
- `State.tt` - Transaction time: When this state was created (computational time)
- `State.vt` - Valid time: What time this state is thinking about (defaults to tt)
- Both stored as simple integers (tick numbers)

**Time Coordination:**
- **Fork Invariant**: `child_mind.tt = parent_state.vt`
  - When creating child mind state, sync to parent's valid time
  - Ensures nested minds stay coordinated with their context
- **Ground State Reference**: `state.ground_state` links child to parent
  - Child states always have ground_state (except world mind)
  - Ground state owns canonical valid time
- **No Time Arithmetic**: Never use `tt + 1` or similar
  - Always coordinate via explicit ground_state.vt reference
  - Time parameters must be passed explicitly to branch_state()

**Method Signatures:**
```javascript
// Create new state (branching from existing state)
state.branch_state(ground_state, vt)

// World mind (no ground state, must provide explicit vt)
world_state.branch_state(null, 2)

// Child mind (vt inherited from ground_state.vt if not specified)
npc_state.branch_state(world_state)

// Helper for versioning a belief with new traits
state.tick_with_traits(belief, vt, {trait: value})
```

**Temporal Querying:**
- `temporal_mind.states_at_tt(tt)` - Find states that exist at given transaction time
  - Available only on `Materia` (not Logos or Eidos)
  - Filters by `state.tt <= tt`
  - Returns outermost states on each branch
  - Common usage: `temporal_mind.states_at_tt(ground_state.vt)` due to fork invariant

**Temporal Reasoning Patterns:**
- **Present thinking**: `state.vt = state.tt` (default)
- **Memory/recall**: `state.vt < state.tt` (thinking about the past)
- **Planning**: `state.vt > state.tt` (thinking about the future)
- **Superposition**: Same tt + same ground_state = different possibilities at same moment
- **Versioning**: Same tt + different ground_state = different versions in parent's timeline

**Future: Decision Time (DT)**
- Planned as trait-level metadata (not yet implemented)
- Will track when information was learned/decided
- Enables testimony chains and knowledge provenance
- See SPECIFICATION.md "Tri-Temporal Semantics" for design

### Possibility Spaces

- Properties can return probability distributions rather than single values
- Observations create constraints that filter possibility distributions
- Multiple valid resolutions maintained until evidence forces collapse
- **Branching on Uncertainty**: Multiple states can exist at same tick with different `certainty` levels (certain, common, unusual, rare)
- **Conflict tracking**: Beliefs can track `conflicts_with` when observations contradict

## Key Implementation Patterns

### State Immutability
- States are immutable - changes create new state via `state.branch_state(ground_state, vt)`
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

## Future Architecture

### Lazy Version Propagation (Planned)

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

4. **Materialization** (`Belief.from_template()`, `State.branch_state()`):
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
country_v2 = Belief.from_template(state, {
  sid: country_sid,
  bases: [country_v1],
  traits: {season: 'winter'}
})
// Belief is automatically added to state._insert during from_template()

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

### Template System (Planned)
- Templates implement `is_applicable(template, belief_state)` returning fit quality
- Templates return iterators yielding `{state, events}` pairs
- Multi-template sampling and combination for story generation
- Variables can match against possibility distributions
- Hierarchical templates for theme and pacing coordination

### Constraint Satisfaction Engine (Partially Implemented)
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
- [trait-inheritance/](trait-inheritance/) - Comprehensive trait inheritance documentation and tests
- [public/worker/CLAUDE.md](../public/worker/CLAUDE.md) - Worker implementation details
- [test/CLAUDE.md](../test/CLAUDE.md) - Test structure

**Specification**:
- [SPECIFICATION.md](SPECIFICATION.md) - Language-agnostic data model specification
- [notes/observations.md](notes/observations.md) - Trait exposure system
- [notes/prototypes.md](notes/prototypes.md) - Prototype/flyweight pattern
- [notes/temporal-mind-states.md](notes/temporal-mind-states.md) - Temporal reasoning
- [requirements.md](requirements.md) - Detailed requirements

**External**:
- Blog: https://blog.jonas.liljegren.org/tag/systemic/
