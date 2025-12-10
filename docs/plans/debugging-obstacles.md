# Making Debugging Easier

This document provides guidance on debugging tests and code in this codebase, based on lessons learned from debugging complex perception and learning tests.

## Quick Reference

### When a Test Fails

1. **Create minimal reproduction** (3-step breakdown: world → perceive → learn_from)
2. **Use `inspect_perception()`** to see what was created
3. **Use `trace_trait()`** to understand inheritance
4. **Use `explain_recognize()`** to verify knowledge lookup
5. **Use `dump_registry()`** to confirm setup

### Before Writing Tests

1. **Set `exposure` on all traits** (required for perception)
2. **Test world-side first**, then perception
3. **Use helper functions** in assertions (not direct sid comparisons)
4. **Add debug output** liberally

---

## Debugging Best Practices

### 1. Start with Minimal Reproduction

When a test fails, don't debug the full complex test. Instead, **isolate the failure**:

**Create 3-step breakdown tests**:
1. **World-side only** - Test composition/inheritance without perception
2. **perceive() only** - Test that perception creates correct knowledge
3. **learn_from() only** - Test that learning processes perception correctly

**Why this works**: If step 1 passes but step 2 fails, you know the problem is in `perceive()`, not in world-side composition. This eliminates 50%+ of the codebase from investigation.

**Example**: See `test/observation_debug.test.mjs` for the 3-step pattern.

**Real example from our codebase**:
- Complex test failed: "knight inventory is null instead of [sword]"
- Step 1 (world-side): ✓ PASSED - knight has [sword] in world state
- Step 2 (perceive): ✗ FAILED - knowledge has null inventory
- **Conclusion**: Problem is in `perceive()`, not composition → saved hours of debugging

### 2. Use Debugging Helpers Proactively

Don't wait for tests to fail. **Use helpers during test development**:

```javascript
// During test setup - verify archetypes are correct
dump_registry()

// After perception - verify what was created
const perception = perceive(player_state, [knight])
console.log(inspect_perception(player_state, perception))

// When checking traits - show inheritance chain
const inventory = knight.get_trait(state, inventory_tt)
console.log(trace_trait(state, knight, 'inventory'))

// When using recognize() - explain why it matched
const knowledge = recognize(player_state, knight)
console.log(explain_recognize(player_state, knight))
```

**Available helpers** (in `test/helpers.mjs`):
- `inspect_perception(state, perception)` - Shows all knowledge beliefs created with their traits
- `trace_trait(state, belief, 'trait_name')` - Shows trait inheritance chain (own → bases)
- `explain_recognize(state, world_entity)` - Shows why recognize() found/didn't find knowledge
- `dump_registry()` - Lists all registered archetypes and traittypes with metadata
- `get_knowledge_about(player_state, knowledge_subject)` - Resolves player knowledge to world entity

### 3. Design Tests for Debuggability

**Good test design**:
```javascript
it('knight with empty inventory inherits sword from warrior_proto', () => {
  // Setup: Create world entities
  const sword = state.get_belief_by_label('sword')
  const knight = state.get_belief_by_label('knight')

  // Verify: Knight inherits [sword] from warrior_proto
  const knight_inventory = knight.get_trait(state, inventory_tt)
  console.log('Knight inventory:', debug(state, knight_inventory))

  expect(knight_inventory).to.be.an('array')
  expect(knight_inventory[0].sid).to.equal(sword.subject.sid)
})
```

**Bad test design**:
```javascript
it('works', () => {
  const a = state.get_belief_by_label('a')
  const b = a.get_trait(state, tt)
  expect(b).to.exist  // What does "exist" mean? What's b supposed to be?
})
```

**Principles**:
- Use **descriptive variable names** (not `a`, `b`, `c`)
- Add **comments** explaining what each section tests
- **Verify assumptions** at each step, not just at the end
- **Leave debug output** in place (helps future debugging)

### 4. Understand the Data Model

**Critical concepts**:

1. **Player knowledge is separate from world entities**
   - Player has their own beliefs about world entities
   - Different sids - don't compare directly!

2. **Recursive learning creates nested knowledge**
   - Inventory items get their own knowledge beliefs
   - Each has `@about` pointing to the world entity

3. **Traits need `exposure` metadata**
   - `exposure: 'visual'` required for visual perception
   - Missing exposure = trait invisible to `perceive()`

4. **`@about` is the link**
   - Knowledge beliefs point to world entities via `@about` trait
   - Check `@about` relationships, not direct sid equality

**Common mistake**:
```javascript
// ❌ Wrong - player's sword knowledge has different sid than world's sword
expect(knight_inventory[0].sid).to.equal(world_sword.subject.sid)

// ✅ Correct - check @about relationship
const sword_about = get_knowledge_about(player_state, knight_inventory[0])
expect(sword_about.sid).to.equal(world_sword.subject.sid)
```

---

## When to Use Each Debugging Tool

### perceive() doesn't work as expected
**→ Use `inspect_perception(player_state, perception)`**

