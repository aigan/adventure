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

**Purpose:** Links belief to corresponding entity in parent mind

**Semantics:** The mind's identification of what outer entity this belief refers to. This is epistemic - it represents what the mind *believes* the identity to be, which may be incorrect or absent.

**Traittype definition:**
```javascript
'@about': {
  type: 'Subject',
  mind: 'parent',      // Resolve in parent mind's state
  exposure: 'internal' // Not observable by others
}
```

**Usage:**
- Set when mind identifies the entity (recognition succeeds)
- Can be wrong during misidentification
- Null/absent when identity unknown or uncertain
- Resolved via `belief.get_about(state)` method

**Examples:**
```javascript
// Correctly identified workshop
const workshop_knowledge = state.add_belief_from_template({
  bases: ['Location'],
  traits: {
    '@about': world_workshop.subject,  // Mind's identification
    location_type: 'indoor'
  }
})

// Misidentified (thinks stranger is Bob)
const mistaken_belief = state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': world_tom.subject,  // Wrong - actually saw Bob
    appearance: 'tall, bearded'   // Bob's traits attributed to Tom
  }
})

// Identity uncertain (stranger in disguise)
const stranger_belief = state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': null,  // Don't know who this is
    appearance: 'hooded figure'
  }
})
```

### Subject (belief.subject)

**Purpose:** Stable identity of the belief through time

**Note:** This is a **property** of Belief (`belief.subject`), not a meta-trait. Documented here because it's central to identity tracking.

**Semantics:** Different versions of a belief share the same Subject instance. The Subject has a stable `sid` (subject ID) that persists across versions.

**Usage:**
- `belief.subject.sid` - Stable numeric identifier
- Versioned beliefs share same subject when created with `sid` parameter
- Used for queries like `state.get_belief_by_subject(subject)`
- Labels are associated with subjects, not individual belief versions

**Examples:**
```javascript
// Initial belief - creates new subject
const bob_v1 = state.add_belief_from_template({
  bases: ['Person'],
  traits: { appearance: 'bearded' },
  label: 'bob'
})
// bob_v1.subject.sid = 123 (auto-assigned)

// Updated belief - same subject via sid parameter
const bob_v2 = Belief.from_template(state, {
  sid: bob_v1.subject.sid,  // Same subject identity
  bases: [bob_v1],          // Inherits from v1
  traits: { appearance: 'clean_shaven' }
})
// bob_v2.subject.sid = 123 (same as v1)
// bob_v2.subject === bob_v1.subject (same Subject instance)
```

### @acquaintance

**Purpose:** Level of familiarity enabling recognition

**Important:** This trait belongs on **knowledge beliefs**, not observations. Observations are raw perceptual data; acquaintance is accumulated familiarity stored in the mind's knowledge about an entity.

**Semantics:** Indicates how well the mind knows this entity, affecting recognition ability.

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
const best_friend_knowledge = state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': world_alice.subject,
    '@acquaintance': 'intimate',
    personality: 'cheerful'
  }
})

// Context-limited acquaintance
const blacksmith_knowledge = state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': world_bob.subject,
    '@acquaintance': 'slight',  // Only seen at forge
    role: 'blacksmith'
  }
})

// Knowledge without acquaintance (heard of, never met)
const king_knowledge = state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': world_king.subject,
    '@acquaintance': null,  // Would not recognize if seen
    role: 'ruler',
    reputation: 'just'
  }
})
```

### @source

**Purpose:** Tracks how this belief originated (provenance)

**Status:** Not yet implemented. Planned for testimony chains and knowledge provenance.

**Semantics:** Points to the event (observation, testimony, inference) that created or updated this belief. Enables answering "how do you know that?"

**Examples:**
```javascript
// Knowledge from direct observation
const hammer_knowledge = state.add_belief_from_template({
  bases: ['PortableObject'],
  traits: {
    '@about': world_hammer.subject,
    '@source': observation_event.subject,  // Links to EventPerception
    color: 'black'
  }
})

// Knowledge from testimony
const rumor_knowledge = state.add_belief_from_template({
  bases: ['Location'],
  traits: {
    '@about': world_treasure.subject,
    '@source': testimony_event.subject,  // Links to communication event
    location_description: 'old mine'
  }
})

