# Trait Inheritance - Visual Diagrams

## Simple Inheritance Patterns

### 1. Linear Inheritance (Shadowing)
```
hammer_v1           hammer_v2           hammer_v3
  color: 'grey' →     color: 'blue' →     color: 'red'
                      ↑ bases             ↑ bases

get_trait(hammer_v3, 'color') → 'red' (own value wins)
```

### 2. Archetype Chain
```
Thing (archetype)
  @about: null
    ↓ bases
ObjectPhysical (archetype)
  location: null
  color: null
    ↓ bases
PortableObject (archetype)
  (no additional traits)
    ↓ bases
hammer (belief)
  color: 'black'

get_trait(hammer, 'location') → null (from ObjectPhysical)
get_trait(hammer, 'color') → 'black' (own value)
```

### 3. Shared Belief Prototype
```
Eidos (shared mind)
  └─ GenericSword (shared belief)
       damage: 10
       weight: 5

Player Mind
  └─ player_sword (belief)
       bases: [GenericSword]
       (inherits damage & weight)

get_trait(player_sword, 'damage') → 10 (from GenericSword)
```

---

## Composable Trait Patterns

### 4. Single Base Composition
```
warrior_proto (shared)
  inventory: [sword]
    ↓ bases
knight (instance)
  inventory: [shield]

COMPOSE: [sword] + [shield] = [sword, shield]
get_trait(knight, 'inventory') → [sword, shield]
```

### 5. Multiple Base Composition
```
warrior_proto          defender_proto
  inventory: [sword]     inventory: [shield]
         ↘             ↙
          knight (instance)
            inventory: [] or undefined

COMPOSE: [sword] + [shield] = [sword, shield]
get_trait(knight, 'inventory') → [sword, shield]
```

### 6. Transitive Composition
```
Villager (archetype)
  inventory: [token]
    ↓ bases
Blacksmith (archetype)
  inventory: [hammer, badge]

COMPOSE: [token] + [hammer, badge] = [token, hammer, badge]
get_trait(Blacksmith, 'inventory') → [token, hammer, badge]
```

---

## Diamond Inheritance Patterns

### 7. Diamond Archetype (Conflict)
```
        Thing
       /    \
   Magical  Physical
   combat:  combat:
  'defensive' 'offensive'
       \    /
      Spellblade
      bases: [Magical, Physical]

Breadth-first: Magical is first → 'defensive' wins
get_trait(Spellblade, 'combat') → 'defensive'
```

### 8. Diamond Composable (Deduplication)
```
        Base
     inventory: [token]
       /    \
     Left    Right
   +[sword]  +[shield]
    /   \   /    \
   /     \ /      \
  /       X        \
 /       / \        \
       Diamond
     bases: [Left, Right]

token appears via 2 paths, but deduplicated
COMPOSE: [token] + [sword] + [token] + [shield]
DEDUP:   [token, sword, shield]
```

### 9. Multi-Level Diamond
```
        A
     trait: 1
       / \
      B   C
    +2   +3
      \ / \
       D   E
      +4  +5
        \ /
         F
       bases: [D, E]

F composition path:
  D: [1, 2, 4]
  E: [1, 3, 5]
  Compose: [1, 2, 4] + [1, 3, 5]
  Dedup: [1, 2, 4, 3, 5]
```

---

## Mixed Inheritance Patterns

### 10. Archetype + Belief Bases
```
Villager (archetype)         guard_proto (shared belief)
  inventory: [token]           inventory: [sword]
         \                    /
          \                  /
           guard (instance)
           bases: ['Villager', guard_proto]

COMPOSE: [token] + [sword] = [token, sword]
```

### 11. Belief Chain Through Shared
```
Tool (shared belief in Eidos)
  durability: 100
    ↓ bases
hammer_v1 (belief in player mind)
  weight: 10
    ↓ bases
hammer_v2 (belief in player mind)
  weight: 12

get_trait(hammer_v2, 'durability') → 100 (from shared Tool)
get_trait(hammer_v2, 'weight') → 12 (own value)
```

---

## Special Blocking Patterns

### 12. Null Blocks Composition (Expected)
```
warrior_proto
  inventory: [sword]
    ↓ bases
pacifist
  inventory: null  ← BLOCKS

Expected: null stops composition
get_trait(pacifist, 'inventory') → null (not [sword])
```

