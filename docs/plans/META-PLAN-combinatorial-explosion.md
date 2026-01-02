# Meta-Plan: Combinatorial Explosion Components Implementation

## Overview

This plan coordinates the implementation of all **"Designed - Ready for Implementation"** components from:
- `docs/notes/combinatorial-explosion-components.md` - Core architectural patterns
- `docs/notes/version_propagation.md` - Lazy propagation design
- `docs/notes/observation_recognition_spec.md` - Perception/recognition system
- `docs/notes/event-perception.md` - Stage 1 LOOK command

**Existing Plans to Update** (not replace):
- `docs/plans/archive/lazy-version-propagation.md` - 7 phases, ✅ ALL COMPLETE
- `docs/plans/observation-events.md` - perceive/identify/learn_from, partially done

**In Scope** (per combinatorial-explosion-components.md):
- All items in "Designed - Ready for Implementation"
- Pending tests that depend on these features

**Out of Scope** (explicitly deferred):
- @path_certainty cache (skip for v1)
- Certainty float value tuning
- Branch lifecycle (pruning, merging, GC)
- Decision time (dt)
- LOD + minds
- Contradiction detection (Psychology domain)

---

## Dependency Graph (Updated January 2026)

**Key insight**: There are **four distinct resolution/navigation mechanisms**:
- **Promotions** = query-time resolution for shared belief updates (lazy propagation)
- **Belief Resolution** = individual belief/trait uncertainty collapse (Fuzzy, unknown)
- **Timeline Resolution** = Convergence-level branch selection (whole branch becomes authoritative)
- **@tracks** = timeline inheritance (fallback to parallel timeline for untouched content)
- **Session.legacy** = cross-timeline persistence (committed discoveries survive reloads)

```
                    ┌─────────────────────────┐
                    │    FOUNDATION LAYER     │
                    │  (Trait, Fuzzy, Notion) │
                    └───────────┬─────────────┘
                                │
    ┌───────────────────────────┼───────────────────────────┐
    │                           │                           │
    ▼                           ▼                           ▼
┌─────────────────┐   ┌─────────────────┐   ┌──────────────────────┐
│ PROMOTIONS      │   │ BELIEF          │   │ OBSERVATION SYSTEM   │
│ (shared belief  │   │ RESOLUTION      │   │ (perceive, identify, │
│  versioning)    │   │ (Fuzzy/unknown) │   │  learn_from)         │
│ Phase 2 ✅      │   │ Phase 3 ✅      │   │ Phase 7              │
└─────────────────┘   └────────┬────────┘   └──────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ TIMELINE RESOLUTION │
                    │ (Convergence-level  │
                    │  branch selection)  │
                    │ Phase 4             │
                    └────────┬────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │                                         │
        ▼                                         ▼
┌───────────────────┐                   ┌─────────────────────┐
│ @tracks           │                   │ Session.legacy      │
│ (timeline         │                   │ (cross-timeline     │
│  inheritance)     │                   │  persistence)       │
│ Phase 5           │                   │ Phase 6             │
└───────────────────┘                   └─────────────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ SUPERPOSITION    │
                    │ API              │
                    │ Phase 8          │
                    └──────────────────┘
```

**Query flow** (updated):
1. Check Subject.resolutions for recorded collapse (belief-level)
2. Check if in timeline descended from resolved Convergence (timeline-level)
3. If Session.legacy set → also check legacy ancestry for resolutions
4. Otherwise → promotions (walk bases, resolve branches via lazy propagation)
5. If @tracks set → fall back to tracked timeline for missing content
6. Temporal branches → resolver picks by timestamp
7. Probability branches → return superposition → caller may collapse

---

## Implementation Phases

### Phase 1: Foundation Layer ✅ COMPLETE
**Goal**: Core structures without behavior changes

| Component | Status | Fits Existing Design? | Notes |
|-----------|--------|----------------------|-------|
| Trait object (reified) | ✅ Complete | ✅ Yes | `public/worker/trait.mjs` - 102 lines |
| Fuzzy class | ✅ Complete | ✅ Yes | `public/worker/fuzzy.mjs` - uncertain trait values with alternatives |
| Notion class | ✅ Complete | ✅ Yes | `public/worker/notion.mjs` - materialized belief view |
| unknown() singleton | ✅ Complete | ✅ Yes | `fuzzy.mjs` - Fuzzy with no alternatives |
| @certainty at splits | ✅ Complete | ✅ Yes | `state.mjs:789` - getter, line 128 field |
| Path certainty | ✅ Complete | ✅ Yes | `mind.mjs:844` - `_compute_path_certainty()` with caching |
| ~~@path_certainty cache~~ | **DEFERRED** | - | Skip for v1 |

