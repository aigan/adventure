# Mind Extension via State Base Inheritance

**Status**: ✅ Complete (2025-01-08)

**Problem**: When a belief with a mind template inherits from another belief with a mind, the new mind replaces the inherited one, losing cultural knowledge.

**Example**:
```javascript
Villager: {
  mind: {
    workshop: ['location'],  // Knows workshop location
    hammer: ['color']         // Knows hammer color
  }
}

player: {
  bases: ['Villager'],
  mind: {
    hammer: ['location']      // Should ADD to Villager knowledge
  }
}
```

**Current Behavior**:
- Player gets new Mind that REPLACES Villager's Mind
- Player loses workshop location and hammer color knowledge

**Solution**: State base inheritance for cultural knowledge
- Player gets their own Mind instance (not shared)
- Player's Mind.State has Villager's Mind.State as its base
- Knowledge accessed through State.base chain
- Each NPC has independent Mind but shares cultural knowledge via state bases

**Implementation Steps**:

1. **Modify Mind creation from template** (likely in `Traittype.mjs` or `Mind.mjs`)
   - When resolving `mind: {template}` trait
   - Check if belief inherits a Mind via `belief.get_trait(state, 'mind')`
   - If inherited Mind exists:
     - Create new Mind instance for this belief
     - Get inherited Mind's State
     - Create new Mind's State with inherited State as BASE
     - Add template beliefs to new State
   - If no inherited Mind: current behavior (create Mind with fresh State)

2. **Adjust asserts** as needed for:
   - State.base from different Mind than current Mind
   - Using locked States as bases
   - ground_state vs base interactions

3. **Test** with existing diagnostic in `tools/test_world.mjs` to verify:
   - Player has own Mind ✓
   - Player's Mind knows hammer location (from template) ✓
   - Player's Mind knows workshop location + hammer color (from Villager via base) ✓

**Files to modify**:
- `public/worker/traittype.mjs` (or Mind.mjs - wherever mind template resolution happens)
- Possibly `public/worker/state.mjs` (assert adjustments)
- `public/worker/mind.mjs` (if state creation needs changes)

**Why State.base instead of Mind.parent**:
- Mind.parent is for world hierarchy (world mind → player mind)
- State.base is for knowledge inheritance (shared cultural state → individual state)
- Multiple NPCs can each have their own Mind with states based on shared cultural state
- Prevents shared mutable state between different NPC instances
