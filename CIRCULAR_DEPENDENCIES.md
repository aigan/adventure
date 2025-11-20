# Circular Dependency Analysis - public/worker/*.mjs

## Summary

There are **CRITICAL CIRCULAR DEPENDENCY CHAINS** in the codebase. The main hub is the **cosmos.mjs ↔ db.mjs** circular pair, which creates a cascading effect through multiple core modules.

---

## Critical Circular Dependency: cosmos.mjs ↔ db.mjs

### The Primary Issue

```
cosmos.mjs ──imports→ db.mjs
     ↑                  │
     └──imports────────┘
```

**cosmos.mjs imports:**
- `db.mjs` (re-exports only: `export { DB }`)

**db.mjs imports:**
- `logos`, `logos_state`, `_reset_singletons` from `cosmos.mjs`
- `eidos`, `_reset_eidos` from `cosmos.mjs`

**Why this matters:** Every module that imports either cosmos or db gets pulled into this cycle.

---

## All Circular Dependency Chains

### Chain 1: cosmos ↔ db (CRITICAL HUB)
```
cosmos.mjs → db.mjs → cosmos.mjs
```
- **cosmos.mjs line 6:** `import * as DB from './db.mjs'`
- **cosmos.mjs line 28:** `import { _reset_logos } from './logos.mjs'` → logos imports db
- **cosmos.mjs line 29:** `import { _reset_eidos } from './eidos.mjs'` → eidos imports logos which imports db
- **db.mjs line 17:** `import { logos, logos_state, eidos, _reset_singletons } from './cosmos.mjs'`

### Chain 2: db → belief → cosmos → db
```
db.mjs → belief.mjs → cosmos.mjs → db.mjs
```
- **db.mjs line 13:** `import { Belief } from './belief.mjs'`
- **belief.mjs line 20:** `import { eidos } from './cosmos.mjs'`
- **cosmos.mjs line 6, 28, 29:** imports db.mjs

### Chain 3: db → subject → cosmos → db
```
db.mjs → subject.mjs → cosmos.mjs → db.mjs
```
- **db.mjs line 12:** `import { Subject } from './subject.mjs'`
- **subject.mjs line 2:** `import { eidos, logos } from './cosmos.mjs'`
- **cosmos.mjs:** imports db.mjs

### Chain 4: db → archetype (DIRECT)
```
db.mjs ↔ archetype.mjs
```
- **db.mjs line 10:** `import { Archetype } from './archetype.mjs'`
- **archetype.mjs line 22:** `import * as DB from './db.mjs'`

### Chain 5: db → mind → cosmos → db
```
db.mjs → mind.mjs → cosmos.mjs → db.mjs
```
- **db.mjs line 15:** `import { Mind } from './mind.mjs'`
- **mind.mjs line 27:** `import * as Cosmos from './cosmos.mjs'`
- **cosmos.mjs:** imports db.mjs

### Chain 6: db → state → cosmos → db
```
db.mjs → state.mjs → cosmos.mjs → db.mjs
```
- **db.mjs line 16:** `import { State } from './state.mjs'`
- **state.mjs line 26:** `import * as Cosmos from './cosmos.mjs'`
- **cosmos.mjs:** imports db.mjs

### Chain 7: db → traittype → cosmos → db
```
db.mjs → traittype.mjs → cosmos.mjs → db.mjs
```
- **db.mjs line 11:** `import { Traittype } from './traittype.mjs'`
- **traittype.mjs line 28:** `import * as Cosmos from './cosmos.mjs'`
- **cosmos.mjs:** imports db.mjs

### Chain 8: db → serialize → cosmos → db
```
db.mjs → serialize.mjs → cosmos.mjs → db.mjs
```
- **db.mjs line 18:** `import { Serialize } from './serialize.mjs'`
- **serialize.mjs line 3:** `import { logos } from './cosmos.mjs'`
- **cosmos.mjs:** imports db.mjs

### Chain 9: logos → mind → cosmos → logos
```
logos.mjs → mind.mjs → cosmos.mjs → logos.mjs
```
- **logos.mjs line 11:** `import { Mind } from './mind.mjs'`
- **mind.mjs line 27:** `import * as Cosmos from './cosmos.mjs'`
- **cosmos.mjs line 28:** `import { _reset_logos } from './logos.mjs'`