// Pre-existing knowledge (no tracked source)
const home_knowledge = state.add_belief_from_template({
  bases: ['Location'],
  traits: {
    '@about': world_player_house.subject,
    '@source': null  // Always known
  }
})
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
const hammer = state.add_belief_from_template({
  bases: ['PortableObject'],
  traits: {
    spatial_prominence: 'exposed',
    location: workshop.subject,
    color: 'black'
  }
})

// Hidden object
const secret_key = state.add_belief_from_template({
  bases: ['PortableObject'],
  traits: {
    spatial_prominence: 'hidden',
    location: workshop.subject,
    hiding_place: 'under_floorboard'
  }
})

// Attention-grabbing object
const burning_forge = state.add_belief_from_template({
  bases: ['Location'],  // Or a Fixture archetype
  traits: {
    spatial_prominence: 'prominent',
    location: workshop.subject,
    light_level: 'bright',
    heat_level: 'intense',
    sound_level: 'loud'
  }
})
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

Observations use a two-tier architecture separating perception from knowledge:

**Tier 1: Perceived beliefs** - Raw perceptual data about what was observed
**Tier 2: EventPerception** - The event that holds references to perceived beliefs

**Archetype definitions (from world.mjs):**
```javascript
EventAwareness: {
  bases: ['Thing'],
  traits: { content: null }  // Array of Thing references
}

EventPerception: {
  bases: ['EventAwareness']
}

// content traittype
content: {
  type: 'Thing',
  container: Array
}
```

**Creating a perception event:**
```javascript
// 1. Create perceived beliefs (what was actually seen)
const perceived_hammer = observer_state.add_belief_from_template({
  bases: ['PortableObject'],
  traits: {
    '@about': null,  // Identity not yet determined
    color: 'black',
    location: perceived_workshop.subject
  }
})

const perceived_workshop = observer_state.add_belief_from_template({
  bases: ['Location'],
  traits: {
    '@about': world_workshop.subject,  // Recognized location
    location_type: 'indoor'
  }
})

// 2. Create perception event holding references to perceived beliefs
const perception_event = observer_state.add_belief_from_template({
  bases: ['EventPerception'],
  traits: {
    '@about': world_perception_event?.subject,  // Optional world event link
    content: [perceived_hammer.subject, perceived_workshop.subject]
  }
})
```

**Three-tier knowledge architecture:**

| Tier | Contains | Purpose |
|------|----------|---------|
| World events | Ground truth | What actually happened |
| Perception events | EventPerception + perceived beliefs | What observer saw (evidence) |
| Knowledge beliefs | Accumulated understanding | What observer knows/believes |

**Separation of perception from knowledge:**
- Perceived beliefs are raw observation data (no `@acquaintance`)
- Knowledge beliefs may use perceived beliefs as bases
- Knowledge accumulates `@acquaintance` over multiple observations

## Recognition Process

Recognition determines whether a perceived entity matches existing knowledge.

### Recognition Check

When processing a perceived belief:

1. **Match traits** - Compare perceived traits against existing knowledge beliefs
2. **Check acquaintance** - Does existing knowledge have sufficient `@acquaintance`?
3. **Evaluate context** - Is this a context where recognition would occur?
4. **Set identity** - If recognized, set `@about` on perceived belief

### Decision Flow

```
FOR each perceived_belief in perception_event.content:
  candidates = find_knowledge_matching_traits(perceived_belief)

  IF single candidate with sufficient @acquaintance
    → Set perceived_belief.@about = candidate.@about
    → Optionally update knowledge with new observations

  ELSE IF multiple candidates
    → Leave perceived_belief.@about = null (ambiguous)
    → May create new knowledge belief with unknown identity

  ELSE (no match)
    → Create new knowledge belief
    → Set @acquaintance = 'slight' (first encounter)
```

### Recognition Examples

**Case 1: Familiar entity in normal context**
```javascript
// Player's existing knowledge about Bob
const bob_knowledge = state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': world_bob.subject,
    '@acquaintance': 'familiar',
    appearance: 'tall, bearded'
  }
})

// Perceives someone matching Bob's traits at market
// Recognition succeeds: @acquaintance = 'familiar' allows recognition
// Result: perceived_belief.@about = world_bob.subject
```

**Case 2: Slight acquaintance, wrong context**
```javascript
// Player only knows blacksmith at forge
const blacksmith_knowledge = state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': world_bob.subject,
    '@acquaintance': 'slight',  // Context-dependent
    typical_location: forge.subject
  }
})

// Perceives clean-shaven man at market (actually Bob without apron)
// Recognition fails: 'slight' acquaintance + unfamiliar context
// Result: perceived_belief.@about = null (doesn't recognize Bob)
```

