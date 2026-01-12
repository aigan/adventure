# Phase 5a: tracks (Timeline Inheritance)

## Dependencies

- **Requires:** Phase 4 (Timeline Resolution)
- **Blocked by:** Phase 4
- **Can parallelize with:** Phase 6 (Session.legacy) after Phase 4 complete

## Goal

Implement overlay semantics - local beliefs win by subject, tracks provides content for unhandled subjects.

## Design

**What tracks does:**
- State property pointing to a **specific state** in the tracked timeline (at tracking vt)
- No navigation needed - tracks points directly to the right state
- Used for: alt timelines, theories tracking core, committed branches

**Key design decisions** (from Jan 2026 discussion):
- **Overlay, not fallback**: Local wins by subject (insert or remove marks subject as "handled")
- **No trait merging**: Use belief `_bases` for trait continuity across timelines
- **base:null + tracks**: Alt timelines have no shared base with tracked timeline
- **Cross-timeline belief._bases**: Allowed if in accessible scope (own mind, Eidos, prototypes)

**Example** (alt with base:null + tracks):
```javascript
alt_state_6:
  base: null              // NO shared base with core
  tracks: state_6         // tracked timeline state at same vt
  _insert: [belief_bob_forest]  // local deviation

alt_state_8:
  base: alt_state_6       // own chain continues
  tracks: state_8         // tracked timeline state at vt 8
  _insert: []
```

**Query algorithm** (overlay with handled_subjects):
```javascript
*get_beliefs_with_tracks() {
  const handled_subjects = new Set()

  // Walk local chain first - collect handled subjects
  for (let s = this; s; s = s.base) {
    for (const belief of s._remove) handled_subjects.add(belief.subject)
    for (const belief of s._insert) {
      handled_subjects.add(belief.subject)
      yield belief
    }
  }

  // Get beliefs from tracks, skip handled subjects
  if (this.tracks) {
    for (const belief of this.tracks.get_beliefs()) {
      if (!handled_subjects.has(belief.subject)) yield belief
    }
  }
}
```

## Components

| Component | Status | Notes |
|-----------|--------|-------|
| State.tracks property | TODO | Direct reference to tracked state |
| get_beliefs_with_tracks() | TODO | Overlay merger with handled_subjects |

## Files to Modify

- `public/worker/state.mjs` - State.tracks property, get_beliefs_with_tracks()

## Tests

| Test | File | Status | Description |
|------|------|--------|-------------|
| TRACKS-1 | tracks.test.mjs | TODO | Local belief overrides tracks belief for same subject |
| TRACKS-2 | tracks.test.mjs | TODO | Unhandled subjects fall through to tracks |
| TRACKS-3 | tracks.test.mjs | TODO | Local remove blocks tracks belief |
| TRACKS-4 | tracks.test.mjs | TODO | Theory tracking core observations |

## Verification

- [ ] All TRACKS tests written and passing
- [ ] `npm test` passes
- [ ] Alt timeline with base:null + tracks works correctly
- [ ] Local inserts override tracks content
- [ ] Local removes block tracks content

## Notes

- This is a core phase for timeline branching functionality
- Key insight: tracks is a direct state reference (no navigation needed)
- tracks points to the state at the tracking vt in the tracked timeline
- See `docs/notes/combinatorial-explosion-components.md` for full design
- **Phase 5b** covers alts (forward references to alternative timelines)
