# Plan: Observation Events Implementation

## Context

Stage 2 of Alpha 1 requires compositional object matching. Observation events capture **what was perceived** (hierarchical traits) separately from **what entity it was** (resolved identity).

Reference: `docs/notes/observation_recognition_spec.md`

## Goals

1. Implement observation event creation with hierarchical `observed_traits`
2. Modify `recognize()` to match observed_traits against beliefs
3. Update spec document examples to match actual codebase syntax

## Pre-work: Update Spec Document

The examples in `docs/notes/observation_recognition_spec.md` use outdated syntax.

### Current (wrong):
```javascript
belief_workshop: {
  @about: world.workshop_1,
  archetype: 'Event_perception',
  location_type: 'indoor'
}
```

### Correct syntax:
```javascript
belief_workshop: {
  bases: ['Location'],
  traits: {
    '@about': 'workshop_1',
    location_type: 'indoor'
  }
}
```

### Sections to update:
- [x] @about examples (lines 40-58)
- [x] @subject examples (lines 71-87)
- [x] @acquaintance examples (lines 110-137)
- [x] @source examples (lines 145-166)
- [x] Entity Spatial Prominence examples (lines 234-257)
- [x] Creating Observation section (lines 301-332)
- [x] Recognition Examples (lines 361-403)
- [x] Direct Knowledge Creation (lines 409-425)
- [x] Misidentification examples (lines 429-468)
- [x] Scalability examples (lines 496-547)
- [x] Integration examples (lines 553-575)
- [x] Example Scenarios 1-4 (lines 607-716)
- [x] Compositional Observations section (lines 729-934) - already uses correct syntax

## Cognitive Science Foundation

Based on object recognition research:

**Dual-process recognition:**
- **Familiarity**: Context-free, immediate "I know this" feeling (ventro-lateral frontal regions)
- **Recollection**: Context-dependent, effortful feature-matching and retrieval (full ventral stream hierarchy)

**Method terminology:**
- `recognize(subject)` - Familiarity-based: "Do I have knowledge about this subject?" (existing method)
- `identify(perceived_belief)` - Trait-based identification: "Which entity matches these traits?" (new method)
- `recall_perception(traits)` - Find duplicate perceived beliefs (future optimization)

## Design Decisions Resolved

### 1. Event_perception archetype

**RESOLVED:** Use existing EventAwareness/EventPerception from world.mjs

**Actual structure:**
```javascript
// Already in world.mjs
EventAwareness: {
  bases: ['Thing'],
  traits: {
    content: null  // Array of Subject references to perceived beliefs
  }
}

EventPerception: {
  bases: ['EventAwareness']
}
```

**Pattern:** Perceived things are stored as regular beliefs in the observer's mind state. EventPerception's `content` holds Subject references to those beliefs. This allows the memory/idea of the event to change over time.

### 2. ~~observer trait~~

**RESOLVED:** Not needed.

EventPerception exists in a specific mind's state, so the observer is implicit. Don't add traits until actually needed.

### 3. ~~observed_traits traittype~~

**RESOLVED:** Not needed. Use existing `content` trait from EventAwareness.

Perceived things are stored as regular beliefs in mind state, and EventPerception's `content` holds Subject references to them. No need for a separate observed_traits structure.

### 4. ~~target trait~~

**RESOLVED:** Not needed.

Identity/recognition is tracked per perceived belief using `'@about'`. Each belief in `content` has its own `'@about'` (recognized) or `'@about': null` (unrecognized).

### 5. ~~time trait~~

**RESOLVED:** Not needed.

Time is implicit from the state version. Each mind state represents a specific moment.

## Implementation Steps

### Phase 1: Observation Creation

1. **Verify EventPerception exists** - Already in world.mjs, no schema changes needed

2. **Create helper function** for creating observations:
   ```javascript
   function create_observation(mind_state, perceived_beliefs) {
     // perceived_beliefs is array of belief subjects already in mind_state
     return mind_state.add_belief_from_template({
       bases: ['EventPerception'],
       traits: {
         content: perceived_beliefs.map(b => b.subject)
       }
     })
   }
   ```

3. **Add helper for creating perceived beliefs**:
   ```javascript
   function create_perceived_belief(mind_state, archetype_bases, trait_values, about_subject = null) {
     return mind_state.add_belief_from_template({
       bases: archetype_bases,
       traits: {
         '@about': about_subject,  // null if unrecognized
         ...trait_values
       }
     })
   }
   ```

4. **Add tests** for observation creation:
   - Create perceived beliefs with flat traits
   - Create perceived beliefs with nested/compositional traits
   - Create EventPerception holding multiple perceived beliefs
   - Verify `'@about'` properly tracks recognized vs unrecognized

### `state.perceive(content, modalities = ['visual', 'spatial'])`

```javascript
// Categorization: capture what was observed
perceive(content, modalities = ['visual', 'spatial']) {
  const perceived_items = []

  for (const world_entity of content) {
    // Fast path: Check familiarity
    const knowledge = this.recognize(world_entity)
    if (knowledge.length > 0) {
      // Familiar - just reference
      perceived_items.push(world_entity.subject)
      continue
    }

    // Slow path: Create perceived belief
    const observed_traits = this.get_observable_traits(world_entity, modalities)
    const archetype_bases = world_entity.get_archetypes().map(a => a.label)

    const perceived = this.add_belief_from_template({
      bases: archetype_bases,
      traits: { '@about': null, ...observed_traits }
    })

    perceived_items.push(perceived.subject)
  }

  return this.add_belief_from_template({
    bases: ['EventPerception'],
    traits: { content: perceived_items }
  })
}
```

