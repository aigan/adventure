# Phase 7: Observation System

## Dependencies

- **Requires:** None (independent)
- **Blocked by:** None
- **Can parallelize with:** Phases 4-6

## Goal

Complete perceive/identify/learn_from implementation for NPC observation and recognition.

## Design

**Reference:** `docs/plans/observation-events.md` (existing detailed plan)

**Observation flow:**
1. **perceive()** - Raw sensory input, creates perception event
2. **identify()** - Match perception against known entities
3. **learn_from()** - Extract traits from observation, update beliefs

**Key concepts:**
- EventPerception archetype (already exists in world.mjs)
- @about meta-trait for linking perceptions to subjects
- @acquaintance meta-trait for tracking known entities
- @source meta-trait for testimony chains
- Compositional matching for recognition

## Components

| Component | Status | Notes |
|-----------|--------|-------|
| EventPerception archetype | ✅ Exists | In world.mjs |
| @about meta-trait | ✅ Exists | In registry |
| @acquaintance meta-trait | TODO | Add to registry |
| @source meta-trait | TODO | Add to registry |
| state.perceive() | TODO | New method |
| state.identify() | TODO | New method |
| state.learn_from() | TODO | Build on learn_about() |
| Compositional matching | TODO | Recursive trait comparison |

## Files to Modify

- `public/worker/state.mjs` - perceive(), identify(), learn_from() methods
- `public/worker/db.mjs` - @acquaintance, @source meta-traits in registry

## Tests

| Test | File | Status | Description |
|------|------|--------|-------------|
| OBS-1 | observation.test.mjs | TODO | perceive() creates perception event |
| OBS-2 | observation.test.mjs | TODO | identify() matches known entity |
| OBS-3 | observation.test.mjs | TODO | identify() fails for unknown entity |
| OBS-4 | observation.test.mjs | TODO | learn_from() extracts traits |
| Mind composition | observation.test.mjs:1889 | ⚠️ Partial | Needs talking system |

## Verification

- [ ] @acquaintance, @source traits registered
- [ ] perceive/identify/learn_from methods implemented
- [ ] OBS tests written and passing
- [ ] `npm test` passes
- [ ] NPC can observe, recognize, and learn from events

## recall() Function

The recall() function is part of this phase - it returns traits about a subject regardless of where they live in the container hierarchy.

### Design

**Signature:**
```javascript
recall(subject, vt, scope?) → Trait iterator
```

**Flattens container hierarchy:**
```javascript
recall(hammer_subject, vt=5) →
[
  Trait{type: 'color', subject: handle_subject, value: 'red', certainty: 'common', source: handle_belief_red},
  Trait{type: 'color', subject: handle_subject, value: 'blue', certainty: 'unusual', source: handle_belief_blue},
  Trait{type: 'material', subject: head_subject, value: 'iron', certainty: 'certain', source: head_belief},
  Trait{type: 'weight', subject: hammer_subject, value: 'heavy', certainty: 'certain', source: hammer_belief},
]
```

### Scoped Queries

For interview-style queries, recall takes scope:

```javascript
recall(suspect_subject, vt, scope: 'appearance') →
[
  Trait{type: 'hair_color', value: 'dark', certainty: 'certain'},
  Trait{type: 'height', value: 'tall', certainty: 'common'},
]

recall(suspect_subject, vt, scope: 'relationships') →
[
  Trait{type: 'enemy', value: bob_subject, certainty: 'common'},
]

recall(self_subject, vt: yesterday_morning, scope: 'location') →
[
  Trait{type: 'location', value: workshop_subject, certainty: 'certain'},
]
```

Scope comes from archetype (trait categories) or query specification.

### Uncertainty in Results

- **Superposition**: Multiple Trait entries with same type+subject, different values
- **Unknown**: No Trait entry for that type, or explicit unknown value
- **Certain**: Single Trait entry with certainty: certain

Caller filters/groups as needed for presentation.

### Additional Tests

| Test | File | Status | Description |
|------|------|--------|-------------|
| RECALL-1 | observation.test.mjs | TODO | recall() returns traits for subject |
| RECALL-2 | observation.test.mjs | TODO | recall() flattens container hierarchy |
| RECALL-3 | observation.test.mjs | TODO | recall() with scope filters by trait category |
| RECALL-4 | observation.test.mjs | TODO | recall() returns superposition for uncertain traits |

## Notes

- This phase is **independent** and can be worked on in parallel with resolution phases
- See `docs/plans/observation-events.md` for detailed design
- Mind trait composition test (line 1889) requires talking system - may be deferred
- Build on existing learn_about() functionality
- recall() is the primary query interface for "what do I know about X?"
