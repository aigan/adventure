# Trait Inheritance & Reverse Lookup Reference

Reference documentation for trait inheritance (`get_trait`) and reverse trait lookup (`rev_trait`) in the belief system.

## Overview

Beliefs inherit trait values through a prototype chain, similar to JavaScript's prototype inheritance. The system supports both forward lookups (what does this belief reference?) and reverse lookups (what beliefs reference this subject?).

```javascript
// FORWARD: What does this belief reference?
person.get_trait(state, 'location')  // → tavern (Subject)

// REVERSE: What beliefs reference this subject?
tavern.rev_trait(state, location_tt) // → [person, bartender] (Belief[])
```

---

## Quick Start

**Learning the system?** Start with [summary.md](summary.md) for key concepts, then [diagrams.md](diagrams.md) for visual examples.

**Looking for specific behavior?** Check [matrix.md](matrix.md) for forward lookup patterns or [rev-trait-diagrams.md](rev-trait-diagrams.md) for reverse lookup patterns.

**Debugging an issue?** The diagrams show the expected behavior - compare with your actual results.

---

## Core Concepts

### Forward Lookup (get_trait)

Traits are resolved through a breadth-first search of the inheritance chain:

1. **Check own traits** - Direct values set on the belief
2. **Check cache** - If belief is locked, use cached inherited values
3. **Walk bases** - Search archetypes and belief bases
4. **Compose if needed** - Composable arrays merge values from all bases

**Example: Simple Inheritance**
```javascript
// Archetype defines default
Container.traits = { location: 'warehouse' }

// Belief inherits from archetype
chest.bases = ['Container']
chest.get_trait(state, 'location') // → 'warehouse'
```

**Example: Composable Arrays**
```javascript
// Warrior prototype has sword
warrior_proto.inventory = [sword]

// Knight inherits and adds shield
knight.bases = [warrior_proto]
knight.inventory = [shield]  // Triggers composition

knight.get_trait(state, 'inventory') // → [sword, shield]
```

### Reverse Lookup (rev_trait)

Finds all beliefs that reference a given subject through a specific trait. Uses a reverse index maintained in the state chain.

**Example: Direct References**
```javascript
// Multiple NPCs in same location
npc1.location = tavern.subject
npc2.location = tavern.subject

// Query: who's in the tavern?
tavern.rev_trait(state, location_tt) // → [npc1, npc2]
```

**Example: Inherited References**
```javascript
// v1 has location explicitly set
npc_v1.location = tavern.subject

// v2 inherits location from v1 (doesn't set it)
npc_v2.bases = [npc_v1]

// Both appear in reverse lookup
tavern.rev_trait(state, location_tt) // → [npc_v1, npc_v2]
```

---

## Key Behaviors

### Inheritance Rules

1. **Own values shadow inherited values** - Direct trait assignments take precedence
2. **First match wins** - Non-composable traits use the first value found in breadth-first order
3. **Null blocks composition** - Explicit `null` prevents inheriting composable values
4. **Empty arrays compose** - `[]` is additive, not blocking (unlike `null`)

### Composition Rules (composable: true)

1. **Breadth-first collection** - Gather one value from each base's inheritance chain
2. **Subject deduplication** - Array items deduplicated by Subject sid
3. **Stop at first non-null** - Don't search deeper once value is found in a branch

### Reverse Lookup Rules

1. **State-scoped** - Queries only traverse the current state's chain
2. **Includes inherited references** - Inherited trait values appear in reverse lookups
3. **Temporal deduplication** - Only newest version of each subject appears
4. **Skip list optimization** - Efficiently jumps over states with no changes

---

## Reference Files

| File | Purpose | Best For |
|------|---------|----------|
| [summary.md](summary.md) | High-level patterns and examples | Learning the system |
| [diagrams.md](diagrams.md) | Visual inheritance patterns | Understanding how it works |
| [matrix.md](matrix.md) | All 42 forward lookup permutations | Finding specific behavior |
| [rev-trait-diagrams.md](rev-trait-diagrams.md) | Reverse lookup patterns with Convergence | Understanding reverse queries |

---

## Architecture

### Forward Lookup Flow

