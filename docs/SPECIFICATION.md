# Specification

**Purpose**: This is the language-agnostic specification for the game's data model. It defines what we're building, not how it's currently implemented.

**What belongs here**:
- Conceptual data model and relationships
- Design rationale and principles
- Planned features and future extensions
- Implementation-agnostic patterns

**What does NOT belong here**:
- JavaScript code or syntax
- Current implementation details (see IMPLEMENTATION.md)
- Implementation-specific workarounds
- File paths or module references

**Maintenance**: Keep this updated as the design evolves, even if features aren't implemented yet.

---

# Conceptual Model

## Idealist Philosophy

The system follows an **idealist model**: reality exists as beliefs in minds, not as objective truth.

**Nested Perspectives**:
- **World mind** "dreams" reality - contains possibility distributions that collapse on observation
- **NPC minds** model inner representations of the outer world (world mind)
- **Nested recursively**: NPCs can model other NPCs' minds, who model other minds, etc.

Each mind contains its own state sequence tracking what it believes over time.

## Instances vs Prototypes

**Instances** (beliefs in states):
- Observable entities in the world: rocks, taverns, NPCs
- Exist in specific states with ownership (`in_mind` is a Mind reference)
- Can be learned about via `learn_about()` (copies traits from outer to inner mind)
- Have `@about` linking inner beliefs to outer instances

**Prototypes** (shared beliefs):
- Inheritance templates: cultural knowledge, archetypes
- Not observable - exist only for `bases` inheritance
- No ownership (`in_mind = null`, `origin_state = null`)
- Cannot be learned about - only inherited from
- Tracked via `@timestamp` meta-trait instead of `origin_state`

**Key distinction**: You observe and learn about instances. You inherit from prototypes.

See IMPLEMENTATION.md "Core Philosophy" for implementation details.

---

# Data Structure

## Why This Structure?

### Universal Belief Architecture

* Same structure works for objects, events, observations, memories, plans
* Enables beliefs about beliefs (theory of mind)
* Allows conflicting beliefs between different minds

### Story Generation

* Observations create constraints on possibility space
* Story engine finds templates matching current constraints
* Mismatched about references create misunderstandings
* Descriptive properties enable detective-style investigation

### Efficiency Considerations

* Flyweight pattern via base reduces memory for shared beliefs
* Minds nested in actors avoid separate enumeration
* Only instantiate beliefs when observed/relevant to story

### Future Extensions

This foundation supports:

* NPCs with different beliefs about same entities
* Testimony chains (source: "villager_1 told me")
* Possibility distributions (location: [60% shed, 30% workshop, 10% unknown])
* Investigation templates (Event_missing_item with victim/offender slots)
* Temporal reasoning (beliefs changing over time)

# Data Efficiency Strategies from Discussion

### Event Log Management:

* Sequential access mimics brain/LLM processing patterns
* Event logs for working memory, consolidated summaries for long-term storage
* Attention filters determine which events get detailed encoding
* Temporal indexing separates "current state" from "historical chain" queries

### Temporal Compression:

* Sleep cycles for memory consolidation during natural game breaks
* Compress observational chains when intermediate steps lack story relevance
* Differential storage - only record what changed between observations
* LOD-based aging - detailed observations decay to general familiarity over time

### Belief Chain Optimization:

* Immutable records with append-only changes
* Lazy materialization of inheritance chains rather than pre-computation
* Periodic belief compaction to collapse unnecessary version chains
* Cleanup phases that consolidate chains not serving active story threads

### Storage Architecture:

* Separate semantic reasoning from storage optimization
* Database handles indexing/queries, reasoning engine operates on cached subsets
* Redis for change subscriptions and fast lookups
* Materialized views for flyweight inheritance patterns

### LOD System Integration:

* Procedural generation seeded by neighboring LOD properties
* Details removed when player leaves (tracks, movable objects that could reasonably change)
* Hierarchical simulation with different timesteps per abstraction level
* Village belief nodes as search boundaries

### Indexing Considerations:

* Vector embeddings for semantic similarity matching
* Spatial partitioning for observation relevance
* Property-based indexing for constraint satisfaction queries

