# Meta-Plan: Combinatorial Explosion Components Implementation

## Overview

This plan coordinates the implementation of all **"Designed - Ready for Implementation"** components from:
- `docs/notes/combinatorial-explosion-components.md` - Core architectural patterns
- `docs/notes/version_propagation.md` - Lazy propagation design
- `docs/notes/observation_recognition_spec.md` - Perception/recognition system
- `docs/notes/event-perception.md` - Stage 1 LOOK command

**Existing Plans to Update** (not replace):
- `docs/plans/lazy-version-propagation.md` - 7 phases, all incomplete
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

## Dependency Graph (Updated December 2024)

**Key insight**: Lazy propagation and @resolution are **orthogonal systems**:
- Lazy prop = query-time resolution for shared belief updates (temporal)
- @resolution = recorded collapse of possibility space (persistent, works with legacy)

```
                    ┌─────────────────────────┐
                    │    FOUNDATION LAYER     │
                    │  (Trait object, etc.)   │
                    └───────────┬─────────────┘
                                │
    ┌───────────────────────────┼───────────────────────────┐
    │                           │                           │
    ▼                           ▼                           ▼
┌─────────────────┐   ┌─────────────────┐   ┌──────────────────────┐
│ LAZY PROPAGATION│   │ @resolution     │   │ OBSERVATION SYSTEM   │
│ (shared belief  │   │ (collapse       │   │ (perceive, identify, │
│  versioning)    │   │  recording)     │   │  learn_from)         │
└────────┬────────┘   └────────┬────────┘   └──────────────────────┘
         │                     │
         │   ┌─────────────────┘
         │   │
         ▼   ▼
    ┌──────────────────┐
    │ @tracks +        │
    │ Session.legacy   │
    │ (timeline nav)   │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ SUPERPOSITION    │
    │ API              │
    │ (uses both LP    │
    │  and @resolution)│
    └──────────────────┘
```

**Query flow**:
1. Check Subject.resolutions for recorded collapse (@resolution)
2. If found in ancestry OR Session.legacy → return resolved
3. Otherwise → lazy propagation (walk bases, resolve branches)
4. Temporal branches → resolver picks by timestamp
5. Probability branches → return superposition → caller may collapse

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

### Phase 2: Lazy Version Propagation
**Goal**: Enable O(1) updates cascading to O(depth) queries for **shared beliefs**

Reference: `docs/plans/lazy-version-propagation.md` (updated December 2024)

| Sub-phase | Status | Fits Existing Design? | Notes |
|-----------|--------|----------------------|-------|
| 2.1 Branch tracking in Belief | ✅ Complete | ✅ Yes | `branches: Set<Belief>`, `branch_metadata`, `add_branch()`, `branch()` with metadata |
| 2.1a Certainty via branch_metadata | ✅ Complete | ✅ Yes | `@certainty` removed, use `branch_metadata.certainty`. `recall()` multiplies state × belief × trait certainty |
| 2.2 State resolver interface | Designed | ✅ Yes | Add `resolve_branches()` - temporal filtering |
| 2.3 Trait resolution with branches | Designed | ⚠️ Extends | Modify `get_trait()` to detect branches |
| 2.4 Materialization on creation | Designed | ⚠️ Extends | Add `materialize_path()` helper |
| 2.5 get_belief_by_subject with resolver | Designed | ⚠️ Extends | Check branches before returning |
| 2.6 Superposition return | Designed | ✅ Yes | Return `Fuzzy` via `Notion` for probability branches |
| 2.7 Documentation | - | - | ✅ Updated with interaction matrix |

**Key clarification**: Lazy prop handles **query-time** resolution (temporal filtering).
Does NOT record collapse - that's @resolution's job.

**Already implemented**: `Mind.recall()` returns `Notion` with `Fuzzy` values when trait has uncertainty.

**Files**: `public/worker/belief.mjs`, `public/worker/state.mjs`, `public/worker/mind.mjs`

**Test matrix**: LP-1 through LP-6, COMB-1, COMB-2, EDGE-1 through EDGE-6

---

### Phase 3: @resolution Pattern (Orthogonal to Phase 2)
**Goal**: **Record** collapse of possibility space (persistent, works with legacy)