**Case 3: No acquaintance (hearsay only)**
```javascript
// Player heard of king but never met
const king_hearsay = state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': world_king.subject,
    '@acquaintance': null,  // Would not recognize if seen
    role: 'ruler'
  }
})

// Perceives well-dressed person at castle
// No recognition possible: @acquaintance = null
// Result: Creates separate belief for "well-dressed person"
// Player doesn't connect this to what they heard about the king
```

## Direct Knowledge Creation

For cases where observation mechanics aren't needed (initialization, testimony, game start), use `learn_about()`:

```javascript
// Create knowledge about world entity without full perception flow
const hammer_knowledge = npc_state.learn_about(world_hammer, {
  traits: ['color', 'location']  // Which traits to copy
})

// Or manually for more control:
const workshop_knowledge = state.add_belief_from_template({
  bases: ['Location'],
  traits: {
    '@about': world_workshop.subject,
    '@acquaintance': 'familiar',  // Pre-existing familiarity
    location_type: 'indoor'
  }
})
```

## Misidentification and Correction

### Misidentification State

Misidentification occurs when `@about` points to wrong entity:

```javascript
// Player mistakes stranger for Tom (actually Bob in disguise)
const mistaken_belief = state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': world_tom.subject,  // Wrong! Actually saw Bob
    '@acquaintance': 'familiar',  // Thinks they recognized Tom
    appearance: 'tall, bearded'   // Bob's traits
  }
})
```

### Detection

Misidentification is detected when:
- Direct contradiction (sees both "Tom" and actual Tom simultaneously)
- Testimony contradicts belief ("Tom was elsewhere")
- Story template identifies inconsistency

### Correction Process

1. **Create corrected belief** about actual entity
2. **Re-attribute observations** to correct belief
3. **Mark old belief as superseded** via versioning

```javascript
// Realize it was actually Bob - create corrected knowledge
const corrected_belief = Belief.from_template(state, {
  sid: mistaken_belief.subject.sid,  // Same subject (version update)
  bases: [mistaken_belief],
  traits: {
    '@about': world_bob.subject,  // Corrected identification
    '@acquaintance': 'slight'     // Now acquainted with Bob
  }
})
// Previous mistaken_belief is superseded by this version
```

## Implementation Considerations

### When @about is Set

Since `@about` is the mind's identification (epistemic, not system truth):

**Set @about when:**
- Recognition succeeds (traits match + sufficient acquaintance)
- Direct identification (someone tells you who it is)
- Obvious identity (only one entity matches)

**Leave @about null when:**
- First encounter with stranger
- Ambiguous observation (multiple candidates)
- Disguise prevents recognition
- Insufficient acquaintance level for context

### Story Generation

**Templates can query for:**
- Beliefs with `@about: null` (unidentified entities - mystery hooks)
- Multiple minds with different `@about` for same observation (conflicting identifications)
- Beliefs with `@acquaintance` but no recent observations (reunion opportunities)
- Wrong `@about` across time (misidentification to correct later)

### Scalability

**Knowledge versioning pattern:**
```javascript
// Initial knowledge (first observation)
const bob_v1 = state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': world_bob.subject,
    '@acquaintance': 'slight',
    appearance: 'tall, bearded',
    role: 'blacksmith'
  },
  label: 'bob'
})

// Updated knowledge (later observation with new detail)
const bob_v2 = Belief.from_template(later_state, {
  sid: bob_v1.subject.sid,
  bases: [bob_v1],
  traits: {
    '@acquaintance': 'familiar',  // Upgraded familiarity
    appearance_detail: 'bandaged hand'  // New observation
  }
})
```

**For queries:**
- `state.get_belief_by_subject(subject)` returns latest version
- Trait inheritance provides accumulated knowledge

### Context Modeling

**Implicit through acquaintance level:**
- `'slight'` acquaintance = context-dependent recognition
- Trait matching determines if context matches
- No need for explicit context branches in most cases

## Integration with Existing System

### Archetype Observability

Perceived beliefs inherit archetypes based on observable traits:

```javascript
// Archetype definitions with exposure
ObjectPhysical: {
  bases: ['Thing'],
  traits: {
    location: null,  // exposure: 'spatial'
    color: null      // exposure: 'visual'
  }
}

Mental: {
  traits: {
    mind: null  // exposure: 'internal'
  }
}
```

