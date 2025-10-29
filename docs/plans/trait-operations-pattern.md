# Trait Operations Pattern - Composable Knowledge via Delegation

**Goal**: Enable archetype-based composition of complex traits (like `mind`) through operation delegation to value classes.

**Related**:
- CURRENT.md backlog - "Shared States" and "Mind Template Syntax"
- docs/plans/shared-belief-architecture.md - Similar composition needs
- test/declarative_mind_state.test.mjs - Current mind initialization pattern

## Context

Currently, NPCs with multiple archetype bases can't easily compose their cultural knowledge:

```javascript
// Archetypes define pieces
Villager: {
  mind: {tavern: ['location'], mayor: ['name']}
}

Blacksmith: {
  mind: {forge: ['location'], tools: ['inventory']}
}

// NPC inherits both - which mind value wins?
blacksmith_npc: {
  bases: ['Villager', 'Blacksmith']
  // Currently: First base's 'mind' trait shadows the other
  // Desired: Combine knowledge from both
}
```

**Problem**: Traits follow shadow semantics (first match wins). We need **composition** for knowledge while keeping shadow semantics for simple traits.

## Design Principles

1. **Delegation over merging** - Value classes control their own composition logic
2. **Two-step process** - Construction, then modification via operations
3. **No automatic merging** - Traits still replace/shadow by default
4. **Sub-property syntax** - Operations expressed as `trait.operation` in archetypes
5. **Extensible** - Pattern works for any class, not just Mind

## Architecture Overview

### Trait Sub-Properties

Archetypes can specify operations on traits using dotted notation:

```javascript
Mental: {
  mind: {_call: 'create'}  // Base value - constructor marker
}

Villager: {
  mind.append: {                // Operation on 'mind' trait
    tavern: ['location'],
    mayor: ['name']
  }
}

Blacksmith: {
  mind.append: {                // Another operation
    forge: ['location'],
    tools: ['inventory']
  }
}

// NPC composition
blacksmith_npc: {
  bases: ['Mental', 'Villager', 'Blacksmith']
}
```

### Resolution Flow

When `belief.get_trait('mind', state)` is called:

**Step 1: Collect sub-properties** (breadth-first search through bases)
```javascript
operations = [
  {key: 'append', value: {tavern: [...], mayor: [...]}, source: Villager},
  {key: 'append', value: {forge: [...], tools: [...]}, source: Blacksmith}
]
```

**Step 2: Find base value**
```javascript
base_value = {_call: 'create'}  // From Mental archetype
```

**Step 3: Construction** (if base value has `_call` marker)
```javascript
const traittype = Traittype.get_by_label('mind')
const ValueClass = get_class_by_name(traittype.data_type)  // Mind
value = ValueClass.create(state)  // Invoke factory method
```

**Step 4: Modification** (if operations exist)
```javascript
if (operations.length > 0) {
  value = value.state_data(state, operations)
}
```

**Step 5: Cache and return**
```javascript
belief._traits.set('mind', value)
return value
```

## Implementation Contract

### Constructor Marker: `{_call: 'create'}`

Indicates this trait should be constructed by calling a static factory method:

```javascript
// In archetype
Mental: {
  mind: {_call: 'create'}
}

// In traittype
traittypes: {
  mind: {
    data_type: 'Mind'  // Specifies which class
  }
}

// Invokes: Mind.create(state)
```

**Properties in constructor marker** are passed to factory:
```javascript
// Archetype with config
Mental: {
  mind: {_call: 'create', default_tick: 1}
}

// Invokes: Mind.create(state, {default_tick: 1})
```

### Factory Method: `ValueClass.create(state, props)`

Static method for constructing fresh instances:

```javascript
class Mind {
  static create(state, props = {}) {
    // state = belief's state context (becomes ground_state for new mind)
    // props = any additional properties from constructor marker

    const mind = new Mind(state.in_mind)  // parent_mind from state
    const initial_state = new State(
      mind,
      props.default_tick ?? 1,
      state,           // ground_state
      null             // self (would come from belief.subject)
    )
    initial_state.lock()
    return mind  // Empty mind with one empty locked state
  }
}
```

### Modification Method: `instance.state_data(state, operations)`

Instance method for applying operations (creates new state):

```javascript
class Mind {
  state_data(state, operations) {
    // state = current belief's state context
    // operations = [{key: string, value: any, source: Belief}, ...]

    // Create new state for this mind
    const latest = [...this.states_valid_at(state.timestamp)][0]
    const new_state = new State(
      this,
      latest.timestamp + 1,  // Next tick
      state,                  // ground_state
      this.self               // Preserve self reference
    )

    // Process operations
    for (const {key, value, source} of operations) {
      if (key === 'append') {
        // Append operations add knowledge
        for (const [label, trait_names] of Object.entries(value)) {
          const belief = state.get_belief_by_label(label)
          if (belief) {
            new_state.learn_about(belief, trait_names)
          }
        }
      }
      // Future: 'remove', 'replace', etc.
    }

    new_state.lock()
    return this  // Returns self, new state created as side effect
  }
}
```

