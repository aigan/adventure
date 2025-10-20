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
