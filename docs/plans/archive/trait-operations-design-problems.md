# Trait Operations Pattern - Design Problems

## Current Flow (What Happens)

When creating an NPC with composed knowledge:

```javascript
// World state at timestamp 1
const world_state = world_mind.create_state(1)
const tavern = world_state.add_belief({label: 'tavern', bases: ['Location']})

// NPC with Mental + Villager bases
const npc = world_state.add_belief({
  label: 'npc',
  bases: ['Person', 'Villager']  // Person -> Villager -> Mental
})

// Get mind trait (triggers constructor marker + operations)
const mind = npc.get_trait(world_state, 'mind')
```

**Step 1: Constructor marker** (`mind: {_call: 'create_from_template'}`)
- Calls: `Mind.create_from_template(world_state, {}, npc.subject)`
- Creates: Mind with State at **timestamp 1**, empty (0 beliefs)
- Result: Mind with 1 state at t=1, ground_state=world_state(t=1)

**Step 2: Operations** (`mind.append: {tavern: ['location']}`)
- Calls: `mind.state_data(world_state, operations)`
- Finds: latest state at t=1 (the empty one)
- Creates: NEW State at **timestamp 2** with tavern knowledge
- Result: Mind with 2 states (t=1 empty, t=2 with tavern)

**Step 3: Query**
- Query: `mind.states_valid_at(1)` returns state at t=1
- Problem: Returns the EMPTY state, not the one with knowledge!

## Design Problem #1: Timestamp Mismatch

```
World State (t=1)
  ├─ NPC belief created
  └─ NPC.mind trait resolved
       ├─ Mind State (t=1) - empty from create_from_template
       └─ Mind State (t=2) - has knowledge from state_data +1

Query at t=1 → Returns empty state ❌
Query at t=2 → Would return knowledge state, but world is still at t=1 ❌
```

**The +1 problem:**
- `state_data()` does `latest.timestamp + 1` (mind.mjs:398)
- This assumes state_data is for *versioning* (adding knowledge later)
- But here it's used for *initial construction* (adding knowledge now)
- Result: Knowledge lives in the future relative to ground_state

## Design Problem #2: Semantic Confusion

The trait operations pattern assumes:
1. **Base value construction**: Create empty/default instance
2. **Operations application**: Modify/extend the instance

This works for versioning:
```javascript
// Later, at t=100
npc_v2 = npc.with_traits(state_100, {
  'mind.append': {new_place: ['location']}
})
// Creates state at t=101 with new knowledge ✓
```

But fails for initial construction:
```javascript
// During belief creation at t=1
const mind = npc.get_trait(world_state, 'mind')
// Step 1: Empty mind at t=1
// Step 2: Knowledge at t=2 ❌ Wrong timestamp!
```

## Design Problem #3: State Creation Semantics

From user feedback:
> "Creating a new state in mind should not force the ground_mind to have a new state"

Current behavior:
- Mind creates states indexed by timestamp
- Each mind.append creates a new mind state at timestamp++
- But ground_state (world) stays at same timestamp
- Result: Mind's internal timeline diverges from world's timeline

Example:
```
t=1: World state created
     ├─ Create NPC
     └─ Resolve NPC.mind trait
          ├─ Mind state t=1 (empty)
          └─ Mind state t=2 (with knowledge)  ← Mind advances but world doesn't!
```

## What Should Happen (Ideal Design)

### Option A: Single-Pass Construction

Constructor marker should handle operations in one pass:

```javascript
// Instead of two-step (create empty, then append)
Mind.create_from_template(ground_state, {}, subject)  // Empty at t=1
mind.state_data(ground_state, operations)              // Populated at t=2 ❌

// Do one-step construction
Mind.create_from_template(ground_state, initial_knowledge, subject)  // Populated at t=1 ✓
```

**Proposal:**
- Modify `belief.get_trait()` to pass operations to constructor
- Change signature: `Mind.create_from_template(ground_state, traits, subject, operations)`
- Process `mind.append` operations during initial state creation
- Result: One state at ground_state.timestamp with all knowledge

### Option B: Mutable Initial State

Allow operations to modify the initial state instead of creating new one:

```javascript
// create_from_template creates unlocked state
const mind = Mind.create_from_template(ground_state, {}, subject)
const initial_state = [...mind._states][0]  // Unlocked

// state_data modifies initial state if unlocked
mind.state_data(ground_state, operations)  // Adds to existing state, doesn't create new
initial_state.lock()  // Locks after operations applied
```

**Problem:** Violates immutability - states shouldn't be mutated after creation

### Option C: Use Same Timestamp for Construction

Allow `state_data()` to create state at same timestamp when appropriate:

```javascript
state_data(ground_state, operations) {
  const latest = [...this.states_valid_at(ground_state.timestamp)][0]

  // For initial construction: use ground_state.timestamp
  // For versioning: use latest.timestamp + 1
  const is_initial = latest.timestamp === ground_state.timestamp && [...latest.get_beliefs()].length === 0

  const new_state = new State(
    this,
    is_initial ? ground_state.timestamp : latest.timestamp + 1,  // Same timestamp for initial
    latest,
    ground_state,
    latest.self
  )
}
```

**Problem:** Multiple states at same timestamp breaks `states_valid_at()` assumptions

### Option D: Rethink Timestamps Entirely

Perhaps mind states shouldn't have timestamps tied to ground_state?

**Questions:**
- What does a mind state timestamp represent?
- Is it "when in world time this knowledge was acquired"?
- Or is it "version number for this mind's knowledge"?
- Should querying mind at world t=1 return the "latest knowledge available at t=1"?

## Specific Code Issues

### Issue 1: `states_valid_at()` behavior
**Location:** mind.mjs:142-158

```javascript
*states_valid_at(timestamp) {
  // Returns states where base_or_self_timestamp <= timestamp
  // But if multiple states at same timestamp, returns all of them
  // Which one is "correct"?
}
```

### Issue 2: `create_from_template()` timestamp hardcoded to 1
**Location:** mind.mjs:350-356

```javascript
const state = new State(
  entity_mind,
  1,  // Hardcoded! Should this be ground_state.timestamp?
  null,
  ground_state,
  self_subject
)
```

### Issue 3: `state_data()` always increments
**Location:** mind.mjs:396-402

```javascript
const new_state = new State(
  this,
  latest.timestamp + 1,  // Always increments - no way to "append at current time"
  latest,
  ground_state,
  latest.self
)
```

## Test Cases That Should Pass

```javascript
// Test 1: Initial construction composes knowledge
const npc = world_state.add_belief({
  bases: ['Person', 'Villager', 'Blacksmith']  // Multiple mind.append operations
})
const mind = npc.get_trait(world_state, 'mind')
const state = [...mind.states_valid_at(world_state.timestamp)][0]

// Should have knowledge from both Villager and Blacksmith at world's current timestamp
expect(state.get_belief_by_label('tavern')).to.exist  // From Villager
expect(state.get_belief_by_label('forge')).to.exist   // From Blacksmith

// Test 2: Later versioning creates new state
let world_state_2 = world_state.tick({})
npc = world_state_2.get_belief_by_label('npc')
npc = npc.with_traits(world_state_2, {
  'mind.append': {new_place: ['location']}
})

const mind_2 = npc.get_trait(world_state_2, 'mind')
const state_2 = [...mind_2.states_valid_at(world_state_2.timestamp)][0]

// Should have old + new knowledge at new timestamp
expect(state_2.get_belief_by_label('tavern')).to.exist
expect(state_2.get_belief_by_label('new_place')).to.exist
```

## Questions for Design Decision

1. **What is the mental model for mind state timestamps?**
   - Version counter (1, 2, 3...)?
   - Sync'd with ground_state time?
   - Independent timeline?

2. **Should initial construction be atomic?**
   - All mind.append operations happen "at once" at construction time?
   - Or should they be sequential even during init?

3. **How should `states_valid_at()` handle multiple states at same timestamp?**
   - Return all? First? Last?
   - Should this even be possible?

4. **Should `create_from_template` accept operations parameter?**
   - Would avoid two-step construction
   - Makes constructor marker more complex

5. **What's the relationship between world time and mind time?**
   - Should they be synchronized?
   - Can a mind have knowledge "from the future" of its ground_state?
