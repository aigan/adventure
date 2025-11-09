# Observation and Recognition System Specification

## Overview

This document specifies how minds observe entities in their parent mind and how they recognize familiar entities. The system uses trait-based exposure and entity prominence to determine observability, combined with acquaintance levels for recognition.

## Core Concepts

### Separation of Observation and Knowledge

**Observation event** - Memory of the *act* of perceiving (Event_perception)
**Resulting belief** - Memory of *what* was perceived (the observed entity)

These are separate beliefs. Observations can be forgotten while their resulting beliefs persist.

### Mind Boundaries

Minds cannot access parent or sibling minds directly. All knowledge about outer entities comes through:
1. **Observation** - perceiving exposed entities
2. **Testimony** - being told by others
3. **Inference** - reasoning from known facts

## Meta-Traits

Meta-traits use `@` prefix and describe properties of the belief itself, not the subject:

### @about

**Purpose:** Links belief to corresponding entity in outer mind

**Semantics:** Represents the mind's current identification (which may be incorrect)

**Usage:**
- Performance optimization for routine cases (identity not in question)
- Set immediately when recognition is clear
- Can be wrong during misidentification
- Absent when identity requires trait matching

**Examples:**
```javascript
// Correctly identified
belief_workshop: {
  @about: world.workshop_1,
  location_type: 'indoor'
}

// Misidentified (thinks Tom is Bob)
belief_person: {
  @about: world.tom,  // wrong identification
  appearance: 'tall, bearded'  // actually Bob's traits
}

// Identity uncertain
belief_stranger: {
  @about: null,  // don't know who this is
  appearance: 'hooded figure'
}
```

### @subject

**Purpose:** Identity of the belief through time

**Semantics:** Different versions of a belief modified over time share the same subject

**Usage:**
- Links belief versions via `base` inheritance
- Used for acquaintance (recognize subject across versions)
- Stable identifier for belief evolution

**Examples:**
```javascript
// Initial belief
belief_bob_v1: {
  @subject: 'subject_bob_123',
  @about: world.bob,
  appearance: 'bearded'
}

// Updated belief
belief_bob_v2: {
  @subject: 'subject_bob_123',  // same subject
  @about: world.bob,
  base: belief_bob_v1,
  appearance: 'clean_shaven'  // trait changed
}
```

### @acquaintance

**Purpose:** Level of familiarity enabling recognition

**Semantics:** Points to subject (not specific version) to indicate recognition capability

**Values:**
- **'intimate'** - Recognize across all contexts and personas
- **'familiar'** - Recognize in most contexts
- **'slight'** - Only recognize in known contexts
- **null** - Would not recognize (no acquaintance)

**Recognition behavior:**

| Level | Exposed in familiar context | Exposed in unfamiliar context | Significant trait changes |
|-------|---------------------------|------------------------------|--------------------------|
| intimate | Recognize | Recognize | Recognize |
| familiar | Recognize | Recognize | May recognize |
| slight | Recognize | Don't recognize | Don't recognize |
| null | Don't recognize | Don't recognize | Don't recognize |

**Examples:**
```javascript
// Deep acquaintance - would recognize anywhere
belief_best_friend: {
  @about: world.alice,
  @subject: 'subject_alice_456',
  @acquaintance: 'intimate',
  personality: 'cheerful'
}

// Context-limited acquaintance
belief_blacksmith: {
  @about: world.bob,
  @subject: 'subject_bob_123',
  @acquaintance: 'slight',  // only seen at forge
  appearance_context: ['at_forge', 'leather_apron'],
  role: 'blacksmith'
}

// Knowledge without acquaintance
belief_king: {
  @about: world.king,
  @subject: 'subject_king_789',
  @acquaintance: null,  // heard of, never met
  role: 'ruler',
  reputation: 'just'
}
```

### @source

**Purpose:** Tracks how this belief originated

**Semantics:** Points to observation event, testimony, or inference that created the belief

**Examples:**
```javascript
// From observation
belief_hammer: {
  @about: world.hammer_1,
  @source: obs_workshop_tick_5,
  color: 'black'
}

// From testimony
belief_rumor: {
  @about: world.treasure,
  @source: testimony_from_merchant,
  location: 'old_mine'
}

// No source (pre-existing knowledge)
belief_home: {
  @about: world.player_house,
  @source: null
}
```

## Trait Exposure

**Purpose:** Defines what sensory channel traits manifest in

**Property:** `exposure` on traittype definition

**Values:**
- **'visual'** - Surface appearance (color, shape, text)
- **'tactile'** - Touch-based (weight, texture, temperature)
- **'auditory'** - Sound-based (volume, pitch)
- **'olfactory'** - Smell-based
- **'spatial'** - Spatial presence (location)
- **'behavioral'** - Observable through behavior
- **'internal'** - No sensory manifestation (mind states, memories)

