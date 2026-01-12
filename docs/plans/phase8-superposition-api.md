# Phase 8: Superposition API

## Dependencies

- **Requires:** Phase 4 (Convergence resolution), Phase 5b (alts)
- **Blocked by:** Phase 5b (alts system)
- **Can parallelize with:** None (depends on Phase 5b)

## Goal

Basic superposition support - query alternatives, get branch heads. **NOT** branch lifecycle (deferred).

## Design

**What this phase includes:**
- Convergence yields alternatives when @uncertainty set
- get_branch_heads() API for tracking active branches
- Basic superposition return format

**What this phase does NOT include (deferred):**
- Branch pruning when observations contradict
- Branch merging when confirmed
- Garbage collection of abandoned branches

**Superposition return format:**
```javascript
{
  type: 'superposition',
  branches: [
    {belief: belief_A, value: 'red', certainty: 0.6},
    {belief: belief_B, value: 'blue', certainty: 0.4}
  ]
}
```

## Components

| Component | Status | Notes |
|-----------|--------|-------|
| Convergence yields alternatives | TODO | Modify get_beliefs() for @uncertainty |
| get_branch_heads() | TODO | New method on State |
| ~~Observation collapse~~ | **DEFERRED** | Branch pruning = branch lifecycle |
| ~~Branch rebasing/merging~~ | **DEFERRED** | Branch lifecycle |

## Files to Modify

- `public/worker/convergence.mjs` - get_branch_heads(), alternative yielding
- `public/worker/state.mjs` - Alternative yielding support

## Tests

| Test | File | Status | Description |
|------|------|--------|-------------|
| SUPER-1 | superposition.test.mjs:217 | TODO | get_branch_heads() returns active branches |
| SUPER-2 | superposition.test.mjs | TODO | Query with @uncertainty returns superposition |
| ~~Observation removes branches~~ | superposition.test.mjs:224 | **DEFERRED** | Branch pruning |
| ~~Merging confirmed branch~~ | superposition.test.mjs:231 | **DEFERRED** | Branch rebasing |

## Verification

- [ ] get_branch_heads() implemented and tested
- [ ] Superposition return works for @uncertainty queries
- [ ] `npm test` passes
- [ ] Deferred tests clearly marked as such

## Notes

- This phase provides the API, not the full branch lifecycle
- Branch lifecycle (pruning, merging, GC) is explicitly deferred to future work
- Key insight: Superposition is about *returning* multiple possibilities, not managing their lifecycle
- Tests at lines 224, 231 are deferred - don't implement yet

## Deferred to Future Work

| Feature | Reason |
|---------|--------|
| Branch pruning | Complex - needs observation system integration |
| Branch merging | Complex - needs careful state management |
| Garbage collection | Performance optimization - not needed for v1 |

See `docs/notes/combinatorial-explosion-components.md` section "Open - Needs Design Work" for branch lifecycle discussion.