### `state.identify(perceived_belief)`

```javascript
// Identification: match traits to known entities
identify(perceived_belief) {
  const archetypes = perceived_belief.get_archetypes()
  const candidates = []

  for (const archetype of archetypes) {
    const beliefs = this.get_beliefs_by_archetype(archetype)
    for (const belief of beliefs) {
      const about = belief.get_trait(this, Traittype.get_by_label('@about'))
      if (!about) continue

      const score = this.match_traits(perceived_belief, belief)
      if (score > 0) {
        candidates.push({ subject: about, score })
      }
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .map(c => c.subject)
}
```

### `state.learn_from(perception)`

```javascript
// Form knowledge from perception
learn_from(perception) {
  const content = perception.get_trait(this, Traittype.get_by_label('content'))

  for (const item_subject of content) {
    const item = this.get_belief_by_subject(item_subject)
    const about_tt = Traittype.get_by_label('@about')
    const about = item.get_trait(this, about_tt)

    if (about !== undefined) {
      // Perceived belief
      if (about === null) {
        // Unidentified - run identification
        const candidates = this.identify(item)

        if (candidates.length === 1) {
          // Unambiguous
          const world_entity = this.ground_state.get_belief_by_subject(candidates[0])
          this.learn_about(world_entity)
        } else {
          // Ambiguous or no match - handle later
          // For now: create new knowledge
          this.learn_about(item)
        }
      } else {
        // Already identified
        const world_entity = this.ground_state.get_belief_by_subject(about)
        this.learn_about(world_entity)
      }
    } else {
      // Just a subject reference - familiar
      const world_entity = this.ground_state.get_belief_by_subject(item_subject)
      this.learn_about(world_entity)
    }
  }
}
```

### Tests

1. **perceive() creates perceived beliefs for unfamiliar entities**
2. **perceive() stores subject refs for familiar entities**
3. **identify() matches traits to knowledge beliefs**
4. **learn_from() integrates perception into knowledge**
5. **End-to-end**: look → perceive → learn_from → knowledge updated

## Test Scenarios

### Scenario 1: Unambiguous observation
```javascript
// Create perceived belief for "hammer with short handle"
perceived = create_perceived_belief(player_mind_state, ['Hammer'], {
  handle: { length: 'short' }
})

// Only hammer1 has short handle
candidates = player_mind_state.recognize_by_traits(perceived)
// → [hammer1.subject]

// Set @about on perceived belief
perceived_updated = player_mind_state.update_belief(perceived, {
  '@about': candidates[0]
})
```

### Scenario 2: Ambiguous observation
```javascript
// Perceive "hammer with black head"
perceived = create_perceived_belief(player_mind_state, ['Hammer'], {
  head: { color: 'black' }
})

// Both hammers have black heads
candidates = player_mind_state.recognize_by_traits(perceived)
// → [hammer1.subject, hammer2.subject]

// Leave @about as null (ambiguous)
```

### Scenario 3: No match
```javascript
// Perceive "hammer with red head"
perceived = create_perceived_belief(player_mind_state, ['Hammer'], {
  head: { color: 'red' }
})

candidates = player_mind_state.recognize_by_traits(perceived)
// → []

// @about stays null (unrecognized)
```

## File Changes

| File | Changes |
|------|---------|
| `docs/notes/observation_recognition_spec.md` | ✅ Already updated to correct syntax |
| `test/observation.test.mjs` | ✅ Helper functions exist, add perceive/identify/learn_from tests |
| `public/worker/state.mjs` | Add `perceive()`, `identify()`, `learn_from()` methods |
| `public/worker/narrator.mjs` | Update `do_look_in_location()` to use perceive/learn_from |
| `public/worker/world.mjs` | ✅ EventPerception already exists, no changes needed |

## Open Questions

1. ~~Should `observed_traits` include the archetype/bases, or just trait values?~~
   **RESOLVED:** Yes, include bases when the observer recognized the category.

2. ~~Should observations be created in the observer's mind state or world state?~~
   **RESOLVED:** Observer's mind state.

3. **Familiarity threshold**: What determines "familiar enough" to skip creating perceived belief?
   - **Initial**: `recognize()` returns non-empty array = familiar
   - **Future**: Consider acquaintance level, time since last seen

4. **Trait matching in identify()**: How to score similarity?
   - **Initial**: Exact match on all perceived traits = score 1.0
   - **Future**: Partial match, hierarchical matching for nested traits

5. **Archetype inheritance matching**: Should identify() match parent archetypes?
   - Example: Perceived bases: ['Hammer'], match knowledge with bases: ['Tool']?
   - **Initial**: Match exact archetype only
   - **Future**: Consider archetype hierarchy

## Success Criteria

- [x] Spec document examples match actual codebase syntax
- [x] Can create perceived beliefs with compositional/nested traits
- [x] Can create EventPerception with content referencing perceived beliefs
- [x] Tests demonstrate `'@about'` tracking recognized vs unrecognized entities
- [ ] recognize_by_traits returns correct candidates for test scenarios:
  - Unambiguous (1 match)
  - Ambiguous (multiple matches)
  - No match (empty array)
- [ ] Compositional trait matching works (nested objects like `handle: { length: 'short' }`)