**Examples:**
```javascript
const traittypes = {
  color: {
    type: 'string',
    exposure: 'visual'
  },
  
  weight: {
    type: 'number',
    exposure: 'tactile'
  },
  
  location: {
    type: 'Location',
    exposure: 'spatial'
  },
  
  mind_states: {
    type: 'State',
    exposure: 'internal'  // not directly observable
  },
  
  nervousness: {
    type: 'string',
    exposure: 'behavioral'  // observable through actions
  }
}
```

## Entity Spatial Prominence

**Purpose:** Narrative presence/accessibility of entity in scene

**Property:** `spatial_prominence` on entity

**Values (in order):**
- **'prominent'** - Actively draws attention (loud, bright, large, smelly)
- **'exposed'** - Normal presence, readily observable
- **'obscured'** - Reduced by conditions (fog, darkness, clutter, small)
- **'hidden'** - Deliberately concealed
- **'intangible'** - No spatial presence (thoughts, distant entities)

**Modifiers:**
Environmental conditions can shift prominence:
- Darkness: visual traits become more obscured
- Fog: reduces visual prominence at distance
- Loud noise: auditory prominence increases
- Strong smell: olfactory prominence increases

**Examples:**
```javascript
// Normal object at location
hammer: {
  spatial_prominence: 'exposed',
  location: workshop,
  color: 'black'
}

// Hidden object
secret_key: {
  spatial_prominence: 'hidden',
  location: workshop,
  hiding_place: 'under_floorboard'
}

// Attention-grabbing object
burning_forge: {
  spatial_prominence: 'prominent',
  location: workshop,
  light_level: 'bright',
  heat_level: 'intense',
  sound_level: 'loud'
}
```

## Observation Process

### Basic Flow

1. **Observer at location** - Entity with mind at same location as target
2. **Check spatial prominence** - Is target exposed enough to be noticed?
3. **Check sensory access** - Which trait exposures are accessible?
4. **Attempt recognition** - Does observer have acquaintance?
5. **Create/update belief** - Form knowledge about observed entity

### Observability Determination

Entity is observable when:
```
(spatial_prominence >= 'exposed') AND
(observer has access to at least one trait exposure type)
```

### Accessible Traits

Traits are accessible when:
```
(trait.exposure in available_sensory_channels) AND
(entity.spatial_prominence allows trait.exposure)
```

**Example:**
```javascript
// Visual observation in good light
available_channels = ['visual', 'spatial', 'auditory']
entity.spatial_prominence = 'exposed'

// These traits are accessible:
color: {exposure: 'visual'} → Yes
location: {exposure: 'spatial'} → Yes
sound: {exposure: 'auditory'} → Yes

// These are not:
weight: {exposure: 'tactile'} → No (not touching)
mind_states: {exposure: 'internal'} → No (never accessible via observation)
```

### Creating Observation

```javascript
// 1. Create observation event
obs_workshop: {
  archetype: 'Event_perception',
  observer: player,
  target: null,  // will point to resulting belief
  time: current_tick,
  @about: world_perception_event  // if world tracks this
}

// 2. Create resulting belief (or update existing)
player_belief_workshop: {
  archetype: 'Location',
  @about: world.workshop_1,
  @subject: 'workshop_subject',
  @acquaintance: 'familiar',  // if recognized
  @source: obs_workshop,
  // Copy accessible traits from world.workshop_1
  location_type: 'indoor',
  size: 'large'
}

// 3. Link observation to belief
obs_workshop.target = player_belief_workshop

// 4. Add to state
state.tick({
  insert: [obs_workshop, player_belief_workshop]
})
```

## Recognition Process

### Recognition Check

When observing an entity:

1. **Check @about shortcut** - If `@about` already set from previous logic, use it
2. **Check acquaintance** - Search for belief with `@acquaintance != null`
3. **Match traits** - Compare observed traits against known entities
4. **Evaluate context** - Is this a known context for slight acquaintance?

### Decision Flow

```
IF @about is set (from prior identification)
  → Use that identity (might be wrong)
  
ELSE IF @acquaintance exists for this entity
  IF acquaintance level permits recognition in this context
    → Recognize (set @about, update existing belief)
  ELSE
    → Don't recognize (create new belief or leave @about null)
    
ELSE
  → Trait matching required (story-specific logic)
```

### Recognition Examples

**Case 1: Familiar entity in normal context**
```javascript
// Player knows Bob well
existing_belief: {
  @about: world.bob,
  @acquaintance: 'familiar',
  appearance: 'tall, bearded'
}

// Observes Bob at market
// Result: Immediate recognition
// Updates existing_belief, no new belief created
```

