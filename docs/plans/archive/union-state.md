# UnionState - Flyweight Composition for Prototype Minds

**Status**: Complete
**Created**: 2025-11-03
**Completed**: 2025-11-09

## Problem

When composing prototypes with mind traits, we need to combine knowledge from multiple base prototypes without copying data.

**Example**: VillageBlacksmith = Villager + Blacksmith

```
Villager prototype (has mind trait)
  └─ villager_mind.state → knows: farming, gossip

Blacksmith prototype (has mind trait)
  └─ blacksmith_mind.state → knows: smithing, metals

VillageBlacksmith = bases: [Villager, Blacksmith]
  └─ village_blacksmith_mind.state → NEEDS beliefs from BOTH states
```

**Current limitation**: `state.base` can only reference ONE state, but composition requires merging beliefs from multiple states.

**Why not multiple bases?**:
- States are event logs with operations (insert, replace, remove)
- Multiple bases create ordering ambiguity: if one base adds a trait and another removes it, which wins?
- Complexity grows with conflicting operations

## Solution: UnionState

A special State subclass that composes multiple component states in a controlled, ordered manner.

### Design

```javascript
class UnionState extends State {
  /**
   * @param {Mind} mind
   * @param {number} tt
   * @param {State[]} component_states - Ordered array of states to compose
   * @param {State} ground_state - Where the belief owning this mind exists
   * @param {Subject|null} self
   * @param {number|null} vt
   */
  constructor(mind, tt, component_states, ground_state, self = null, vt = null) {
    super(mind, tt, null, ground_state, self, vt)  // No base
    this.component_states = component_states  // Ordered array [villager_state, blacksmith_state]
    this.is_union = true
  }

  get_beliefs() {
    // Iterate component_states in order
    // Collect all beliefs, later states can override earlier
    // Returns merged view without copying
  }

  // Restricted operations
  branch_state(ground_state, vt) {
    // UnionState can branch, creating a new state with this union as base
    // The new state can insert/replace, but the union view itself is immutable
    return super.branch_state(ground_state, vt)
  }
}
```

### Trait Resolution Order

**Last wins** (override pattern):
```javascript
const union = new UnionState(mind, tt, [villager_state, blacksmith_state], ground_state)
// Both define 'strength' trait
// blacksmith_state.strength wins (later in array)
```

This matches prototype inheritance semantics where later bases override earlier ones.

### Restrictions

**No delete operations**: UnionState throws error on `remove` operations to avoid ambiguity.

**Allowed operations**:
- `insert`: Add new beliefs
- `replace`: Update existing beliefs (override from component states)

### Example Usage

```javascript
// In Eidos (prototypes)
const eidos = new Mind(logos, 'Eidos')
const eidos_state = eidos.create_state(0, logos_state)

// Create base prototypes
const villager_belief = eidos_state.add_belief_from_template({
  bases: ['Mental'],
  traits: {
    '@label': 'Villager',
    mind: { village_lore: ['all'], farming: ['all'] }
  }
})

const blacksmith_belief = eidos_state.add_belief_from_template({
  bases: ['Mental'],
  traits: {
    '@label': 'Blacksmith',
    mind: { smithing: ['all'], metals: ['all'] }
  }
})

// Composed prototype with UnionState mind
const vb_belief = eidos_state.add_belief_from_template({
  bases: ['Villager', 'Blacksmith'],
  traits: {
    '@label': 'VillageBlacksmith',
    mind: {
      _type: 'UnionMind',  // Special marker
      component_minds: ['Villager.mind', 'Blacksmith.mind']
    }
  }
})

// Mind.resolve_trait_value_from_template() detects UnionMind marker
// Creates UnionState with component states from both minds
```

## Ground State for UnionState

The ground_state is always the state containing the belief that owns this mind trait.

```javascript
// Prototype mind's ground_state (Eidos = realm of forms)
village_blacksmith_mind.state.ground_state = Eidos.origin_state

// Instance mind's ground_state
bob_mind.state.ground_state = world_state  // Where Bob belief exists
```

## Serialization

```javascript
{
  _type: 'UnionState',
  _id: 42,
  tt: 0,
  component_states: [123, 456],  // State IDs in order
  ground_state: 789,
  self: 999,
  vt: 0
}
```

## Open Questions

1. **Conflict resolution**: Should we allow component states to have overlapping beliefs? Or validate no conflicts?
2. **Performance**: Cache merged belief set, or compute on every get_beliefs()?
3. **Mutability**: Can component_states change after creation? Or frozen?
4. **Deep composition**: Can a UnionState be a component of another UnionState?

## Implementation Tasks

- [ ] Create UnionState class extending State
- [ ] Implement get_beliefs() with ordered merging
- [ ] Ensure branch_state() works correctly (union itself is immutable view)
- [ ] Add toJSON() / from_json() for serialization
- [ ] Update Mind.resolve_trait_value_from_template() to detect union patterns
- [ ] Add tests for trait resolution order
- [ ] Add tests for operation restrictions
- [ ] Document in SPECIFICATION.md

## Related

- [Lazy Version Propagation](../lazy-version-propagation.md) - Uses bases to reference sibling group minds
- [Shared Belief Architecture](shared-belief-architecture.md) - Evolution from limbo pattern
