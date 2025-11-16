# Reverse Trait Lookup (rev_trait) - Visual Diagrams

## Overview

Visual explanations of how `rev_trait()` works across different scenarios. Each diagram shows both the forward reference structure and the reverse lookup query.

**Legend**:
```
[Belief]    - Belief object
(Subject)   - Subject being queried
trait:      - Trait name
→           - Forward reference (get_trait)
←           - Reverse lookup (rev_trait)
```

---

## Diagram 1: Basic Direct Reference

```
Forward: Who does person reference?
Reverse: Who references tavern?

State 1:
┌────────┐ location: tavern.subject  ┌────────┐
│ person │────────────────────────→  │(tavern)│
└────────┘                           └────────┘
                                         ↑
                                         │ rev_trait(state1, location_tt)
                                         │
                                      [person]
```

**Code**:
```javascript
// Forward lookup
person.get_trait(state1, location_tt) // → tavern (Subject)

// Reverse lookup
tavern.rev_trait(state1, location_tt) // → [person] (Belief[])
```

**Reverse Index**:
```
state1._rev_add:
  tavern → location → [person]
```

---

## Diagram 2: Multiple References (Same Trait)

```
Multiple beliefs reference same subject via same trait

State 1:
┌──────────┐ location
│bartender │──────┐
└──────────┘      │
                  ↓
┌──────────┐   ┌────────┐
│ patron1  │──→│(tavern)│←── rev_trait(state1, location_tt)
└──────────┘   └────────┘
                  ↑           Result: [bartender, patron1, patron2]
┌──────────┐      │
│ patron2  │──────┘
└──────────┘ location
```

**Reverse Index**:
```
state1._rev_add:
  tavern → location → [bartender, patron1, patron2]
```

---

## Diagram 3: Array Trait (Multiple Subjects)

```
Single belief references multiple subjects in one trait

State 1:
            witnesses: [alice.subject, bob.subject]
┌───────┐   ┌─────────┐   ┌─────────┐
│ crime │──→│ (alice) │   │  (bob)  │
└───────┘   └─────────┘   └─────────┘
               ↑               ↑
               │               │ rev_trait(state1, witnesses_tt)
               └───────┬───────┘
                    [crime]
```

**Code**:
```javascript
// crime.witnesses = [alice.subject, bob.subject]
alice.rev_trait(state1, witnesses_tt) // → [crime]
bob.rev_trait(state1, witnesses_tt)   // → [crime]
```

**Reverse Index**:
```
state1._rev_add:
  alice → witnesses → [crime]
  bob → witnesses → [crime]
```

---

## Diagram 4: State Chain with Skip Pointers

```
Skip list optimization jumps directly to states with changes

State Chain:
State 1: person.location = tavern
State 2: (no changes)
State 3: (no changes)
State 4: person.location = bedroom
State 5: (no changes)

Skip List Structure:
┌────────┐     ┌────────┐     ┌────────┐
│ State5 │────→│ State4 │────→│ State1 │
└────────┘     └────────┘     └────────┘
   no changes    bedroom        tavern
                    ↑              ↑
                    │              │
                _rev_base      _rev_base
                 pointer        pointer

Query: tavern.rev_trait(state5, location_tt)
1. Check state5._rev_add[tavern][location] → empty
2. Check state5._rev_del[tavern][location] → empty
3. Jump via _rev_base pointer → state4
4. Check state4._rev_del[tavern][location] → [person] (removed!)
5. Mark person as seen (deleted)
6. Jump via _rev_base pointer → state1
7. Check state1._rev_add[tavern][location] → [person]
8. person already in seen (deleted) → skip
9. state1 has no _rev_base pointer → done
Result: [] (person was removed in state4)
```

**Key Insight**: Skip list jumps over states 2, 3, 5 instantly!

---

## Diagram 5: UnionState Traversal

```
UnionState has multiple component_states to search

World State:
┌─────────┐ location: tavern  ┌────────┐
│ tavern  │←──────────────────│knowledge│
└─────────┘                   │ belief  │
                              └────────┘
                                  ↑
                                  │ Lives in...
VillageBlacksmith Mind State (UnionState):
┌──────────────────────────────────────┐
│ component_states = [                  │
│   villager_mind_state,  ← contains knowledge about tavern
│   blacksmith_mind_state ← contains knowledge about forge
│ ]                                     │
└──────────────────────────────────────┘

Query: tavern.rev_trait(vb_mind_state, location_tt)
1. Start with vb_mind_state (UnionState)
2. Call vb_mind_state.rev_base(tavern, location_tt)
3. UnionState.rev_base() checks EACH component:
   - villager_mind_state.rev_base(tavern, location_tt) → [villager_origin_state]
   - blacksmith_mind_state.rev_base(tavern, location_tt) → []
4. Queue both results
5. Search villager_origin_state for _rev_add[tavern][location]
6. Find knowledge_belief
Result: [knowledge_belief]
```

