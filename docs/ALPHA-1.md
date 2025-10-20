# Alpha 1: Missing Hammer Investigation

## Project Vision

**What it is**: A single-player systemic story game where narrative emerges from simulated agents and constraint-based generation, rather than pre-authored content. Think NetHack/Dwarf Fortress narrative depth meets detective game investigation, with Wildermyth-style adaptive story arcs.

**How it works**:
- **Agent simulation**: NPCs with memory, beliefs, planning, psychology
- **Wavefunction collapse for story**: Unobserved game state exists as possibilities, collapses to coherent outcomes when the player engages with it
- **Multi-resolution simulation**: Abstract when unobserved, detailed when the player looks
- **Thread weaving**: Multiple overlapping story threads that connect based on what the player chooses to engage with

**Current stage**: pre-alpha, working toward Alpha 1

## Goal

Build a text-based investigation game where player finds a missing hammer through questioning NPCs. System maintains consistency across all observations with multiple possible culprits until evidence narrows it down.

## Development Stages

#### Stage 1: Core Belief Structure ✓
**Status**: Implemented

- Basic belief nodes with archetype property
- Single world_mind container
- `about` property for identity linking (shorthand for unquestioned things)
- `source` property for belief origin
- Universal belief structure - everything uses same format
- Player has mind container for beliefs
- Menu command: "LOOK" creates observation belief
- Observations use target predicate (can be objects, events, or other observations)
- Simple observation: `obs_1: {archetype: Event_perception, observer: player_1, target: hammer_1, time: now_1}`

**Test**: Player observes hammer, hammer belief created in player_mind

#### Stage 2: Descriptors
**Status**: Planned

- Objects have multiple descriptors: `hammer_1: [black, heavy, worn]`
- Observations copy descriptors into perceived objects
- Menu command: "EXAMINE [object]" for detailed descriptors

**Test**: Player can observe and recall properties

**Implementation notes**:
- Descriptor trait type (array of strings)
- Descriptor inheritance through archetype chain
- Observation system copies descriptors to player mind

#### Stage 3: Multiple Similar Objects
**Status**: Planned

- Setup: `hammer_1: [black, large]`, `hammer_2: [black, small]`, `hammer_3: [blue, small]`
- Menu command: "ASK [npc] ABOUT [descriptor] [type]"
- NPCs respond based on descriptor matching
- Partial observations: NPC might only notice some descriptors

**Test**: "Ask about black hammer" requires disambiguation

**Implementation notes**:
- Need matching algorithm that compares descriptor sets
- Ambiguity handling when multiple objects match query
- Dialog system for disambiguation prompts

#### Stage 4: Location Constraints
**Status**: Planned

- Objects have location property
- Menu command: "GO TO [location]" (takes 10 minutes game time)
- Observations include location context
- Empty observations: `target: []` means nothing seen there
- Player knows what's NOT in observed locations (implicit absence)

**Test**: Player can't find hammer where it should be

**Implementation notes**:
- Location trait type (Belief reference to Location archetype)
- Time advancement system (simple tick counter)
- Query system for "what's in this location"
- Empty observation recording (important for alibis)

#### Stage 5: NPC Location Beliefs
**Status**: Planned

- NPCs have mind containers with observations
- NPCs can have beliefs about object locations
- Menu command: "ASK [npc] WHERE [object]"
- Conflict detection: System notices when NPC claims object is where player knows it isn't
- Simple resolution: Different objects (two black hammers)

**Test**: Conflicting location claims get resolved

**Implementation notes**:
- NPC minds as nested minds in world_mind
- Learn_about system for transferring beliefs
- Conflict tracking system for contradictions
- Dialog variations based on conflict detection

#### Stage 6: Time Points
**Status**: Planned

- Add temporal property to observations
- Simple time: morning, noon, afternoon, evening
- Each command advances time by ~10 minutes
- Past observations marked with earlier time
- Menu shows current time

**Test**: Observations are temporally ordered

**Implementation notes**:
- Time trait type (enumeration or tick count)
- State timestamps for all observations
- Query filtering by time range
- Time display in UI

#### Stage 7: Object Movement Events
**Status**: Planned

- New archetype: Event_movement
- Movement events: `{archetype: Event_movement, actor: npc_1, target: hammer_1, from: workshop, to: forge, time: noon}`
- World tracks these events (but player doesn't know them yet)
- Objects update their location after movement

**Test**: Object can be in different places at different times

**Implementation notes**:
- Event archetype with actor, object, from_location, to_location
- Event recording in world_mind
- Query system for "events involving X"
- Location update propagation

#### Stage 8: Temporal NPC Observations
**Status**: Planned

- Menu command: "ASK [npc] WHEN SAW [object]"
- NPCs report observations with time: "Saw hammer this morning in workshop"
- Menu command: "ASK [npc] ABOUT MISSING [object]"
- NPCs can observe events: `{target: movement_1, time: noon}`

**Test**: Build timeline from multiple NPCs

**Implementation notes**:
- Time-aware queries on NPC minds
- "Last seen" calculations
- Missing object detection (expected but not observed)

#### Stage 9: Actor-Event Observations
**Status**: Planned

- NPCs can observe WHO did something
- Menu command: "ASK [npc] WHO TOOK [object]"
- Observation: `{target: event_1}` where event_1 includes actor
- Dual uncertainty: NPC might be lying OR uncertain about details

**Test**: "I saw someone take it but couldn't see who" vs "It was Bob"

**Implementation notes**:
- Actor field on events
- Observation of events (saw someone do something)
- Certainty levels on observations
- Deception system (facade minds)

#### Stage 10: Thread Connections
**Status**: Planned

- System prefers resolution using existing elements
- Priority: 1) Connect to known NPCs, 2) Reuse seen objects, 3) Create new only if needed
- Multiple valid resolutions maintained (merchant took it vs elder took it)
- Menu command: "ACCUSE [npc] OF TAKING [object]"
- Resolution collapses based on best thread connections
- Retroactive significance: Mundane hammer can become important

**Test**: Complete "who took the hammer" investigation with satisfying resolution

**Implementation notes**:
- Constraint satisfaction scoring
- Evidence weighting algorithm
- Resolution commit (collapse superposition)
- Narrative coherence metrics
- Retroactive detail generation

### Alpha 1 Deliverable

- Text-based investigation game
- Menu-driven commands
- Find missing hammer through questioning NPCs
- System maintains consistency across all observations
- Multiple possible culprits until evidence narrows it down
- No word-by-word dialogue, just information display
- No story templates yet, just constraint resolution
- Demonstrates belief system with superposition works

### Success Criteria

- [ ] Complete "missing hammer" investigation scenario
- [ ] Multiple solution paths based on player investigation choices
- [ ] Clear demonstration of constraint-based possibility filtering
- [ ] System maintains consistency across all observations
- [ ] Evidence naturally narrows down suspects
- [ ] No contradictions in final resolution

### Template-Driven Story
**Status**: Future feature, not in Alpha 1

After Alpha 1, extend system with template-driven story generation using the constraint satisfaction foundation.

## References

- [IMPLEMENTATION.md](IMPLEMENTATION.md) - Current implementation architecture
- [SPECIFICATION.md](SPECIFICATION.md) - Language-agnostic data model
- [requirements.md](requirements.md) - Technical proof-of-concept requirements
- [../README.md](../README.md) - High-level roadmap (all Alphas)
- Blog: https://blog.jonas.liljegren.org/tag/systemic/