**Case 2: Slight acquaintance, wrong context**
```javascript
// Player only knows blacksmith at forge
existing_belief: {
  @about: world.bob,
  @acquaintance: 'slight',
  appearance_context: ['at_forge', 'leather_apron']
}

// Observes clean-shaven man at market (actually Bob)
// Result: Don't recognize
// Creates new belief with @about: null or world.bob (but no recognition)
```

**Case 3: No acquaintance**
```javascript
// Player heard of the king but never met
existing_belief: {
  @about: world.king,
  @acquaintance: null,
  role: 'ruler'
}

// Observes well-dressed person at castle
// Result: No recognition
// Creates separate belief for "well-dressed person"
```

## Direct Knowledge Creation

For cases where observation mechanics aren't needed (initialization, testimony, game start):

```javascript
Mind.prototype.create_knowledge_about(outer_entity, traits_override = {}) {
  const belief = new Belief(this, {
    archetypes: [...outer_entity.archetypes],
    traits: {
      ...copy_traits(outer_entity),
      ...traits_override,
      @about: outer_entity,
      @subject: generate_subject_id(),
      @acquaintance: null,  // or set if appropriate
      @source: null
    }
  });
  
  return belief;
}
```

## Misidentification and Correction

### Misidentification State

```javascript
// Player mistakes Tom for Bob
belief_mistaken: {
  @about: world.tom,           // wrong identification
  @subject: 'subject_mistake',
  @acquaintance: 'familiar',   // thinks they know Tom
  @source: obs_market_tick_10,
  appearance: 'tall, bearded'  // actually Bob's traits
}
```

### Detection

Misidentification is detected when:
- Direct contradiction (see both "Tom" and actual Tom at once)
- Testimony contradicts belief
- Story template identifies inconsistency

### Correction Process

1. **Create corrected belief** about actual entity
2. **Re-attribute observations** to correct belief
3. **Mark old belief as invalidated** or remove
4. **Update @about** references

```javascript
// Create belief about actual Bob
belief_bob_corrected: {
  @about: world.bob,
  @subject: 'subject_bob_new',
  @acquaintance: 'familiar',
  appearance: 'tall, bearded',
  @source: obs_market_tick_10  // re-attributed
}

// Invalidate mistaken belief
belief_mistaken.invalidated = true
belief_mistaken.corrected_by = belief_bob_corrected
```

## Implementation Considerations

### Performance Optimization

**Use @about for routine cases:**
- Known locations player visits regularly
- Familiar NPCs in expected contexts
- Objects player has identified

**Skip @about for story-interesting cases:**
- Disguises and deception
- First encounters
- Ambiguous situations
- Investigation scenarios

### Story Generation

**Templates can query for:**
- Mismatches in @about across minds (misidentification drama)
- Beliefs with @acquaintance but no recent observations (reunion opportunities)
- Multiple beliefs about same @about entity (confusion scenarios)
- Beliefs with @acquaintance pointing to wrong @about (mistaken identity)

### Scalability

**Canonical + Instance Pattern:**
```javascript
// Canonical belief (accumulated general knowledge)
player_belief_bob_canonical: {
  @about: world.bob,
  @subject: 'subject_bob',
  @acquaintance: 'familiar',
  appearance_typical: ['tall', 'bearded'],
  role: 'blacksmith',
  last_observed: tick_100
}

// Recent instance (specific observation)
player_belief_bob_instance_tick_100: {
  @about: world.bob,
  @subject: 'subject_bob',  // same subject
  base: player_belief_bob_canonical,
  appearance_specific: ['bandaged_hand'],  // today's detail
  @source: obs_tick_100
}
```

**For "what do they look like?"**
- Use canonical belief (fast lookup)
- Optionally include recent instance details

**For recognition:**
- Match against canonical traits (fast)
- Fall back to instance traits if needed

### Context Modeling

**Option 1: Implicit through acquaintance level**
- 'slight' acquaintance = context-dependent recognition
- Let trait matching determine if context matches

**Option 2: Explicit context branches**
```javascript
// Root canonical
belief_bob: {
  @about: world.bob,
  @subject: 'subject_bob',
  appearance_general: ['tall', 'bearded']
}

// Context-specific branch
belief_bob_at_work: {
  base: belief_bob,
  appearance_context: ['leather_apron', 'soot'],
  location_typical: 'forge'
}
```

## Integration with Existing System

### Archetype Observability

Archetypes are observed based on their traits:

