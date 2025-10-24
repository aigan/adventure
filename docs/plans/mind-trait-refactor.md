# Mind Trait Refactor

**Goal**: Change person/actor beliefs from `mind_states` array to `mind` reference

**Related**:
- docs/ALPHA-1.md Stage 1 (mental states)
- docs/SPECIFICATION.md (nested minds)
- Recent discussion about state management and ground_state

## Context

Currently, person beliefs have a `mind_states` trait containing an array of all states for that entity's mind. This creates a maintenance problem:
- Every time a nested mind branches, the parent belief must be updated
- The array duplicates what should be a dynamic query
- Locked states make updating the array impractical

**Better approach**:
- Person belief has a stable `mind` trait (the Mind never changes)
- When we need states at a specific world moment, query DB for states where `(in_mind=X, ground_state=Y)`
- The mind can branch independently without parent knowledge
- Fits the model where nested minds have private thoughts/possibilities

## Steps

- [ ] Add DB query helper: `get_states_by_ground(mind, ground_state)` → returns state(s) observing that ground
- [ ] Update `Mental` archetype: change `mind_states` array trait to `mind` Mind trait
- [ ] Update `world.mjs`: change player belief to use `mind` instead of `mind_states`
- [ ] Update tests: replace `mind_states[0]` patterns with `mind` and DB queries as needed
- [ ] Update any serialization/inspection code that references `mind_states`
- [ ] Verify all tests pass

## Current Status

Not started. This blocks proper nested mind management.

## Notes

**Key insight**: `mind_states` was trying to cache what should be a dynamic query. The mind is the stable reference, states are temporal slices queried on demand.

**Migration path**: This is a breaking change to the data model. Existing saved worlds would need migration (not a concern yet in pre-alpha).
