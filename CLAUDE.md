# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**What it is**: A single-player systemic story game where narrative emerges from simulated agents and constraint-based generation, rather than pre-authored content. Think NetHack/Dwarf Fortress narrative depth meets detective game investigation, with Wildermyth-style adaptive story arcs.

**How it works**:
- **Agent simulation**: NPCs with memory, beliefs, planning, psychology
- **Wavefunction collapse for story**: Unobserved game state exists as possibilities, collapses to coherent outcomes when the player engages with it, constrained by story structure and existing threads
- **Multi-resolution simulation**: Abstract when unobserved, detailed when the player looks
- **Thread weaving**: Multiple overlapping story threads that connect based on what the player chooses to engage with

**Design principles**:
- Turn-based tactical gameplay with high stakes
- No failed quests - world adapts to player actions
- Detective/investigation focus with meaningful choices
- Immersive single-player experience

**Current stage**: pre-alpha

See: https://blog.jonas.liljegren.org/tag/systemic/

## Architecture

### Client-Server Model with Web Workers

The application uses a **Web Worker architecture** to separate game logic from UI:

- **Client** (`public/client.mjs`): Entry point that initializes GUI and establishes worker communication
- **Worker** (`public/worker/worker.mjs`): Runs game logic in a separate thread, handles message dispatch
- **Communication** (`public/lib/message.mjs`): Bidirectional message passing with promise-based async responses using acknowledgment IDs

### Core Philosophical Principles

**No Objective Truth**: The system operates on the principle that no objective truth exists - only collections of possibilities that exist from different perspectives. Story emerges from the interaction of these possibility spaces rather than pre-written content.

**Uncertainty Until Observation**: Like skilled game masters and television writers, the system keeps story elements in superposition until dramatic necessity requires collapse. Player observations create constraints that filter possibility distributions.

**Belief-Based Reality**: Everything exists as beliefs in minds (world_mind, NPC minds, player mind). The same entity can have different properties from different observers' perspectives.

### Core Systems

**Mind/Belief Database** (`public/worker/db.mjs`, ~341 lines):
- **Universal belief structure**: All entities (world, player, NPCs) use identical data structures for beliefs
- **Immutable beliefs**: Changes create new versions via `base` inheritance (like prototype chains)
- `Mind`: Container for beliefs with label-based lookup and nested mind support
- `Belief`: Represents game entities with archetypes and traits
- `State`: Immutable state snapshots with tick-based progression
  - States track `insert`, `remove`, `replace` operations (differential updates)
  - Multiple states can exist at same tick (superposition/branching)
  - States inherit via `base` from any previous state
- **Archetype composition**: Entities inherit traits from multiple archetypes via `bases` array (e.g., Player = Actor + Mental)
- **Hierarchical minds**: world_mind contains npc_minds which contain beliefs; parent minds can access child minds but not vice versa
- **Conflict tracking**: Beliefs can track `conflicts_with` when observations contradict

**Possibility Spaces**:
- Properties can return probability distributions rather than single values
- Observations create constraints that filter possibility distributions
- Multiple valid resolutions maintained until evidence forces collapse
- Retroactive significance: mundane elements can become important based on player attention

**Game World** (`public/worker/world.mjs`):
- Defines archetypes: ObjectPhysical, Mental, Location, PortableObject, Actor, Player
- Sets up initial world state (workshop, hammer, player, ball)
- State mutations via `state.tick()` with insert/replace operations
- Exports `Adventure` singleton with world, player, and state

**GUI System** (`public/lib/gui.mjs`, ~379 lines):
- Topic-based navigation with hierarchical menus
- Dialog system for action menus
- Keyboard shortcuts: Arrow keys for navigation, Enter to execute, Escape to go back
- Focus management with selection states
- Message handlers: `header_set`, `main_clear`, `main_add`, `subject_update`

### Directory Structure

```
public/
├── client.mjs              # Main entry point
├── index.html              # Minimal HTML shell
├── lib/
│   ├── gui.mjs            # UI and interaction logic
│   └── message.mjs        # Worker communication layer
├── worker/
│   ├── worker.mjs         # Worker entry point & message dispatcher
│   ├── world.mjs          # Game world definition & Adventure singleton
│   ├── db.mjs             # Mind/belief database engine
│   ├── channel.mjs        # Communication handlers
│   └── time.mjs           # Time management
├── vendor/                # Third-party libraries
└── lab/                   # Experimental code (ecs.js, etc.)
```

## Development Commands

### Build & Setup
```bash
npm install              # Install dependencies and run postinstall (gulp default)
gulp default             # Run rollup build
npx rollup -c            # Manual rollup build (builds vendor/indefinite.mjs)
```