## Usage Examples

### Basic Composition

```javascript
// Setup world entities
const world_state = world_mind.create_state(100)
world_state.add_belief({label: 'tavern', bases: ['Location'], ...})
world_state.add_belief({label: 'forge', bases: ['Location'], ...})
world_state.lock()

// Create NPC with composed knowledge
const blacksmith = world_state.add_belief({
  label: 'blacksmith_npc',
  bases: ['Mental', 'Villager', 'Blacksmith'],  // Composes all three
  traits: {
    // mind trait is constructed + modified automatically
  }
})

// Result: blacksmith has mind with state containing beliefs about:
// - tavern (from Villager)
// - mayor (from Villager)
// - forge (from Blacksmith)
// - tools (from Blacksmith)
```

### Versioning with Operations

```javascript
// Later tick: Blacksmith learns about new tool
const blacksmith_v2 = belief.with_traits(state_200, {
  'mind.append': {
    new_hammer: ['location', 'quality']
  }
})

// Result: blacksmith_v2.mind has new state at tick 201 with
// all previous knowledge PLUS belief about new_hammer
```

### Custom Override

```javascript
// NPC overrides inherited knowledge structure
const unique_npc = world_state.add_belief({
  label: 'unique_npc',
  bases: ['Mental', 'Villager'],
  traits: {
    mind: {_call: 'create'},  // Ignore Villager's mind.append
    'mind.append': {
      // Define own knowledge set
      secret_location: ['coordinates']
    }
  }
})
```

## Sub-Property Syntax

### Traittype Responsibility

Traittype must split trait labels from sub-properties:

```javascript
// Input from archetype
'mind.append': {tavern: ['location']}

// Split into:
{
  trait: 'mind',
  subprop: 'append',
  value: {tavern: ['location']}
}
```

**No special traittype config needed** - the Mind class handles all semantics.

### Parser Logic

```javascript
function parse_trait_key(key) {
  const parts = key.split('.')
  return {
    trait: parts[0],
    subprop: parts.slice(1).join('.') || null
  }
}

// Examples:
parse_trait_key('mind')           // {trait: 'mind', subprop: null}
parse_trait_key('mind.append')    // {trait: 'mind', subprop: 'append'}
parse_trait_key('mind.foo.bar')   // {trait: 'mind', subprop: 'foo.bar'}
```

## Modified get_trait() Behavior

### Current Behavior
```javascript
get_trait(name) {
  // Check own traits
  if (this._traits.has(name)) return this._traits.get(name)

  // Walk bases, return first match
  for (const base of this._bases) {
    const value = base.get_trait(name)
    if (value !== null) return value
  }

  return null
}
```

### New Behavior (Pseudocode)
```javascript
get_trait(name, state) {
  const operations = []
  let base_value = undefined

  // Check own traits first
  const own_value = this._traits.get(name)
  if (own_value !== undefined) {
    base_value = own_value
  }

  // Collect sub-properties from own traits
  for (const [key, value] of this._traits.entries()) {
    const {trait, subprop} = parse_trait_key(key)
    if (trait === name && subprop) {
      operations.push({key: subprop, value, source: this})
    }
  }

  // If no base value yet, search bases (breadth-first)
  if (base_value === undefined) {
    for (const base of get_prototypes(this)) {
      const base_trait = base.get_trait(name)
      if (base_trait !== undefined) {
        base_value = base_trait
        break  // Found base value, stop
      }

      // Collect operations from this base
      for (const [key, value] of base._traits?.entries() || []) {
        const {trait, subprop} = parse_trait_key(key)
        if (trait === name && subprop) {
          operations.push({key: subprop, value, source: base})
        }
      }
    }
  }

  // If still no value, return null
  if (base_value === undefined) return null

  // Process constructor marker
  if (is_constructor_marker(base_value)) {
    const traittype = Traittype.get_by_label(name)
    const ValueClass = get_class_by_name(traittype.data_type)
    base_value = ValueClass.create(state, base_value)
  }

  // Apply operations if any
  if (operations.length > 0 && typeof base_value.state_data === 'function') {
    base_value = base_value.state_data(state, operations)
  }

  // Cache and return
  this._traits.set(name, base_value)
  return base_value
}
```

## Open Questions

### 1. Operation Semantics

**Question**: What operations should be supported beyond `append`?

**Options**:
- `append` - Add to collection
- `remove` - Remove from collection
- `replace` - Override specific keys
- `merge` - Deep merge objects
- Custom per class?

**Current**: Start with `append` only, add others as needed.

### 2. Operation Order

**Question**: Does order of operations matter?

```javascript
// If both archetypes specify mind.append for same subject:
Villager: {mind.append: {tavern: ['location']}}
Blacksmith: {mind.append: {tavern: ['owner']}}

// Should this:
// A) Union trait lists: tavern → ['location', 'owner']
// B) Last wins: tavern → ['owner']
// C) Error (conflict)?
```

