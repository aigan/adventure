# Mind Composition Test Plan

**Status**: Complete (All Phases)
**Created**: 2025-11-09
**Completed**: 2025-11-09
**Context**: Mind.compose() implementation complete, comprehensive test coverage added (15 tests across 4 phases)

## Current Test Coverage

### Passing Tests (test/integration.test.mjs)

- ✅ **P1.1**: Multiple bases with mind traits (VillageBlacksmith = Villager + Blacksmith)
  - Tests UnionState composition with knowledge from multiple prototype bases
  - Verifies knowledge from BOTH bases appears in composed mind
  - Checks for deduplication (no duplicate beliefs about same subject)

- ✅ **P1.3**: Empty mind template behavior (override vs inherit)
  - Tests `mind: {}` while inheriting from base with mind
  - Verifies new Mind instance created but state inherits via base chain
  - Confirms knowledge inheritance through state.base

- ✅ **P2.1**: Transitive mind inheritance (depth 2+ state.base chain)
  - Tests Culture → Villager → Player chain
  - Verifies knowledge inheritance through multiple levels
  - Checks state.base chain structure

- ✅ **P2.2**: Overlapping knowledge merging (extending inherited knowledge)
  - Tests child learning new traits about subject known from base
  - Verifies ONE belief with ALL traits (merged, not duplicated)

- ✅ **P2.3**: Complete re-learning (no duplication when re-learning same traits)
  - Tests child trying to learn exact same traits as base
  - Verifies recognition of inherited knowledge

### Skipped Tests

- ⏸️ **P1.2**: Trait override order when bases have overlapping knowledge
  - **Can activate now** - Mind.compose() is implemented
  - Tests UnionState override semantics (last base wins)
  - When both bases have knowledge about same subject with different traits

## Inventory Test Patterns to Mirror

### From test/composable_traits.test.mjs

| Pattern | Status | Mind Equivalent |
|---------|--------|-----------------|
| Transitive inheritance (multiple levels) | ✅ P2.1 | Culture → Villager → Player |
| Deduplication | ✅ P1.1 | Same knowledge in multiple bases |
| to_inspect_view composition | ❌ **MISSING** | Composed mind in to_inspect_view |

### From test/composable_complex.test.mjs

| Pattern | Status | Mind Equivalent |
|---------|--------|-----------------|
| Null blocking | ❌ **MISSING** | `mind: null` blocks composition |
| Empty array composes | ✅ P1.3 | `mind: {}` creates new but inherits via state.base |
| Own trait blocks lookup, creation composes | ❌ **MISSING** | Mind template composes at creation time |
| Temporal evolution (tick 2) | ❌ **MISSING** | Entity gains knowledge via tick_with_traits |
| State branching | ❌ **MISSING** | Composed mind across branched states |
| Deep inheritance + temporal | ❌ **MISSING** | Complex mixed scenario |
| Instance references Eidos shared beliefs | ❌ **MISSING** | Knowledge about shared entities |
| Multiple direct bases | ✅ P1.1 | Two prototypes directly |

## Mind-Specific Edge Cases

### UnionState Structure
1. ❌ **component_states array structure**
   - Verify component_states is frozen array
   - Verify all components are locked
   - Verify order matches bases order

2. ❌ **is_union flag**
   - Verify UnionState has is_union = true
   - Verify regular State has is_union = false/undefined

3. ❌ **Nested UnionStates**
   - A inherits from B+C (UnionState)
   - D inherits from A+E (nested UnionState composition)
   - Verify recursive traversal works

### Mind.state vs Mind.origin_state
4. ❌ **Composed mind uses origin_state**
   - Verify composed_mind.origin_state is UnionState
   - Verify composed_mind.state initially equals origin_state
   - Verify state can be updated independently

### about_state context
5. ❌ **about_state resolution in UnionState**
   - Verify UnionState.about_state passed through
   - Verify beliefs resolved from correct context
   - Test with prototype minds

### Knowledge overlap/conflict
6. ⚠️ **Same subject, different trait sets** - Partially covered by P2.2
   - Villager: workshop[location, tools]
   - Blacksmith: workshop[size, owner]
   - Composed: workshop[location, tools, size, owner]

