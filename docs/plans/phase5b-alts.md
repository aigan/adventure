# Phase 5b: Alternative Timelines (alts)

## Dependencies

- **Requires:** Phase 5a (@tracks)
- **Blocked by:** Phase 5a
- **Can parallelize with:** None (depends on 5a)

## Goal

Implement alternative timeline tracking - forward references from core to alternatives, @uncertainty flag for superposition, and jumping between timelines.

## Design

### Bidirectional Relationship

| Property | Direction | Cardinality | Purpose |
|----------|-----------|-------------|---------|
| `@tracks` | back | singular | Content fallback - "what timeline am I tracking?" |
| `alts` | forward | plural | Possibilities - "what alternatives branch from me?" |

**Core is relative**: Whatever timeline you're on is "core". Alts are alternatives from your perspective. Jumping to an alt makes it the new core.

### State Structure with alts

```javascript
core_state:
  alts: [alt_A, alt_B, alt_C]
  @uncertainty: true  // if alternatives are live possibilities

alt_A:
  @tracks: core_state  // content overlay
  base: previous_alt_A_state
```

### @uncertainty Flag

When `@uncertainty: true` is set on a state with alts, queries return superposition instead of single values:

```javascript
{
  type: 'superposition',
  branches: [
    {belief: belief_A, value: 'red', certainty: 0.6},
    {belief: belief_B, value: 'blue', certainty: 0.4}
  ]
}
```

### Jumping to an Alt

Jumping inverts the @tracks/alts relationship:

```
Before:
  Session.state = core_state
  core_state.alts = [alt_A, alt_B]
  alt_A.@tracks = core_state

After jump to alt_A:
  new_state = State {
    base: alt_A,
    alts: [old_core_as_alt],  // old reality as possibility
  }
  old_core_as_alt.@tracks = new_state  // inverts
  Session.state = new_state
```

Future observations happen in new_state. Old core demoted to alt.

### Adding Past Possibilities

To add a possibility branching in the past (e.g., "hammer was dropped at vt=2" added at tt=10):

**Problem**: Can't modify locked states. Adding alt to past state would change it.

**Solution**: Switch core timeline. Old core becomes an alt:

```
Before:
  core: obs_1 → obs_2 → obs_3 → obs_4
  core.alts: [alt_A, alt_B]

Want to add possibility C branching at vt=2.

After:
  new_core: (shared observations only)
  new_core.alts: [old_core_as_alt, alt_C]

  old_core_as_alt:
    @tracks: new_core
    # what was "certain" - now just one possibility

  alt_C:
    @tracks: new_core
    # the new past possibility
```

The "certain" past becomes uncertain. Old core demoted to alt. New core holds only what's truly shared across all possibilities.

### Caching Considerations

Safe because locked nodes don't change:
- @tracks points to specific locked state
- Cache keyed by tt - queries from before alt was added don't see it

## Components

| Component | Status | Notes |
|-----------|--------|-------|
| State.alts property | TODO | Forward references to alternative timelines |
| @uncertainty flag | TODO | Triggers superposition return from alts |
| jump_to_alt() | TODO | Inverts @tracks/alts relationship |
| add_past_possibility() | TODO | Core demotion pattern |

## Files to Modify

- `public/worker/state.mjs` - State.alts property, @uncertainty handling
- `public/worker/session.mjs` - jump_to_alt() for timeline switching
- `public/worker/convergence.mjs` - Superposition return when @uncertainty set

## Tests

| Test | File | Status | Description |
|------|------|--------|-------------|
| ALTS-1 | alts.test.mjs | TODO | State.alts tracks forward references |
| ALTS-2 | alts.test.mjs | TODO | @uncertainty=true returns superposition |
| ALTS-3 | alts.test.mjs | TODO | @uncertainty=false returns first-found |
| ALTS-4 | alts.test.mjs | TODO | jump_to_alt() inverts relationships |
| ALTS-5 | alts.test.mjs | TODO | Old core becomes alt after jump |
| ALTS-6 | alts.test.mjs | TODO | add_past_possibility() demotes core |

## Verification

- [ ] All ALTS tests written and passing
- [ ] `npm test` passes
- [ ] Core is relative - current state is always "core"
- [ ] Jumping to alt makes old core an alt
- [ ] Past possibilities can be added without modifying locked states
- [ ] @uncertainty flag correctly triggers superposition returns

## Open Questions

From combinatorial-explosion-components.md:

> **Alts during core advancement**: When core advances, need to update alts list to point to current tip of each alt timeline. Mechanism TBD.

This may require:
- Tracking alt timeline heads
- Updating forward references on advancement
- Or lazy resolution at query time

## Notes

- This phase builds on Phase 5a's @tracks foundation
- The core/alt relationship is relative, not absolute
- Jumping inverts relationships rather than copying data
- Past possibility addition uses core demotion, not state mutation
- Phase 8 (Superposition API) depends on this for get_branch_heads()
- See `docs/notes/combinatorial-explosion-components.md` lines 655-724 for full design