```
Belief.get_trait(state, traittype)
  ↓
Check own _traits
  ↓ (not found)
Check _cache (if locked)
  ↓ (not cached)
Walk bases (breadth-first)
  ├─ Archetype.get_own_trait_value()
  ├─ Belief.get_own_trait_value()
  └─ Shared Belief.get_own_trait_value()
  ↓
If composable:
  Collect from all bases
  Compose + deduplicate
  Return array
Else:
  Return first match
```

### Reverse Lookup Flow

```
Subject.rev_trait(state, traittype)
  ↓
Queue-based state chain traversal
  ↓
For each state:
  Check _rev_add for (subject, traittype)
  Follow skip pointer to next relevant state
  ↓
Collect all referencing beliefs
Deduplicate by subject.sid (keep newest)
Return array
```

### Key Implementation Files

- `public/worker/belief.mjs` - Inheritance and composition logic
- `public/worker/traittype.mjs` - Type-specific trait resolution
- `public/worker/convergence.mjs` - Multi-parent state composition, polymorphic `rev_base()`
- `public/worker/archetype.mjs` - Archetype-based defaults

---

## Common Patterns

### Pattern: Null Blocking

Use explicit `null` to opt out of inherited composable values:

```javascript
// Warrior has weapons
warrior_proto.inventory = [sword, shield]

// Pacifist rejects weapons
pacifist.bases = [warrior_proto]
pacifist.inventory = null  // Blocks composition

pacifist.get_trait(state, 'inventory') // → null (not [sword, shield])
```

### Pattern: Multi-Parent Composition (Convergence)

Compose knowledge from multiple prototypes:

```javascript
// Villager has farming knowledge
villager_proto.skills = [farming, cooking]

// Blacksmith has crafting knowledge
blacksmith_proto.skills = [smithing, repair]

// VillageBlacksmith composes both
village_blacksmith.bases = [villager_proto, blacksmith_proto]
village_blacksmith.get_trait(state, 'skills')
// → [farming, cooking, smithing, repair]
```

### Pattern: Temporal Evolution with Reverse Lookup

Track changing references over time:

```javascript
// State 1: NPC in tavern
npc_v1.location = tavern.subject
tavern.rev_trait(state1, location_tt) // → [npc_v1]

// State 2: NPC moves to inn
npc_v2.bases = [npc_v1]
npc_v2.location = inn.subject
state2.replace_beliefs(npc_v2)  // Removes v1 from reverse index

tavern.rev_trait(state2, location_tt) // → [] (npc moved)
inn.rev_trait(state2, location_tt)    // → [npc_v2]
```

---

## Edge Cases

### Archetype Defaults Remain as Strings

Archetype default values are not resolved to Subjects when inherited:

```javascript
// Archetype has string default
Container.traits = { location: 'warehouse' }

// Belief inherits
chest.bases = ['Container']
chest.get_trait(state, 'location') // → 'warehouse' (string, not Subject)
```

To get a Subject reference, beliefs must set the trait explicitly.

### Empty Arrays vs Null

Empty arrays compose additively, while null blocks:

```javascript
warrior_proto.inventory = [sword]

// Empty array - still inherits sword
student.bases = [warrior_proto]
student.inventory = []
student.get_trait(state, 'inventory') // → [sword]

// Null - blocks inheritance
pacifist.bases = [warrior_proto]
pacifist.inventory = null
pacifist.get_trait(state, 'inventory') // → null
```

### Convergence and Reverse Lookup

Convergence (multi-parent composition) requires polymorphic `rev_base()`:

```javascript
// VillageBlacksmith has Convergence with multiple component_states
village_blacksmith.mind.state → Convergence([villager_state, blacksmith_state])

// rev_trait must check ALL component states
state.rev_base(subject, traittype)
// Regular State → returns single base state
// Convergence → returns array of component_states
```

---

## Finding Help

- **Unexpected inheritance?** Check [diagrams.md](diagrams.md) for visual explanation
- **Reverse lookup not working?** See [rev-trait-diagrams.md](rev-trait-diagrams.md) for common patterns
- **Understanding archetype defaults?** See [matrix.md](matrix.md) cases 2.2, 4.2, 6.1
- **Need a specific test?** Use `grep` to search test files for the pattern name

---

**Last Updated**: 2025-11-16