### 13. Empty Array Behavior (Unknown)
```
warrior_proto
  inventory: [sword]
    ↓ bases
stripped
  inventory: []  ← BLOCKS or COMPOSES?

Option A: [] is empty contribution
  COMPOSE: [sword] + [] = [sword]

Option B: [] blocks like null
  RESULT: []
```

### 14. Multi-Base with Null
```
pacifist_proto      warrior_proto
  inventory: null    inventory: [sword]
         \          /
          hybrid
        bases: [pacifist_proto, warrior_proto]

null in one base doesn't block composition from others
get_trait(hybrid, 'inventory') → [sword]
```

---

## Non-Composable Array Pattern

### 15. Non-Composable Array (Shadowing)
```
parent1_proto          parent2_proto
  children: [alice]      children: [bob]
  ↑ composable: false   ↑ composable: false
         \              /
          combined
        bases: [parent1, parent2]

First base wins (breadth-first)
get_trait(combined, 'children') → [alice] (not [alice, bob])
```

---

## Inheritance Resolution Algorithm

### Breadth-First Search for Non-Composable

```
            belief
           /   |   \
          A    B    C  (level 1)
         / \   |   / \
        D   E  F  G   H  (level 2)

Search order: belief → A → B → C → D → E → F → G → H
First defined value wins
```

### Collect-All for Composable

```
            belief
           /   |   \
          A    B    C
  value: [a]  [b]  [c]

For each base, get ONE value (latest in its chain)
Then compose: [a] + [b] + [c] = [a, b, c]
```

---

## Caching Behavior

### 16. Locked vs Unlocked Caching
```
belief (unlocked)
  get_trait() → walk bases, NO CACHE
    ↓
belief.lock()
    ↓
belief (locked)
  get_trait() → walk bases, CACHE result
  get_trait() → return cached (fast path)
```

### 17. Cache Scope
```
belief._cache is PER-BELIEF (not per-state)
  → Only caches when belief.locked = true
  → Caches inherited traits (not own traits)
  → Cleared on unlock (future: if we support unlock)
```

---

## State-Contextual Resolution

### 18. Subject Resolution
```
Time: t=100                Time: t=200
world_mind:                world_mind:
  workshop_v1                workshop_v2
    sid: 50                     sid: 50 (same!)
    color: 'brown'              color: 'blue'

hammer stores: location = Subject(50)

state_at_100.get_belief_by_subject(50) → workshop_v1
state_at_200.get_belief_by_subject(50) → workshop_v2

Same trait value, different resolutions!
```

---

## Scoping Patterns

### 19. Shared Belief Scoping
```
Logos (root)
  └─ Eidos (global shared)
       └─ GlobalProto (ground_mind = Logos)
            ↓ accessible by any mind
       └─ World_1
            └─ WorldProto (ground_mind = World_1)
                 ↓ accessible only by World_1 children
       └─ World_2
            └─ WorldProto (ground_mind = World_2)
                 ↓ accessible only by World_2 children
```

---

## Test Coverage Map

```
Pattern #  | Test Status | File
-----------+-------------+---------------------------
1-3        | ✅ Tested   | test/belief.test.mjs
4-6        | ✅ Tested   | test/composable_*.test.mjs
7          | ⚠️  Partial | Missing conflict test
8-9        | ❌ Missing  | Need diamond dedup test
10         | ❌ Missing  | Need mixed composition
11         | ✅ Tested   | test/belief.test.mjs
12-14      | ❌ Missing  | Need blocking tests
15         | ❌ Missing  | Need non-composable array
16-17      | ✅ Tested   | test/belief.test.mjs
18         | ⚠️  Implicit| Not explicit
19         | ✅ Tested   | test/belief.test.mjs
```

---

## Quick Reference: What Wins?

### Non-Composable Traits
1. **Own value** (if set)
2. **First base** with value (breadth-first)
3. **null** (if not found)

### Composable Traits
1. **Collect** one value from each direct base's chain
2. **Compose** all collected values
3. **Deduplicate** by Subject sid
4. **Return** composed array

### Special Cases
- **null in own**: Blocks composition from bases
- **null in base**: Ignored, other bases still compose
- **[] in own**: Unknown (test needed!)
- **undefined**: Not set, inherit normally

---

## Legend

```
→  Inheritance direction (base → derived)
↓  Downward inheritance
↑  Points to base
/\ Diamond inheritance paths
✅ Fully tested
⚠️  Partially tested
❌ Not tested
```
