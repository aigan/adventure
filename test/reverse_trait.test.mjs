/**
 * Tests for reverse trait lookup (rev_trait) functionality
 *
 * MATRIX COVERAGE: None (this file tests rev_trait mechanism, not trait inheritance)
 *
 * TESTS COVERED:
 * ✅ Basic rev_trait functionality (empty, single, multiple referrers)
 * ✅ State chain traversal (single state, two-state, long chains)
 * ✅ Add/Del patterns (additions, removals, resurrection)
 * ✅ Skip list optimization (pointers, ancestor jumps, isolation)
 *
 * MISSING (documented in docs/plans/rev-trait-analysis.md):
 * ❌ Inherited Subject references (beliefs inherit location from base)
 * ❌ Shared belief references
 * ❌ Composable arrays in rev_trait (inventory)
 * ❌ Mind state references
 * ❌ State array references
 * ❌ 🔴 CRITICAL: UnionState traversal (see docs/plans/UNIONSTATE_CRITICAL.md)
 *
 * Missing tests are in: docs/plans/reverse_trait_missing.test.mjs
 */

import { assert } from 'chai'
import { setupStandardArchetypes, createStateInNewMind } from './helpers.mjs'
import { Belief } from '../public/worker/belief.mjs'
import { Traittype } from '../public/worker/traittype.mjs'
import { Archetype } from '../public/worker/archetype.mjs'
import { logos } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'