**Before UnionState Fix (BROKEN)**:
```
rev_trait would try current.base
  ↓
UnionState.base = null
  ↓
Traversal stops! → returns []
```

**After UnionState Fix (WORKS)**:
```
rev_trait calls current.rev_base()
  ↓
UnionState.rev_base() returns array of component next states
  ↓
Traversal continues through all components → returns [knowledge_belief]
```

---

## Diagram 6: Nested UnionState

```
UnionState containing another UnionState as component

Components:
┌──────────────────┐
│ Villager Mind    │ → knows about tavern
└──────────────────┘

┌──────────────────┐
│ Blacksmith Mind  │ → knows about forge
└──────────────────┘

First Composition (VillageBlacksmith):
┌────────────────────────────────┐
│ VillageBlacksmith Mind (Union) │
│ components: [Villager,         │
│              Blacksmith]       │
└────────────────────────────────┘

┌──────────────────┐
│ Guild Mind       │ → knows about guild_hall
└──────────────────┘

Second Composition (MasterCraftsman):
┌────────────────────────────────────┐
│ MasterCraftsman Mind (Nested Union)│
│ components: [VillageBlacksmith,    │  ← This is already a Union!
│              Guild]                │
└────────────────────────────────────┘

Query: tavern.rev_trait(master_mind_state, location_tt)
1. master_mind_state.rev_base() iterates components
2. Finds VillageBlacksmith (UnionState)
3. Recursively calls VillageBlacksmith.rev_base()
4. VillageBlacksmith iterates ITS components
5. Finds Villager mind state
6. Searches Villager mind for tavern knowledge
Result: [tavern_knowledge_belief]
```

**Traversal Path**:
```
Master
  ├─ VillageBlacksmith (nested union!)
  │    ├─ Villager ← Found!
  │    └─ Blacksmith
  └─ Guild
```

---

## Diagram 7: Inherited Reference (POTENTIAL BUG!)

```
v2 inherits location from v1 without setting it explicitly

State 1:
┌────────┐ _traits.set(location, tavern)  ┌────────┐
│ npc_v1 │────────────────────────────→   │(tavern)│
└────────┘                                 └────────┘
    ↑                                         ↑
    │                                         │ rev_add
    │                                         │
origin_state._rev_add[tavern][location] = [npc_v1]

State 2:
┌────────┐ bases: [npc_v1]
│ npc_v2 │───────────────→ ┌────────┐
└────────┘                 │ npc_v1 │
    │                      └────────┘
    │                          │
    │ get_trait(location)      │ location: tavern
    └─────────────────────→ tavern (inherited!)

    BUT...
    npc_v2._traits.has(location) → false (not in own traits!)

    When npc_v2 was created:
    - _set_trait was NOT called (didn't set location)
    - origin_state._rev_add was NOT updated

Question: Does tavern.rev_trait(state2, location_tt) find npc_v2?
Expected: Should find [npc_v1, npc_v2]
Actual: Might only find [npc_v1] ← BUG!
```

**Test Code**:
```javascript
// State 1
const npc_v1 = Belief.from_template(state1, {
  bases: ['NPC'],
  traits: { location: tavern.subject }  // Explicit set
})
state1.lock()

// State 2
const npc_v2 = Belief.from_template(state2, {
  bases: [npc_v1],
  traits: { '@label': 'v2' }  // NO location set - inherits it!
})
state2.lock()

// Forward lookup works
npc_v2.get_trait(state2, location_tt) // → tavern (inherited!)

// But does reverse lookup work?
tavern.rev_trait(state2, location_tt) // → ??? [npc_v1] or [npc_v1, npc_v2]?
```

**If Result = [npc_v1] only → BUG**: Inherited references not tracked!
**Root Cause**: `_set_trait` line 156 only checks `this._traits.get()` (direct), not `get_trait()` (inherited)

---

## Diagram 8: Composable Trait Inheritance (CRITICAL!)