**Files**: `public/worker/trait.mjs`, `public/worker/fuzzy.mjs`, `public/worker/notion.mjs`, `public/worker/state.mjs`, `public/worker/mind.mjs`

**Tests**: `test/trait.test.mjs` - 11 tests covering construction, defaults, sysdesig, toJSON

---

### Phase 2: Promotions ✅ COMPLETE
**Goal**: Enable O(1) updates cascading to O(depth) queries for **shared beliefs**

Reference: `docs/plans/archive/lazy-version-propagation.md` ✅ ARCHIVED (January 2026)

Note: "Promotions" (formerly "Lazy Version Propagation") describes beliefs that propagate to children of their base. Lazy propagation is the underlying pattern.

| Sub-phase | Status | Notes |
|-----------|--------|-------|
| 2.1 Promotion tracking in Belief | ✅ Complete | `promotions: Set<Belief>`, direct properties: `origin_state`, `certainty`, `constraints` |
| 2.2 State resolver interface | ✅ Complete | `pick_promotion()` - temporal filtering |
| 2.3 Trait resolution with promotions | ✅ Complete | `get_trait()` walks promotions via `_get_inherited_trait()` |
| 2.4 Materialization on creation | ✅ Complete | `_materialize_promotion_chain()`, `_join_traits_from_promotions()` |
| 2.5 get_belief_by_subject | ✅ NOT NEEDED | `replace()` removes original from state |
| 2.6 Superposition handling | ✅ Complete | Multiple promotions joined into Fuzzy trait values |
| 2.7 Documentation | ✅ Complete | Updated SPECIFICATION.md, IMPLEMENTATION.md |

**Key insight**: Multiple probability promotions are **joined** into a single belief with Fuzzy trait values via `_join_traits_from_promotions()`.

**Files**: `public/worker/belief.mjs`, `public/worker/state.mjs`, `public/worker/mind.mjs`

**Tests**: `test/promotion.test.mjs`, `test/belief.test.mjs` (probability promotions)

---

### Phase 3: Belief Resolution ✅ COMPLETE
**Goal**: Collapse **individual belief/trait** uncertainty (Fuzzy values, unknown traits)

**Design Decision**: `resolution` is a direct Belief property (like `certainty`, `origin_state`), NOT a meta-trait.

**What this phase handles**:
- A single belief has a Fuzzy trait value → resolve to concrete value
- A belief has an unknown() trait → resolve to discovered value
- Works per-subject, per-state

**What this phase does NOT handle** (see Phase 4):
- Convergence-level branch selection (all beliefs in a branch resolving together)
- Timeline-wide resolution

| Component | Status | Notes |
|-----------|--------|-------|
| Belief.resolution property | ✅ Complete | Direct property, Belief reference |
| Subject.resolutions index | ✅ Complete | Map<state_id, Belief> for O(1) lookup |
| Subject.get_resolution(state) | ✅ Complete | Walks state ancestry via base chain |
| Resolution check in get_trait() | ✅ Complete | Short-circuits before cache lookup |

**Files modified**:
- `public/worker/belief.mjs` - resolution property, get_trait check, serialization
- `public/worker/subject.mjs` - resolutions index, get_resolution(), register_resolution()
- `public/worker/state.mjs` - insert_beliefs() indexing
- `public/worker/mind.mjs` - _finalize_resolution_from_json()
- `public/worker/materia.mjs` - _finalize_resolution_from_json()

**Test matrix**:
| Test | Type | Status | Description |
|------|------|--------|-------------|
| RES-2 | Belief | ✅ Done | Fuzzy → concrete value |
| RES-3 | Trait | ✅ Done | Unknown → discovered value |
| RES-4 | Query | ✅ Done | Query returns resolved value |

**Tests**: `test/resolution.test.mjs` - 17 tests

---

### Phase 4: Timeline Resolution
**Goal**: Resolve **entire branches** at the Convergence level (all beliefs in selected branch become authoritative)