### Linting
```bash
npx eslint .                              # Lint all files
npx eslint public/worker/world.mjs        # Lint specific file
```

**ESLint Config** (eslint.config.mjs):
- ES2024 with module syntax
- Worker globals
- prefer-const enforced, semi disabled, no-unused-vars as warnings

### No Tests
The project currently has no test suite (`npm test` will fail).

## Key Patterns & Implementation Details

**State Immutability**:
- States are immutable - changes create new state via `state.tick({insert, remove, replace})`
- Objects never change, only new versions created with `base` inheritance
- Property lookup follows prototype chain: `hammer_1 → hammer_1_v2 → hammer_1_v3`

**Message Flow**:
1. Client sends message via `Message.send(cmd, data)` → returns Promise
2. Worker receives in message handler → dispatches to registered handler
3. Worker responds with `postMessage(['ack', ackid, result])`
4. Client resolves promise with result

**Topic System**:
- GUI elements become "topics" that can be focused, selected, and executed
- Topics can open sub-menus (dialogs) or trigger actions sent to the worker
- Each topic has: `id`, `parent`, `subject`, `slug`, optional `element` and `dialog`

**Archetype Composition**:
- Entities inherit traits from multiple archetypes via `bases` array
- Example: Player has bases ['Actor', 'Mental'], which themselves inherit from ObjectPhysical
- Traits are typed via `Traittype` registry (e.g., location: 'Location', mind: 'Mind', color: 'string')

**Mind Nesting**:
- `world_mind` contains all "ground truth" (what actually happened)
- `npc_mind` contains NPC's beliefs (may differ from world_mind)
- `npc_model_of_other_npc` - beliefs about other entities' beliefs (theory of mind)
- `facade_for_player` - what NPC wants player to believe (deception)

**Branching on Uncertainty**:
- Multiple states can exist at same tick with different `certainty` levels (certain, common, unusual, rare)
- Example: NPC uncertain if someone saw them → state branches into "saw me" (unusual) and "didn't see" (common)
- Cleanup phases can merge objects/states when differences no longer matter

## Alpha 1 Development Roadmap

**Goal**: Build a text-based investigation game where player finds a missing hammer through questioning NPCs. System maintains consistency across all observations with multiple possible culprits until evidence narrows it down.

### Development Stages (10 stages):

1. **Core belief structure**: Basic belief nodes with archetypes, single world_mind, `about` property for identity linking, `source` for belief origin
2. **Descriptors**: Objects with multiple descriptors (black, heavy, worn); observations copy descriptors; EXAMINE command
3. **Multiple similar objects**: Disambiguation system (hammer_1: [black, large], hammer_2: [black, small]); ASK ABOUT command
4. **Location constraints**: Objects have location property; GO TO command (takes 10 min); empty observations (target: [] means nothing seen)
5. **NPC location beliefs**: NPCs have mind containers with observations; ASK WHERE command; conflict detection between NPC claims and player knowledge
6. **Time points**: Temporal property on observations; simple time (morning, noon, afternoon, evening); commands advance time ~10 min
7. **Object movement events**: Event_movement archetype; world tracks movement events; objects update location after movement
8. **Temporal NPC observations**: ASK WHEN SAW command; NPCs report time-stamped observations; ASK ABOUT MISSING command
9. **Actor-event observations**: NPCs observe WHO did actions; ASK WHO TOOK command; dual uncertainty (lying vs uncertain)
10. **Thread connections**: System prefers resolution using existing elements; ACCUSE command; resolution collapses based on best thread connections; retroactive significance

**Success Criteria**:
- Complete "missing hammer" investigation scenario
- Multiple solution paths based on player investigation choices
- Clear demonstration of constraint-based possibility filtering
- Template-driven story (future feature, not in Alpha 1)

## Future Architecture

**Template System** (not yet implemented):
- Templates implement `is_applicable(template, belief_state)` returning fit quality
- Templates return iterators yielding `{state, events}` pairs
- Multi-template sampling and combination for story generation
- Variables can match against possibility distributions
- Hierarchical templates for theme and pacing coordination

**Constraint Satisfaction Engine** (partially implemented):
- Constraints operate on possibility distributions, never single values
- Player observations automatically generate constraints that narrow possibilities
- Multi-perspective constraints evaluated from any entity's belief perspective
- Uncertainty preservation - no forced collapse unless dramatically necessary

**Planned Extensions**:
- NPC psychology and planning systems
- Dialogue system operating on belief states
- Social dynamics (relationships, reputation)
- Temporal decay and level-of-detail (LOD) systems
- Event log compression during "sleep cycles"
- Vector embeddings for semantic similarity matching

## Configuration

`conf.json` contains server configuration (host, port, SSL cert paths) but no server implementation exists in the codebase yet.