```javascript
ObjectPhysical: {
  traits: {
    location: null,    // exposure: 'spatial'
    color: null        // exposure: 'visual'
  }
}
// → Observable when entity has spatial_prominence >= 'exposed'

Mental: {
  traits: {
    mind_states: null  // exposure: 'internal'
  }
}
// → Not directly observable, only through behavior
```

When observing a person with both ObjectPhysical and Mental archetypes:
- Copy ObjectPhysical archetype (has observable traits)
- Don't copy Mental archetype (no observable traits)
- Mental archetype can be inferred later through behavior

### Trait Resolution

Update Traittype.resolve() to handle @meta-traits:

```javascript
Traittype.resolve(mind, data) {
  // Handle meta-traits (@ prefix)
  if (this.label.startsWith('@')) {
    // Validate and return as-is
    return data;
  }
  
  // Regular trait resolution logic
  // ...
}
```

### State Management

Observations create both events and beliefs:

```javascript
state.tick({
  insert: [observation_event, resulting_belief],
  update: [existing_belief_if_recognized]
})
```

## Example Scenarios

### Scenario 1: First Meeting

```javascript
// World state
world.bob: {
  archetype: ['Actor', 'Mental'],
  spatial_prominence: 'exposed',
  appearance: 'tall, bearded',
  location: workshop
}

// Player observes
obs_bob: {
  archetype: 'Event_perception',
  observer: player,
  target: player_belief_bob,
  time: tick_5
}

player_belief_bob: {
  archetype: ['Actor'],  // Mental not copied
  @about: world.bob,
  @subject: 'subject_bob_123',
  @acquaintance: 'slight',  // first meeting
  @source: obs_bob,
  appearance: 'tall, bearded',
  location: workshop
}
```

### Scenario 2: Recognition After Time

```javascript
// Existing belief
player_belief_bob: {
  @about: world.bob,
  @acquaintance: 'familiar',
  appearance: 'bearded',
  last_observed: tick_5
}

// Observe Bob again at tick_50 (now clean-shaven)
// Recognition: @acquaintance = 'familiar' allows recognition
// Result: Update existing belief

player_belief_bob_v2: {
  base: player_belief_bob,
  @about: world.bob,
  @acquaintance: 'familiar',
  appearance: 'clean_shaven',  // trait changed
  @source: obs_tick_50,
  last_observed: tick_50
}
```

### Scenario 3: Disguise

```javascript
// Bob in disguise
world.bob: {
  spatial_prominence: 'exposed',
  appearance: 'hooded, concealed_face',
  location: market
}

// Player observation
// Recognition check: traits don't match known Bob
// @acquaintance level insufficient for recognition
// Result: New belief, no connection to Bob

player_belief_stranger: {
  archetype: ['Actor'],
  @about: world.bob,  // system knows
  @subject: 'subject_stranger_456',
  @acquaintance: null,  // don't know who this is
  @source: obs_market,
  appearance: 'hooded, mysterious'
}

// Player has two separate beliefs about Bob:
// 1. player_belief_bob (knows him)
// 2. player_belief_stranger (doesn't recognize as same person)
```

### Scenario 4: Testimony Without Acquaintance

```javascript
// NPC tells player about the missing hammer
testimony_hammer: {
  archetype: 'Event_communication',
  speaker: npc1,
  listener: player,
  content: 'The hammer is missing from the workshop'
}

// Player creates belief based on testimony
player_belief_hammer: {
  archetype: ['PortableObject'],
  @about: world.hammer_1,  // NPC identified it
  @subject: 'subject_hammer_789',
  @acquaintance: null,  // never seen it
  @source: testimony_hammer,
  location: 'workshop (reportedly)',
  status: 'missing'
}

// Later observes a hammer at forge
// No recognition (no acquaintance)
// Creates separate belief unless trait matching identifies it
```

## Design Decisions Summary

1. **@about represents mind's identification** (can be wrong) rather than system ground truth
2. **@acquaintance enables recognition shortcuts** avoiding trait matching in common cases
3. **@subject provides identity through time** for belief evolution
4. **Trait exposure defines sensory channels** traits manifest in
5. **Spatial prominence defines narrative presence** of entities
6. **Recognition combines acquaintance + context + traits** with acquaintance as primary shortcut
7. **Misidentification is normal state** that gets corrected through story progression
8. **Observation and resulting belief are separate** allowing independent memory decay

## Future Extensions

- **Probability distributions** on @about (60% Bob, 30% Tom, 10% stranger)
- **Familiarity decay** over time without observations
- **Context-specific recognition thresholds**
- **Trait weighting** for recognition (face more important than clothing)
- **Attention/saliency** affecting what traits are observed
- **False memories** updating beliefs incorrectly
- **Collective knowledge** shared across groups (village knows each other)