**Distinction from Phase 3**:
| Phase 3 (Belief) | Phase 4 (Timeline) |
|------------------|-------------------|
| Resolve one belief at a time | Resolve entire branch at once |
| `hammer.color` is Fuzzy → now "red" | Timeline A selected → ALL beliefs get Timeline A versions |
| Per-subject resolution | Convergence-level resolution |

**Use case**: Two timelines diverged at tick 5:
- Timeline A: hammer=red, player=cave, door=open
- Timeline B: hammer=blue, player=tower, door=closed
- Player observes and commits to Timeline B
- ALL queries from that point return Timeline B versions

**Design** (from combinatorial-explosion-components.md:504-508):
```
| Type | Uncertainty | Resolution |
|------|-------------|------------|
| State | Convergence (explicit container) | @resolution → branch |
```
For State resolution, `@resolution` points to a **branch (State)**, not a Belief.

| Component | Status | Notes |
|-----------|--------|-------|
| Convergence.resolution property | Designed | Points to selected branch State |
| Query-time branch check | Designed | If in resolved Convergence → use selected branch |
| RES-1 enhancement | Designed | Existing test needs timeline-level behavior |

**Test matrix**:
| Test | Type | Status | Description |
|------|------|--------|-------------|
| RES-1 | State | ⚠️ Partial | Current: single belief. Need: all beliefs in branch |
| TL-1 | Timeline | TODO | Multiple beliefs resolve together when branch selected |
| TL-2 | Timeline | TODO | Query any belief → gets selected branch version |

**Files**: `public/worker/convergence.mjs`, `public/worker/state.mjs`

---

### Phase 5: @tracks (Timeline Inheritance)
**Goal**: Fallback to parallel timeline for untouched content

**What @tracks does**:
- State meta-property pointing to a parallel timeline
- Query algorithm: local base chain first, then fall back to @tracks
- Used for: committed branches inheriting from parent timeline, theories tracking core observations

**Example** (from combinatorial-explosion-components.md:559-569):
```javascript
new_state_6:
  base: state_5           // branch point (common ancestor)
  @tracks: state_6        // fallback to legacy timeline
  insert: [bob.location = tavern]  // local changes

new_state_7:
  base: new_state_6       // local chain continues
  @tracks: state_7        // tracked advances via branches
```

**Query algorithm**:
```
query(state, trait):
  1. Walk local base chain (depth first)
  2. If not found AND state.@tracks exists:
     return query(state.@tracks, trait)
```

| Component | Status | Notes |
|-----------|--------|-------|
| State.tracks property | Designed | Reference to parallel timeline State |
| @tracks in query path | Designed | Fallback after local chain exhausted |
| advance_tracked_timeline() | Designed | Follow branches to vt <= target |

**Files**: `public/worker/state.mjs`, `public/worker/temporal.mjs`

---

### Phase 6: Session.legacy (Cross-Timeline Persistence)
**Goal**: Committed discoveries persist across timeline navigation (reload, flashback)

**What Session.legacy does**:
- Reference to committed state from previous run/timeline
- Query modification: check legacy ancestry for resolutions
- Enables: "player knows answers from previous run" after reload

**Example** (from combinatorial-explosion-components.md:474-500):
```javascript
Session:
  world: world_mind
  state: state_1        // current position (after reload)
  avatar: player
  legacy: state_50      // committed discoveries from previous run
```

**Backward navigation with legacy**:
1. Query beliefs about subject at current state
2. Check subject.resolutions against legacy (not just current ancestry)
3. If legacy state is in resolutions → resolution applies
4. Get resolved value even though "before" the discovery

| Component | Status | Notes |
|-----------|--------|-------|
| Session.legacy field | Designed | Reference to committed State |
| Legacy check in queries | Designed | Check legacy ancestry for resolutions |
| Resolution visibility | Designed | Resolutions visible across timeline navigation |

**Test matrix**:
| Test | Type | Status | Description |
|------|------|--------|-------------|
| RES-5 | Legacy | TODO | Cross-timeline resolution via Session.legacy |
| RES-6 | Legacy | TODO | Query without legacy → superposition |

**Files**: `public/worker/session.mjs`, `public/worker/belief.mjs`

---

### Phase 7: Observation System
**Goal**: Complete perceive/identify/learn_from implementation

Reference: `docs/plans/observation-events.md`

