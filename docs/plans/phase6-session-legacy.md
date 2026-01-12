# Phase 6: Session.legacy (Cross-Timeline Persistence)

## Dependencies

- **Requires:** Phase 3-4 (resolution infrastructure)
- **Blocked by:** Phase 4 (Timeline Resolution)
- **Can parallelize with:** Phase 5 (@tracks) after Phase 4 complete

## Goal

Committed discoveries persist across timeline navigation (reload, flashback) - player "knows answers from previous run."

## Design

**What Session.legacy does:**
- Reference to committed state from previous run/timeline
- Query modification: check legacy ancestry for resolutions
- Enables: "player knows answers from previous run" after reload

**Example** (from combinatorial-explosion-components.md):
```javascript
Session:
  world: world_mind
  state: state_1        // current position (after reload)
  avatar: player
  legacy: state_50      // committed discoveries from previous run
```

**Backward navigation with legacy:**
1. Query beliefs about subject at current state
2. Check subject.resolutions against legacy (not just current ancestry)
3. If legacy state is in resolutions → resolution applies
4. Get resolved value even though "before" the discovery

**Three modes of "going back"** (context):
- **Reload** (reset): Load earlier snapshot, all collapses undone
- **Flashback** (vt change): Move to earlier valid-time, collapsed facts remain
- **Committed Branch** (legacy): Branch from earlier tick, observations locked

## Components

| Component | Status | Notes |
|-----------|--------|-------|
| Session.legacy field | TODO | Reference to committed State |
| Legacy check in queries | TODO | Check legacy ancestry for resolutions |
| Resolution visibility | TODO | Resolutions visible across timeline navigation |

## Files to Modify

- `public/worker/session.mjs` - legacy field
- `public/worker/belief.mjs` - Legacy check in queries

## Tests

| Test | File | Status | Description |
|------|------|--------|-------------|
| RES-5 | resolution.test.mjs | TODO | Cross-timeline resolution via Session.legacy |
| RES-6 | resolution.test.mjs | TODO | Query without legacy → superposition |
| LEGACY-1 | legacy.test.mjs | TODO | Reload with legacy preserves discoveries |
| LEGACY-2 | legacy.test.mjs | TODO | New branch with legacy sees committed resolutions |

## Verification

- [ ] RES-5, RES-6 tests written and passing
- [ ] LEGACY tests written and passing
- [ ] `npm test` passes
- [ ] Player discoveries persist after reload when legacy set
- [ ] Player discoveries NOT visible when legacy is null (true reload)

## Notes

- This enables the "groundhog day" game loop - player retains knowledge across resets
- Key insight: Legacy is separate from @tracks - legacy is about resolution visibility, @tracks is about content inheritance
- Without legacy, resolutions only visible in current state's ancestry
- With legacy, resolutions in legacy ancestry also apply