7. ❌ **Same subject, conflicting trait values**
   - Villager: workshop.size = 100
   - Blacksmith: workshop.size = 500
   - Last base should win (override semantics)

### Theory of Mind
8. ❌ **Mind about another entity's mind**
   - NPC1 has beliefs about NPC2
   - NPC2 has mind
   - NPC1 learns about NPC2's mind

9. ❌ **Composed mind within composed mind**
   - Entity A has composed mind (from B+C)
   - Entity D learns about A
   - D's knowledge references A's composed mind

### Validation
10. ❌ **Parent mind consistency**
    - All component states must be in same parent mind
    - Error case: mixing minds from different parents

11. ❌ **self_subject propagation**
    - Verify UnionState.self equals belief.subject
    - Verify self is Subject instance

## Proposed Test Suite

### Phase 1: Activate & Basic Coverage (HIGH PRIORITY)

**File**: test/composable_mind.test.mjs (NEW)

1. ~~**Activate P1.2**~~ **REMOVED** - Wrong assumption
   - Expected UnionState to deduplicate beliefs by @about
   - Actually: UnionState is just a container, doesn't care about @about
   - If two components have beliefs about same subject, composed mind shows both
   - Merging would require active mental process, not automatic
   - P1.1 already covers composition behavior adequately

2. **Null blocking**
   ```javascript
   Villager: { mind: { tavern: ['location'] } }
   EmptyPerson: { bases: ['Villager'], traits: { mind: null } }
   // Result: EmptyPerson.mind = null (blocks Villager's mind)
   ```

3. **to_inspect_view composition**
   ```javascript
   VillageBlacksmith: { bases: ['Villager', 'Blacksmith'] }
   view = vb.to_inspect_view(state)
   // Verify view shows composed mind with both tavern and workshop
   ```

4. **Own trait creation composition**
   ```javascript
   Villager: { mind: { tavern: ['location'] } }
   Blacksmith: { mind: { workshop: ['location'] } }
   VB: { bases: ['Villager', 'Blacksmith'], mind: { market: ['location'] } }
   // Result: VB mind has tavern + workshop + market
   ```

5. **Composed mind caching** ✨ **PERFORMANCE**
   ```javascript
   VillageBlacksmith: { bases: ['Villager', 'Blacksmith'] }
   const vb = state.get_belief_by_label('VillageBlacksmith')

   // First call creates UnionState and caches Mind
   const mind1 = vb.get_trait(state, 'mind')

   // Second call returns cached Mind (same instance)
   const mind2 = vb.get_trait(state, 'mind')

   expect(mind1).to.equal(mind2)  // Same === reference
   expect(mind1.origin_state).to.equal(mind2.origin_state)  // Same UnionState

   // Different state = different cache entry
   const state2 = state.branch_state(ground_state, 2)
   const mind3 = vb.get_trait(state2, 'mind')
   expect(mind1).to.not.equal(mind3)  // Different instances
   ```

   **Purpose**: Verify that composed minds are cached at Belief level (belief._cache) to avoid recreating UnionState on every access. This is critical for performance when repeatedly accessing composable mind traits.

### Phase 2: Temporal & Structural (MEDIUM PRIORITY)

**File**: test/composable_mind_complex.test.mjs (NEW)

5. **Temporal evolution**
   ```javascript
   // Tick 1: NPC inherits Villager's knowledge (tavern)
   // Tick 2: NPC learns about workshop via tick_with_traits
   // Result: NPC knows about both tavern and workshop
   ```

6. **State branching**
   ```javascript
   // state1 at tt=1, state2 at tt=2 (branched)
   // VB composed mind accessible from both states
   // Verify knowledge consistency across branches
   ```

7. **component_states structure**
   ```javascript
   vb_mind.origin_state.component_states
   // Verify: is frozen array
   // Verify: all locked
   // Verify: order matches bases
   ```

8. **is_union flag**
   ```javascript
   expect(vb_mind.origin_state.is_union).to.be.true
   expect(villager_mind.origin_state.is_union).to.be.undefined
   ```