| Component | Status | Fits Existing Design? | Notes |
|-----------|--------|----------------------|-------|
| @resolution meta-trait | Designed | ✅ Yes | Add to registry, Belief reference |
| Subject.resolutions index | Designed | ⚠️ New | Map<state_id, state_id> for O(1) lookup |
| collapse_trait() with @resolution | Designed | ⚠️ Extends | Creates resolution belief + updates index |
| Three uncertainty types | Designed | ✅ Yes | State, Belief, UNKNOWN trait |

**Key clarification**: @resolution is checked BEFORE lazy propagation during queries.
If resolution found in ancestry or Session.legacy → use it, skip lazy prop.

**Files**: `public/worker/subject.mjs`, `public/worker/belief.mjs`, `public/worker/db.mjs` (registry)

**Test matrix**: RES-1 through RES-6, COMB-1, COMB-3, COMB-5, COMB-6

---

### Phase 4: @tracks and Session.legacy
**Goal**: Timeline tracking and cross-timeline resolution

| Component | Status | Fits Existing Design? | Notes |
|-----------|--------|----------------------|-------|
| @tracks meta-property | Designed | ✅ Yes | Fallback to parallel timeline |
| advance_tracked_timeline() | Designed | ✅ Yes | Follow branches to target vt |
| Session.legacy | Designed | ⚠️ Extends | Add to Session class |
| Cross-timeline resolution | Designed | ⚠️ Extends | Check legacy in queries |

**Files**: `public/worker/state.mjs`, `public/worker/session.mjs`

---

### Phase 5: Observation System
**Goal**: Complete perceive/identify/learn_from implementation

Reference: `docs/plans/observation-events.md`

| Component | Status | Fits Existing Design? | Notes |
|-----------|--------|----------------------|-------|
| EventPerception archetype | ✅ Exists | ✅ Yes | In world.mjs |
| @about meta-trait | ✅ Exists | ✅ Yes | In registry |
| @acquaintance meta-trait | New | ✅ Yes | Add to registry |
| @source meta-trait | Designed | ✅ Yes | Add to registry |
| state.perceive() | Designed | ✅ Yes | New method |
| state.identify() | Designed | ✅ Yes | New method |
| state.learn_from() | Designed | ⚠️ Extends | Build on learn_about() |
| Compositional matching | Designed | ⚠️ Complex | Recursive trait comparison |

**Files**: `public/worker/state.mjs`, `public/worker/db.mjs` (registry)

**Pending tests this enables**:
- `observation.test.mjs:1889` - Mind trait composition (partial - needs talking system)

---

### Phase 6: Superposition API (Partial)
**Goal**: Basic superposition support (NOT branch lifecycle)

| Component | Status | Fits Existing Design? | Notes |
|-----------|--------|----------------------|-------|
| Convergence yields alternatives | Designed | ⚠️ Extends | Modify get_beliefs() for @resolution |
| get_branch_heads() | Designed | ✅ Yes | New method on State |
| ~~Observation collapse~~ | **DEFERRED** | - | Branch pruning = branch lifecycle |
| ~~Branch rebasing/merging~~ | **DEFERRED** | - | Branch lifecycle |

**Files**: `public/worker/convergence.mjs`, `public/worker/state.mjs`

**Pending tests this enables**:
- `superposition.test.mjs:217` - get_branch_heads() ✅ In scope

**Pending tests DEFERRED**:
- `superposition.test.mjs:224` - observation removes branches ❌ Branch lifecycle
- `superposition.test.mjs:231` - merging confirmed branch ❌ Branch lifecycle

---

## Pending Tests Summary

### In Scope (3 tests)

| Test | File:Line | Phase Required | Blocking Feature |
|------|-----------|----------------|------------------|
| Convergence yields both alternatives | superposition.test.mjs:170 | 3 | @resolution pattern |
| get_branch_heads() | superposition.test.mjs:217 | 2 + 6 | Branch tracking + API |
| Mind trait composition | observation.test.mjs:1889 | 5+ | Talking system |

### Deferred (2 tests - branch lifecycle)

| Test | File:Line | Reason |
|------|-----------|--------|
| Observation removes branches | superposition.test.mjs:224 | Branch pruning → branch lifecycle |
| Merging confirmed branch | superposition.test.mjs:231 | Branch rebasing → branch lifecycle |

---

## Recommended Implementation Order