| Component | Status | Notes |
|-----------|--------|-------|
| EventPerception archetype | ✅ Exists | In world.mjs |
| @about meta-trait | ✅ Exists | In registry |
| @acquaintance meta-trait | Designed | Add to registry |
| @source meta-trait | Designed | Add to registry |
| state.perceive() | Designed | New method |
| state.identify() | Designed | New method |
| state.learn_from() | Designed | Build on learn_about() |
| Compositional matching | Designed | Recursive trait comparison |

**Files**: `public/worker/state.mjs`, `public/worker/db.mjs` (registry)

**Pending tests**:
- `observation.test.mjs:1889` - Mind trait composition (partial - needs talking system)

---

### Phase 8: Superposition API (Partial)
**Goal**: Basic superposition support (NOT branch lifecycle)

| Component | Status | Notes |
|-----------|--------|-------|
| Convergence yields alternatives | Designed | Modify get_beliefs() for @resolution |
| get_branch_heads() | Designed | New method on State |
| ~~Observation collapse~~ | **DEFERRED** | Branch pruning = branch lifecycle |
| ~~Branch rebasing/merging~~ | **DEFERRED** | Branch lifecycle |

**Files**: `public/worker/convergence.mjs`, `public/worker/state.mjs`

**Pending tests**:
- `superposition.test.mjs:217` - get_branch_heads() ✅ In scope

**Deferred tests** (branch lifecycle):
- `superposition.test.mjs:224` - observation removes branches
- `superposition.test.mjs:231` - merging confirmed branch

---

## Pending Tests Summary

### Phase 4: Timeline Resolution

| Test | File:Line | Description |
|------|-----------|-------------|
| RES-1 enhancement | resolution.test.mjs | Current test is single-belief, needs timeline-level |
| TL-1 | resolution.test.mjs | Multiple beliefs resolve together when branch selected |
| TL-2 | resolution.test.mjs | Query any belief → gets selected branch version |

### Phase 6: Session.legacy

| Test | File:Line | Description |
|------|-----------|-------------|
| RES-5 | resolution.test.mjs | Cross-timeline resolution via Session.legacy |
| RES-6 | resolution.test.mjs | Query without legacy → superposition |

### Phase 7-8: Observation + Superposition

| Test | File:Line | Phase | Description |
|------|-----------|-------|-------------|
| get_branch_heads() | superposition.test.mjs:217 | 8 | Branch tracking API |
| Mind trait composition | observation.test.mjs:1889 | 7+ | Talking system |

### Deferred (branch lifecycle)

| Test | File:Line | Reason |
|------|-----------|--------|
| Observation removes branches | superposition.test.mjs:224 | Branch pruning |
| Merging confirmed branch | superposition.test.mjs:231 | Branch rebasing |

---

## Recommended Implementation Order

1. **Phase 1: Foundation** ✅ COMPLETE
   - Trait object class, Fuzzy, Notion, certainty

2. **Phase 2: Promotions** ✅ COMPLETE
   - Lazy propagation for shared beliefs

3. **Phase 3: Belief Resolution** ✅ COMPLETE
   - Individual belief/trait uncertainty collapse
   - Tests: `test/resolution.test.mjs` (17 tests)

4. **Phase 4: Timeline Resolution** ← NEXT
   - Convergence-level branch selection
   - All beliefs in branch resolve together
   - Depends on Phase 3

5. **Phase 5: @tracks** (can parallelize with Phase 6)
   - Timeline inheritance for committed branches
   - advance_tracked_timeline()

6. **Phase 6: Session.legacy** (can parallelize with Phase 5)
   - Cross-timeline resolution persistence
   - Depends on Phase 3-4 for resolution infrastructure

7. **Phase 7: Observation System** (independent)
   - perceive/identify/learn_from
   - Can parallelize with Phases 4-6

8. **Phase 8: Superposition API**
   - get_branch_heads(), Convergence alternatives
   - **Skip**: Branch lifecycle (deferred)

---

## Design Fit Analysis

### ✅ Good Fit (No Concerns)
- Belief.resolution - Already implemented, standard pattern
- Subject.resolutions index - Already implemented
- @tracks meta-property - Additive change to State
- Session.legacy field - Additive change to Session
- get_branch_heads() - Simple API addition