### Phase 3: Edge Cases (LOWER PRIORITY)

9. **Nested UnionStates**
   ```javascript
   VillageBlacksmith: bases: ['Villager', 'Blacksmith']  // UnionState
   MasterCraftsman: bases: ['VillageBlacksmith', 'Guild']  // Nested
   // Verify recursive composition works
   ```

10. **Conflicting trait values**
    ```javascript
    Villager: { mind: { workshop: { size: 100 } } }
    Blacksmith: { mind: { workshop: { size: 500 } } }
    VB: { bases: ['Villager', 'Blacksmith'] }
    // Result: workshop.size = 500 (last base wins)
    ```

11. **Multiple direct bases (3+)**
    ```javascript
    Entity: { bases: ['Villager', 'Guard', 'Merchant'] }
    // Verify composition from all three sources
    ```

12. **Deep inheritance chain**
    ```javascript
    Culture → Region → Village → Villager → Entity (5 levels)
    // Verify transitive composition through all levels
    ```

### Phase 4: Mind-Specific Validation

**File**: test/integration.test.mjs or test/mind.test.mjs

13. **Parent mind validation**
    ```javascript
    // Try to compose minds from different parent minds
    // Should error or handle gracefully
    ```

14. **self_subject consistency**
    ```javascript
    vb_mind.origin_state.self === vb_belief.subject
    // Verify self is propagated correctly
    ```

15. **about_state propagation**
    ```javascript
    // Prototype mind with about_state = world_state
    // Verify UnionState preserves about_state context
    ```

16. **Read-only composition after lock** ❗ **CRITICAL BUG**
    ```javascript
    // Create shared beliefs with composable mind
    state.add_shared_from_template({
      Blacksmith: { bases: ['Person', 'Villager'], traits: { mind: {...} } }
    })

    // Lock the state (immutable snapshot)
    state.lock()

    // Get a belief that has composable mind from locked state
    const player = state.get_belief_by_label('player')

    // This SHOULD work - it's a READ operation
    const mind = player.get_trait(state, 'mind')

    // Currently FAILS with: "Cannot create state for locked self"
    // Root cause: Mind.compose() creates UnionState for locked belief
    // Solution: Track composition context (read vs mutation)
    ```

    **Issue**: `get_trait()` for composable minds creates `UnionState` instances as part of the read operation, but the "locked self" assertion at state.mjs:130 treats all state creation as mutation. Need to distinguish read-only composition from actual mutations.

    **Discovered**: 2025-01-09 via world.mjs:188 error
    **Status**: Blocking world.mjs execution after state.lock()
    **Priority**: HIGH - affects all locked states with composable minds

## Implementation Order

### Phase 1 ✅ COMPLETE
1. ~~Activate P1.2~~ **REMOVED** - Wrong assumption about deduplication
2. Add null blocking test ✅
3. Add to_inspect_view test ✅
4. Add own trait creation composition test ✅
5. Add composed mind caching test ✅

### Phase 2 ✅ COMPLETE
6. Add component_states structure test ✅
7. Add is_union flag test ✅
8. Add state branching test ✅

### Phase 3 ✅ COMPLETE
9. Add nested UnionStates test ✅
10. Add overlapping knowledge test ✅ (renamed from "conflicting trait values")
11. Add multiple direct bases (3+) test ✅
12. Add deep inheritance chain test ✅

### Phase 4 ✅ COMPLETE
13. Add parent mind validation test ✅
14. Add self_subject consistency test ✅
15. Add about_state propagation test ✅
16. Add read-only composition after lock test ✅

## Related Files
- test/composable_traits.test.mjs - Inventory composition patterns
- test/composable_complex.test.mjs - Complex inventory scenarios
- test/integration.test.mjs - P1.x, P2.x Mind tests
- public/worker/mind.mjs - Mind.compose() implementation
- public/worker/union_state.mjs - UnionState implementation

## Notes
- Mind composition is more complex than inventory due to UnionState
- Theory of mind scenarios are advanced, may be post-Alpha 1
- Serialization (JSON) not tested for inventory either, can skip
- Focus on patterns that ensure correctness and prevent bugs
