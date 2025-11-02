# Trait Composition and Learn_About Fixes

**Goal**: Fix double-mind bugs, prevent invalid trait composition, and clarify learnable vs internal traits

**Status**: Active (2025-11-02, updated 2025-11-03)

**Decision**: Returning to original design with data in shared nodes (Option 2 - materialize in source/archetype). Current implementation (Option 1 - materialize per-belief) was temporary workaround for locked state problem.

**Related**:
- docs/SPECIFICATION.md (archetype composition, learn_about)
- docs/IMPLEMENTATION.md (Belief constructor, trait resolution)
- docs/notes/wild_at_heart_model.md (earlier design - Blackbough_resident shared cultural knowledge)
- docs/notes/wild_at_heart_with_systemic_story.md (flyweight pattern for shared prototypes)
- public/worker/belief.mjs (lines 140-213 - new trait composition code)
- Discussion: npc1 double-mind bug, player child mind creation

## Context

### Architectural Principles

**Fundamental: No direct access between minds**

There are always three distinct Mind objects when one entity models another:
1. **Mayor's actual mind** (in world state) = what mayor actually knows
2. **Player's belief about mayor** (in player's mind) = player's knowledge that mayor exists
3. **Player's MODEL of mayor's mind** = what player THINKS mayor knows (separate Mind object)

These are NEVER the same object. There is no direct access between minds.

**Minds are internal state, not observable traits**

When you learn about an entity with a mind, you don't automatically get a model of their mind. That's created lazily when you need to reason about what they know (theory of mind).

### Lazy Materialization Architecture

