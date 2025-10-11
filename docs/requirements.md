# Requirements Specification, v2

## Core Philosophy

This system operates on the principle that no objective truth exists - only collections of possibilities that exist from different perspectives. Story emerges from the interaction of these possibility spaces rather than pre-written content. Like skilled game masters and television writers, the system keeps story elements in superposition until dramatic necessity requires collapse.

## Unified Belief Architecture

### Belief State Management

* [ ] Universal Belief Structure: All entities (world, player, NPCs) use identical data structures for beliefs
* [ ] Nested Belief Support: Entities can have beliefs about other entities' beliefs (Village A believes Village B hates them)
* [ ] Hierarchical Organization: Player beliefs are child nodes under player entity; world state is world entity's belief about itself
* [ ] Perspective Context: All belief queries support {observer, timeref} context parameters
* [ ] Belief Persistence: Belief states are maintained across game sessions

### Possibility Space System

* [ ] Possibility Distributions: All properties can return probability distributions rather than single values
* [ ] Dynamic Properties: Frame-based entities support computed properties that resolve based on perspective context
* [ ] Constraint Filtering: Observations create constraints that filter possibility distributions
* [ ] Possibility Propagation: Belief chains multiply probabilities (NPC testimony filtered by NPC reliability)
* [ ] Space Combination: Multiple possibility spaces can be combined when they don't conflict

## Constraint Satisfaction Engine

### Core Constraint System

* [ ] Possibility-Based Constraints: All constraints operate on possibility distributions, never single values
* [ ] Constraint Definition: System can define and store constraints that filter possibility spaces
* [ ] Constraint Evaluation: Engine tests which possibilities satisfy current constraint sets
* [ ] Observation Integration: Player observations automatically generate constraints that narrow possibilities
* [ ] Constraint Persistence: Constraints remain active and continue filtering across sessions

### Belief Integration

* [ ] Multi-Perspective Constraints: Constraints can be evaluated from any entity's belief perspective
* [ ] Belief Propagation: Information flow between belief systems through social interaction
* [ ] Uncertainty Preservation: System never forces collapse of possibilities unless dramatically necessary
* [ ] Conflict Resolution: When beliefs conflict, system maintains multiple possibility spaces rather than choosing truth

## Template System Architecture

### Template Object Interface

* [ ] Universal Template Interface: All templates implement is_applicable(template, belief_state) returning fit quality
* [ ] Fit Quality Assessment: Templates return perfect fit, possible fit, or last resort applicability
* [ ] Entity Template Repertoires: Any entity (world, NPCs, humans) can own templates representing what they think can happen
* [ ] Template Inheritance: Templates can be inherited through entity hierarchies (all humans, all blacksmiths, specific individuals)

### Template Execution System

* [ ] Iterator Pattern: Invoked templates return iterators yielding {state, events} pairs
* [ ] Multi-Template Sampling: Story system can sample from multiple templates simultaneously
* [ ] Template Combination: Compatible templates can be combined when possibility spaces don't conflict
* [ ] Hierarchical Templates: Parent templates (theme, pacing) can evaluate and coordinate child template results

### Template Variables and Matching

* [ ] Possibility Space Matching: Template variables can match against possibility distributions ("any bandit")
* [ ] Selective Collapse: When specificity needed, templates can collapse possibilities to test specific fits
* [ ] Generic Fulfillment: Variables can be fulfilled by generic entities without requiring specific individuals
* [ ] Constraint-Driven Specification: Additional criteria can force further specification of generic matches

## Story Generation Framework

### Event and State Management

* [ ] Event Metadata: Generated events carry tension values and story management data
* [ ] State Transitions: Templates produce new possibility spaces as result of generated events
* [ ] Story Coherence: System ensures generated events are consistent with current possibility spaces
* [ ] Narrative Flow: Parent templates can guide pacing and thematic development

### Expandable Story Elements

* [ ] Theme Integration: Templates can be categorized and selected based on thematic requirements
* [ ] Tension Management: System tracks and responds to story tension through template selection
* [ ] Player Agency: Player actions and attention shape which possibilities survive and which fade
* [ ] Emergent Narrative: Complex stories emerge from interaction of simple template rules

## Expandability Architecture

### Future System Integration

* [ ] NPC Psychology Ready: Belief system supports complex NPC reasoning when added later
* [ ] Dialogue System Preparation: Framework supports future dialogue system that operates on belief states
* [ ] Social Dynamics Support: Architecture handles relationship and reputation systems
* [ ] Temporal Complexity Ready: System designed to support temporal decay and LOD systems later

### Modular Design Requirements

* [ ] Loosely Coupled Systems: Core belief, constraint, and template systems operate independently
* [ ] Data-Driven Content: Story content defined through template data, not hardcoded logic
* [ ] Plugin Architecture: New template types and constraint forms can be added without core changes
* [ ] Performance Scaling: System architecture supports caching and optimization as complexity grows

## Technical Implementation Requirements

### Data Architecture

* [ ] Frame-Based Entities: Entities support multiple inheritance with dynamic property resolution
* [ ] Perspective-Dependent Properties: Properties can return different values based on observer context
* [ ] Efficient Inheritance: Flyweight pattern or similar for shared properties across entity hierarchies
* [ ] Memory Management: Efficient handling of possibility space storage and computation

### Development and Debug Support

* [ ] Debug Visibility: System can explain decision-making process for story generation
* [ ] Template Tracing: Ability to trace why specific templates were selected or rejected
* [ ] Possibility Space Inspection: Tools to examine current belief states and possibility distributions
* [ ] Story Flow Analysis: Debugging tools for understanding narrative progression

