# Trait Operations Pattern - Archive

**Date Archived**: 2025-11-06
**Status**: Deferred - Wrong approach for trait composition
**Reason**: Operations syntax (_call, .append) adds complexity without solving the real problem

## What We Tried

The idea was to use **operation syntax** in archetype trait definitions to compose complex traits (especially Mind) from multiple archetype bases:

```javascript
// Base archetype constructs the mind
Mental: {
  traits: {
    mind: {_call: 'create_from_template'}  // Constructor marker
  }
}

// Extending archetypes add knowledge
Villager: {
  bases: ['Mental'],
  traits: {
    'mind.append': {  // Operation on existing mind
      tavern: ['location'],
      mayor: ['name']
    }
  }
}

Blacksmith: {
  bases: ['Mental'],
  traits: {
    'mind.append': {
      forge: ['location'],
      tools: ['inventory']
    }
  }
}

// Composed NPC inherits both
VillageBlacksmith: {
  bases: ['Villager', 'Blacksmith']
  // Mind should have knowledge from both archetypes
}
```

## Implementation Artifacts

### Removed from Belief Constructor (2025-11-06)

**public/worker/belief.mjs:99-163** - Dynamic props resolution in constructor:
```javascript
    // collect dynamic props
    //log("Resolve dynamic props from prototypes", this);

    //const beliefs = []
    const queue = []
    if (mind !== null) {
      for (const base of this._bases) {
        if (base instanceof Belief) {
          if (base.in_mind === mind) continue
        }
        queue.push(base);
      }
    }

    const ops = []
    const targets = new Set()
    const seen = new Set()
    while (queue.length > 0) {
      const base = queue.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      //log("Consider", base);

      for (const [key, value_in] of base.get_trait_entries()) {
        const [trait, subprop] = key.split(/\.(.+)/)
        if (typeof subprop === 'string') {
          //log("Add op", trait, subprop );
          ops.push({
            key: subprop,
            value: value_in,
            source: base,
          })
          targets.add(trait)
          continue
        }

        if (value_in === null) continue

        let value_out = value_in
        if (value_in._call) {
          //log ("resolve _call", value_in);
          const {_call, ...props} = value_in
          const traittype = Traittype.get_by_label(trait)
          assert(traittype, `Traittype '${trait}' not found for _call constructor pattern`, {trait, _call})
          const ValueClass = Traittype.type_class_by_name[traittype.data_type]
          assert(ValueClass, `No class registered for data type '${traittype.data_type}' (trait: ${trait})`, {trait, data_type: traittype.data_type, _call})
          // @ts-ignore - Dynamic method lookup validated by assert
          const method = ValueClass[_call]
          assert(typeof method === 'function', `Method '${_call}' not found on class for trait '${trait}'`, {trait, _call, ValueClass: ValueClass.name})
          value_out = method(state, this, props)
        }

        if(targets.has(trait) && (typeof value_out.state_data === 'function')) {
          value_out = value_out.state_data(state, this, ops)
        }

        if (value_out !== value_in) {
          this.add_trait(trait, value_out)
          //log("added", trait, value_out)
        }
      }

      queue.push(... base._bases);
    }
```
- **Purpose**: Walked base chain to find `_call` constructors and operations, then executed them
- **Problem**: Constructor should not have side effects like creating Minds
- **Why removed**: Part of failed trait operations approach, never properly worked

### Active Code (Not Currently Used)

**public/worker/belief.mjs:60-66** - parse_trait_key helper:
```javascript
function parse_trait_key(key) {
  const parts = key.split('.')
  return {
    trait: parts[0],
    subprop: parts.slice(1).join('.') || null
  }
}
```
- Used in: `add_trait_from_template()` (line 240), `_collect_operations_from_entries()` (line 90)
- Purpose: Splits trait keys like `'mind.append'` into `{trait: 'mind', subprop: 'append'}`
- Status: Active code but `subprop` result is unused (operation code commented out)

**public/worker/belief.mjs:86-95** - _collect_operations_from_entries helper:
```javascript
function _collect_operations_from_entries(trait_name, entries, source) {
  const operations = []
  for (const [key, value] of entries) {
    const {trait, subprop} = parse_trait_key(key)
    if (trait === trait_name && subprop) {
      operations.push({key: subprop, value, source})
    }
  }
  return operations
}
```
- Used in: `get_trait_data()` (line 343)
- Status: Active but operations array is unused (operation code commented out)

### Commented Out Code

**public/worker/belief.mjs:242-252** - Operation handling in add_trait_from_template:
```javascript
/*
    // If this is an operation (has subprop), store it directly without traittype resolution
    if (subprop) {
      // Operations are stored as-is and collected by get_trait_data()
      // Validate that the base trait can be had
      assert(this.can_have_trait(trait), `Belief can't have trait ${trait}`, {label, trait, belief: this.get_label(), data, archetypes: [...this.get_archetypes()].map(a => a.label)})
      this._traits.set(label, data)
      return
      }