The core insight: optimize for working sets during story generation rather than full graph traversal, with periodic consolidation maintaining long-term consistency.

---

# Possibility Space Data Structure - Test Scenario

## Core Concepts

### Universal Belief Structure

- Everything is beliefs in minds (world_mind, npc minds, player mind)
- Objects are immutable - changes create new versions with `base` inheritance
- States use prototype chain lookup (like JavaScript)
- Time is represented by simple `tick` literals
- Certainty uses discrete levels: certain, common, unusual, rare

### State Management

- States track `added`, `removed`, `updated` rather than full belief lists
- Multiple states can exist at same tick (superposition)
- States inherit via `base` from any previous state
- Each mind has its own state sequence
- States track forward links via `branches` for navigation
- Nested mind states can ground to parent mind states via `ground_state`

### Object Versioning

- New versions inherit via `base` (e.g., hammer_2 base: hammer_1)
- Conflicts tracked via `conflicts_with: [observations]`
- Objects can split when partially observed
- Cleanup phases can merge objects back together

---

## Implementation Notes

- **Immutability**: Objects never change, only new versions created
- **Lazy evaluation**: States only track changes, not full object lists
- **Cleanup phases**: Can merge similar objects when differences no longer matter
- **Save points**: Each state branch is essentially a saveable game state
- **No ground truth**: Everything exists as possibilities until observed/constrained

This structure supports:

- Temporal reasoning (via ticks and state inheritance)
- Multiple perspectives (each mind has own states)
- Uncertainty/superposition (multiple states at same tick)
- Constraint propagation (via conflicts_with)
- Efficient memory use (via base inheritance)

---

# **Data Structure**

## **Core Principles**

* **Everything is beliefs in minds** - All game entities (objects, NPCs, locations) are represented as Beliefs
* **Global registry with ownership** - Beliefs stored in global registry, each has `in_mind` reference for ownership
* **Hierarchical access** - Parent minds can access child minds (theory of mind) through nested belief structures
* **Prototype inheritance** - Beliefs inherit from Archetypes and other Beliefs via `bases`
* **Immutable nodes** - Changes create new versions via `base` inheritance
* **Branching on uncertainty** - Multiple states can exist at the same tick
* **Time progression** - States are indexed by tick number
* **Differential updates** - States track `insert`/`remove` rather than full belief lists
* **Label uniqueness** - Labels are globally unique across beliefs and archetypes
* **Shared cultural knowledge** - Beliefs in template/cultural minds that other minds reference via `bases` inheritance
* **Identity-based references** - Traits store subject IDs (integers) not object references, enabling temporal queries and state branching at scale

## **Identity and Temporal Versioning**

To support temporal queries, state branching, and scaling to billions of objects, the system uses **identity-based references** rather than direct object references.

### **Subject ID (sid) and Version ID (id)**

Every belief has two identifiers:

* **sid** (subject ID) - Stable identity that persists across all versions of a belief about the same subject
* **id** (version ID) - Unique identifier for each specific temporal version of a belief

Both are integers from a single global sequence:

```
id_sequence = 0

// Create new subject
hammer.sid = ++id_sequence  // 1
hammer.id = ++id_sequence   // 2

// Create new version of same subject
hammer_v2.sid = 1           // Reused - same subject
hammer_v2.id = ++id_sequence  // 3 - new unique version
```

**Key properties:**
- Every `id` is globally unique and never reused
- `sid` values are reused across versions of the same subject
- Same sequence eliminates lookup ambiguity
- Version chains share the same `sid` but have different `id` values

### **State-Contextual Resolution**

Trait values store **subject IDs as integers**, not object references:

```yaml
hammer:
  sid: 100
  id: 101
  traits:
    location: 50  # Integer sid, not object reference
    color: "red"  # Primitive values stored directly
```

To use a reference, you must **resolve it within a state context**:

```
// Stored value is just an integer
hammer.traits.location = 50

// Resolution finds the appropriate version
state.resolve_subject(50) → workshop_v3  # Latest version visible in this state
```