```
Inventory composes from multiple bases

Shared Prototypes:
┌──────────┐ inventory: [sword]
│ Warrior  │
└──────────┘

Instance:
┌──────────┐ bases: [Warrior]
│  knight  │ inventory: [shield]  (explicit add)
└──────────┘
    │
    │ get_trait(inventory) → composition happens!
    └────────→ [sword, shield] (composed at query time!)

Reverse Index State:
knight.origin_state._rev_add:
  shield → inventory → [knight]  ✅ (explicit set)
  sword → inventory → ??? [knight] or [] ???  ← CRITICAL!

Query: sword.rev_trait(state, inventory_tt)
Expected: [knight] (knight has sword via composition!)
Actual: ??? (composition happens at get_trait time, but rev_add happens at set time!)

Problem:
1. Warrior.inventory = [sword] (shared, locked)
2. knight.bases = [Warrior]
3. knight._traits.set(inventory, [shield])
4. _set_trait sees:
   - old_value = this._traits.get(inventory) → undefined (no previous own value!)
   - new_value = [shield]
   - Diff: add shield, remove nothing
   - Updates: _rev_add[shield][inventory] = [knight]
5. Composition happens LATER at get_trait() time
6. sword never added to reverse index!
```

**Test Code**:
```javascript
// Warrior prototype (shared)
const warrior_proto = Belief.from_template(eidos_state, {
  bases: ['Person'],
  traits: {
    '@label': 'Warrior',
    inventory: [sword.subject]  // Default inventory
  }
})
eidos_state.lock()

// Knight instance
const knight = Belief.from_template(state, {
  bases: [warrior_proto],
  traits: {
    inventory: [shield.subject]  // Explicit add
  }
})

// Forward: composition works
knight.get_trait(state, inventory_tt)  // → [sword, shield] ✅

// Reverse: does it work?
sword.rev_trait(state, inventory_tt)   // → [knight] or [] ???
shield.rev_trait(state, inventory_tt)  // → [knight] ✅ (explicit)
```

**If Result = []**: MAJOR BUG - composable traits + rev_trait broken!

---

## Diagram 9: State Branching

```
Different branches have different references

                State 1: npc.location = tavern
                    ┌────────┐
                    │ npc_v1 │ location: tavern
                    └────────┘
                         │
            ┌────────────┴────────────┐
            ↓                         ↓
    State 2a (Branch A)       State 2b (Branch B)
    ┌────────┐                ┌────────┐
    │ npc_v2a│                │ npc_v2b│
    └────────┘                └────────┘
    location: bedroom         location: kitchen

Query from branch A:
tavern.rev_trait(state2a, location_tt) → [] (npc moved to bedroom in this branch)

Query from branch B:
tavern.rev_trait(state2b, location_tt) → [] (npc moved to kitchen in this branch)

Query from state 1:
tavern.rev_trait(state1, location_tt) → [npc_v1] (still at tavern at this point)
```

**Reverse Index Per Branch**:
```
state2a._rev_del[tavern][location] = [npc]
state2a._rev_add[bedroom][location] = [npc]

state2b._rev_del[tavern][location] = [npc]
state2b._rev_add[kitchen][location] = [npc]
```

**Key**: Each branch maintains independent reverse index!

---

## Diagram 10: Deletion and Resurrection

```
Add → Remove → Add pattern

State 1: npc.location = tavern
┌────────┐                  ┌────────┐
│  npc   │─────────────────→│(tavern)│
└────────┘                  └────────┘
origin_state._rev_add[tavern][location] = [npc]

State 2: npc.location = bedroom (change triggers deletion)
┌────────┐ location: bedroom
│ npc_v2 │──────┐
└────────┘      ↓
    Deletion from tavern recorded:
    state2._rev_del[tavern][location] = [npc_v2]
    state2._rev_add[bedroom][location] = [npc_v2]

State 3: npc.location = tavern (back to tavern!)
┌────────┐ location: tavern  ┌────────┐
│ npc_v3 │─────────────────→ │(tavern)│
└────────┘                   └────────┘
    state3._rev_del[bedroom][location] = [npc_v3]
    state3._rev_add[tavern][location] = [npc_v3]

Query: tavern.rev_trait(state3, location_tt)
Traversal:
1. state3._rev_add[tavern][location] → [npc_v3] → add to results
2. state3._rev_del[tavern][location] → none
3. Jump to state2
4. state2._rev_add[tavern][location] → none
5. state2._rev_del[tavern][location] → [npc_v2] → add to seen (deleted!)
6. Jump to state1
7. state1._rev_add[tavern][location] → [npc_v1] → seen.has(npc_v1._id)? No! Different version
   Wait, same belief different version - check by _id
   Actually npc_v3 has different _id than npc_v1
   So both would be added, but deduplication by belief.subject.sid needed?

Actually the code tracks by _id, so:
- npc_v1 has _id = 1, sid = 100
- npc_v2 has _id = 2, sid = 100
- npc_v3 has _id = 3, sid = 100
- state3 adds _id=3 to results
- state2 adds _id=2 to seen (deleted)
- state1 tries to add _id=1, but it's not in seen, so it gets added?

Wait, let me check the actual code more carefully...

Actually looking at belief.mjs:365-370:
```javascript
const add_beliefs = current._rev_add.get(this.subject)?.get(traittype)
if (add_beliefs) {
  for (const belief of add_beliefs) {
    if (!seen.has(belief._id)) {
      results.add(belief)
    }
  }
}
```

So it tracks by belief._id, meaning:
- state3 adds npc_v3 (_id=3) to results
- state2 marks npc_v2 (_id=2) as seen/deleted
- state1 tries to add npc_v1 (_id=1), not in seen, so adds it too!

Result: [npc_v1, npc_v3] ???

Hmm, that seems wrong. Let me think about this more carefully...

Oh wait, the issue is that when npc_v2 changed location from tavern to bedroom:
- The NEW belief (npc_v2) is what gets recorded in _rev_del[tavern]
- So state2._rev_del[tavern][location] = [npc_v2]
- This marks npc_v2._id as deleted
- But npc_v1 is a different _id!

The system tracks versioning correctly:
- npc_v1 at tavern (state 1)
- npc_v2 at bedroom (state 2) - this belief is marked as having removed tavern ref
- npc_v3 at tavern (state 3)

When querying at state3:
- Latest version is npc_v3 at tavern
- npc_v2 is in the deletion list for tavern
- npc_v1 is in the addition list for tavern, but it's superseded by v3

Actually I think the query result should just be [npc_v3] because that's the latest version.

Let me re-examine the code... The issue is that each belief version has a separate _id, and the reverse index tracks by _id, not by subject.sid.

So the correct behavior is:
Result: [npc_v3] (latest version at tavern)
```