*/
```

**public/worker/belief.mjs:375-407** - Operation processing in get_trait:
```javascript
    return value;
    /* eslint-disable no-unreachable */

    // Everything below this line is UNREACHABLE (early return above)
    let result = value

    // Process constructor marker {_call: 'method_name'}
    if (result && typeof result === 'object' && '_call' in result && !Array.isArray(result)) {
      // ... constructor processing code ...
    }

    // Apply operations (mind.append, etc)
    if (operations.length > 0) {
      // ... operation application code ...
    }
```

### Tests (Skipped)

**test/trait_operations.test.mjs** - 4 skipped tests:
- `constructor marker creates mind via create_from_template`
- `single archetype with mind.append adds cultural knowledge`
- `multiple archetypes compose mind.append operations`
- `mind.append with versioning adds knowledge to existing mind`

### Documentation

**docs/plans/archive/trait-operations-pattern.md** - Original design
**docs/plans/archive/trait-operations-design-problems.md** - Problems discovered
**docs/plans/trait-composition-fixes.md** - Attempts to fix the approach

## Why It Didn't Work

1. **Complexity Without Benefit**: Adding operation syntax (`_call`, `.append`) creates a parallel trait system that's harder to reason about

2. **Wrong Abstraction Level**: The real problem is **prototype composition** (combining knowledge from multiple prototype minds), not trait syntax

3. **Timing Issues**: When do operations execute? During belief construction? After archetype resolution? Creates ordering dependencies

4. **Double-Mind Bug**: Mental archetype with `_call` constructor could create minds unintentionally when learning about Mental entities

5. **Not Actually Needed**: The `about_state` parameter (implemented 2025-11-06) solves the cross-state reference problem more elegantly

## What We Learned

### Real Problem
Prototypes need to **reference beliefs in different states**:
- Villager prototype (in Eidos) needs to know about workshop (in world state)
- This is a **state scoping** problem, not a trait composition problem

### Actual Solution
**about_state parameter** (implemented 2025-11-06):
```javascript
// Create prototype in Eidos that references world beliefs
state.add_shared_from_template({
  Villager: {
    bases: ['Person'],
    traits: {
      mind: {
        workshop: ['location']  // Resolves in about_state (world)
      }
    }
  }
})
// about_state is automatically set to 'state' by add_shared_from_template()
```

This is **simpler and more powerful** than operations syntax.

## Future: When Operations MIGHT Be Useful

Operations syntax could still be valuable for **runtime state modifications**:

```javascript
// NOT for archetype composition (wrong use)
Villager: {
  'mind.append': {...}  // ✗ Wrong
}

// MAYBE for runtime actions/events (future exploration)
player_action = {
  type: 'learn_skill',
  target: npc,
  'skills.add': 'blacksmithing'  // Runtime modification
}
```

**Key insight**: Operations are about **runtime changes**, not **compile-time composition**.

## Better Approach: Convergence

For **prototype composition** (Villager + Blacksmith), the solution is **Convergence**:

```javascript
// Compose multiple mind states without operations syntax
VillageBlacksmith: {
  bases: ['Person'],
  traits: {
    mind: {
      _type: 'UnionMind',
      component_minds: ['Villager.mind', 'Blacksmith.mind']
    }
  }
}
```

See: [docs/plans/union-state.md](../docs/plans/union-state.md)

## Cleanup Status

### ✅ Removed (2025-11-06)
- ✅ **Unreachable code** in `Belief.get_trait()` - All operations processing after `return value;`
- ✅ **Commented-out code** in `add_trait_from_template()` - Operation handling
- ✅ **Commented-out code** in `Belief constructor` (lines 98-164) - Dynamic props resolution
- ✅ **get_trait_data()** method - Completely removed, logic inlined into `get_trait()`
- ✅ **parse_trait_key()** function - No longer needed
- ✅ **_collect_operations_from_entries()** function - No longer needed
- ✅ **get_class_by_name()** function - Removed (was just wrapper for Traittype.type_class_by_name)

**Result**:
- `Belief.get_trait()` is now simple and direct - walks inheritance chain, returns value or null
- `Belief constructor` is clean - no side effects, just sets up properties
- **~150 lines of dead/unused code removed** from belief.mjs
- No operations processing anywhere in the codebase

### ✅ Archived Tests (2025-11-06)
- ✅ **Moved test file** - `test/trait_operations.test.mjs` → `lab/archive/trait_operations.test.mjs`
  - 4 skipped tests, 0 active tests
  - Tests for: constructor markers (_call), mind.append operations, trait composition
  - All tests were already skipped - never worked

### Keep (Historical Reference)
- ✅ **docs/plans/archive/trait-operations-*.md** - Design history
- ✅ **This archive** - Summary and lessons learned
- ✅ **Git history** - Full implementation attempts

### Already Updated
- ✅ **CURRENT.md** - Removed trait operations from backlog (2025-11-06)
- ✅ **All 212 tests passing** - Cleanup didn't break anything!

## References

- **Implemented solution**: about_state parameter (public/worker/state.mjs, belief.mjs, mind.mjs)
- **Original plans**: docs/plans/archive/trait-operations-*.md
- **Test artifacts**: test/trait_operations.test.mjs (4 skipped tests)
- **Future direction**: docs/plans/union-state.md