**Current**: Operations include `source` for conflict resolution. Mind class can decide.

### 3. Self Reference

**Question**: How does Mind.create() get `self` subject?

```javascript
// Need self for: new State(mind, tick, ground_state, self)
// Where does self come from?

// Option A: Pass from belief
Mind.create(state, props, belief.subject)

// Option B: Set after construction
mind = Mind.create(state, props)
mind.self = belief.subject

// Option C: Set during state_data()
// self comes from operations or context
```

**Current**: Needs investigation. Likely Option A.

### 4. Caching Strategy

**Question**: When to cache computed values?

```javascript
// Current approach: Cache after computation
this._traits.set('mind', computed_mind)

// But what if:
// - state changes (new tick)?
// - operations change (new version)?
// - ground_state changes?
```

**Considerations**:
- Traits are immutable once set on belief
- New versions create new beliefs
- Cached value is correct for that belief's lifetime

**Current**: Cache is safe. Each belief version has its own trait cache.

### 5. Type Safety

**Question**: How to ensure value classes implement required methods?

```javascript
// Need both:
static create(state, props)
state_data(state, operations)

// Options:
// A) Document contract (current)
// B) Interface/protocol checking
// C) Runtime validation
```

**Current**: Document contract, validate at runtime with helpful errors.

## Implementation Phases

### Phase 1: Basic Pattern (append only)
- [ ] Update Traittype to parse sub-properties
- [ ] Modify Belief.get_trait() to collect operations
- [ ] Add Mind.create() static factory
- [ ] Add Mind.state_data() modifier
- [ ] Add constructor marker detection
- [ ] Tests for basic composition

### Phase 2: Operation Semantics
- [ ] Define operation types (append, remove, replace)
- [ ] Update Mind.state_data() to handle all types
- [ ] Handle operation conflicts (same subject, different values)
- [ ] Tests for each operation type

### Phase 3: Other Value Classes
- [ ] Document pattern for custom classes
- [ ] Examples for non-Mind traits
- [ ] Tests showing extensibility

### Phase 4: Integration
- [ ] Update archetype definitions to use pattern
- [ ] Update world.mjs examples
- [ ] Performance testing (caching effectiveness)

## Success Criteria

1. **Composability**: NPCs can inherit knowledge from multiple archetypes
2. **No automatic merging**: Default shadow semantics preserved
3. **Class delegation**: Value classes control their composition
4. **Extensible**: Pattern works for any trait type
5. **Clean syntax**: Sub-property notation is intuitive
6. **Performance**: Caching prevents redundant computation
7. **Tests pass**: Full coverage of composition scenarios

## Notes

### Why Not Automatic Merging?

Automatic trait merging (union all bases) would:
- Break backward compatibility
- Require complex merge rules per type
- Hide composition logic from value classes
- Make versioning/branching harder

**Delegation pattern** is cleaner:
- Explicit operations (`mind.append`)
- Value class controls semantics
- Works for both construction and modification
- Supports versioning naturally

### Why {_call: 'create'} Instead of Class Reference?

JSON-compatible templates can't store class references directly:
```javascript
// Can't do this in JSON:
Mental: {
  mind: Mind  // Not serializable
}

// But can do:
Mental: {
  mind: {_call: 'create'}  // Serializable marker
}
```

Traittype registry (`data_type: 'Mind'`) provides the class mapping.

### Relationship to Shared Beliefs

**Shared beliefs**: Prototype-based inheritance (lazy resolution)
**Trait operations**: Composition-based initialization (eager execution)

**Orthogonal concerns**:
- Shared beliefs define WHAT entities are (inherited properties)
- Trait operations define WHAT to initialize (composed knowledge)

**Can work together**:
```javascript
// Shared belief defines Person prototype
const person_proto = Belief.create_shared_from_template(world_mind, ['Actor'], {
  '@timestamp': 100,
  '@label': 'PersonPrototype',
  age_range: '20-80'
})

// Trait operation uses shared belief as base
Villager: {
  bases: ['PersonPrototype'],  // Inherit from shared belief
  mind.append: {               // Add cultural knowledge
    village: ['location', 'population']
  }
}
```

## Future Enhancements

### Conditional Operations

```javascript
Warrior: {
  'mind.append': {
    armory: ['location'],
    weapon_rack: {
      traits: ['inventory'],
      if: 'rank >= 5'  // Conditional inclusion
    }
  }
}
```

### Parameterized Templates

```javascript
Mental: {
  mind: {
    _call: 'create',
    memory_capacity: 100,  // Constructor parameter
    learning_rate: 0.8
  }
}
```

### Validation

```javascript
Mind.state_data(state, operations) {
  // Validate operations before applying
  for (const op of operations) {
    assert(op.key in VALID_OPERATIONS, `Invalid operation: ${op.key}`)
  }
  // ... apply
}
```