### Chain 10: eidos → logos → db → cosmos → eidos
```
eidos.mjs → logos.mjs → db.mjs → cosmos.mjs → eidos.mjs
```
- **eidos.mjs line 19:** `import { logos } from './logos.mjs'`
- **logos.mjs line 14:** `import * as DB from './db.mjs'`
- **db.mjs line 17:** `import { eidos } from './cosmos.mjs'`

### Chain 11: belief ↔ subject (DIRECT)
```
belief.mjs ↔ subject.mjs
```
- **belief.mjs line 21:** `import { Subject } from './subject.mjs'`
- **subject.mjs line 3:** `import { Belief } from './belief.mjs'`

### Chain 12: belief ↔ archetype (DIRECT)
```
belief.mjs ↔ archetype.mjs
```
- **belief.mjs line 18:** `import { Archetype } from './archetype.mjs'`
- **archetype.mjs line 24:** `import { Subject } from './subject.mjs'`
- **subject.mjs line 3:** imports Belief (via cosmos or direct)

### Chain 13: traittype → mind/state/belief (multi-way DIRECT)
```
traittype.mjs ↔ mind.mjs
traittype.mjs ↔ state.mjs
traittype.mjs ↔ belief.mjs
```
- **traittype.mjs line 30:** `import { Mind } from './mind.mjs'`
- **traittype.mjs line 31:** `import { State } from './state.mjs'`
- **traittype.mjs line 32:** `import { Belief } from './belief.mjs'`
- **mind.mjs line 29:** `import { Belief } from './belief.mjs'`
- **state.mjs line 28:** `import { Belief } from './belief.mjs'`
- **belief.mjs line 22:** `import { Traittype } from './traittype.mjs'`

---

## Dependency Graph - Core Modules

```
                    cosmos.mjs ←─────────┐
                   /  |  |  \  \         │
                  /   |  |   \  \        │
                 v    v  v    v  v       │
              logos eidos     [many]    db.mjs
              /  \    |                  │
             v    v   v                  │
           Mind Timeless ───────────────┘
            |
            v
         Belief ←──────────────┐
         /  |  \               │
        v   v   v              │
    Subject Traittype Archetype
       |        |         |
       └────────┴─────────┘

Core Hub: db.mjs (imports ~8 modules, mostly via cosmos)
Problem: Every module using db or cosmos is part of the cycle
```

---

## Impact Analysis

### Modules Involved in Cycles (18 of 20 total)

**Directly in cycles:**
1. cosmos.mjs - HUB
2. db.mjs - HUB
3. logos.mjs - Primordial singleton
4. eidos.mjs - Realm of forms singleton
5. archetype.mjs - **DIRECT cycle with db**
6. belief.mjs - **DIRECT cycle with subject**
7. subject.mjs - **DIRECT cycle with belief**
8. mind.mjs - Core entity type
9. state.mjs - Core entity type
10. traittype.mjs - **MULTI-WAY cycle with mind/state/belief**
11. serialize.mjs - Data persistence
12. union_state.mjs - Composition primitive

**Indirectly in cycles:**
13. channel.mjs - Inspector interface
14. session.mjs - Game session
15. world.mjs - World setup
16. narrator.mjs - Player interface

**Not in cycles (safe):**
17. debug.mjs - Pure utilities
18. id_sequence.mjs - Pure utilities
19. worker.mjs - Entry point (imports Session which imports Traittype)

---

## Root Causes

### 1. Database Registry as Central Hub
**Problem:** `db.mjs` imports almost every class, while those classes also import from db for lookups.

**Example:**
```javascript
// db.mjs
import { Belief } from './belief.mjs'  // Needs to construct Belief

// belief.mjs
import * as DB from './db.mjs'  // Needs to register belief
```

### 2. Cosmos as Re-export Hub
**Problem:** `cosmos.mjs` was meant to be a simple re-export hub, but it imports singletons (logos, eidos) that depend on db.

**Example:**
```javascript
// cosmos.mjs
import { logos } from './logos.mjs'
import { eidos } from './eidos.mjs'

// logos.mjs
import * as DB from './db.mjs'

// db.mjs
import { logos, eidos } from './cosmos.mjs'  // Closes the loop
```