When perceiving a Person (bases: ['Actor', 'Mental']):
- Include Actor/ObjectPhysical archetypes (have observable traits)
- Exclude Mental archetype (no observable traits)
- Mental aspects can be inferred later through behavior

### State Management

Perception creates EventPerception with references to perceived beliefs:

```javascript
// 1. Create perceived beliefs
const perceived = observer_state.add_belief_from_template({
  bases: ['Person'],  // Only observable archetypes
  traits: {
    '@about': null,  // Identity determined by recognition
    appearance: 'tall, bearded'
  }
})

// 2. Create perception event
const event = observer_state.add_belief_from_template({
  bases: ['EventPerception'],
  traits: {
    content: [perceived.subject]
  }
})

// 3. Recognition sets @about if successful
// 4. Knowledge beliefs may be created/updated separately
```

## Example Scenarios

### Scenario 1: First Meeting

```javascript
// World state: Bob at workshop
const world_bob = world_state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    spatial_prominence: 'exposed',
    appearance: 'tall, bearded',
    location: workshop.subject
  },
  label: 'bob'
})

// Player perceives Bob (first time seeing him)
const perceived_person = player_state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': null,  // Don't know who this is yet
    appearance: 'tall, bearded',
    location: perceived_workshop.subject
  }
})

const perception_event = player_state.add_belief_from_template({
  bases: ['EventPerception'],
  traits: { content: [perceived_person.subject] }
})

// Recognition: No existing knowledge matches
// Create knowledge belief for this new person
const bob_knowledge = player_state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': world_bob.subject,  // Identity established
    '@acquaintance': 'slight',    // First meeting
    appearance: 'tall, bearded'
  },
  label: 'bob'
})
```

### Scenario 2: Recognition After Time

```javascript
// Existing knowledge about Bob
const bob_knowledge = player_state.get_belief_by_label('bob')
// bob_knowledge has @acquaintance: 'familiar', appearance: 'bearded'

// Observe Bob again (now clean-shaven)
const perceived = player_state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': null,
    appearance: 'clean_shaven'
  }
})

// Recognition succeeds: @acquaintance = 'familiar' allows recognition
// despite appearance change

// Update knowledge with new observation
const bob_v2 = Belief.from_template(player_state, {
  sid: bob_knowledge.subject.sid,
  bases: [bob_knowledge],
  traits: {
    appearance: 'clean_shaven'  // Updated trait
  }
})
// perceived.@about can now be set to world_bob.subject
```

### Scenario 3: Disguise

```javascript
// Bob in disguise at market
// world_bob.appearance is now 'hooded, concealed_face'

// Player observes hooded figure
const perceived_stranger = player_state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': null,  // Can't identify
    appearance: 'hooded, mysterious'
  }
})

// Recognition fails: traits don't match known Bob
// @acquaintance = 'familiar' isn't enough when face is concealed

// Player creates new knowledge (doesn't connect to Bob)
const stranger_knowledge = player_state.add_belief_from_template({
  bases: ['Person'],
  traits: {
    '@about': null,  // Identity unknown
    '@acquaintance': null,
    appearance: 'hooded, mysterious'
  }
})

// Player now has two separate beliefs:
// 1. bob_knowledge (@about: world_bob, @acquaintance: 'familiar')
// 2. stranger_knowledge (@about: null) - actually Bob but unknown
```

### Scenario 4: Testimony Without Acquaintance

```javascript
// NPC tells player about the missing hammer
// (Testimony creates knowledge without direct observation)

const hammer_hearsay = player_state.add_belief_from_template({
  bases: ['PortableObject'],
  traits: {
    '@about': world_hammer.subject,  // NPC identified it
    '@acquaintance': null,           // Never seen it
    reported_location: workshop.subject,
    status: 'missing'
  }
})

// Later: Player observes a hammer at forge
const perceived_hammer = player_state.add_belief_from_template({
  bases: ['PortableObject'],
  traits: {
    '@about': null,  // Can't identify
    color: 'black',
    location: forge.subject
  }
})

// No recognition: @acquaintance = null for hammer_hearsay
// Player doesn't connect observed hammer to the "missing" one
// Creates separate knowledge belief
```

## Design Decisions Summary

