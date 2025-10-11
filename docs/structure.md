# Data structure

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

* **Everything is beliefs in minds** - world_mind contains npc_minds which contain beliefs
* **Hierarchical access** - Parent minds can access child minds (theory of mind), but minds cannot access their parent or sibling minds
* **Prototype inheritance** - Shared belief prototypes live in a global set,
  allowing multiple beliefs across different minds to inherit common structure without
  violating mind isolation
* **Immutable nodes** - Changes create new versions via `base` inheritance
* **Branching on uncertainty** - Multiple states can exist at the same tick
* **Time progression** - States are indexed by tick number
* **Differential updates** - States track `added`, `updated`, `removed` rather than full lists

## **Schema**

### **Mind Structure**

```yaml
mind:
  states:
    state_[tick][branch]:
      base: previous_state  # inheritance chain
      timestamp: [number]
      insert: [list of new beliefs]
      remove: [list of replaced beliefs]
      certainty: certain|common|unusual|rare

  beliefs:
    [belief_id]:
      archetypes: [types]
      bases: [parent_belief]  # for inheritance
      about: [belief_in_outer_mind]  # correspondence to outer mind's belief
      source: [belief]  # how this belief originated (observation, testimony, etc)
      traits: [properties based on archetype]
```

### **Belief Archetypes**

* **Object** - Physical items with location, properties
* **Event** - Things that happened (movement, perception, etc)
* **Mind** - Model of another entity's beliefs
* **Location** - Places in the world

### **Key Properties**

* **bases** - Inherited beliefs, prototypes or archetypes
* **about** - Links a belief to the corresponding belief in an outer mind. Used by system to track correspondence, not accessible to the mind itself.
* **target** - Points to other beliefs within the same mind (used in observations, references).
* **source** - Points to the belief that originated this belief (observation event, testimony, inference).

## **Example: The Missing Hammer Mystery**

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

### **Conflict Tracking**

When beliefs contradict:

```yaml
belief_x:
  base: belief_original
  conflicts_with: [observation_y]
```

### **Mind Nesting**

* `world_mind` contains `npc1_mind`, `npc2_mind`
* `npc1_mind` contains `npc1_model_npc2`, `facade_for_player`
* Each mind is isolated from siblings and parent, but can introspect children

### **Template Matching**

Templates query across branches to find story opportunities:

* Deception possible when `facade_for_player` differs from `state_actual`
* Investigation needed when multiple branches have different certainties
* Confrontation available when conflicting observations exist