**Benefits of ID-based references:**
1. **Temporal queries** - Same `sid` can resolve to different versions at different times
2. **State branching** - Same `sid` resolves differently in different branches
3. **No stale references** - References never break when targets update
4. **Trivial serialization** - Traits are just integers, no recursive object tracking
5. **Scales to billions** - No cascade updates when objects change
6. **DB-agnostic** - Resolution can be optimized with indexing, SQL, partitioning, etc.

### **Cross-Mind References via about**

The `about` field links beliefs across mind boundaries using subject IDs:

```yaml
# World mind (ground truth)
world.hammer:
  sid: 100
  id: 101
  about: null  # Root subject

# NPC mind (belief about world's hammer)
npc.hammer_belief:
  sid: 200      # NPC's local subject ID
  id: 201
  about: 100    # Links to world's hammer via sid (integer, not reference)
```

**Semantic meaning:**
- `sid = 100` identifies the "actual" hammer in world mind
- `sid = 200` identifies the NPC's *concept* of the hammer
- `about = 100` means "my concept is about that actual thing"

Each mind maintains its own subject space, with `about` creating traceable links from belief → ground truth.

## **Tri-Temporal Semantics**

The system uses three distinct time dimensions to support temporal reasoning, nested minds, and knowledge provenance:

### **Transaction Time (TT)**

When a state or belief was created in computational time.

**Properties:**
- Always set and never goes backwards within a state chain
- Used to query "what states existed at this point in the simulation"
- Child mind states synchronize with parent via **fork invariant**: `child.tt = parent_state.vt`

**Example uses:**
- Finding the current state of a mind at simulation tick 100
- Querying which version of a belief was active when an event occurred
- Coordinating nested mind timelines with their parent contexts

### **Valid Time (VT)**

What time the state is thinking/reasoning about.

**Properties:**
- Defaults to transaction time (present thinking)
- Can differ from tt to enable temporal reasoning:
  - `vt < tt` - Remembering the past
  - `vt = tt` - Reasoning about the present
  - `vt > tt` - Planning for the future
- Same tt + same ground_state = superposition (different possibilities at same moment)
- Same tt + different ground_state = different versions in parent's timeline

**Example uses:**
- NPC recalling what the workshop looked like yesterday (vt=50, tt=100)
- NPC planning a future action (vt=110, tt=100)
- Multiple conflicting beliefs about the current state (superposition)

### **Decision Time (DT)** *(planned, not yet implemented)*

When information was learned or decided upon.

**Properties:**
- Lives at the trait level (provenance metadata)
- Enables testimony chains and knowledge tracking
- Distinguishes direct observation from hearsay

**Example uses:**
- "I saw the hammer at tick 50" (dt=50, direct observation)
- "Guard told me hammer was stolen at tick 40" (dt=60, hearsay about tick 40)
- Resolving conflicting information by recency or source reliability

### **Time Coordination**

**Ground state coordination:**
- Ground state owns the canonical valid time
- Child minds synchronize: `child.tt = ground_state.vt` (fork invariant)
- No arithmetic on time values - always coordinate via explicit ground state reference

**Temporal consistency:**
- Transaction time must progress forward: `next_tt >= current_tt`
- Valid time can move freely (past, present, future)
- Decision time tracks when knowledge was acquired (trait-level metadata)

See IMPLEMENTATION.md for how these concepts map to the current JavaScript implementation.

## **Example: The Missing Hammer Mystery**

*Note: The following examples show beliefs grouped under minds for readability, but in the actual design, beliefs are stored in a global registry with `in_mind` references.*

### **Initial Setup (Tick 1)**

```yaml
world_mind:
  beliefs:
    hammer_1:
      archetype: PortableObject
      descriptors: [black, heavy]
      location: workshop_1

    npc1:
      archetype: NPC
      location: workshop_1
      mind: npc1_mind

    npc2:
      archetype: NPC
      location: market_1
      mind: npc2_mind

npc1_mind:
  states:
    state_1:
      tick: 1
      added: []  # Empty mind initially
  beliefs: {}

npc2_mind:
  states:
    state_1:
      tick: 1
      added: []
  beliefs: {}
```

**Note**: Beliefs are shown grouped under minds for readability, but are actually stored in global `belief_by_id` and `belief_by_sid` registries with `in_mind` references.

