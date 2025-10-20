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
* **Cultural beliefs** - Beliefs with null ownership can be shared across all minds
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

## **Schema**

### **Registry Structure**

All entities are stored in global registries for efficient lookup:

```yaml
registries:
  mind_by_id: [id → mind]
  mind_by_label: [label → mind]
  belief_by_id: [id → belief]       # Version-based lookup (get specific version)
  belief_by_sid: [sid → beliefs]     # Subject-based lookup (get all versions of subject)
  label_by_sid: [sid → label]        # Labels belong to subjects, not versions
  sid_by_label: [label → sid]        # Reverse lookup from label to subject
  archetype_by_label: [label → archetype]
```

**Design constraint**: Labels are globally unique across subjects and archetypes to prevent naming conflicts.

**Label semantics**: Labels identify subjects (stable identity), not versions (temporal variants). All versions of the same subject share the label. To lookup by label: `sid_by_label["hammer"]` → `sid = 100`, then `resolve_subject(state, 100)` → latest version.

**Indexing strategy**: `belief_by_sid` enables efficient resolution queries like "find latest version of subject S in state T" without scanning all beliefs.

### **Mind Structure**

```yaml
mind:
  id: [unique identifier]
  label: [optional string for lookup]
  states: [collection of state snapshots]
```

**Key design decision**: Beliefs are NOT stored in minds. All beliefs live in the global registry, with each belief maintaining an `in_mind` reference for ownership. This enables:
- Direct belief lookup without knowing which mind owns it
- Efficient queries across all beliefs (e.g., "find all beliefs about entity X")
- Consistent access patterns for all entity types

### **State Structure**

```yaml
state:
  id: [unique identifier]
  in_mind: [reference to owning mind]
  base: [reference to previous state, or null]
  ground_state: [reference to state in outer mind, or null]
  timestamp: [tick number]
  insert: [beliefs added in this state]
  remove: [beliefs removed in this state]
  branches: [collection of states created from this state]
```

**Validation**: States can only contain beliefs from their owning mind, except for "cultural beliefs" (beliefs with null ownership) which are shared.

**Query pattern**: To get all beliefs in a state, walk the `base` chain accumulating `insert` lists while tracking `remove` lists.

**Grounding**: When a nested mind creates states (e.g., NPC's model of another NPC's mind), the `ground_state` links back to the parent mind's state that created it. This tracks which version of reality the nested reasoning is based on.

**Branching**: The `branches` collection tracks forward links to all states created from this state, enabling navigation of possibility trees and planning scenarios.

### **Belief Structure**

```yaml
belief:
  sid: [subject identifier - stable across versions]
  id: [version identifier - unique for this temporal instance]
  in_mind: [owning mind reference, or null for cultural beliefs]
  about: [integer sid referencing subject in outer mind]
  bases: [inheritance from archetypes or other beliefs]
  traits: [properties - stores integer sids for references, primitives for values]
```

**Identity semantics**:
- `sid` identifies the subject (what entity this is)
- `id` identifies the version (when/how this belief exists)
- Labels are stored separately: `label_by_sid[sid] = "hammer"`
- All versions of the same subject share the same `sid` and label

**Ownership semantics**:
- Normal beliefs: `in_mind` points to owning mind
- Cultural beliefs: `in_mind` is null, can be referenced by any mind
- Beliefs auto-register in global registry on creation

**Reference semantics**:
- `about` stores integer `sid` (not object reference)
- Trait values store integer `sid` for entity references (e.g., `location: 50`)
- Resolution happens at query time: `state.resolve_subject(sid)` → latest belief

**Versioning**: Creating modified versions uses immutable pattern - new belief with same `sid`, new `id`, and `base` reference to previous version.

### **Archetype Structure**

```yaml
archetype:
  label: [unique identifier]
  bases: [parent archetypes for inheritance]
  traits_template: [available trait definitions]
```

Archetypes define the "types" of beliefs (Object, Event, Location, etc.) and what traits they can have.

### **Key Properties**

* **bases** - Inherited beliefs, prototypes or archetypes
* **about** - Links a belief to the corresponding belief in an outer mind. Used by system to track correspondence, not accessible to the mind itself.
* **target** - Points to other beliefs within the same mind (used in observations, references).
* **source** - Points to the belief that originated this belief (observation event, testimony, inference).

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

Properties flow through `base` references:

hammer_1 → hammer_1_v2 → hammer_1_v3  
         ↓  
    location: workshop → npc1_inventory → npc2_inventory

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

### **Template Matching**

Templates query across branches to find story opportunities:

* Deception possible when `facade_for_player` differs from `state_actual`
* Investigation needed when multiple branches have different certainties
* Confrontation available when conflicting observations exist