---

## Diagram 11: Cross-Mind Isolation

```
Each mind has independent reverse index

World Mind:
┌─────────────────────┐
│ World State         │
│ ┌────────┐         │
│ │ tavern │         │
│ └────────┘         │
└─────────────────────┘

NPC Mind (child of World):
┌──────────────────────┐
│ NPC State            │
│ ┌──────────────────┐ │
│ │ knowledge_about  │ │
│ │ tavern           │ │
│ └──────────────────┘ │
│ @about: tavern       │
└──────────────────────┘

Query from world_state:
tavern.rev_trait(world_state, about_tt) → [] (no @about refs in world)

Query from npc_state:
tavern.rev_trait(npc_state, about_tt) → [knowledge_about_tavern]

Key: rev_trait is state-scoped, not mind-scoped
```

---

## Summary of Visual Patterns

1. **Direct Reference** - Simple 1:1 mapping
2. **Multiple References** - 1:N mapping (common)
3. **Array Traits** - 1:N within single belief
4. **State Chains** - Temporal dimension + skip list
5. **UnionState** - Spatial dimension (multiple components)
6. **Nested UnionState** - Recursive traversal
7. **Inherited Reference** - Potential tracking gap
8. **Composable Inheritance** - Query-time vs set-time mismatch
9. **Branching** - Independent per-branch indices
10. **Deletion/Resurrection** - Temporal reference changes
11. **Cross-Mind** - Scoping and isolation

---

## Key Insights from Diagrams

### 1. Skip List is Critical for Performance
Without skip pointers, long chains require O(n) traversal. With skip pointers, most queries are O(log n) or better.

### 2. UnionState Adds Complexity
Simple state chain: linear traversal
UnionState: fan-out to multiple components
Nested UnionState: recursive fan-out

### 3. Inheritance May Have Gap
Direct traits: tracked in _rev_add/_rev_del
Inherited traits: may not be tracked (test required!)

### 4. Composition Happens at Different Times
- get_trait: composes at QUERY time
- rev_trait: relies on index updated at SET time
- Mismatch possible for inherited composable traits!

### 5. Versioning Uses _id, Not sid
Each belief version has unique _id
Reverse index tracks by _id
Deduplication by sid happens in results

---

## Debugging Tips

### If rev_trait Returns Empty When It Shouldn't

1. **Check reverse index**:
   ```javascript
   state._rev_add.get(subject)?.get(traittype)
   ```

2. **Check if reference is inherited**:
   ```javascript
   belief._traits.has(traittype) // Own?
   belief.get_trait(state, traittype) // Inherited?
   ```

3. **Check UnionState traversal**:
   ```javascript
   if (state.is_union) {
     console.log('Components:', state.component_states.length)
   }
   ```

4. **Trace traversal manually**:
   ```javascript
   let current = state
   while (current) {
     console.log('Checking state:', current._id)
     const next_states = current.rev_base(subject, traittype)
     console.log('Next states:', next_states.length)
     current = next_states[0] // Simplified
   }
   ```

---

**Created**: 2025-11-16
**Purpose**: Visual understanding of rev_trait() permutations
**See Also**: rev-trait-matrix.md for complete test catalog