**Shows**:
- What knowledge beliefs were created
- Which traits were copied (and which weren't)
- `@about` relationships
- Archetypes assigned to knowledge

**Example output**:
```
Perception #22 contains 1 knowledge belief(s):
  1. unlabeled#20 (@about: 11)
     archetypes: [PersonWithInventory, Person, Actor]
     inventory: [1 items]  ← Shows trait WAS copied
```

**Real debugging example**: Used this to discover inventory trait wasn't being copied - showed `inventory: null` in knowledge belief, immediately revealing the problem.

### Traits have unexpected values
**→ Use `trace_trait(state, belief, 'trait_name')`**

**Shows**:
- Trait resolution path (own → bases)
- Where value comes from
- Why composition did/didn't happen

**Example output**:
```
Tracing 'inventory' on Knight#15:
  ✗ Own traits: (not set)
  ✓ Base warrior_proto#8:
    ✓ Own traits: [Sword#5]
    → RESOLVED: [Sword#5]
```

**Real debugging example**: Showed knight doesn't have own inventory trait but inherits from warrior_proto base - confirmed inheritance was working correctly.

### recognize() fails to find knowledge
**→ Use `explain_recognize(player_state, world_entity)`**

**Shows**:
- All knowledge beliefs with matching `@about`
- How many candidates found
- Confirms whether knowledge exists

**Example output**:
```
Searching for knowledge about Knight#12 (sid: 11) in player_state:
  Candidates with @about = 11:
    #20 unlabeled - MATCHED
  Result: 1 knowledge belief(s) found
```

### Archetype/trait registration unclear
**→ Use `dump_registry()`**

**Shows**:
- All registered archetypes with bases
- All trait types with complete metadata
- Exposure settings

**Example output**:
```
=== ARCHETYPES ===
PersonWithInventory
  bases: [Person]
  traits: { inventory: null }

=== TRAITTYPES ===
inventory
  type: PortableObject
  container: Array
  composable: true
  exposure: visual  ← Confirms exposure is set
```

**Real debugging example**: Revealed inventory trait had NO exposure metadata - this was why `perceive()` wasn't copying it.

---

## Prevention Strategies

### 1. Always Set Exposure on Traits

**Problem**: Traits without `exposure` are invisible to perception.

**Solution**: Always explicitly set exposure:

```javascript
DB.register({
  inventory: {
    type: 'PortableObject',
    container: Array,
    composable: true,
    exposure: 'visual'  // ← REQUIRED for visual perception
  }
}, {}, {})
```

**Exposure types**:
- `'visual'` - Can be seen by looking (most common)
- `'spatial'` - Requires spatial awareness (location, size)
- `'internal'` - Cannot be directly perceived (mind, thoughts)
- `'tactile'` - Requires touching/handling

**Rule of thumb**: If a trait should be copied during `perceive()`, it MUST have `exposure: 'visual'` or appropriate modality.

### 2. Test World-Side Composition First

**Problem**: When perception tests fail, hard to isolate the issue.

**Solution**: Always test world-side before testing perception:

```javascript
// Test 1: World-side composition (no perception)
it('knight inherits [sword] from warrior_proto in world state', () => {
  const knight = state.get_belief_by_label('knight')
  const inventory = knight.get_trait(state, inventory_tt)
  expect(inventory).to.be.an('array')
  expect(inventory).to.have.lengthOf(1)
})

// Test 2: Perception (only if Test 1 passes)
it('player perceives knight with [sword] inventory', () => {
  // ... perception test ...
})
```

**Benefits**:
- Isolates Belief/Archetype layer from Perception layer
- Faster debugging (world tests simpler)
- Ensures composition works before testing perception

### 3. Use Helper Functions in Assertions

**Problem**: Direct sid comparisons are brittle.

**Solution**: Use semantic helpers:

```javascript
// ❌ Brittle - breaks if implementation changes
expect(knight_inventory[0].sid).to.equal(sword.subject.sid)

// ✅ Robust - checks semantic relationship
const sword_about = get_knowledge_about(player_state, knight_inventory[0])
expect(sword_about.sid).to.equal(sword.subject.sid)
```

**Available helpers**:
- `get_knowledge_about(player_state, knowledge_subject)` - Gets world entity from player knowledge

### 4. Add Debug Output to Complex Tests

**Problem**: No visibility into intermediate state when tests fail.

**Solution**: Liberally add console.log with debug():

```javascript
it('complex inheritance scenario', () => {
  const npc = state.get_belief_by_label('npc')
  console.log('=== BEFORE PERCEPTION ===')
  console.log('NPC:', debug(state, npc))

  const perception = perceive(player_state, [npc])
  console.log('\n=== AFTER PERCEPTION ===')
  console.log(inspect_perception(player_state, perception))

  learn_from(player_state, perception)
  const knowledge = recognize(player_state, npc)
  console.log('\n=== AFTER LEARN_FROM ===')
  console.log('Knowledge:', debug(player_state, knowledge[0]))

  // Assertions...
})
```

**Guidelines**:
- **Leave debug output** - helps future debugging
- **Use debug() for objects** - structured, readable
- **Add section markers** - `===  AFTER X ===`
- **Show both sides** - world state AND player knowledge

---

## Future Tooling Recommendations

### 1. Interactive Test Debugger

**Problem**: Can't pause and inspect state at failure point.

**Proposed**:
```javascript
it('test with breakpoint', async () => {
  const perception = perceive(player_state, [knight])
  await debug.breakpoint()  // Pause, open REPL
  learn_from(player_state, perception)
})
```

**Features**:
- Pause execution at any point
- Interactive REPL
- Step through logic
- Continue/skip to next breakpoint

### 2. Visual State Graph Viewer

**Problem**: Hard to visualize state chains, belief inheritance, knowledge relationships.

**Proposed**: HTML visualization showing:
- State chains with branches (timeline)
- Belief inheritance (tree)
- Knowledge relationships (`@about` links)
- Trait composition paths

```javascript
debug.visualize(player_state)
// Opens browser with interactive graph
```

### 3. Trait Resolution Visualizer

**Problem**: `trace_trait()` shows WHAT but not WHY.

**Proposed**:
```javascript
debug.explain_trait(state, knight, 'inventory')
// Shows:
// 1. Knight has own trait: []
// 2. Trait is composable: true
// 3. Base warrior_proto has: [sword]
// 4. Composition: [] + [sword] = [sword]
// 5. Final value: [sword]
```

**Features**:
- Step-by-step resolution
- Highlights composition rules
- Explains null vs empty array semantics
- Shows archetype defaults

### 4. Perception Trace Logger

**Problem**: Can't see which traits were considered and why.

**Proposed**:
```bash
DEBUG_PERCEPTION=1 npm test
# Output:
# perceive(knight):
#   color: exposure='visual' ✓ copying
#   mind: exposure='internal' ✗ skipped (modalities=[visual])
#   inventory: exposure='visual' ✓ copying
#     → Recursive learn for inventory[0] (sword)
#     → Created knowledge #23 about sword
#   location: no exposure ✗ skipped
```

**Benefits**:
- See all traits considered
- Understand why skipped
- Track recursive learning
- Identify missing exposure

### 5. Assertion Helpers with Better Errors

**Problem**: Generic errors like "expected 7 to equal 11" not helpful.

**Proposed**:
```javascript
// Instead of:
const sword_about = get_knowledge_about(player_state, knight_inventory[0])
expect(sword_about.sid).to.equal(world_sword.subject.sid)

// Use:
expectKnowledgeAbout(player_state, knight_inventory[0], world_sword)
// Error: "Expected knowledge about Sword#7 but @about points to Shield#11"
```

**More helpers**:
```javascript
expectTraitInheritance(knight, 'inventory', warrior_proto)
// Error: "Expected knight.inventory from warrior_proto but comes from Person"

expectComposition(knight, 'inventory', [sword], [shield])
// Error: "Expected [sword] + [shield] = [sword, shield] but got [sword] only"
```

**Benefits**:
- Clear, actionable errors
- Semantic actual vs expected
- Faster debugging
- Clearer test intent

---

## Real Debugging Example

**Problem**: Test failed with "expected null to be an array"

**Investigation using tools**:

1. **Created minimal test** (world-side only):
   ```javascript
   // Step 1: Just test world composition
   const knight_inventory = knight.get_trait(state, inventory_tt)
   console.log(trace_trait(state, knight, 'inventory'))
   ```
   → ✓ PASSED - world-side composition works

2. **Created perception test**:
   ```javascript
   // Step 2: Just test perceive()
   const perception = perceive(player_state, [knight])
   console.log(inspect_perception(player_state, perception))
   ```
   → ✗ FAILED - showed `inventory: null` in knowledge

3. **Checked trait registration**:
   ```javascript
   dump_registry()
   ```
   → Found: `inventory` trait had NO `exposure` metadata

**Root cause**: Inventory trait missing `exposure: 'visual'`

**Fix**: Added `exposure: 'visual'` to trait registration

**Result**: Test passed

**Time saved**: Minimal tests + helpers identified the exact issue in minutes instead of hours of blind debugging.

---

## Summary Checklist

**When writing tests**:
- [ ] Set `exposure` on all traits
- [ ] Test world-side first, then perception
- [ ] Use descriptive variable names
- [ ] Add debug output at key points
- [ ] Use semantic assertion helpers

**When debugging failures**:
- [ ] Create 3-step minimal reproduction
- [ ] Use `inspect_perception()` to see what was created
- [ ] Use `trace_trait()` to understand inheritance
- [ ] Use `explain_recognize()` to verify lookups
- [ ] Use `dump_registry()` to confirm setup

**Before asking for help**:
- [ ] Have minimal reproduction test
- [ ] Have debug output showing the issue
- [ ] Know which step (world/perceive/learn_from) fails
- [ ] Can explain what you expected vs what happened