**Problem**: The `mind: {_call: 'create_from_template'}` pattern creates Mind on construction, but this causes issues:
- Too eager for learned beliefs (creates minds we don't need)
- Read-time creation would violate immutability on locked states

**Solution**: Lazy materialization on first read
- The trait logically exists (defined in archetype/base) but Mind object isn't created until first access
- This isn't a "mutation" - it's computing a value that was always there
- Looking at traits before or after lock gives same result

**Two options for WHERE to materialize:**

**Option 1: Materialize in reading belief (current approach after refactor)**
```javascript
// Villager archetype has mind: {_call: ...}

npc1.get_trait(state, 'mind')
// Creates Mind, stores in npc1._traits
// Each NPC gets their own mind ✓ for actual entity minds
```

**Option 2: Materialize in source (shared belief/archetype) - original design**
```javascript
// Villager archetype has mind: {_call: ...}

npc1.get_trait(state, 'mind')
// Creates Mind, stores in Villager shared belief
// Returns Mind

npc2.get_trait(state, 'mind')
// Finds already materialized Mind in Villager base
// Returns SAME Mind (shared across all villagers)
// All villagers share cultural knowledge Mind ✓ for cultural models
```

**Shared Cultural Mind Architecture** (Option 2 target)

When cultural knowledge is shared, the shared mind acts as common parent:

```
world_mind
  └─ village_mind (materialized in Villager shared belief)
      └─ shared_state (cultural knowledge: tavern exists, mayor has name, forge location)
          │
          ├─ NPC1's actual mind (parent: village_mind, owner: npc1 belief in world)
          │   └─ npc1_state (base: shared_state)
          │       - Inherits: all cultural knowledge
          │       - Personal: what NPC1 individually observed
          │
          ├─ NPC2's actual mind (parent: village_mind, owner: npc2 belief in world)
          │   └─ npc2_state (base: shared_state)
          │       - Inherits: all cultural knowledge
          │       - Personal: what NPC2 individually observed
          │
          ├─ NPC1's model of NPC2's mind (parent: village_mind!, owner: learned belief in npc1's mind)
          │   └─ model_state (base: shared_state)
          │       - Inherits: NPC1 assumes NPC2 knows cultural knowledge
          │       - Specific: what NPC1 observed about NPC2's knowledge
          │
          └─ NPC2's model of NPC1's mind (parent: village_mind!, owner: learned belief in npc2's mind)
              └─ model_state (base: shared_state)
                  - Inherits: NPC2 assumes NPC1 knows cultural knowledge
                  - Specific: what NPC2 observed about NPC1's knowledge
```

**Key insight**: When creating theory-of-mind models, the modeled mind's parent should be the shared cultural mind, not the modeling entity's mind. This means:
- All villagers' actual minds are children of village_mind
- All villagers' models of other villagers are ALSO children of village_mind
- They share the cultural baseline via common parent and state inheritance

**Earlier design example** (from docs/notes/wild_at_heart_model.md):

The `Blackbough_resident` prototype has shared "Thought" (cultural knowledge):
```
Base Blackbough_resident
  Thought
    Hanna (knows she's a resident, married to Niellen)
    Niellen (knows he's a resident, married to Hanna)
    Hanna_missing (knows about the missing person event)
```

Then `Niellen` inherits from `Blackbough_resident` and adds personal details:
```
Niellen
  Base Hunter, Blackbough_resident
  Thought
    Hanna_missing (his specific knowledge: last saw her before dawn)
    Time_period_last_saw_Hanna (his personal timeline)
    Before_dawn_1 (his memory of seeing her sleeping)
```

This is the **flyweight pattern** mentioned in wild_at_heart_with_systemic_story.md:
> "Each actor is modeled with knowledge, emotions, goals, capabilities and habits. This can be done with the flyweight pattern, where a lot of the data is stored in prototypes for Human, Hunter, in Velen, in Blackbough, and finally Cursed by Lycanthropy."

The shared cultural mind (Blackbough_resident's Thought) materializes once in the prototype, and all Blackbough residents reference it. This is exactly **Option 2: Materialize in source/archetype**.

**Distinction**: Two separate concerns
1. **Lazy materialization location** - Where Mind objects are stored (in reading belief vs source)
2. **Learned belief _call execution** - Whether to execute _call for beliefs with @about (should skip)

### Bugs Discovered

1. **Double-mind from explicit trait + archetype** (RESOLVED)
   - npc1 had `mind: { workshop: ['location'] }` + inherited Mental archetype
   - Mental's `mind: {_call: 'create_from_template'}` created first mind
   - Explicit trait tried to create second mind
   - Fix: Commented out explicit mind trait in world.mjs

2. **Same-state inheritance** (FIXED)
   - player tried to inherit from blacksmith_villager (both in same state tt=1)
   - Fix: Added `Subject.get_shared_belief_by_state()` that only returns prototypes
   - Base resolution now prevents same-state inheritance

3. **Learned beliefs create child minds** (CRITICAL BUG - architectural issue)
   - Player inherits Villager archetype → `mind.append: { mayor: ['name'] }`
   - This calls `learn_about(mayor, ['name'])` in player's mind
   - learn_about creates belief with `@about: mayor`, copying mayor's archetypes (Mental, ObjectPhysical, Thing)
   - Belief constructor sees Mental archetype → executes `mind: {_call: 'create_from_template'}`
   - Creates unwanted child mind (id=37, label="null") under player's mind
   - **Root cause**: Learned beliefs shouldn't execute _call constructor patterns
   - **Deeper issue**: This violates "minds are internal state, not observable traits" principle
   - Learning about an entity should copy observable traits, not instantiate their internal mind
   - Mind models should be created lazily when needed for theory-of-mind reasoning, not automatically

4. **Null trait values create labeled subjects**
   - mayor.name is null (archetype default, not set)
   - learn_about tries to learn about null value
   - Creates Subject with label "null" (sid=35)

### Refactoring in Progress

- **Trait composition moved to Belief constructor** (belief.mjs:140-213)
  - Walks bases, collects operations (e.g., mind.append)
  - Executes _call constructor patterns
  - Calls state_data() on target traits with collected operations
- **Old code commented out** (belief.mjs:227-237)
  - add_trait_from_template operation handling
  - Will be removed after refactoring complete

## Immediate Fixes

### 1. Prevent learned beliefs from creating minds

**Problem**: When learn_about copies archetypes to new belief, Belief constructor executes _call patterns

**Solution Options**:

A. **Add flag to Belief.from()** indicating learned vs constructed
   - `Belief.from(state, bases, traits, {learned: true})`
   - Skip _call execution when learned=true
   - Pro: Simple, explicit
   - Con: Another parameter

B. **Check origin context in constructor**
   - If belief has @about trait, it's a learned belief
   - Don't execute _call patterns for learned beliefs
   - Pro: Automatic detection
   - Con: Couples @about to learning (may be wrong assumption)

C. **Filter archetypes in learn_about**
   - Don't copy archetypes that create state (Mental, etc.)
   - Only copy "data" archetypes (ObjectPhysical, Thing, etc.)
   - Pro: Prevents issue at source
   - Con: Need to classify archetypes as "data" vs "stateful"

**Recommended**: Option B with refinement
- Belief constructor checks if in_mind !== null AND @about trait exists
- If both true, skip _call execution (it's a learned belief about external entity)
- Learned beliefs inherit trait VALUES, not constructor BEHAVIOR

**Implementation**:
```javascript
// In Belief constructor, before line 176:
const is_learned_belief = (this.in_mind !== null && this._traits.has('@about'))

// At line 176:
if (value_in._call && !is_learned_belief) {
  // ... execute _call pattern
}
```

### 2. Fix null trait values in learn_about

**Problem**: `_recursively_learn_trait_value()` doesn't handle null/undefined properly

**Solution**:
- Check for null before treating value as Subject
- Skip learning about null values (they're absences, not entities)

**Implementation** (state.mjs:468-479):
```javascript
_recursively_learn_trait_value(source_state, value) {
  if (value === null || value === undefined) {
    return value  // Pass through nulls
  } else if (Array.isArray(value)) {
    return value.map(item => this._recursively_learn_trait_value(source_state, item))
  } else if (value instanceof Subject) {
    // ... existing Subject handling
  } else {
    return value  // Primitives, State, Mind
  }
}
```

### 3. Prevent explicit mind trait on Mental archetype entities

**Problem**: Easy to accidentally create double-mind by adding mind trait to Person

**Solution**: Add assertion in add_trait_from_template or Belief constructor
- If Mental archetype in bases AND explicit mind trait provided → error
- Suggest using mind.append instead

**Implementation**:
```javascript
// After collecting operations in constructor, check:
if (targets.has('mind') && this.can_have_trait('mind')) {
  const has_mental = [...this.get_archetypes()].some(a => a.label === 'Mental')
  if (has_mental && this._traits.has('mind')) {
    throw new Error('Cannot provide explicit mind trait on Mental archetype entity. Mental archetype creates mind automatically. Use mind.append to add knowledge.')
  }
}
```

## Tests Needed

### Test Suite: Trait Composition

- [ ] **Prevent learned belief mind creation**
  ```javascript
  // Create entity with Mental archetype (has mind)
  const npc = state.add_belief_from_template({
    bases: ['Person'],
    traits: { '@label': 'npc' }
  })

  // Learn about it in another mind
  const player_state = player_mind.create_state(1)
  const learned = player_state.learn_about(npc, ['location'])

  // Should NOT create child mind
  assert(player_mind._child_minds.size === 0)
  assert(!learned._traits.has('mind'))
  ```

- [ ] **Same-state inheritance prevention** (already passing with get_shared_belief_by_state fix)
  ```javascript
  // Try to create belief inheriting from same-state entity
  state.add_belief_from_template({ '@label': 'entity1' })

  // Should throw error
  assert.throws(() => {
    state.add_belief_from_template({
      bases: ['entity1'],  // Not a prototype!
      '@label': 'entity2'
    })
  }, /only looked at shared belief and archetype/)
  ```

- [ ] **Explicit mind + Mental archetype conflict**
  ```javascript
  // Should throw error when both Mental archetype and explicit mind trait
  assert.throws(() => {
    state.add_belief_from_template({
      bases: ['Person'],  // Has Mental
      traits: {
        '@label': 'npc',
        mind: { workshop: ['location'] }  // Conflict!
      }
    })
  }, /Cannot provide explicit mind trait/)
  ```

- [ ] **mind.append composition from multiple archetypes**
  ```javascript
  // blacksmith_villager has both Villager and Blacksmith
  const person = state.add_belief_from_template({
    bases: ['blacksmith_villager'],
    traits: { '@label': 'smith' }
  })

  const mind = person.get_trait(state, 'mind')
  const mind_state = [...mind.states_at_tt(1)][0]

  // Should have knowledge from both archetypes
  const tavern = mind_state.get_belief_by_label('tavern')  // from Villager
  const forge = mind_state.get_belief_by_label('forge')    // from Blacksmith
  assert(tavern !== null)
  assert(forge !== null)
  ```

- [ ] **Null/undefined trait values in learn_about**
  ```javascript
  const entity = state.add_belief_from_template({
    bases: ['Person'],
    traits: {
      '@label': 'entity',
      name: null  // Explicitly null
    }
  })

  const learner_state = learner_mind.create_state(1)
  const learned = learner_state.learn_about(entity, ['name'])

  // Should not create subject for null value
  assert(learned.get_trait(learner_state, 'name') === null)
  // Should not create child mind
  assert(learner_mind._child_minds.size === 0)
  ```

### Test Suite: Edge Cases

- [ ] **Learn about entity without requested trait**
  ```javascript
  const entity = state.add_belief_from_template({
    bases: ['ObjectPhysical'],
    traits: { '@label': 'rock' }
    // No 'color' trait
  })

  const learned = learner_state.learn_about(entity, ['color'])
  assert(learned.get_trait(learner_state, 'color') === null)
  ```

- [ ] **Learn about with empty trait list**
  ```javascript
  const learned = learner_state.learn_about(entity, [])
  // Should create minimal belief with just archetypes and @about
  assert(learned._traits.size === 1)  // Just @about
  assert(learned._traits.has('@about'))
  ```

## Asserts Needed

### Belief Constructor (belief.mjs:140-213)

1. **Skip _call for learned beliefs**
   ```javascript
   const is_learned_belief = (this.in_mind !== null && this._traits.has('@about'))
   if (value_in._call && !is_learned_belief) {
     // Execute _call
   }
   ```

2. **Detect mind trait + Mental archetype conflict**
   ```javascript
   if (targets.has('mind')) {
     const has_mental = [...this.get_archetypes()].some(a => a.label === 'Mental')
     if (has_mental && this._traits.has('mind')) {
       throw new Error('Cannot provide explicit mind trait on Mental archetype entity')
     }
   }
   ```

### State.integrate() (state.mjs:369-429)

3. **Validate trait values before learning**
   ```javascript
   for (const name of trait_names) {
     const value = source_belief.get_trait(source_state, name)
     if (value !== null && value !== undefined) {
       copied_traits[name] = this._recursively_learn_trait_value(source_state, value)
     } else {
       copied_traits[name] = null  // Explicit null, not undefined
     }
   }
   ```

### State._recursively_learn_trait_value() (state.mjs:468-479)

4. **Handle null before Subject check**
   ```javascript
   if (value === null || value === undefined) {
     return value
   } else if (value instanceof Subject) {
     // ... existing logic
   }
   ```

## Design Evolution

### 1. Trait Update vs Create New Belief

**Current behavior**: Every trait change creates new belief version via `with_traits()`

**Question**: Should some traits UPDATE existing belief instead?

**Example**: mind.append operations
- Villager adds knowledge about tavern and mayor
- Blacksmith adds knowledge about forge and tools
- These compose into single mind state, not multiple versions

**Hypothesis**: mind.append isn't needed if we can merge traits properly
- When belief has mind trait, adding more knowledge updates the mind's state
- Don't create new belief version, modify mind's state in place (if unlocked)

**Design Options**:

A. **Mutable traits** (current for Mind)
   - Some trait types (Mind, State) are mutable references
   - Operations modify the referenced object
   - Pro: Natural for stateful objects
   - Con: Breaks immutability principle

B. **Trait merge operations**
   - Define merge semantics per trait type
   - `traittype.merge(existing_value, new_value) → merged_value`
   - Use during trait composition instead of append syntax
   - Pro: Explicit merge semantics
   - Con: Complex type system

C. **Operation recording**
   - Keep mind.append syntax as operation descriptor
   - Record operations, apply during state access
   - Pro: Clean declarative syntax
   - Con: Deferred execution complexity

**Recommendation**: Current approach (A) is correct for Mind
- Mind is stateful by nature (contains States)
- mind.append operations call `mind.state_data()` which modifies mind's state
- Other traits (primitives, Subjects) remain immutable

**Backlog item**: Document when to use mutable vs immutable trait types

### 2. Learnable Trait Specification

**Current behavior**: learn_about tries to copy all requested traits

**Problem**: Some traits are internal state, not observable
- `mind` - internal mental state (thoughts, knowledge)
- Future: `health` - internal state (vs observed condition)
- Future: `inventory` - what NPC carries (vs what player sees)

**Proposed**: Trait visibility metadata
```javascript
const traittypes = {
  mind: {
    type: 'Mind',
    learnable: false  // Internal state
  },
  location: {
    type: 'Location',
    learnable: true   // Observable
  },
  health: {
    type: 'number',
    learnable: false  // Internal (player sees 'condition' instead)
  }
}
```

**Implementation**:
- Add `learnable` field to TraitTypeSchema
- Default: true (observable by default)
- State.integrate() filters trait_names by learnable flag
- Error if trying to learn non-learnable trait? Or silently skip?

**Backlog item**: Implement learnable trait metadata

### 3. Observable vs Internal Trait Distinction

**Philosophy**: No objective truth principle
- Internal traits represent "ground truth" in entity's own experience
- Observable traits represent what others can perceive
- Learning converts observable traits, not internal state

**Examples**:
- Internal `mind`, Observable `behavior` (inferred from actions)
- Internal `health: 50`, Observable `condition: 'wounded'` (appears hurt)
- Internal `inventory: [key]`, Observable `visible_items: []` (key is hidden)

**Design question**: Should internal/observable be separate traits, or one-to-many mapping?

**Backlog item**: Design observable trait mapping system

## Backlog Items

### High Priority - Redesign for Shared Nodes (Option 2)

**Current state**: 34 pending tests awaiting redesign

1. **Implement lazy materialization with shared storage (Option 2)**
   - Move _call execution from Belief constructor to get_trait() read-time
   - Materialize Mind objects in source (shared belief/archetype), not reading belief
   - First read creates Mind, stores in shared node
   - Subsequent reads (from any inheriting belief) return same Mind
   - Ensure reads on locked states work correctly (no mutation, pure computation)
   - This enables shared cultural knowledge architecture

2. **Implement belief import system for chunks (shared or not)**
   - Separate world setup from cultural knowledge injection
   - World setup: Create entities (tavern, mayor, etc.) with labels
   - Cultural injection: Add beliefs to shared minds AFTER world entities exist
   - Support batch operations for adding beliefs to minds
   - Works for both shared prototypes and individual minds
   - Example flow:
     ```javascript
     // 1. Create world entities
     state.add_beliefs_from_template({ tavern: {...}, mayor: {...} })

     // 2. Add cultural knowledge to Villager prototype (after entities exist)
     villager_shared_belief.import_cultural_knowledge(state, {
       tavern: ['location'],
       mayor: ['name']
     })
     ```

3. **Template format can use labels, but underlying system works with subjects**
   - User-facing API: Labels are convenient (`mind: { tavern: ['location'] }`)
   - Internal implementation: Works with Subject references, not label strings
   - Label resolution happens at import time, not definition time
   - This allows templates to be reusable across different worlds (resolve labels in context)

4. **Fix 34 pending tests**
   - Update tests to work with shared node architecture
   - Tests currently expect per-belief mind instantiation
   - Update expectations for shared cultural minds
   - Verify theory-of-mind parent selection works correctly

5. **Implement shared cultural mind architecture**
   - Villager archetype's mind materializes once, shared across all villager instances
   - NPC actual minds have village_mind as parent, states inherit from shared cultural state
   - Theory-of-mind models also use village_mind as parent (not modeling entity's mind)
   - Document parent mind selection for nested minds

### Medium Priority - Bug Fixes

6. **Implement learned belief detection in Belief constructor**
   - Skip _call execution for beliefs with @about trait
   - Add test coverage

7. **Fix null handling in _recursively_learn_trait_value**
   - Return null/undefined without trying to learn about it
   - Add test coverage

8. **Add mind trait + Mental archetype conflict detection**
   - Throw clear error when both present
   - Suggest mind.append alternative

### Low Priority

9. **Document trait merge semantics**
   - When does trait update vs create new belief?
   - Why Mind is mutable reference (with shared storage)
   - Contrast with immutable trait values

10. **Implement learnable trait metadata**
    - Add learnable field to TraitTypeSchema
    - Filter in State.integrate()
    - Document which traits are internal vs observable

11. **Cleanup commented code**
    - Remove old operation handling in add_trait_from_template (belief.mjs:227-237)
    - Verify all functionality moved to constructor

12. **Design observable trait mapping**
    - How do internal traits map to observable perceptions?
    - One-to-many? Separate traits? Computed properties?

13. **Classify existing archetypes**
    - Which archetypes are "data" (safe to copy in learn_about)?
    - Which are "stateful" (should not trigger _call in learned beliefs)?
    - Document in SPECIFICATION.md

## Notes

### Key Insights

1. **No direct access between minds** (fundamental principle)
   - Mayor's actual mind ≠ player's belief about mayor ≠ player's model of mayor's mind
   - These are always three distinct Mind objects
   - Theory of mind is modeling, not observation

2. **Minds are internal state, not observable traits**
   - Learning about an entity doesn't instantiate their mind
   - Mind models should be created lazily when needed for theory-of-mind reasoning
   - The mayor mind created by Villager archetype is shared cultural knowledge, not mayor's actual thoughts

3. **Shared cultural mind as common parent**
   - village_mind (from Villager archetype) is parent to all villager actual minds
   - village_mind is ALSO parent to theory-of-mind models of other villagers
   - Shared cultural baseline via common parent and state inheritance
   - Each villager's state has base: shared_state (cultural knowledge)

4. **Lazy materialization vs mutation**
   - Trait logically exists (defined in archetype) but Mind object created on first read
   - This isn't mutation - it's computing a value that was always there
   - Before/after lock gives same result (pure computation)
   - Question: Materialize in reading belief (Option 1) or source/archetype (Option 2)?

5. **Learned beliefs are snapshots, not instances**
   - When you learn about an entity, you copy trait VALUES
   - You don't instantiate the entity's BEHAVIOR (no _call execution)
   - The @about link maintains identity without duplicating state

6. **Mental archetype creates minds, not mind trait**
   - Mental archetype defines mind: {_call: 'create_from_template'}
   - This executes during belief construction from template
   - Don't add explicit mind trait unless you want override behavior

7. **mind.append composes knowledge from multiple bases**
   - Villager + Blacksmith archetypes both have mind.append operations
   - Belief constructor collects all operations, calls mind.state_data() once
   - This populates single mind state with combined knowledge

8. **Trait composition happens in Belief constructor**
   - Moved from add_trait_from_template to centralize logic
   - Walks bases, collects operations (e.g., mind.append)
   - Executes _call patterns, applies operations via state_data()
   - Old code commented out during refactoring

9. **Separate world setup from cultural knowledge injection**
   - World setup creates entities first (tavern, mayor, etc.)
   - Cultural knowledge added to shared prototypes AFTER world exists
   - Belief import system for batch operations (shared or individual minds)
   - Template format uses labels (user convenience), underlying system uses Subjects
   - Lazy materialization: beliefs in shared minds created on-demand, not eagerly
   - This matches wild_at_heart_model.md design: Blackbough_resident.Thought references entities

### Migration Notes

**Why construction-time creation was needed:**
- Original design: _call execution on first read (lazy)
- Problem: Can't create Mind on locked state (violates immutability)
- Temporary solution: Move _call to Belief constructor (eager)
- But eager creation conflicts with "minds are internal state" principle
- Future solution: Lazy materialization that doesn't mutate (pure computation)

When refactoring is complete:
- Remove commented code in add_trait_from_template
- Verify all tests pass with new composition logic
- Document pattern in IMPLEMENTATION.md
- Implement proper lazy materialization (Option 1 or 2)
- Ensure theory-of-mind models use shared cultural mind as parent

### Open Questions

1. Should we prevent ALL _call execution in learned beliefs, or just Mind-creating ones?
2. Should learn_about error or silently skip non-learnable traits?
3. Do we need both @about and explicit learnable flag, or is @about sufficient marker?
4. ~~Which lazy materialization option: Option 1 (per-belief) or Option 2 (shared/archetype)?~~ **DECIDED: Option 2 (shared/archetype)**
5. How to create theory-of-mind models explicitly? New API or automatic on certain queries?
6. ~~How should mind template format work without requiring labeled world subjects?~~ **RESOLVED: Separate world setup from cultural injection**
   - Template format can use labels - that's fine for user-facing API
   - Underlying system works with Subject references, not labels
   - Cultural knowledge added AFTER world entities exist
   - Belief import system handles batch operations for adding cultural beliefs
7. **NEW: Design for belief import/batch system**
   - API for adding beliefs to minds in chunks
   - Should work for both shared prototypes and individual minds
   - Handle label resolution at import time
   - Support lazy materialization (don't create all beliefs immediately)
   - Example: `villager_shared_belief.import_cultural_knowledge(state, { tavern: ['location'] })`
