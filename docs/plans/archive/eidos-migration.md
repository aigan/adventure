# Eidos Migration - Eliminate Limbo Pattern

**Status**: Complete
**Created**: 2025-11-03

## Goal

Eliminate the "limbo" pattern where shared beliefs have `in_mind=null` and `origin_state=null`. Instead, all beliefs live in states, including prototypes and archetypes.

## Design

**Eidos** = Platonic realm of forms/prototypes, a Mind child of Logos that holds all universal archetypes.

### Architecture

```
Logos (parent=null) - Ground of being
  ├─ logos_state (ground_state=null) - Primordial state
  │
  ├─ Eidos (parent=Logos) - Realm of forms/prototypes
  │    └─ origin_state (ground_state=logos_state)
  │         └─ All prototypes: Hammer, Tavern, VillageBlacksmith, etc.
  │              └─ Prototype minds with UnionStates for composition
  │
  └─ World (parent=Logos) - Physical reality
       ├─ origin_state (ground_state=logos_state)
       │    └─ Physical entities
       │
       └─ World.group_mind (sibling peer for shared cultural knowledge)
            └─ Cultural beliefs
```

### Key Concepts

**Eidos**: Single global mind for all universal prototypes
- Parent: Logos
- Contains: Archetypes accessible from any world
- Examples: Hammer archetype, Location archetype, VillageBlacksmith template

**World.group_mind**: World-specific shared knowledge
- Parent: World
- Contains: Cultural knowledge, region lore
- Siblings: NPC minds reference via state bases

**Origin State**: Every mind gets an initial state at creation
- Created automatically or explicitly
- Access via `mind.origin_state` property
- Ground for prototype minds

## Migration Path

### Phase 1: Create Eidos

```javascript
// In DB or initialization
const logos = DB.get_logos()  // Singleton
const eidos = new Mind(logos, 'Eidos')
const eidos_origin_state = eidos.create_state(0, DB.get_logos_state())
```

### Phase 2: Update DB.register()

**Current**:
```javascript
// Prototypes created in limbo
Belief.create_shared_from_template(null, def.bases, traits, decider)
// in_mind=null, origin_state=null
```

**After**:
```javascript
// Prototypes created in Eidos
const eidos = DB.get_eidos()
eidos.origin_state.add_belief_from_template({
  bases: def.bases,
  traits: {...traits}
})
// in_mind=eidos, origin_state=eidos.origin_state
```

### Phase 3: Migrate Test Usage

**Current**:
```javascript
const shared = Belief.create_shared_from_template(null, ['Thing'], {...})
```

**After**:
```javascript
const eidos = DB.get_eidos()  // Eidos = realm of forms (child of Logos)
const shared = eidos.origin_state.add_belief_from_template({
  bases: ['Thing'],
  traits: {...}
})
```

### Phase 4: Remove Limbo Support

- Remove `Belief.create_shared_from_template()` method
- Update `in_mind: Mind|null` → `in_mind: Mind` (never null)
- Update `origin_state: State|null` → `origin_state: State` (never null)
- Remove null checks for shared beliefs

## Origin State Pattern

Every mind should have an origin state for prototypes:

```javascript
class Mind {
  constructor(parent_mind, label = null, self = null) {
    // ... existing code ...

    this.origin_state = null  // Set on first create_state()
  }

  create_state(tt, ground_state) {
    const state = new State(this, tt, null, ground_state)

    // Track first state as origin
    if (this.origin_state === null) {
      this.origin_state = state
    }

    return state
  }
}
```

Or explicit property set during creation:
```javascript
const eidos = new Mind(logos, 'Eidos')
eidos.origin_state = eidos.create_state(0, logos_state)
```

## Group Mind Pattern

Each mind can have a peer group mind for shared knowledge:

```javascript
class Mind {
  constructor(parent_mind, label = null, self = null) {
    // ... existing code ...

    this.group_mind = null  // Lazily created or explicit
  }

  get_group_mind() {
    if (!this.group_mind) {
      this.group_mind = new Mind(this.parent, `${this.label}_group`)
      this.group_mind.origin_state = this.group_mind.create_state(0, this.origin_state)
    }
    return this.group_mind
  }
}
```

Access pattern:
```javascript
// NPC uses cultural knowledge
const world = DB.get_world()  // Or however world is accessed
const cultural_state = world.group_mind.origin_state

const npc_state = npc_mind.create_state(100, world_state)
npc_state.base = cultural_state  // Inherits cultural beliefs
```

## Lazy Propagation with Group Minds

NPCs reference sibling group mind states as bases:

```javascript
// Cultural knowledge updates
world.group_mind.origin_state.tick({
  replace: [{belief: country_lore, traits: {season: 'winter'}}]
})
// Creates world.group_mind.state_110

// NPC1 still references origin_state (old knowledge)
npc1_state.base = world.group_mind.origin_state

// NPC2 observes, gets new version
npc2_state.base = world.group_mind.state_110
```

## Implementation Tasks

- [x] Add `DB.get_eidos()` singleton function
- [x] Add `mind.origin_state` property tracking
- [x] Update `DB.register()` to use Eidos instead of limbo
- [x] Migrate test files using `create_shared_from_template(null, ...)`
- [x] Update `is_shared` getter to recognize Eidos beliefs
- [x] Update `get_shared_belief_by_state` to make Eidos beliefs globally accessible
- [ ] Remove null support from `in_mind` type (deferred - keeping backward compatibility)
- [ ] Remove null support from `origin_state` type (deferred - keeping backward compatibility)
- [ ] Remove `Belief.create_shared_from_template()` method (deferred - keeping backward compatibility)
- [ ] Document group_mind pattern (future work)
- [ ] Update SPECIFICATION.md with Eidos architecture (future work)

## Breaking Changes

- `Belief.create_shared_from_template()` removed
- `belief.in_mind` never null
- `belief.origin_state` never null
- All prototypes must be created in Eidos or other mind states

## Migration Strategy

1. **Additive Phase**: Add Eidos alongside limbo (both work)
2. **Deprecation Phase**: Warn on limbo usage, migrate tests
3. **Breaking Phase**: Remove limbo support, enforce non-null

## Related

- [Union State](union-state.md) - Composition for prototype minds
- [Lazy Version Propagation](../lazy-version-propagation.md) - Group mind bases
- [Shared Belief Architecture](shared-belief-architecture.md) - Previous limbo design