describe('Reverse Trait Lookup (rev_trait)', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()

    // Add missing trait types for these tests
    Traittype.register('container', new Traittype('container', 'Location'))
    Traittype.register('name', new Traittype('name', 'string'))

    // Add traits to archetypes
    const container_traittype = Traittype.get_by_label('container')
    const name_traittype = Traittype.get_by_label('name')

    const portableObject = Archetype.get_by_label('PortableObject')
    portableObject._traits_template.set(container_traittype, null)
    portableObject._traits_template.set(name_traittype, null)

    const actor = Archetype.get_by_label('Actor')
    actor._traits_template.set(name_traittype, null)
  })

  describe('Basic Functionality', () => {
    it('returns empty array when no beliefs reference the subject', () => {
      const state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      // Create a room that nothing references
      const room = Belief.from_template(state, {
        bases: ['Location'],
        traits: {'@label': 'empty_room'}
      })
      state.lock()

      // Query for beliefs with location trait pointing to this room
      const referrers = room.rev_trait(state, location_traittype)

      assert.isArray(referrers)
      assert.lengthOf(referrers, 0)
    })

    it('returns single belief that references the subject', () => {
      const state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      // Create a room
      const room = state.add_belief_from_template({
        bases: ['Location'],
        traits: {'@label': 'tavern'}
      })

      // Create NPC in that room
      const npc = state.add_belief_from_template({
        bases: ['Actor'],
        traits: {
          '@label': 'bartender',
          'location': room.subject
        }
      })
      state.lock()

      // Query: who is in the tavern?
      const occupants = room.rev_trait(state, location_traittype)

      assert.lengthOf(occupants, 1)
      assert.strictEqual(occupants[0], npc)
    })

    it('returns multiple beliefs that reference the subject', () => {
      const state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      // Create a room
      const room = Belief.from_template(state, {
        bases: ['Location'],
        traits: {'@label': 'marketplace'}
      })

      // Create multiple NPCs in that room
      const npc1 = Belief.from_template(state, {
        bases: ['Actor'],
        traits: {'@label': 'merchant', 'location': room.subject}
      })
      const npc2 = Belief.from_template(state, {
        bases: ['Actor'],
        traits: {'@label': 'guard', 'location': room.subject}
      })
      const npc3 = Belief.from_template(state, {
        bases: ['Actor'],
        traits: {'@label': 'customer', 'location': room.subject}
      })
      state.lock()

      // Query: who is in the marketplace?
      const occupants = room.rev_trait(state, location_traittype)

      assert.lengthOf(occupants, 3)
      assert.includeMembers(occupants, [npc1, npc2, npc3])
    })
  })

  describe('State Chain Traversal', () => {
    it('works with single state (no base chain)', () => {
      const state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from_template(state, {
        bases: ['Location'],
        traits: {'@label': 'cellar'}
      })
      const npc = Belief.from_template(state, {
        bases: ['Actor'],
        traits: {'@label': 'prisoner', 'location': room.subject}
      })
      state.lock()

      const occupants = room.rev_trait(state, location_traittype)
      assert.lengthOf(occupants, 1)
      assert.strictEqual(occupants[0], npc)
    })

    it('traverses two-state chain correctly', () => {
      const state1 = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {'@label': 'hall'}
      })
      const npc1 = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {'@label': 'noble', 'location': room.subject}
      })
      state1.lock()

      // State 2: Add another NPC
      const state2 = state1.branch_state(logos().origin_state, 1)
      const npc2 = Belief.from_template(state2, {
        bases: ['Actor'],
        traits: {'@label': 'servant', 'location': room.subject}
      })
      state2.lock()

      // Query from state2 should see both NPCs
      const occupants = room.rev_trait(state2, location_traittype)
      assert.lengthOf(occupants, 2)
      assert.includeMembers(occupants, [npc1, npc2])

      // Query from state1 should see only npc1
      const occupants1 = room.rev_trait(state1, location_traittype)
      assert.lengthOf(occupants1, 1)
      assert.strictEqual(occupants1[0], npc1)
    })

    it('traverses long chain with sparse changes (skip list optimization)', () => {
      let state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from_template(state, {
        bases: ['Location'],
        traits: {'@label': 'forest'}
      })
      state.lock()

      // Create 10 states, only add NPCs in states 0, 3, 7
      const npcs = []
      for (let i = 0; i < 10; i++) {
        state = state.branch_state(logos().origin_state, i + 2)

        if (i === 0 || i === 3 || i === 7) {
          const npc = Belief.from_template(state, {
            bases: ['Actor'],
            traits: {
              '@label': `traveler${i}`,
              'location': room.subject
            }
          })
          npcs.push(npc)
        }

        state.lock()
      }

      // Query should find all 3 NPCs despite 10-state chain
      const occupants = room.rev_trait(state, location_traittype)
      assert.lengthOf(occupants, 3)
      assert.includeMembers(occupants, npcs)
    })
  })

  describe('Add/Del Patterns', () => {
    it('handles only additions across states', () => {
      let state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from_template(state, {
        bases: ['Location'],
        traits: {'@label': 'inn'}
      })
      state.lock()

      // Add NPCs in sequence
      const npcs = []
      for (let i = 0; i < 3; i++) {
        state = state.branch_state(logos().origin_state, i + 2)
        const npc = Belief.from_template(state, {
          bases: ['Actor'],
          traits: {
            '@label': `guest${i}`,
            'location': room.subject
          }
        })
        npcs.push(npc)
        state.lock()
      }

      const occupants = room.rev_trait(state, location_traittype)
      assert.lengthOf(occupants, 3)
      assert.includeMembers(occupants, npcs)
    })

    it('handles add then remove pattern', () => {
      const state1 = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room1 = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {'@label': 'kitchen'}
      })
      const room2 = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {'@label': 'bedroom'}
      })
      const npc = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {'@label': 'cook', 'location': room1.subject}
      })
      state1.lock()

      // State 2: NPC moves to bedroom
      const state2 = state1.branch_state(logos().origin_state, 1)
      const npc2 = Belief.from_template(state2, {
        bases: [npc],
        traits: {'location': room2.subject}
      })
      state2.replace_beliefs(npc2)
      state2.lock()

      // Kitchen should have no occupants in state2
      const kitchen_occupants = room1.rev_trait(state2, location_traittype)
      assert.lengthOf(kitchen_occupants, 0)

      // Bedroom should have the NPC in state2
      const bedroom_occupants = room2.rev_trait(state2, location_traittype)
      assert.lengthOf(bedroom_occupants, 1)
      assert.strictEqual(bedroom_occupants[0], npc2)

      // Kitchen should still have occupant in state1
      const kitchen_occupants_old = room1.rev_trait(state1, location_traittype)
      assert.lengthOf(kitchen_occupants_old, 1)
    })

    it('handles resurrection pattern (remove then add)', () => {
      const state1 = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {'@label': 'throne_room'}
      })
      const npc = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {'@label': 'king', 'location': room.subject}
      })
      state1.lock()

      // State 2: King leaves (remove location)
      const state2 = state1.branch_state(logos().origin_state, 1)
      const npc2 = Belief.from_template(state2, {
        bases: [npc],
        traits: {'location': null}
      })
      state2.replace_beliefs(npc2)
      state2.lock()

      // State 3: King returns
      const state3 = state2.branch_state(logos().origin_state, 2)
      const npc3 = Belief.from_template(state3, {
        bases: [npc2],
        traits: {'location': room.subject}
      })
      state3.replace_beliefs(npc3)
      state3.lock()

      // State 1: King present
      assert.lengthOf(room.rev_trait(state1, location_traittype), 1)

      // State 2: King absent
      assert.lengthOf(room.rev_trait(state2, location_traittype), 0)

      // State 3: King returns
      assert.lengthOf(room.rev_trait(state3, location_traittype), 1)
      assert.strictEqual(room.rev_trait(state3, location_traittype)[0], npc3)
    })
  })

  describe('Skip List Correctness', () => {
    it('sets skip list pointer on first add/del operation', () => {
      const state1 = createStateInNewMind('world')

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {'@label': 'workshop'}
      })
      state1.lock()

      const state2 = state1.branch_state(logos().origin_state, 1)
      const npc = Belief.from_template(state2, {
        bases: ['Actor'],
        traits: {'@label': 'smith', 'location': room.subject}
      })
      state2.lock()

      // Verify skip list pointer is set
      const traittype = Traittype.get_by_label('location')
      const pointer = state2._rev_base.get(room.subject)?.get(traittype)

      // Should point to null (no previous state with changes)
      assert.isNull(pointer)
    })

    it('skip list pointer points to ancestor with changes', () => {
      const state1 = createStateInNewMind('world')

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {'@label': 'library'}
      })
      const npc1 = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {'@label': 'scholar', 'location': room.subject}
      })
      state1.lock()

      // State 2: no changes to location references
      const state2 = state1.branch_state(logos().origin_state, 1)
      state2.lock()

      // State 3: no changes
      const state3 = state2.branch_state(logos().origin_state, 2)
      state3.lock()

      // State 4: add another NPC
      const state4 = state3.branch_state(logos().origin_state, 3)
      const npc2 = Belief.from_template(state4, {
        bases: ['Actor'],
        traits: {'@label': 'student', 'location': room.subject}
      })
      state4.lock()

      // State 4's skip list pointer should jump to state1 (skipping 2 and 3)
      const traittype = Traittype.get_by_label('location')
      const pointer = state4._rev_base.get(room.subject)?.get(traittype)

      assert.strictEqual(pointer, state1)
    })

    it('isolates different (subject, traittype) pairs', () => {
      const state1 = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room1 = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {'@label': 'armory'}
      })
      const room2 = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {'@label': 'treasury'}
      })
      const npc = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {'@label': 'guard', 'location': room1.subject}
      })
      state1.lock()

      // State 2: different room gets occupant
      const state2 = state1.branch_state(logos().origin_state, 1)
      const npc2 = Belief.from_template(state2, {
        bases: ['Actor'],
        traits: {'@label': 'treasurer', 'location': room2.subject}
      })
      state2.lock()

      // Each room should only see its own occupant
      assert.lengthOf(room1.rev_trait(state2, location_traittype), 1)
      assert.strictEqual(room1.rev_trait(state2, location_traittype)[0], npc)

      assert.lengthOf(room2.rev_trait(state2, location_traittype), 1)
      assert.strictEqual(room2.rev_trait(state2, location_traittype)[0], npc2)
    })
  })

  describe('Edge Cases', () => {
    it('returns empty array for non-existent traittype', () => {
      const state = createStateInNewMind('world')
      // Register a traittype that won't have any referrers
      const unused_traittype = new Traittype('unused_trait', 'Subject')
      Traittype.register('unused_trait', unused_traittype)

      const room = Belief.from_template(state, {
        bases: ['Location'],
        traits: {'@label': 'void'}
      })
      state.lock()

      const result = room.rev_trait(state, unused_traittype)
      assert.isArray(result)
      assert.lengthOf(result, 0)
    })

    it('handles subject never referenced', () => {
      const state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from_template(state, {
        bases: ['Location'],
        traits: {'@label': 'abandoned'}
      })
      state.lock()

      const result = room.rev_trait(state, location_traittype)
      assert.lengthOf(result, 0)
    })

    it('deduplicates same belief added multiple times', () => {
      const state1 = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {'@label': 'plaza'}
      })
      const npc = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {'@label': 'statue', 'location': room.subject}
      })
      state1.lock()

      // State 2: "update" NPC with same location
      const state2 = state1.branch_state(logos().origin_state, 1)
      const npc2 = Belief.from_template(state2, {
        bases: [npc],
        traits: {'location': room.subject}  // Same location
      })
      state2.replace_beliefs(npc2)
      state2.lock()

      // Should only return npc2 (current version), not duplicates
      const occupants = room.rev_trait(state2, location_traittype)
      assert.lengthOf(occupants, 1)
      assert.strictEqual(occupants[0], npc2)
    })
  })

  describe('Trait Type Isolation', () => {
    it('different trait types on same subject are isolated', () => {
      const state = createStateInNewMind('world')
      const container_traittype = Traittype.get_by_label('container')
      const location_traittype = Traittype.get_by_label('location')

      const container = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {'@label': 'chest'}
      })
      const room = Belief.from_template(state, {
        bases: ['Location'],
        traits: {'@label': 'vault'}
      })

      // Chest is both located in room AND contains items
      const item1 = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {
          '@label': 'sword',
          'location': room.subject,
          'container': container.subject
        }
      })
      const item2 = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {
          '@label': 'gold',
          'container': container.subject
        }
      })
      state.lock()

      // Container query should find items inside it
      const contents = container.rev_trait(state, container_traittype)
      assert.lengthOf(contents, 2)
      assert.includeMembers(contents, [item1, item2])

      // Room query should find only item with location
      const room_contents = room.rev_trait(state, location_traittype)
      assert.lengthOf(room_contents, 1)
      assert.strictEqual(room_contents[0], item1)
    })
  })

  describe('Integration Tests', () => {
    it('works with locked and unlocked states', () => {
      const state1 = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {'@label': 'stable'}
      })
      const npc = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {'@label': 'groom', 'location': room.subject}
      })

      // Query on unlocked state
      const occupants_unlocked = room.rev_trait(state1, location_traittype)
      assert.lengthOf(occupants_unlocked, 1)

      state1.lock()

      // Query on locked state
      const occupants_locked = room.rev_trait(state1, location_traittype)
      assert.lengthOf(occupants_locked, 1)
      assert.strictEqual(occupants_locked[0], npc)
    })

    it('only tracks Subject trait type (not primitives)', () => {
      const state = createStateInNewMind('world')
      const name_traittype = Traittype.get_by_label('name')

      const npc = Belief.from_template(state, {
        bases: ['Actor'],
        traits: {
          '@label': 'wizard',
          'name': 'Gandalf'  // string, not Subject
        }
      })
      state.lock()

      // name trait is string type, should not be indexed
      // Verify rev_trait doesn't crash and returns empty
      const result = npc.rev_trait(state, name_traittype)
      assert.isArray(result)
    })
  })

  describe('Real-world Scenarios', () => {
    it('finds all NPCs in a location', () => {
      const state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const tavern = Belief.from_template(state, {
        bases: ['Location'],
        traits: {'@label': 'tavern'}
      })

      const bartender = Belief.from_template(state, {
        bases: ['Actor'],
        traits: {'@label': 'bartender', 'location': tavern.subject}
      })
      const patron1 = Belief.from_template(state, {
        bases: ['Actor'],
        traits: {'@label': 'drunk', 'location': tavern.subject}
      })
      const patron2 = Belief.from_template(state, {
        bases: ['Actor'],
        traits: {'@label': 'merchant', 'location': tavern.subject}
      })
      state.lock()

      const people_in_tavern = tavern.rev_trait(state, location_traittype)
      assert.lengthOf(people_in_tavern, 3)
      assert.includeMembers(people_in_tavern, [bartender, patron1, patron2])
    })

    it('finds all items in a container', () => {
      const state = createStateInNewMind('world')
      const container_traittype = Traittype.get_by_label('container')

      const backpack = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {'@label': 'backpack'}
      })

      const sword = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {'@label': 'sword', 'container': backpack.subject}
      })
      const potion = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {'@label': 'potion', 'container': backpack.subject}
      })
      const rope = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {'@label': 'rope', 'container': backpack.subject}
      })
      state.lock()

      const inventory = backpack.rev_trait(state, container_traittype)
      assert.lengthOf(inventory, 3)
      assert.includeMembers(inventory, [sword, potion, rope])
    })
  })

  describe('Performance and Stress Tests', () => {
    it('combined stress test: 100+ referrers × deep state chain', () => {
      // Tests: Skip list optimization scales with many referrers and deep chains
      // Setup: 100+ NPCs × 100-state chain (10,000 potential lookups)
      // Expected: < 10ms with skip list optimization

      let state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const location = Belief.from_template(state, {
        bases: ['Location'],
        traits: {'@label': 'city_square'}
      })
      state.lock()

      const all_npcs = []

      // Create 100 states with sparse NPC additions
      for (let i = 0; i < 100; i++) {
        state = state.branch_state(logos().origin_state, i + 2)

        // Add 1-2 NPCs every 5 states (total ~25 NPCs)
        if (i % 5 === 0) {
          const npc1 = Belief.from_template(state, {
            bases: ['Actor'],
            traits: {
              '@label': `citizen_${i}_a`,
              'location': location.subject
            }
          })
          all_npcs.push(npc1)

          if (i % 10 === 0) {
            const npc2 = Belief.from_template(state, {
              bases: ['Actor'],
              traits: {
                '@label': `citizen_${i}_b`,
                'location': location.subject
              }
            })
            all_npcs.push(npc2)
          }
        }

        state.lock()
      }

      // Query with performance timing
      const start = Date.now()
      const occupants = location.rev_trait(state, location_traittype)
      const duration = Date.now() - start

      // Verify correctness
      assert.lengthOf(occupants, all_npcs.length,
        `Should find all ${all_npcs.length} NPCs across 100-state chain`)
      assert.includeMembers(occupants, all_npcs)

      // Verify performance (skip list should make this fast)
      assert.isBelow(duration, 10,
        'Skip list optimization should complete in < 10ms')
    })

    it('wide fanout: 10 parallel branches with independent changes', () => {
      // Tests: rev_trait correctness with branching state trees
      // Setup: 1 root → 10 branches, each adds different NPCs
      // Expected: Each branch sees only its own NPCs + root NPCs

      const root_state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const plaza = Belief.from_template(root_state, {
        bases: ['Location'],
        traits: {'@label': 'plaza'}
      })

      // Root has 2 NPCs
      const root_npc1 = Belief.from_template(root_state, {
        bases: ['Actor'],
        traits: {'@label': 'statue', 'location': plaza.subject}
      })
      const root_npc2 = Belief.from_template(root_state, {
        bases: ['Actor'],
        traits: {'@label': 'fountain', 'location': plaza.subject}
      })
      root_state.lock()

      // Create 10 branches, each adding 1 unique NPC
      const branches = []
      for (let i = 0; i < 10; i++) {
        const branch = root_state.branch_state(logos().origin_state, i + 2)

        const branch_npc = Belief.from_template(branch, {
          bases: ['Actor'],
          traits: {
            '@label': `visitor_${i}`,
            'location': plaza.subject
          }
        })
        branch.lock()

        branches.push({ state: branch, npc: branch_npc })
      }

      // Verify each branch sees exactly 3 NPCs (2 root + 1 own)
      for (let i = 0; i < 10; i++) {
        const { state: branch, npc } = branches[i]
        const occupants = plaza.rev_trait(branch, location_traittype)

        assert.lengthOf(occupants, 3,
          `Branch ${i} should see 2 root + 1 own NPC`)
        assert.includeMembers(occupants, [root_npc1, root_npc2, npc],
          `Branch ${i} should include root NPCs and own NPC`)

        // Verify branch does NOT see other branches' NPCs
        for (let j = 0; j < 10; j++) {
          if (i !== j) {
            assert.notInclude(occupants, branches[j].npc,
              `Branch ${i} should NOT see branch ${j}'s NPC`)
          }
        }
      }

      // Root state should see only 2 NPCs
      const root_occupants = plaza.rev_trait(root_state, location_traittype)
      assert.lengthOf(root_occupants, 2,
        'Root state should see only its own 2 NPCs')
    })
  })
})
