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
- [ ] @about examples (lines 40-58)
- [ ] @subject examples (lines 71-87)
- [ ] @acquaintance examples (lines 110-137)
- [ ] @source examples (lines 145-166)
- [ ] Entity Spatial Prominence examples (lines 234-257)
- [ ] Creating Observation section (lines 301-332)
- [ ] Recognition Examples (lines 361-403)
- [ ] Direct Knowledge Creation (lines 409-425)
- [ ] Misidentification examples (lines 429-468)
- [ ] Scalability examples (lines 496-547)
- [ ] Integration examples (lines 553-575)
- [ ] Example Scenarios 1-4 (lines 607-716)
- [ ] Compositional Observations section (lines 729-934) - newly added, needs review

## Design Decisions Needed

### 1. Event_perception archetype

**Questions:**
- What bases? `['Thing']` or new `['Event']` base?
- Should events have `@form: 'intangible'`?

**Proposed:**
```javascript
// Archetype definition
Event: {
  bases: ['Thing'],
  traits: { '@form': 'intangible', time: null }
}

Event_perception: {
  bases: ['Event'],
  traits: {
    observer: null,        // Mind that observed
    observed_traits: null, // Hierarchical observed data
    target: null           // Resolved subject (set by recognize)
  }
}
```

### 2. observer trait

**Questions:**
- Type: `Mind` reference or `Person` reference?
- The mind creates the observation, but we might want to track which person did the observing

**Options:**
A. `observer: Mind` - The mind that holds this observation
B. `observer: Person` - The entity that observed (actor)
C. Both: `observer_mind: Mind`, `observer_actor: Person`

**Recommendation:** Option A - `observer` is the Mind. The observation exists in that mind's state, so the actor is implicit (the mind's host entity).

### 3. observed_traits traittype

**Questions:**
- Type: `object` (arbitrary JS object) or structured belief reference?
- How to store hierarchical data?

**Options:**
A. `type: 'object'` - Store as plain JS object, no validation
B. `type: 'Observation_data'` - New archetype for structured observation data
C. Store as nested beliefs (observation has parts like hammer has parts)

**Recommendation:** Option A for now - plain object is simplest. Can add structure later.

```javascript
observed_traits: {
  type: 'object',
  exposure: 'internal'
}
```

### 4. target trait

**Questions:**
- Type: Subject reference or Belief reference?
- Can be null (unresolved) or array (multiple candidates)?

**Proposed:**
```javascript
target: {
  type: 'Subject',      // Points to resolved entity's subject
  exposure: 'internal'
}

// Or for ambiguous case:
candidates: {
  type: 'Subject',
  container: Array,     // Multiple possible matches
  exposure: 'internal'
}
```

### 5. time trait

**Questions:**
- Type: number (tick) or structured time?
- Alpha 1 Stage 6 adds time points - keep simple for now?

**Proposed:**
```javascript
time: {
  type: 'number',       // Simple tick counter for now
  exposure: 'internal'
}
```

## Implementation Steps

### Phase 1: Schema Setup

1. **Add traittypes** to test file (self-contained):
   ```javascript
   observer: { type: 'Mind', exposure: 'internal' },
   observed_traits: { type: 'object', exposure: 'internal' },
   target: { type: 'Subject', exposure: 'internal' },
   time: { type: 'number', exposure: 'internal' },
   ```

2. **Add archetypes** to test file:
   ```javascript
   Event: {
     bases: ['Thing'],
     traits: { time: null }
   },
   Event_perception: {
     bases: ['Event'],
     traits: { observer: null, observed_traits: null, target: null }
   },
   ```

### Phase 2: Observation Creation

3. **Add helper function** (in test file or new module):
   ```javascript
   function create_observation(state, observer_mind, observed_traits, time) {
     return state.add_belief_from_template({
       bases: ['Event_perception'],
       traits: {
         observer: observer_mind.subject,
         observed_traits: observed_traits,
         time: time,
         target: null
       }
     })
   }
   ```

4. **Add tests** for observation creation:
   - Create observation with flat traits
   - Create observation with nested/compositional traits
   - Create partial observation (missing some traits)
   - Verify observed_traits stored correctly

### Phase 3: Recognition

5. **Modify `state.recognize()`** to accept observed_traits:
   ```javascript
   // Current signature
   recognize(source_belief)

   // New signature (overload or separate method)
   recognize_by_traits(observed_traits)
   ```

6. **Implement matching algorithm**:
   - Iterate beliefs of matching archetype
   - Score each belief against observed_traits
   - Return ranked candidates

7. **Add tests** for recognition:
   - Single match → returns one candidate
   - Multiple matches → returns all candidates
   - No match → returns empty array
   - Partial observation matches multiple

### Phase 4: Integration

8. **Update `learn_about()`** to use observations:
   - Accept observation event as input
   - Call recognize_by_traits on observed_traits
   - Set observation.target based on result
   - Create/update belief based on match

9. **End-to-end test**:
   - Create two similar hammers
   - Create observation of "hammer with short handle"
   - Call learn_about
   - Verify correct hammer identified

## Test Scenarios

### Scenario 1: Unambiguous observation
```javascript
// Observe "hammer with short handle"
obs = create_observation(player_mind, {
  bases: ['Hammer'],
  handle: { length: 'short' }
}, tick_1)

// Only hammer1 has short handle
candidates = state.recognize_by_traits(obs.observed_traits)
// → [hammer1]
```

### Scenario 2: Ambiguous observation
```javascript
// Observe "hammer with black head"
obs = create_observation(player_mind, {
  bases: ['Hammer'],
  head: { color: 'black' }
}, tick_2)

// Both hammers have black heads
candidates = state.recognize_by_traits(obs.observed_traits)
// → [hammer1, hammer2]
```

### Scenario 3: No match
```javascript
// Observe "hammer with red head"
obs = create_observation(player_mind, {
  bases: ['Hammer'],
  head: { color: 'red' }
}, tick_3)

candidates = state.recognize_by_traits(obs.observed_traits)
// → []
```

## File Changes

| File | Changes |
|------|---------|
| `docs/notes/observation_recognition_spec.md` | Update all examples to correct syntax |
| `test/similarity.test.mjs` | Add observation tests (self-contained) |
| `public/worker/state.mjs` | Add `recognize_by_traits()` method |
| `public/worker/world.mjs` | Eventually add Event archetypes (after tests pass) |

## Open Questions

1. Should `observed_traits` include the archetype/bases, or just trait values?
2. How to handle archetype matching? (saw "a hammer" vs saw "a tool")
3. Should observations be created in the observer's mind state or world state?
4. How to represent "didn't observe this trait" vs "observed trait is null"?

## Success Criteria

- [ ] Can create observation events with hierarchical observed_traits
- [ ] recognize_by_traits returns correct candidates for test scenarios
- [ ] Spec document examples match actual codebase syntax
- [ ] Tests pass in isolation (no dependency on world.mjs)
