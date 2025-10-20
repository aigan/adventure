# Prototypes

## Purpose

Prototypes are shared belief templates that enable the flyweight pattern - allowing multiple beliefs across different minds to inherit common structure and data without violating mind isolation rules.

## Structure

Prototypes are beliefs that live in a special `prototypes`. They never have states (no timeline) and serve purely as templates for other beliefs to reference via `bases`.

### Unified Composition via Bases

Beliefs use `bases` as the single composition mechanism. The `bases` property can reference:

1. **Other beliefs** - For versioning and trait inheritance within a mind
2. **Prototypes** - Shared templates from prototypes
3. **Archetype objects** - Type definitions for constraints and methods

Beliefs do NOT have an `archetypes` property. Instead, archetypes are inferred by walking the `bases` chain and collecting:
- Archetype objects directly in bases
- The `archetype` property from prototypes
- Recursively through the entire chain

### Resolution Order

When resolving a string reference in `bases` during belief creation:

1. Check own mind's `belief_by_label`
2. Check `prototypes.belief_by_label`
3. Check archetype registry
4. Throw error if not found

At runtime, these are all direct object references.

## Examples

### Actor Self-Concept

Actors (player, NPCs) share a common structure for self-knowledge:

```javascript
prototypes.beliefs = {
  actor_self: {
    bases: [Person]  // archetype reference
  }
}

player_mind.beliefs = {
  self: {
    bases: [actor_self],
    about: player_entity,
    traits: {location: workshop}
  }
}

npc_mind.beliefs = {
  self: {
    bases: [actor_self],
    about: npc_entity,
    traits: {location: market}
  }
}
```

### Blackbough Residents (Cultural Knowledge)

This example demonstrates recursive prototypes representing shared community knowledge:

```javascript
prototypes.beliefs = {
  blackbough_resident: {
    bases: [Person],
    traits: {
      home_location: 'blackbough',
      mind: [hanna_common_knowledge, niellen_common_knowledge]
    }
  },
  
  hanna_common_knowledge: {
    bases: [blackbough_resident],  // inherits the shared mind
    traits: {
      name: 'Hanna',
      spouse: niellen_common_knowledge
    }
  },
  
  niellen_common_knowledge: {
    bases: [blackbough_resident],  // inherits the shared mind
    traits: {
      name: 'Niellen',
      spouse: hanna_common_knowledge,
      occupation: 'hunter'
    }
  }
}

// Any villager inheriting from blackbough_resident
glenna_mind.beliefs = {
  hanna: {bases: [hanna_common_knowledge]},
  niellen: {bases: [niellen_common_knowledge]}
}

blacksmith_mind.beliefs = {
  hanna: {bases: [hanna_common_knowledge]},
  niellen: {bases: [niellen_common_knowledge]}
}
```

Key aspects:
- Hanna and Niellen reference each other as spouses
- Both inherit minds containing knowledge about both of them
- Any resident gets the entire interconnected knowledge graph
- Represents cultural knowledge that exists independent of world entities

### Workshop Knowledge

Simple shared structure between world and character minds:

```javascript
prototypes.beliefs = {
  workshop: {
    bases: [Location]
  }
}

world_mind.beliefs = {
  workshop: {
    bases: [workshop],  // prototype
    traits: {/* actual world properties */}
  }
}

player_mind.beliefs = {
  workshop_knowledge: {
    bases: [workshop],  // same prototype
    about: world.workshop,
    traits: {visited: true}
  }
}
```

## Benefits

1. **Memory efficiency** - Shared structure stored once
2. **Consistency** - Changes to prototypes affect all derived beliefs
3. **Mind isolation** - Beliefs can share structure without accessing parent/sibling minds
4. **Cultural knowledge** - Represents "what everyone knows" separate from world truth
5. **Nested minds** - Child minds inherit appropriate knowledge without mixing levels

## Implementation Notes

- Prototypes are created before any other beliefs
- The `mind` trait type accepts lists of beliefs as input to Mind constructor
- Recursive references in prototypes are intentional and supported
- Prototypes can reference other prototypes via `bases` for composition