1. **@about is epistemic** - Represents the mind's identification (can be wrong or null), not system ground truth
2. **@acquaintance belongs on knowledge** - Not on perceived beliefs; accumulated familiarity enables recognition
3. **Subject is a property** - `belief.subject.sid` provides stable identity, not a meta-trait
4. **EventPerception uses content array** - Holds Subject references to perceived beliefs
5. **Trait exposure defines observability** - `exposure` on traittype controls what can be perceived
6. **Recognition matches traits then checks acquaintance** - Trait matching first, acquaintance determines if recognition succeeds
7. **Perception and knowledge are separate** - Perceived beliefs are raw data; knowledge accumulates over time
8. **Misidentification is normal** - Wrong `@about` gets corrected through story progression

## Compositional Observations (Stage 2)

### Overview

Objects have compositional structure - a hammer has a head and handle, each with their own traits. Perceived beliefs capture this hierarchical structure through belief references, enabling proper matching.

### Observation Structure

Perceived beliefs use the same compositional pattern as world beliefs - compositional traits reference other beliefs:

```javascript
// Perceiving a hammer with compositional structure
const perceived_head = observer_state.add_belief_from_template({
  bases: ['HammerHead'],
  traits: {
    color: 'black',
    material: 'iron'
  }
})

const perceived_handle = observer_state.add_belief_from_template({
  bases: ['HammerHandle'],
  traits: {
    length: 'short'
    // Didn't observe handle color - not in traits
  }
})

const perceived_hammer = observer_state.add_belief_from_template({
  bases: ['Hammer'],
  traits: {
    '@about': null,  // Identity to be determined
    head: perceived_head.subject,
    handle: perceived_handle.subject,
    location: perceived_workshop.subject
  }
})

// EventPerception holds the top-level perceived belief
const perception = observer_state.add_belief_from_template({
  bases: ['EventPerception'],
  traits: {
    content: [perceived_hammer.subject]
  }
})
```

### Two-Phase Process

**Phase 1: Perception**
- Create perceived beliefs for each observed entity
- Compositional traits reference other perceived beliefs
- Only actually perceived traits are included
- `@about` is initially null

**Phase 2: Recognition**
- Compare perceived beliefs against existing knowledge
- Traverse compositional structure for matching
- Rank candidates by match quality
- Single match → set `@about` on perceived belief
- Multiple matches → leave `@about` null (ambiguous)
- No match → create new knowledge belief

### Matching Algorithm

```javascript
// Pseudo-code for compositional matching
function match_score(perceived, knowledge, state) {
  let score = 0
  let total = 0

  for (const traittype of get_traittypes(perceived)) {
    const perceived_value = perceived.get_trait(state, traittype)
    const knowledge_value = knowledge.get_trait(state, traittype)
    if (perceived_value === undefined) continue

    total++

    if (perceived_value instanceof Subject) {
      // Compositional trait - recurse into referenced beliefs
      const perceived_ref = state.get_belief_by_subject(perceived_value)
      const knowledge_ref = state.get_belief_by_subject(knowledge_value)
      if (perceived_ref && knowledge_ref) {
        score += match_score(perceived_ref, knowledge_ref, state)
      }
    } else {
      // Leaf trait - direct comparison
      if (perceived_value === knowledge_value) {
        score++
      }
    }
  }

  return total > 0 ? score / total : 0  // 0.0 to 1.0
}
```

### Example: Two Similar Hammers

```javascript
// World state: two hammers
const hammer1 = world_state.add_belief_from_template({
  bases: ['Hammer'],
  traits: {
    head: hammer1_head.subject,    // color: 'black', material: 'iron'
    handle: hammer1_handle.subject // length: 'short', color: 'brown'
  }
})

const hammer2 = world_state.add_belief_from_template({
  bases: ['Hammer'],
  traits: {
    head: hammer2_head.subject,    // color: 'black', material: 'iron'
    handle: hammer2_handle.subject // length: 'long', color: 'dark_brown'
  }
})

// Partial observation: "saw a hammer with a black head"
const perceived_head = observer_state.add_belief_from_template({
  bases: ['HammerHead'],
  traits: { color: 'black' }
})
const perceived_hammer = observer_state.add_belief_from_template({
  bases: ['Hammer'],
  traits: { '@about': null, head: perceived_head.subject }
})
// Result: Both hammers match → ambiguous, @about stays null

// Specific observation: "saw a hammer with a short handle"
const perceived_handle = observer_state.add_belief_from_template({
  bases: ['HammerHandle'],
  traits: { length: 'short' }
})
const perceived_hammer2 = observer_state.add_belief_from_template({
  bases: ['Hammer'],
  traits: { '@about': null, handle: perceived_handle.subject }
})
// Result: Only hammer1 matches → @about = hammer1.subject
```