### **NPC1 Takes Hammer (Tick 2)**

```yaml
world_mind:
  states:
    state_2:
      base: state_1
      tick: 2
      updated: [hammer_1_v2]
      added: [event_take_hammer]
  beliefs:
    hammer_1_v2:
      archetype: PortableObject
      base: hammer_1
      location: npc1_inventory

    event_take_hammer:
      archetype: Event_movement
      actor: npc1
      target: hammer_1
      from: workshop_1
      to: npc1_inventory
      time: tick_2
```

### **NPC1 is Uncertain if NPC2 Saw (Tick 3)**

```yaml
npc1_mind:
  states:
    state_3a:  # Branch: NPC2 saw me
      base: state_2
      tick: 3
      added: [npc1_model_npc2_v1a]
      certainty: unusual

    state_3b:  # Branch: NPC2 didn't see
      base: state_2
      tick: 3
      added: [npc1_model_npc2_v1b]
      certainty: common

  beliefs:
    npc1_model_npc2_v1a:
      archetype: mind
      about: npc2_mind
      states:
        state_3:
          tick: 3
          ground_state: npc1_mind.state_3a  # Grounded in NPC1's branch where they assume they were seen
          added: [obs_saw_take, npc2_belief_event, npc2_belief_hammer]
      beliefs:
        obs_saw_take:
          archetype: Event_perception
          observer: npc2
          target: npc2_belief_event
          time: tick_2
          about: world_perception_event  # world's version of this observation

        npc2_belief_event:
          archetype: Event_movement
          about: event_take_hammer  # corresponds to world event
          actor: npc1
          target: npc2_belief_hammer
          source: obs_saw_take

        npc2_belief_hammer:
          archetype: PortableObject
          about: hammer_1  # corresponds to world's hammer

    npc1_model_npc2_v1b:
      archetype: mind
      about: npc2_mind
      states:
        state_3:
          tick: 3
          ground_state: npc1_mind.state_3b  # Grounded in NPC1's branch where they assume they weren't seen
          added: []  # No observation
      beliefs: {}
```

### **NPC1 Creates Facade for Player (Tick 4)**

Building on branch 3a (assumes NPC2 saw):

```yaml
npc1_mind:
  states:
    state_4:
      base: state_3a
      tick: 4
      added: [facade_for_player]

  beliefs:
    facade_for_player:
      archetype: mind
      states:
        state_4:
          tick: 4
          added: [false_hammer_location]
      beliefs:
        false_hammer_location:
          archetype: PortableObject
          descriptors: [black, heavy]
          location: workshop_1  # The lie - claims it's still there
          about: hammer_1  # corresponds to world's hammer
```

### **NPC1 Believes NPC2 is Also Uncertain (Tick 5)**

NPC1 thinks NPC2 might be unsure about what they saw:

```yaml
npc1_mind:
  states:
    state_5:
      base: state_4
      tick: 5
      updated: [npc1_model_npc2_v2]

  beliefs:
    npc1_model_npc2_v2:
      archetype: mind
      base: npc1_model_npc2_v1a
      about: npc2_mind
      states:
        state_5a:  # NPC2 thinks they saw NPC1
          tick: 5
          added: [obs_saw_take]
          certainty: unusual

        state_5b:  # NPC2 thinks they saw someone else
          tick: 5
          added: [obs_saw_someone, npc2_belief_event_v2]
          certainty: common

      beliefs:
        obs_saw_someone:
          archetype: Event_perception
          observer: npc2
          target: npc2_belief_event_v2
          time: tick_2

        npc2_belief_event_v2:
          archetype: Event_movement
          base: npc2_belief_event
          about: event_take_hammer
          actor: unknown_person  # Uncertain who
```

## **Key Patterns**

### **Inheritance Chain**

Properties flow through `bases` references:

```
# Linear version chain
hammer_1 → hammer_1_v2 → hammer_1_v3
         ↓
    location: workshop → npc1_inventory → npc2_inventory

# Branching version chain
country_culture_v1 (autumn)
  ↓ branches
  ├─→ country_v2 (winter, @T110)
  └─→ country_v3 (spring, @T150)
```

### **Correspondence Chain**

The `about` property links beliefs across mind boundaries:

world.hammer_1 ← player.hammer_belief ← player.obs_hammer (source)

### **State Branching**

States track forward navigation via `branches`:

```yaml
state_2:
  branches: [state_3a, state_3b]  # Multiple possible futures

state_3a:
  base: state_2
  certainty: unusual
  branches: [state_4]

state_3b:
  base: state_2
  certainty: common
  branches: []  # No further exploration yet
```

**Use cases**:
- **Uncertainty**: Multiple possible current states (superposition)
- **Planning**: NPC considers alternative future actions
- **Theory of mind**: Reasoning about what others might believe
- **Cleanup**: Merge branches when differences no longer matter

### **Ground State Linking**

Nested mind states link back to outer mind via `ground_state`:

```yaml
# NPC's mind state grounded in world state
npc_mind.state_5:
  ground_state: world_mind.state_10  # Created when world was at tick 10

# NPC's model of another NPC grounded in their own state
npc1_model_of_npc2.state_3:
  ground_state: npc1_mind.state_7  # NPC1's reasoning at tick 7
```

**Properties**:
- Tracks which version of outer reality a nested mind is reasoning about
- Inherited automatically by child states via `tick()` unless explicitly overridden
- Root states (world_mind) have `ground_state: null`
- Enables temporal coordination between nested minds

### **Conflict Tracking**

When beliefs contradict:

```yaml
belief_x:
  base: belief_original
  conflicts_with: [observation_y]
```

### **Mind Nesting**

* `world_mind` has references to `npc1_mind`, `npc2_mind` (stored as beliefs with Mind trait)
* `npc1_mind` has references to `npc1_model_npc2`, `facade_for_player` (nested mind beliefs)
* Each mind is isolated from siblings and parent, but can introspect children
* All beliefs (including those "belonging to" a mind) exist in the global registry with `in_mind` references

### **Belief Version Branching**

Beliefs can have child versions (branches) representing alternative states:

```
country_culture_v1 (autumn)
  ↓ branches: [v2, v3]
  ├─→ country_culture_v2 (winter, @T110)
  └─→ country_culture_v3 (spring, @T150)
```

Query resolution selects appropriate child based on context:
- Query @T90  → v1 (autumn) - no children yet
- Query @T110 → v2 (winter) - temporal match
- Query @T150 → v3 (spring) - temporal match

Inherited beliefs see updates without creating new versions:

```
npc_belief (bases: [city_belief → country_v1])
  Query @T110:
    → country_v1.branches → v2
    → Result: winter trait from v2

  No npc_belief_v2 created until explicitly needed
```

**Branch types**:
- **Temporal**: Different time periods (seasons, news events)
- **Probability**: Multiple possible states (king alive 60%, dead 40%)
- **Spatial**: Regional variations in knowledge
- **Perspective**: Different beliefs held by different minds

### **Lazy Propagation Pattern**

When shared beliefs update, new versions propagate lazily through inheritance chains:

```yaml
# Tick 100: Initial state
country_culture_v1:
  traits: {season: 'autumn'}
  branches: []

city_paris:
  bases: [country_culture_v1]

npc_knowledge:
  bases: [city_paris]

# Query: npc → city → country_v1 → season = 'autumn'
```

```yaml
# Tick 110: Country updates (1 new belief)
country_culture_v2:
  bases: [country_culture_v1]
  traits: {season: 'winter'}

country_culture_v1:
  branches: [country_culture_v2]  # Child added

# City and NPC beliefs UNCHANGED
city_paris:
  bases: [country_culture_v1]  # Still points to v1

npc_knowledge:
  bases: [city_paris]  # Still points to city

# Query @T110:
# npc → city → country_v1
# Detect: country_v1.branches = [v2]
# Resolve: v2 created @T110, query @T110
# Result: season = 'winter' from v2
#
# No new city or NPC beliefs created!
```

**Materialization on demand**:

```yaml
# First NPC creates explicit version @T110
npc1_knowledge_v2:
  bases: [npc1_knowledge_v1]
  traits: {opinion: 'I hate winter'}

# Materialization process:
# Walk: npc1_v1 → city → country_v1 (has branches)
# Resolve: country_v2 selected @T110
# Create: city_paris_v2 {bases: [country_v2]}
# Result: npc1_v2 {bases: [city_v2]}

# Second NPC reuses materialized city:
npc2_knowledge_v2:
  bases: [city_paris_v2]  # Reuses city_v2

# Result: 1000 NPCs share 1 city_v2
```

**Benefits**:
- Shared knowledge updates: O(1) new beliefs
- Query resolution: O(inheritance depth)
- Materialization: Only when explicitly creating versions
- Memory: O(changes) not O(NPCs)

## **Example: Winter Arrives (Shared Knowledge)**

### **Initial State (Tick 100)**

```yaml
country_mind:
  state_100:
    insert: [country_culture_v1]

  beliefs:
    country_culture_v1:
      subject_id: 100
      bases: [Culture]
      traits: {season: 'autumn'}
      branches: []

city_paris_mind:
  state_100:
    insert: [city_paris_v1]

  beliefs:
    city_paris_v1:
      subject_id: 200
      bases: [country_culture_v1]
      traits: {city_name: 'Paris'}

npc1_mind:
  state_100:
    insert: [npc1_knowledge_v1]

  beliefs:
    npc1_knowledge_v1:
      subject_id: 300
      bases: [city_paris_v1]
      traits: {}
```

**Query**: What season does NPC1 know?
```
npc1_knowledge_v1
  → bases: city_paris_v1
    → bases: country_culture_v1
      → traits.season = 'autumn'
```

### **Winter Arrives (Tick 110)**

```yaml
country_mind:
  state_110:
    base: state_100
    insert: [country_culture_v2]

  beliefs:
    country_culture_v1:
      branches: [country_culture_v2]  # Child version added

    country_culture_v2:
      subject_id: 100  # Same subject as v1
      bases: [country_culture_v1]
      origin_state: state_110
      traits: {season: 'winter'}
      branches: []

# City and NPC beliefs unchanged
city_paris_v1:
  bases: [country_culture_v1]  # Still points to v1

npc1_knowledge_v1:
  bases: [city_paris_v1]  # Still points to city_v1
```

**Query @T110**: What season does NPC1 know?
```
npc1_knowledge_v1
  → bases: city_paris_v1
    → bases: country_culture_v1
      → branches: [country_v2]
      → Resolve @T110: v2 (created @T110)
      → traits.season = 'winter'
```

**Result**: NPC1 knows 'winter' without creating npc1_v2 or city_v2

### **NPC Forms Opinion (Tick 115)**

```yaml
npc1_mind:
  state_115:
    base: state_100
    insert: [npc1_knowledge_v2]

  beliefs:
    npc1_knowledge_v2:
      subject_id: 300  # Same subject
      bases: [city_paris_v2]  # Now points to materialized city_v2
      origin_state: state_115
      traits: {opinion: 'I hate winter'}

# Materialization created city_v2:
city_paris_v2:
  subject_id: 200
  bases: [city_paris_v1, country_culture_v2]
  origin_state: state_115
  traits: {city_name: 'Paris'}  # Inherited from v1
```

**Materialization process**:
1. Create npc1_knowledge_v2 with new trait
2. Walk bases: npc1_v1 → city_v1 → country_v1
3. Detect country_v1.branches = [country_v2]
4. Resolve @T115: select country_v2
5. Create city_paris_v2 inheriting from country_v2
6. Update npc1_knowledge_v2 to inherit from city_v2

### **Second NPC Forms Opinion (Tick 120)**

```yaml
npc2_mind:
  state_120:
    insert: [npc2_knowledge_v2]

  beliefs:
    npc2_knowledge_v2:
      bases: [city_paris_v2]  # Reuses existing city_v2!
      traits: {opinion: 'I love winter'}
```

**No new city version created** - city_paris_v2 already materialized by NPC1.

**Scaling**: 1000 NPCs forming opinions → 1 country_v2 + 1 city_v2 + 1000 npc versions

### **Template Matching**

Templates query across branches to find story opportunities:

* Deception possible when `facade_for_player` differs from `state_actual`
* Investigation needed when multiple branches have different certainties
* Confrontation available when conflicting observations exist