### 3. Class Interdependencies
**Problem:** Core classes need each other at construction time.

**Example:**
```javascript
// belief.mjs
export class Belief {
  constructor(state) {
    const mind = state.in_mind
    const subject = DB.get_or_create_subject(mind)  // Needs DB
    DB.register_belief_by_id(this)  // Needs DB
  }
}

// archetype.mjs
import * as DB from './db.mjs'  // Can't avoid - needs lookups
```

---

## Detection Method Used

Analyzed all 20 `.mjs` files in `public/worker/`:
1. Extracted all `import` statements
2. Built directed dependency graph
3. Identified cycles using depth-first search
4. Categorized by severity:
   - **DIRECT cycles** (A ↔ B): archetype ↔ db, belief ↔ subject
   - **3-node cycles** (A → B → C → A): Multiple variations
   - **Complex cycles** (5+ nodes with multiple paths)

---

## Severity Levels

### CRITICAL
- **cosmos ↔ db**: Blocks module loading order, affects all 18 involved modules
- **archetype ↔ db**: Direct circle, essential classes
- **belief ↔ subject**: Direct circle, fundamental types

### HIGH
- **traittype** connects to mind/state/belief creating multi-way cycles
- **logos/eidos** singletons locked into db via cosmos

### MEDIUM
- Other chains > 3 nodes that provide alternative paths

---

## Recommended Fixes

### Fix 1: Break cosmos ↔ db (HIGHEST PRIORITY)
Separate singleton initialization from cosmos re-exports:
```javascript
// cosmos-singletons.mjs (new file)
export { logos } from './logos.mjs'
export { eidos } from './eidos.mjs'

// cosmos.mjs (no db import)
export { Archetype } from './archetype.mjs'
// ... etc (reexports only, no singletons)

// db.mjs (imports only what needed)
// Don't import singletons directly - lazy init pattern
```

### Fix 2: Break archetype ↔ db (HIGH PRIORITY)
Extract Archetype._registry initialization to break the circle.

### Fix 3: Break belief ↔ subject (HIGH PRIORITY)
One module needs to do forward declaration + lazy binding.

### Fix 4: Reduce traittype complexity (MEDIUM PRIORITY)
The traittype.type_class_by_name map creates a multi-way connection.
Consider lazy initialization or factory pattern.

---

## Files Summary

| File | Lines | Imports | Cycles | Notes |
|------|-------|---------|--------|-------|
| cosmos.mjs | 39 | db, logos, eidos | HUB - 9+ chains | Re-export hub creating main bottleneck |
| db.mjs | 477 | Most modules | HUB - 8+ chains | Central registry, wide dependencies |
| archetype.mjs | 202 | db, traittype, subject | Direct: db ↔ | Fundamental class |
| belief.mjs | 956 | 8 modules | Multi-chain | Core type, imports subject, state |
| subject.mjs | 272 | db, eidos, logos, belief | Direct: belief ↔ | Identity reference |
| mind.mjs | 730 | cosmos, db, belief, state | Multi-chain | Core container type |
| state.mjs | 400+ | cosmos, db, belief, traittype | Multi-chain | Core snapshot type |
| traittype.mjs | 100+ | mind, state, belief, cosmos | Multi-way | Type system hub |
| logos.mjs | 96 | db, mind, timeless | Chain: logos → db | Primordial mind |
| eidos.mjs | 89 | logos, mind, timeless | Chain: eidos → logos → db | Realm of forms |
| serialize.mjs | 189 | cosmos, db, mind | Chain: serialize → cosmos → db | Persistence layer |
| union_state.mjs | 100+ | state, db | Chain: via state → cosmos | State composition |
| timeless.mjs | 76 | db | Clear path (no cycles) | Special state |
| channel.mjs | 280 | db, mind, state, belief | Multi-chain | Inspector interface |
| session.mjs | 125 | traittype | Multi-chain | Game session |
| world.mjs | 100+ | cosmos, db, traittype | Multi-chain | World setup |
| narrator.mjs | 95 | subject | Clear path | Player interface |
| debug.mjs | 163 | None | CLEAR | Pure utilities |
| id_sequence.mjs | 40 | None | CLEAR | Pure utilities |
| worker.mjs | 117 | session, debug | Multi-chain | Entry point |