### Partial Observation

Not all traits are observed. Perceived beliefs only contain actually perceived traits:

```javascript
// Full observation (examined closely)
const full_head = state.add_belief_from_template({
  bases: ['HammerHead'],
  traits: { material: 'iron', color: 'black' }
})
const full_handle = state.add_belief_from_template({
  bases: ['HammerHandle'],
  traits: { material: 'wood', color: 'brown', length: 'short' }
})
const perceived_full = state.add_belief_from_template({
  bases: ['Hammer'],
  traits: {
    '@about': null,
    head: full_head.subject,
    handle: full_handle.subject
  }
})

// Partial observation (glanced from distance)
const partial_handle = state.add_belief_from_template({
  bases: ['HammerHandle'],
  traits: { length: 'short' }  // Only noticed handle length
})
const perceived_partial = state.add_belief_from_template({
  bases: ['Hammer'],
  traits: {
    '@about': null,
    handle: partial_handle.subject
    // No head trait - didn't see it clearly
  }
})

// Very partial (just saw something)
const perceived_minimal = state.add_belief_from_template({
  bases: ['PortableObject'],  // Couldn't even tell it was a hammer
  traits: { '@about': null }
})
```

### Recognition Flow

The recognition flow with perceived beliefs:

1. **Create perceived beliefs** for observed entities
2. **Match against knowledge** to find candidates
3. **If single match**: Set `@about` on perceived belief, optionally update knowledge
4. **If multiple matches**: Leave `@about` null (ambiguous)
5. **If no match**: Create new knowledge belief

```javascript
function process_perception(perception_event, observer_state) {
  for (const perceived_subject of perception_event.get_trait(state, content_tt)) {
    const perceived = observer_state.get_belief_by_subject(perceived_subject)
    const candidates = find_matching_knowledge(perceived, observer_state)

    if (candidates.length === 1 && has_sufficient_acquaintance(candidates[0])) {
      // Recognition succeeds - update perceived belief's @about
      // In practice, create new version with @about set
      const recognized = Belief.from_template(observer_state, {
        sid: perceived.subject.sid,
        bases: [perceived],
        traits: { '@about': candidates[0].get_trait(state, about_tt) }
      })
    } else if (candidates.length > 1) {
      // Ambiguous - @about stays null
      // Could store candidates for later disambiguation
    } else {
      // New entity - create knowledge belief
      const new_knowledge = observer_state.add_belief_from_template({
        bases: perceived.archetypes,
        traits: {
          '@about': null,  // Or world entity if determinable
          '@acquaintance': 'slight'
        }
      })
    }
  }
}
```

### Difference Detection

For debugging and story generation, detect what differs between beliefs:

```javascript
function get_differences(belief_a, belief_b, state) {
  const diffs = {}

  for (const traittype of get_all_traittypes(belief_a, belief_b)) {
    const val_a = belief_a.get_trait(state, traittype)
    const val_b = belief_b.get_trait(state, traittype)

    if (val_a instanceof Subject && val_b instanceof Subject) {
      // Compositional - recurse
      const ref_a = state.get_belief_by_subject(val_a)
      const ref_b = state.get_belief_by_subject(val_b)
      const sub_diffs = get_differences(ref_a, ref_b, state)
      if (Object.keys(sub_diffs).length > 0) {
        diffs[traittype.label] = sub_diffs
      }
    } else if (val_a !== val_b) {
      diffs[traittype.label] = [val_a, val_b]
    }
  }

  return diffs
}

// Example:
get_differences(hammer1, hammer2, state)
// → { handle: { color: ['brown', 'dark_brown'], length: ['short', 'long'] } }
```

## Future Extensions

- **Probability distributions** on @about (60% Bob, 30% Tom, 10% stranger)
- **Familiarity decay** over time without observations
- **Context-specific recognition thresholds**
- **Trait weighting** for recognition (face more important than clothing)
- **Attention/saliency** affecting what traits are observed
- **False memories** updating beliefs incorrectly
- **Collective knowledge** shared across groups (village knows each other)