### Performance and Persistence

* [ ] Save/Load System: Complete belief states and possibility spaces can be serialized
* [ ] Efficient Querying: Fast lookup of relevant templates and possibility spaces
* [ ] Scalable Architecture: System performance remains acceptable as story complexity increases
* [ ] Resource Management: Automatic cleanup of unused possibility branches and expired constraints

## Minimum Viable Implementation

### Phase 1: Single Observer

* [ ] Player-Only Beliefs: Initial implementation focuses on player belief system only
* [ ] Basic Possibility Spaces: Simple probability distributions for entity properties
* [ ] Constraint Filtering: Player observations create constraints that filter possibilities
* [ ] Simple Templates: Basic story templates that operate on filtered possibility spaces

### Phase 1 Success Criteria

* [ ] "Missing Hammer" Scenario: Complete implementation of item location mystery
* [ ] Multiple Solution Paths: Same scenario resolves differently based on player investigation choices
* [ ] Constraint Demonstration: Clear examples of how observations narrow possibility spaces
* [ ] Template-Driven Story: Story progression driven by template selection rather than scripted events

### Expansion Path

* [ ] NPC Belief Integration: Add NPC belief systems using same architecture
* [ ] Social Interaction: Templates for information exchange between belief systems
* [ ] Complex Scenarios: Multi-actor stories with conflicting beliefs and hidden information
* [ ] Advanced Templates: Sophisticated story patterns that operate across multiple belief contexts

This foundation prioritizes the core insight that stories emerge from managing uncertainty rather than resolving it, providing a technical framework that can grow from simple single-player scenarios to complex multi-actor narratives while maintaining architectural consistency.

# Alpha 1 Development Stages

### Stage 1: Core belief structure

* Basic belief nodes with archetype property
* Single world_mind container
* about property for identity linking (shorthand for unquestioned things)
* source property for belief origin
* Universal belief structure - everything uses same format
* Player has mind container for beliefs
* Menu command: "LOOK" creates observation belief
* Observations use target predicate (can be objects, events, or other observations)
* Simple observation: obs_1: {archetype: Event_perception, observer: player_1, target: hammer_1, time: now_1}
* Test: Player observes hammer, hammer belief created in player_mind

### Stage 2: Descriptors

* Objects have multiple descriptors: hammer_1: [black, heavy, worn]
* Observations copy descriptors into perceived objects
* Menu command: "EXAMINE [object]" for detailed descriptors
* Test: Player can observe and recall properties

### Stage 3: Multiple similar objects

* Setup: hammer_1: [black, large], hammer_2: [black, small], hammer_3: [blue, small]
* Menu command: "ASK [npc] ABOUT [descriptor] [type]"
* NPCs respond based on descriptor matching
* Partial observations: NPC might only notice some descriptors
* Test: "Ask about black hammer" requires disambiguation

### Stage 4: Location constraints

* Objects have location property
* Menu command: "GO TO [location]" (takes 10 minutes game time)
* Observations include location context
* Empty observations: target: [] means nothing seen there
* Player knows what's NOT in observed locations (implicit absence)
* Test: Player can't find hammer where it should be

### Stage 5: NPC location beliefs

* NPCs have mind containers with observations
* NPCs can have beliefs about object locations
* Menu command: "ASK [npc] WHERE [object]"
* Conflict detection: System notices when NPC claims object is where player knows it isn't
* Simple resolution: Different objects (two black hammers)
* Test: Conflicting location claims get resolved

### Stage 6: Time points

* Add temporal property to observations
* Simple time: morning, noon, afternoon, evening
* Each command advances time by ~10 minutes
* Past observations marked with earlier time
* Menu shows current time
* Test: Observations are temporally ordered

### Stage 7: Object movement events

* New archetype: Event_movement
* Movement events: {archetype: Event_movement, actor: npc_1, target: hammer_1, from: workshop, to: forge, time: noon}
* World tracks these events (but player doesn't know them yet)
* Objects update their location after movement
* Test: Object can be in different places at different times

### Stage 8: Temporal NPC observations

* Menu command: "ASK [npc] WHEN SAW [object]"
* NPCs report observations with time: "Saw hammer this morning in workshop"
* Menu command: "ASK [npc] ABOUT MISSING [object]"
* NPCs can observe events: {target: movement_1, time: noon}
* Test: Build timeline from multiple NPCs

### Stage 9: Actor-event observations

* NPCs can observe WHO did something
* Menu command: "ASK [npc] WHO TOOK [object]"
* Observation: {target: event_1} where event_1 includes actor
* Dual uncertainty: NPC might be lying OR uncertain about details
* Test: "I saw someone take it but couldn't see who" vs "It was Bob"

### Stage 10: Thread connections

* System prefers resolution using existing elements
* Priority: 1) Connect to known NPCs, 2) Reuse seen objects, 3) Create new only if needed
* Multiple valid resolutions maintained (merchant took it vs elder took it)
* Menu command: "ACCUSE [npc] OF TAKING [object]"
* Resolution collapses based on best thread connections
* Retroactive significance: Mundane hammer can become important
* Test: Complete "who took the hammer" investigation with satisfying resolution

### Alpha 1 Deliverable:

* Text-based investigation game
* Menu-driven commands
* Find missing hammer through questioning NPCs
* System maintains consistency across all observations
* Multiple possible culprits until evidence narrows it down
* No word-by-word dialogue, just information display
* No story templates yet, just constraint resolution
* Demonstrates belief system with superposition works