### ⚠️ Needs Careful Integration
- **Timeline resolution in Convergence** - Query path modification for branch selection
- **@tracks in query path** - Core hot path, needs careful testing
- **Session.legacy in queries** - Cross-timeline lookup, performance implications

### ❓ Remaining Open Questions

1. **Timeline resolution storage**: Convergence.resolution property vs State property?
2. **@tracks query integration**: Depth-first vs BFS behavior in existing code?
3. **Legacy check scope**: Every query or only explicit calls?

### ✅ Questions Resolved

- Belief vs Timeline resolution → Clarified: separate phases (3 vs 4)
- @tracks vs Session.legacy → Clarified: separate mechanisms (5 vs 6)
- Branch lifecycle → Deferred to future work

---

## Files to Modify

### Phase 1-3: Already Implemented ✅
- `public/worker/trait.mjs` - Reified Trait class
- `public/worker/fuzzy.mjs` - Uncertain trait values, unknown()
- `public/worker/notion.mjs` - Materialized belief view
- `public/worker/belief.mjs` - Belief.resolution property, promotions
- `public/worker/subject.mjs` - Subject.resolutions index
- `public/worker/state.mjs` - insert_beliefs() indexing
- `public/worker/mind.mjs` - recall(), path_certainty, resolution finalization

### Phase 4: Timeline Resolution
- `public/worker/convergence.mjs` - Convergence.resolution property, query modification
- `public/worker/state.mjs` - Branch check in queries

### Phase 5: @tracks
- `public/worker/state.mjs` - State.tracks property
- `public/worker/temporal.mjs` - advance_tracked_timeline()
- `public/worker/belief.mjs` - @tracks fallback in get_trait()

### Phase 6: Session.legacy
- `public/worker/session.mjs` - legacy field
- `public/worker/belief.mjs` - Legacy check in queries

### Phase 7: Observation System
- `public/worker/perception.mjs` - perceive(), identify(), learn_from()
- `public/worker/db.mjs` - @acquaintance, @source traits

### Phase 8: Superposition API
- `public/worker/convergence.mjs` - get_branch_heads()
- `public/worker/state.mjs` - Alternative yielding

---

## Success Metrics

1. **Phase 3 ✅**: Belief resolution tests pass (17 tests)
2. **Phase 4**: Timeline resolution - selecting branch resolves ALL beliefs
3. **Phase 5**: @tracks fallback works for committed branches
4. **Phase 6**: Session.legacy enables cross-timeline resolution visibility
5. **Phase 7**: perceive → identify → learn_from working
6. **Phase 8**: get_branch_heads() API works

---

## Existing Plan Updates

### `docs/plans/archive/lazy-version-propagation.md` ✅ ARCHIVED

**Status**: All 7 phases complete (January 2026)
- Promotion tracking, resolver interface, trait resolution
- Materialization, superposition handling
- Documentation and save/load tests all done

### `docs/plans/observation-events.md`

**Already complete**: perceive/identify/learn_from design.

**Additions needed**:
- Add @source meta-trait registration
- Add @acquaintance meta-trait registration
- Link to combinatorial-explosion-components.md for Trait object design
- Note: recognize_by_traits tests still pending

---

## Deferred Features (for future plan)

1. **Branch Lifecycle** - pruning, merging, GC
   - Tests: superposition.test.mjs:224, :231

2. **@path_certainty Cache** - skip for v1

3. **Decision Time (dt)** - third temporal dimension

4. **LOD + Minds** - distant mind compression

5. **Contradiction Detection** - Psychology domain (Alpha 4+)

---

## Phase Summary

| Phase | Name | Status | Key Deliverable |
|-------|------|--------|-----------------|
| 1 | Foundation | ✅ COMPLETE | Trait, Fuzzy, Notion classes |
| 2 | Promotions | ✅ COMPLETE | Lazy propagation for shared beliefs |
| 3 | Belief Resolution | ✅ COMPLETE | Per-belief uncertainty collapse |
| 4 | Timeline Resolution | TODO | Convergence-level branch selection |
| 5 | @tracks | TODO | Timeline inheritance for branches |
| 6 | Session.legacy | TODO | Cross-timeline persistence |
| 7 | Observation System | TODO | perceive/identify/learn_from |
| 8 | Superposition API | TODO | get_branch_heads(), alternatives |

*Last updated: January 2026 - Reorganized to separate @tracks, Session.legacy, and timeline resolution*