1. **Phase 1: Foundation** ✅ COMPLETE
   - Trait object class → `public/worker/trait.mjs`
   - Certainty at split points → `state.mjs:789`
   - **Skip**: @path_certainty cache (deferred for v1)

2. **Phase 2: Lazy Propagation** (largest chunk)
   - Update `docs/plans/lazy-version-propagation.md` with any missing details
   - Implement sub-phases 2.1-2.6 in order
   - Tests: Branch tracking, resolver interface

3. **Phase 3: @resolution Pattern**
   - Build on Phase 2 resolver
   - Subject resolution index
   - Tests: `superposition.test.mjs:170`

4. **Phase 5: Observation System** (can parallelize with 3-4)
   - Update `docs/plans/observation-events.md` with remaining items
   - Implement perceive/identify/learn_from
   - Independent of lazy propagation

5. **Phase 4: @tracks + Session.legacy**
   - Depends on Phase 3
   - Timeline tracking and cross-timeline resolution

6. **Phase 6: Superposition API**
   - get_branch_heads() API
   - Convergence yielding alternatives
   - Tests: `superposition.test.mjs:217`
   - **Skip**: Branch pruning/rebasing (deferred)

---

## Design Fit Analysis

### ✅ Good Fit (No Concerns)
- Trait object - Standard pattern
- @certainty at splits - Already implemented (state.certainty)
- Branch tracking - Additive change
- EventPerception - Already exists
- @about, @acquaintance, @source - Standard meta-traits
- get_branch_heads() - Simple API addition

### ⚠️ Needs Careful Integration
- get_trait() with branch resolution - Core hot path
- get_belief_by_subject() with resolver - Backward compat needed
- Convergence get_beliefs() changes - May affect existing callers
- Session.legacy - Extends Session class

### ❓ Remaining Open Questions

1. **Materialization triggers**: Exact conditions for intermediate node creation?
2. **Convergence iteration order**: When yielding both alternatives, what order?
3. **Observation modalities**: Default set for perceive()?

### ✅ Questions Resolved (deferred)

- Certainty float values → deferred, use keywords only for now
- Branch lifecycle → deferred to future work

---

## Files to Modify

### Already Implemented ✅
- `public/worker/trait.mjs` - Reified Trait class
- `public/worker/fuzzy.mjs` - Uncertain trait values with alternatives
- `public/worker/notion.mjs` - Materialized belief view
- `public/worker/mind.mjs` - `recall()` returns Notion, `_compute_path_certainty()`

### Core (High Impact) - To Do
- `public/worker/belief.mjs` - Branch tracking, materialization
- `public/worker/state.mjs` - Resolver, perceive, identify, collapse
- `public/worker/convergence.mjs` - Alternative yielding
- `public/worker/subject.mjs` - Resolution index

### Registry (Medium Impact) - To Do
- `public/worker/db.mjs` - @resolution, @acquaintance, @source traits

### Session (Medium Impact) - To Do
- `public/worker/session.mjs` - legacy field, cross-timeline resolution

---

## Success Metrics

1. **3 pending tests pass** (2 deferred to branch lifecycle)
2. Lazy propagation: 1 country update → query NPCs → no cascade
3. Observation: perceive → identify → learn_from working
4. @resolution: convergence, belief, and unknown resolution
5. Timeline: @tracks inheritance with proper fallback

---

## Existing Plan Updates

### `docs/plans/lazy-version-propagation.md`

**Already complete**: Overall 7-phase structure is good.

**Additions needed**:
- Add `get_branch_heads()` API in Phase 6
- Note that Phase 7 should skip branch lifecycle docs

### `docs/plans/observation-events.md`

**Already complete**: perceive/identify/learn_from design.

**Additions needed**:
- Add @source meta-trait registration
- Add @acquaintance meta-trait registration
- Link to combinatorial-explosion-components.md for Trait object design
- Note: recognize_by_traits tests still pending

---

## Deferred Features (for future plan)

These are explicitly marked "Deferred" or "Open - Needs Design Work":

1. **Branch Lifecycle** - pruning, merging, GC
   - Tests: superposition.test.mjs:224, :231

2. **@path_certainty Cache** - skip for v1

3. **Decision Time (dt)** - third temporal dimension

4. **LOD + Minds** - distant mind compression

5. **Contradiction Detection** - Psychology domain (Alpha 4+)
