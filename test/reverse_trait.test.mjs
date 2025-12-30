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
 * ✅ Convergence traversal (fixed 2025-11-16, see reverse_trait_convergence.test.mjs)
 *
 * See also: test/reverse_trait_convergence.test.mjs for Convergence-specific tests
 */

import { assert } from 'chai'
import { setupStandardArchetypes, createStateInNewMind, setupAfterEachValidation } from './helpers.mjs'
import { Belief } from '../public/worker/belief.mjs'
import { Traittype } from '../public/worker/traittype.mjs'
import { Archetype } from '../public/worker/archetype.mjs'
import { Mind, Materia, Fuzzy } from '../public/worker/cosmos.mjs'
import { eidos } from '../public/worker/eidos.mjs'
import { logos, logos_state } from '../public/worker/logos.mjs'
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
  setupAfterEachValidation();


  describe('Basic Functionality', () => {
    it('returns empty array when no beliefs reference the subject', () => {
      const state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      // Create a room that nothing references
      const room = Belief.from(state, [Archetype.get_by_label('Location')], {})
      state.lock()

      // Query for beliefs with location trait pointing to this room
      const referrers = [...room.rev_trait(state, location_traittype)]

      assert.isArray(referrers)
      assert.lengthOf(referrers, 0)
    })

    it('returns single belief that references the subject', () => {
      const state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      // Create a room
      const room = Belief.from(state, [Archetype.get_by_label('Location')], {})

      // Create NPC in that room
      const npc = Belief.from(state, [Archetype.get_by_label('Actor')], {
        location: room.subject
      })
      state.lock()

      // Query: who is in the tavern?
      const occupants = [...room.rev_trait(state, location_traittype)]

      assert.lengthOf(occupants, 1)
      assert.strictEqual(occupants[0], npc)
    })

    it('returns multiple beliefs that reference the subject', () => {
      const state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      // Create a room
      const room = Belief.from(state, [Archetype.get_by_label('Location')], {})

      // Create multiple NPCs in that room
      const npc1 = Belief.from(state, [Archetype.get_by_label('Actor')], {
        location: room.subject
      })
      const npc2 = Belief.from(state, [Archetype.get_by_label('Actor')], {
        location: room.subject
      })
      const npc3 = Belief.from(state, [Archetype.get_by_label('Actor')], {
        location: room.subject
      })
      state.lock()

      // Query: who is in the marketplace?
      const occupants = [...room.rev_trait(state, location_traittype)]

      assert.lengthOf(occupants, 3)
      assert.includeMembers(occupants, [npc1, npc2, npc3])
    })
  })

  describe('State Chain Traversal', () => {
    it('works with single state (no base chain)', () => {
      const state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from(state, [Archetype.get_by_label('Location')], {})
      const npc = Belief.from(state, [Archetype.get_by_label('Actor')], {
        location: room.subject
      })
      state.lock()

      const occupants = [...room.rev_trait(state, location_traittype)]
      assert.lengthOf(occupants, 1)
      assert.strictEqual(occupants[0], npc)
    })

    it('traverses two-state chain correctly', () => {
      const state1 = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from(state1, [Archetype.get_by_label('Location')], {})
      const npc1 = Belief.from(state1, [Archetype.get_by_label('Actor')], {
        location: room.subject
      })
      state1.lock()

      // State 2: Add another NPC
      const state2 = state1.branch(logos().origin_state, 1)
      const npc2 = Belief.from(state2, [Archetype.get_by_label('Actor')], {
        location: room.subject
      })
      state2.lock()

      // Query from state2 should see both NPCs
      const occupants = [...room.rev_trait(state2, location_traittype)]
      assert.lengthOf(occupants, 2)
      assert.includeMembers(occupants, [npc1, npc2])

      // Query from state1 should see only npc1
      const occupants1 = [...room.rev_trait(state1, location_traittype)]
      assert.lengthOf(occupants1, 1)
      assert.strictEqual(occupants1[0], npc1)
    })

    it('traverses long chain with sparse changes (skip list optimization)', () => {
      let state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from(state, [Archetype.get_by_label('Location')], {})
      state.lock()

      // Create 10 states, only add NPCs in states 0, 3, 7
      const npcs = []
      for (let i = 0; i < 10; i++) {
        state = state.branch(logos().origin_state, i + 2)

        if (i === 0 || i === 3 || i === 7) {
          const npc = Belief.from(state, [Archetype.get_by_label('Actor')], {
            location: room.subject
          })
          npcs.push(npc)
        }

        state.lock()
      }

      // Query should find all 3 NPCs despite 10-state chain
      const occupants = [...room.rev_trait(state, location_traittype)]
      assert.lengthOf(occupants, 3)
      assert.includeMembers(occupants, npcs)
    })
  })

  describe('Add/Del Patterns', () => {
    it('handles only additions across states', () => {
      let state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from(state, [Archetype.get_by_label('Location')], {})
      state.lock()

      // Add NPCs in sequence
      const npcs = []
      for (let i = 0; i < 3; i++) {
        state = state.branch(logos().origin_state, i + 2)
        const npc = Belief.from(state, [Archetype.get_by_label('Actor')], {
          location: room.subject
        })
        npcs.push(npc)
        state.lock()
      }

      const occupants = [...room.rev_trait(state, location_traittype)]
      assert.lengthOf(occupants, 3)
      assert.includeMembers(occupants, npcs)
    })

    it('handles add then remove pattern', () => {
      const state1 = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room1 = Belief.from(state1, [Archetype.get_by_label('Location')], {})
      const room2 = Belief.from(state1, [Archetype.get_by_label('Location')], {})
      const npc = Belief.from(state1, [Archetype.get_by_label('Actor')], {
        location: room1.subject
      })
      state1.lock()

      // State 2: NPC moves to bedroom
      const state2 = state1.branch(logos().origin_state, 1)
      const npc2 = new Belief(state2, npc.subject, [npc]);
      npc2.add_trait(location_traittype, room2.subject);
      state2.insert_beliefs(npc2);
      state2.remove_beliefs(npc);
      state2.lock()

      // Kitchen should have no occupants in state2
      const kitchen_occupants = [...room1.rev_trait(state2, location_traittype)]
      assert.lengthOf(kitchen_occupants, 0)

      // Bedroom should have the NPC in state2
      const bedroom_occupants = [...room2.rev_trait(state2, location_traittype)]
      assert.lengthOf(bedroom_occupants, 1)
      assert.strictEqual(bedroom_occupants[0], npc2)

      // Kitchen should still have occupant in state1
      const kitchen_occupants_old = [...room1.rev_trait(state1, location_traittype)]
      assert.lengthOf(kitchen_occupants_old, 1)
    })

    it('handles resurrection pattern (remove then add)', () => {
      const state1 = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from(state1, [Archetype.get_by_label('Location')], {})
      const npc = Belief.from(state1, [Archetype.get_by_label('Actor')], {
        location: room.subject
      })
      state1.lock()

      // State 2: King leaves (remove location)
      const state2 = state1.branch(logos().origin_state, 1)
      const npc2 = new Belief(state2, npc.subject, [npc]);
      npc2.add_trait(location_traittype, null);
      state2.insert_beliefs(npc2);
      state2.remove_beliefs(npc);
      state2.lock()

      // State 3: King returns
      const state3 = state2.branch(logos().origin_state, 2)
      const npc3 = new Belief(state3, npc.subject, [npc2]);
      npc3.add_trait(location_traittype, room.subject);
      state3.insert_beliefs(npc3);
      state3.remove_beliefs(npc2);
      state3.lock()

      // State 1: King present
      assert.lengthOf([...room.rev_trait(state1, location_traittype)], 1)

      // State 2: King absent
      assert.lengthOf([...room.rev_trait(state2, location_traittype)], 0)

      // State 3: King returns
      assert.lengthOf([...room.rev_trait(state3, location_traittype)], 1)
      assert.strictEqual([...room.rev_trait(state3, location_traittype)][0], npc3)
    })
  })

  describe('Skip List Correctness', () => {
    it('sets skip list pointer on first add/del operation', () => {
      const state1 = createStateInNewMind('world')

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'workshop'
      })
      state1.lock()

      const state2 = state1.branch(logos().origin_state, 1)
      const npc = Belief.from_template(state2, {
        bases: ['Actor'],
        traits: {'location': room.subject}, label: 'smith'
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
        traits: {}, label: 'library'
      })
      const npc1 = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {'location': room.subject}, label: 'scholar'
      })
      state1.lock()

      // State 2: no changes to location references
      const state2 = state1.branch(logos().origin_state, 1)
      state2.lock()

      // State 3: no changes
      const state3 = state2.branch(logos().origin_state, 2)
      state3.lock()

      // State 4: add another NPC
      const state4 = state3.branch(logos().origin_state, 3)
      const npc2 = Belief.from_template(state4, {
        bases: ['Actor'],
        traits: {'location': room.subject}, label: 'student'
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
        traits: {}, label: 'armory'
      })
      const room2 = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'treasury'
      })
      const npc = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {'location': room1.subject}, label: 'guard'
      })
      state1.lock()

      // State 2: different room gets occupant
      const state2 = state1.branch(logos().origin_state, 1)
      const npc2 = Belief.from_template(state2, {
        bases: ['Actor'],
        traits: {'location': room2.subject}, label: 'treasurer'
      })
      state2.lock()

      // Each room should only see its own occupant
      assert.lengthOf([...room1.rev_trait(state2, location_traittype)], 1)
      assert.strictEqual([...room1.rev_trait(state2, location_traittype)][0], npc)

      assert.lengthOf([...room2.rev_trait(state2, location_traittype)], 1)
      assert.strictEqual([...room2.rev_trait(state2, location_traittype)][0], npc2)
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
        traits: {}, label: 'void'
      })
      state.lock()

      const result = [...room.rev_trait(state, unused_traittype)]
      assert.isArray(result)
      assert.lengthOf(result, 0)
    })

    it('handles subject never referenced', () => {
      const state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from_template(state, {
        bases: ['Location'],
        traits: {}, label: 'abandoned'
      })
      state.lock()

      const result = [...room.rev_trait(state, location_traittype)]
      assert.lengthOf(result, 0)
    })

    it('deduplicates same belief added multiple times', () => {
      const state1 = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'plaza'
      })
      const npc = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {'location': room.subject}, label: 'statue'
      })
      state1.lock()

      // State 2: "update" NPC with same location
      const state2 = state1.branch(logos().origin_state, 1)
      const npc2 = Belief.from_template(state2, {
        bases: [npc],
        traits: {'location': room.subject}  // Same location
      })
      state2.replace_beliefs(npc2)
      state2.lock()

      // Should only return npc2 (current version), not duplicates
      const occupants = [...room.rev_trait(state2, location_traittype)]
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
        traits: {}, label: 'chest'
      })
      const room = Belief.from_template(state, {
        bases: ['Location'],
        traits: {}, label: 'vault'
      })

      // Chest is both located in room AND contains items
      const item1 = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {
          'location': room.subject,
          'container': container.subject
        },
        label: 'sword'
      })
      const item2 = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {
          'container': container.subject
        },
        label: 'gold'
      })
      state.lock()

      // Container query should find items inside it
      const contents = [...container.rev_trait(state, container_traittype)]
      assert.lengthOf(contents, 2)
      assert.includeMembers(contents, [item1, item2])

      // Room query should find only item with location
      const room_contents = [...room.rev_trait(state, location_traittype)]
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
        traits: {}, label: 'stable'
      })
      const npc = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {'location': room.subject}, label: 'groom'
      })

      // Query on unlocked state
      const occupants_unlocked = [...room.rev_trait(state1, location_traittype)]
      assert.lengthOf(occupants_unlocked, 1)

      state1.lock()

      // Query on locked state
      const occupants_locked = [...room.rev_trait(state1, location_traittype)]
      assert.lengthOf(occupants_locked, 1)
      assert.strictEqual(occupants_locked[0], npc)
    })

    it('only tracks Subject trait type (not primitives)', () => {
      const state = createStateInNewMind('world')
      const name_traittype = Traittype.get_by_label('name')

      const npc = Belief.from_template(state, {
        bases: ['Actor'],
        traits: {
          'name': 'Gandalf'  // string, not Subject
        },
        label: 'wizard'
      })
      state.lock()

      // name trait is string type, should not be indexed
      // Verify rev_trait doesn't crash and returns empty
      const result = [...npc.rev_trait(state, name_traittype)]
      assert.isArray(result)
    })
  })

  describe('Real-world Scenarios', () => {
    it('finds all NPCs in a location', () => {
      const state = createStateInNewMind('world')
      const location_traittype = Traittype.get_by_label('location')

      const tavern = Belief.from_template(state, {
        bases: ['Location'],
        traits: {}, label: 'tavern'
      })

      const bartender = Belief.from_template(state, {
        bases: ['Actor'],
        traits: {'location': tavern.subject}, label: 'bartender'
      })
      const patron1 = Belief.from_template(state, {
        bases: ['Actor'],
        traits: {'location': tavern.subject}, label: 'drunk'
      })
      const patron2 = Belief.from_template(state, {
        bases: ['Actor'],
        traits: {'location': tavern.subject}, label: 'merchant'
      })
      state.lock()

      const people_in_tavern = [...tavern.rev_trait(state, location_traittype)]
      assert.lengthOf(people_in_tavern, 3)
      assert.includeMembers(people_in_tavern, [bartender, patron1, patron2])
    })

    it('finds all items in a container', () => {
      const state = createStateInNewMind('world')
      const container_traittype = Traittype.get_by_label('container')

      const backpack = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {}, label: 'backpack'
      })

      const sword = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {'container': backpack.subject}, label: 'sword'
      })
      const potion = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {'container': backpack.subject}, label: 'potion'
      })
      const rope = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {'container': backpack.subject}, label: 'rope'
      })
      state.lock()

      const inventory = [...backpack.rev_trait(state, container_traittype)]
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
        traits: {}, label: 'city_square'
      })
      state.lock()

      const all_npcs = []

      // Create 100 states with sparse NPC additions
      for (let i = 0; i < 100; i++) {
        state = state.branch(logos().origin_state, i + 2)

        // Add 1-2 NPCs every 5 states (total ~25 NPCs)
        if (i % 5 === 0) {
          const npc1 = Belief.from_template(state, {
            bases: ['Actor'],
            traits: {
              'location': location.subject
            },
            label: `citizen_${i}_a`
          })
          all_npcs.push(npc1)

          if (i % 10 === 0) {
            const npc2 = Belief.from_template(state, {
              bases: ['Actor'],
              traits: {
                'location': location.subject
              },
              label: `citizen_${i}_b`
            })
            all_npcs.push(npc2)
          }
        }

        state.lock()
      }

      // Query with performance timing
      const start = Date.now()
      const occupants = [...location.rev_trait(state, location_traittype)]
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
        traits: {}, label: 'plaza'
      })

      // Root has 2 NPCs
      const root_npc1 = Belief.from_template(root_state, {
        bases: ['Actor'],
        traits: {'location': plaza.subject}, label: 'statue'
      })
      const root_npc2 = Belief.from_template(root_state, {
        bases: ['Actor'],
        traits: {'location': plaza.subject}, label: 'fountain'
      })
      root_state.lock()

      // Create 10 branches, each adding 1 unique NPC
      const branches = []
      for (let i = 0; i < 10; i++) {
        const branch = root_state.branch(logos().origin_state, i + 2)

        const branch_npc = Belief.from_template(branch, {
          bases: ['Actor'],
          traits: {
            'location': plaza.subject
          },
          label: `visitor_${i}`
        })
        branch.lock()

        branches.push({ state: branch, npc: branch_npc })
      }

      // Verify each branch sees exactly 3 NPCs (2 root + 1 own)
      for (let i = 0; i < 10; i++) {
        const { state: branch, npc } = branches[i]
        const occupants = [...plaza.rev_trait(branch, location_traittype)]

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
      const root_occupants = [...plaza.rev_trait(root_state, location_traittype)]
      assert.lengthOf(root_occupants, 2,
        'Root state should see only its own 2 NPCs')
    })
  })

  describe('Inheritance and Composition', () => {
    describe('Test 4.2: Archetype Defaults and Reverse Index', () => {
      it('belief inheriting archetype default location should NOT appear in warehouse.rev_trait()', () => {
        // Setup: Register archetypes with default location referencing another archetype
        DB.reset_registries()
        DB.register(
          {
            '@about': { type: 'Subject', mind: 'parent', exposure: 'internal' },
            location: { type: 'Location', exposure: 'spatial' }
          },
          {
            Thing: { traits: { '@about': null } },
            Location: { bases: ['Thing'] },
            Warehouse: { bases: ['Location'] },
            Container: {
              bases: ['Thing'],
              traits: {
                location: 'Warehouse'  // Default location archetype (will resolve to Archetype object)
              }
            }
          },
          {}
        )

        const location_tt = Traittype.get_by_label('location')
        const warehouse_archetype = Archetype.get_by_label('Warehouse')

        // Create world state and add chest that inherits Container archetype
        const state = createStateInNewMind('world')

        // Create warehouse belief
        const warehouse = state.add_belief_from_template({
          bases: ['Warehouse'],
          traits: {}, label: 'warehouse'
        })

        // Create chest that inherits from Container archetype
        // chest does NOT explicitly set location - inherits from archetype default
        const chest = state.add_belief_from_template({
          bases: ['Container'],
          traits: {}, label: 'chest'
        })

        state.lock()

        // Verify chest inherited the location from archetype default
        const chest_location = chest.get_trait(state, location_tt)

        // Archetype defaults are now resolved to Archetype objects during DB.register()
        // When belief inherits from archetype, it gets the Archetype object as the trait value
        assert.strictEqual(chest_location, warehouse_archetype, 'chest should inherit Warehouse archetype from Container archetype default')

        // Test: Does warehouse.rev_trait() find chest?
        const items_in_warehouse = [...warehouse.rev_trait(state, location_tt)]

        // Archetype defaults are resolved to Archetype objects (not Subjects)
        // Therefore warehouse.subject is never added to reverse index
        assert.isArray(items_in_warehouse, 'should return array')
        assert.lengthOf(items_in_warehouse, 0, 'chest should NOT appear - archetype default is Archetype object, not warehouse Subject')
      })
    })

    describe('Test 7.3: Composable Inheritance Without Explicit Set', () => {
      it('sword inherited WITHOUT explicit set should appear in sword.rev_trait()', () => {
        // Setup: Register inventory as composable trait
        DB.reset_registries()
        DB.register(
          {
            '@about': { type: 'Subject', mind: 'parent', exposure: 'internal' },
            inventory: {
              type: 'PortableObject',
              container: Array,
              composable: true
            }
          },
          {
            Thing: { traits: { '@about': null } },
            PortableObject: { bases: ['Thing'] },
            Person: {
              bases: ['Thing'],
              traits: { inventory: null }
            }
          },
          {
            sword: { bases: ['PortableObject'] },
            Warrior: {
              bases: ['Person'],
              traits: {
                inventory: ['sword']  // Warrior proto has sword
              }
            }
          }
        )

        const inventory_tt = Traittype.get_by_label('inventory')
        const eidos_state = eidos().origin_state
        const sword = eidos_state.get_belief_by_label('sword')
        const warrior_proto = eidos_state.get_belief_by_label('Warrior')

        // Create knight that inherits from Warrior but does NOT set inventory
        const state = createStateInNewMind('world')

        const knight = state.add_belief_from_template({
          bases: [warrior_proto],  // Inherit Warrior prototype
          traits: {
            // NO inventory trait set! Should inherit [sword] from Warrior
          },
          label: 'knight'
        })

        state.lock()

        // Verify knight inherited the sword
        const knight_inventory = knight.get_trait(state, inventory_tt)
        assert.isArray(knight_inventory, 'inventory should be array')
        assert.lengthOf(knight_inventory, 1, 'knight should have 1 item (inherited)')
        assert.strictEqual(knight_inventory[0].get_label(), 'sword', 'knight should have inherited sword')

        // Verify knight does NOT have inventory in own _traits
        assert.isFalse(knight._traits.has(inventory_tt), 'knight should NOT have inventory in own _traits (inherited only)')

        // Test: Does sword.rev_trait() find knight even though knight._traits doesn't have inventory?
        const who_has_sword = [...sword.rev_trait(state, inventory_tt)]

        assert.include(who_has_sword, knight, 'knight should appear in sword.rev_trait() even though inventory is inherited, not in _traits')
      })
    })

    describe('Test 5.1: Inherited References from Belief Bases', () => {
      it('npc_v2 inheriting location from npc_v1 should appear in tavern.rev_trait()', () => {
        DB.reset_registries()
        setupStandardArchetypes()

        const location_tt = Traittype.get_by_label('location')

        // State 1: Create NPC v1 with explicit location
        const mind = createStateInNewMind('world', 1).in_mind
        const state1 = mind.origin_state
        const logos_state_ref = mind.parent.origin_state  // Get logos_state from parent mind

        const tavern = state1.add_belief_from_template({
          bases: ['Location'],
          traits: {}, label: 'tavern'
        })

        const npc_v1 = state1.add_belief_from_template({
          bases: ['Actor'],
          traits: {
            location: tavern.subject  // Explicitly set
          },
          label: 'npc'
        })

        state1.lock()

        // State 2: Branch from state1 (ground_state must be in parent mind = logos_state)
        const state2 = state1.branch(logos_state_ref, 2)  // vt = 2

        // Create v2 as new version of same subject (same sid, new belief)
        const npc_v2 = Belief.from_template(state2, {
          sid: npc_v1.subject.sid,  // Same subject (versioned belief)
          bases: [npc_v1],  // Inherit from v1
          traits: {}  // Does NOT set location explicitly (inherits from v1)
        })

        state2.lock()

        // Verify npc_v2 inherited the location
        const v2_location = npc_v2.get_trait(state2, location_tt)
        assert.strictEqual(v2_location, tavern.subject, 'npc_v2 should inherit tavern location from npc_v1')

        // Verify npc_v2 does NOT have location in own traits
        assert.isFalse(npc_v2._traits.has(location_tt), 'npc_v2 should NOT have location in own _traits (inherited only)')

        // Test: Does tavern.rev_trait() find npc_v2 even though npc_v2._traits doesn't have location?
        const who_is_in_tavern = [...tavern.rev_trait(state2, location_tt)]

        // Both v1 and v2 should appear (v2 inherits the reference)
        assert.include(who_is_in_tavern, npc_v1, 'npc_v1 should appear (explicit location)')
        assert.include(who_is_in_tavern, npc_v2, 'npc_v2 should appear even though location is inherited, not in _traits')
      })
    })

    describe('Test 3.3: Composable Array - Explicit Set with Composition', () => {
      it('both inherited and explicit items should appear when composable trait is set', () => {
        // This tests composition AT CREATION TIME (different from Test 7.3)
        DB.reset_registries()
        DB.register(
          {
            '@about': { type: 'Subject', mind: 'parent', exposure: 'internal' },
            inventory: {
              type: 'PortableObject',
              container: Array,
              composable: true
            }
          },
          {
            Thing: { traits: { '@about': null } },
            PortableObject: { bases: ['Thing'] },
            Person: {
              bases: ['Thing'],
              traits: { inventory: null }
            }
          },
          {
            sword: { bases: ['PortableObject'] },
            shield: { bases: ['PortableObject'] },
            Warrior: {
              bases: ['Person'],
              traits: {
                inventory: ['sword']
              }
            }
          }
        )

        const inventory_tt = Traittype.get_by_label('inventory')
        const eidos_state = eidos().origin_state
        const sword = eidos_state.get_belief_by_label('sword')
        const shield = eidos_state.get_belief_by_label('shield')
        const warrior_proto = eidos_state.get_belief_by_label('Warrior')

        const state = createStateInNewMind('world')

        // Knight explicitly sets inventory (composes at creation time)
        const knight = state.add_belief_from_template({
          bases: [warrior_proto],
          traits: {
            inventory: [shield.subject]  // Explicit set triggers composition
          },
          label: 'knight'
        })

        state.lock()

        // Verify composition happened at creation (both items in _traits)
        assert.isTrue(knight._traits.has(inventory_tt), 'knight should have inventory in _traits (composed at creation)')
        const knight_inventory = knight._traits.get(inventory_tt)
        assert.lengthOf(knight_inventory, 2, 'knight._traits should have 2 items (composed)')

        // Both items should appear in rev_trait
        const who_has_sword = [...sword.rev_trait(state, inventory_tt)]
        const who_has_shield = [...shield.rev_trait(state, inventory_tt)]

        assert.include(who_has_sword, knight, 'sword should appear (composed into _traits)')
        assert.include(who_has_shield, knight, 'shield should appear (explicit)')
      })
    })

    describe('Test 1.3: Non-Composable Array References', () => {
      it('each array element should appear in rev_trait for non-composable arrays', () => {
        DB.reset_registries()
        setupStandardArchetypes()

        // Register children as non-composable array
        const children_tt = new Traittype('children', {
          type: 'Person',
          container: Array,
          composable: false  // Non-composable
        })
        Traittype.register('children', children_tt)

        const person_arch = Archetype.get_by_label('Person')
        person_arch._traits_template.set(children_tt, null)

        const state = createStateInNewMind('world')

        // Create family members
        const alice = state.add_belief_from_template({
          bases: ['Person'],
          traits: {}, label: 'alice'
        })
        const bob = state.add_belief_from_template({
          bases: ['Person'],
          traits: {}, label: 'bob'
        })

        // Create family with children array
        const family = state.add_belief_from_template({
          bases: ['Person'],
          traits: {
            children: [alice.subject, bob.subject]
          },
          label: 'family'
        })

        state.lock()

        // Each child should appear in rev_trait
        const alice_parents = [...alice.rev_trait(state, children_tt)]
        const bob_parents = [...bob.rev_trait(state, children_tt)]

        assert.include(alice_parents, family, 'alice should appear in family.children reverse lookup')
        assert.include(bob_parents, family, 'bob should appear in family.children reverse lookup')
      })
    })

    describe('Test 3.1: Array with Multiple Subjects', () => {
      it('all array elements should appear in rev_trait', () => {
        DB.reset_registries()
        setupStandardArchetypes()

        // Register witnesses as non-composable array
        const witnesses_tt = new Traittype('witnesses', {
          type: 'Person',
          container: Array,
          composable: false
        })
        Traittype.register('witnesses', witnesses_tt)

        const thing_arch = Archetype.get_by_label('Thing')
        thing_arch._traits_template.set(witnesses_tt, null)

        const state = createStateInNewMind('world')

        // Create witnesses
        const alice = state.add_belief_from_template({
          bases: ['Person'],
          traits: {}, label: 'alice'
        })
        const bob = state.add_belief_from_template({
          bases: ['Person'],
          traits: {}, label: 'bob'
        })
        const charlie = state.add_belief_from_template({
          bases: ['Person'],
          traits: {}, label: 'charlie'
        })

        // Create crime with witnesses
        const crime = state.add_belief_from_template({
          bases: ['Thing'],
          traits: {
            witnesses: [alice.subject, bob.subject, charlie.subject]
          },
          label: 'crime'
        })

        state.lock()

        // All witnesses should appear in crime.witnesses reverse lookup
        const alice_witnessed = [...alice.rev_trait(state, witnesses_tt)]
        const bob_witnessed = [...bob.rev_trait(state, witnesses_tt)]
        const charlie_witnessed = [...charlie.rev_trait(state, witnesses_tt)]

        assert.include(alice_witnessed, crime, 'alice should appear in rev_trait for witnesses')
        assert.include(bob_witnessed, crime, 'bob should appear in rev_trait for witnesses')
        assert.include(charlie_witnessed, crime, 'charlie should appear in rev_trait for witnesses')
      })
    })

    describe('Test 3.2: Array Add/Remove Over Time', () => {
      it('array elements should be tracked correctly through add/remove', () => {
        DB.reset_registries()
        setupStandardArchetypes()

        const witnesses_tt = new Traittype('witnesses', {
          type: 'Person',
          container: Array,
          composable: false
        })
        Traittype.register('witnesses', witnesses_tt)

        const thing_arch = Archetype.get_by_label('Thing')
        thing_arch._traits_template.set(witnesses_tt, null)

        const logos_state_ref = logos().origin_state
        const mind = createStateInNewMind('world', 1).in_mind
        const state1 = mind.origin_state

        const alice = state1.add_belief_from_template({
          bases: ['Person'],
          traits: {}, label: 'alice'
        })
        const bob = state1.add_belief_from_template({
          bases: ['Person'],
          traits: {}, label: 'bob'
        })
        const charlie = state1.add_belief_from_template({
          bases: ['Person'],
          traits: {}, label: 'charlie'
        })

        // State 1: crime.witnesses = [alice, bob]
        const crime_v1 = state1.add_belief_from_template({
          bases: ['Thing'],
          traits: {
            witnesses: [alice.subject, bob.subject]
          },
          label: 'crime'
        })

        state1.lock()

        // State 2: Add charlie
        const state2 = state1.branch(logos_state_ref, 2)
        const crime_v2 = Belief.from_template(state2, {
          sid: crime_v1.subject.sid,
          bases: [crime_v1],
          traits: {
            witnesses: [alice.subject, bob.subject, charlie.subject]
          }
        })
        state2.replace_beliefs(crime_v2)
        state2.lock()

        // State 3: Remove bob
        const state3 = state2.branch(logos_state_ref, 3)
        const crime_v3 = Belief.from_template(state3, {
          sid: crime_v1.subject.sid,
          bases: [crime_v2],
          traits: {
            witnesses: [alice.subject, charlie.subject]
          }
        })
        state3.replace_beliefs(crime_v3)
        state3.lock()

        // Verify state 2: all three should be found
        const bob_at_state2 = [...bob.rev_trait(state2, witnesses_tt)]
        assert.include(bob_at_state2, crime_v2, 'bob should appear in state2 witnesses')

        // Verify state 3: bob should NOT be found (removed via replace_beliefs)
        const bob_at_state3 = [...bob.rev_trait(state3, witnesses_tt)]
        const has_crime = bob_at_state3.some(b => b.subject.sid === crime_v1.subject.sid)
        assert.isFalse(has_crime, 'bob should NOT appear in state3 witnesses after removal')

        // Alice and charlie should still be found in state3
        const alice_at_state3 = [...alice.rev_trait(state3, witnesses_tt)]
        const charlie_at_state3 = [...charlie.rev_trait(state3, witnesses_tt)]
        assert.include(alice_at_state3, crime_v3, 'alice should still appear in state3')
        assert.include(charlie_at_state3, crime_v3, 'charlie should appear in state3')
      })
    })

    describe('Test 3.4: Composable Array - Items Added Over Time', () => {
      it('inherited and added items should both appear in rev_trait across states', () => {
        DB.reset_registries()
        DB.register(
          {
            '@about': { type: 'Subject', mind: 'parent', exposure: 'internal' },
            inventory: {
              type: 'PortableObject',
              container: Array,
              composable: true
            }
          },
          {
            Thing: { traits: { '@about': null } },
            PortableObject: { bases: ['Thing'] },
            Person: {
              bases: ['Thing'],
              traits: { inventory: null }
            }
          },
          {
            sword: { bases: ['PortableObject'] },
            shield: { bases: ['PortableObject'] },
            helmet: { bases: ['PortableObject'] },
            Warrior: {
              bases: ['Person'],
              traits: {
                inventory: ['sword']
              }
            }
          }
        )

        const inventory_tt = Traittype.get_by_label('inventory')
        const eidos_state = eidos().origin_state
        const sword = eidos_state.get_belief_by_label('sword')
        const shield = eidos_state.get_belief_by_label('shield')
        const helmet = eidos_state.get_belief_by_label('helmet')
        const warrior_proto = eidos_state.get_belief_by_label('Warrior')

        const logos_state_ref = logos().origin_state
        const mind = createStateInNewMind('world', 1).in_mind
        const state1 = mind.origin_state

        // State 1: knight inherits [sword] from Warrior (no explicit inventory set)
        const knight_v1 = state1.add_belief_from_template({
          bases: [warrior_proto],
          traits: {}, label: 'knight'
        })

        state1.lock()

        // State 2: knight adds [shield]
        const state2 = state1.branch(logos_state_ref, 2)
        const knight_v2 = Belief.from_template(state2, {
          sid: knight_v1.subject.sid,
          bases: [knight_v1],
          traits: {
            inventory: [shield.subject]
          }
        })
        state2.replace_beliefs(knight_v2)
        state2.lock()

        // State 3: knight adds [helmet]
        const state3 = state2.branch(logos_state_ref, 3)
        const knight_v3 = Belief.from_template(state3, {
          sid: knight_v1.subject.sid,
          bases: [knight_v2],
          traits: {
            inventory: [shield.subject, helmet.subject]
          }
        })
        state3.replace_beliefs(knight_v3)
        state3.lock()

        // Sword should appear in all states (inherited)
        const sword_at_state1 = [...sword.rev_trait(state1, inventory_tt)]
        const sword_at_state2 = [...sword.rev_trait(state2, inventory_tt)]
        const sword_at_state3 = [...sword.rev_trait(state3, inventory_tt)]

        assert.include(sword_at_state1, knight_v1, 'sword should appear in state1 (inherited)')
        assert.include(sword_at_state2, knight_v2, 'sword should appear in state2 (still inherited)')
        assert.include(sword_at_state3, knight_v3, 'sword should appear in state3 (still inherited)')

        // Shield should appear in state2 and state3
        const shield_at_state2 = [...shield.rev_trait(state2, inventory_tt)]
        const shield_at_state3 = [...shield.rev_trait(state3, inventory_tt)]

        assert.include(shield_at_state2, knight_v2, 'shield should appear in state2 (added)')
        assert.include(shield_at_state3, knight_v3, 'shield should appear in state3 (retained)')

        // Helmet should only appear in state3
        const helmet_at_state3 = [...helmet.rev_trait(state3, inventory_tt)]
        assert.include(helmet_at_state3, knight_v3, 'helmet should appear in state3 (added)')
      })
    })

    describe('Null and Empty Array Semantics', () => {
      it('null blocks composition from bases', () => {
        // Test: Explicit null in composable array blocks inheritance
        DB.reset_registries()
        DB.register(
          {
            '@about': { type: 'Subject', mind: 'parent', exposure: 'internal' },
            inventory: {
              type: 'PortableObject',
              container: Array,
              composable: true
            }
          },
          {
            Thing: { traits: { '@about': null } },
            PortableObject: { bases: ['Thing'] },
            Actor: {
              bases: ['Thing'],
              traits: { inventory: null }
            }
          },
          {
            sword: { bases: ['PortableObject'] },
            Warrior: {
              bases: ['Actor'],
              traits: {
                inventory: ['sword']
              }
            }
          }
        )

        const eidos_state = eidos().origin_state
        const sword = eidos_state.get_belief_by_label('sword')
        const warrior_proto = eidos_state.get_belief_by_label('Warrior')

        const state = createStateInNewMind('world')

        // Pacifist explicitly sets inventory to null (blocks composition)
        const pacifist = state.add_belief_from_template({
          bases: [warrior_proto],
          traits: {
            inventory: null  // Blocks inheritance from Warrior
          },
          label: 'pacifist'
        })
        state.lock()

        const inventory_tt = Traittype.get_by_label('inventory')

        // pacifist should NOT appear in sword.rev_trait (null blocked it)
        const who_has_sword = [...sword.rev_trait(state, inventory_tt)]

        assert.notInclude(who_has_sword, pacifist, 'null should block composition - pacifist should not have sword')

        // Verify inventory is null
        const pacifist_inventory = pacifist.get_trait(state, inventory_tt)
        assert.isNull(pacifist_inventory)
      })

      it('empty array composes with base values', () => {
        // Test: Empty array [] is different from null - it still composes
        DB.reset_registries()
        DB.register(
          {
            '@about': { type: 'Subject', mind: 'parent', exposure: 'internal' },
            inventory: {
              type: 'PortableObject',
              container: Array,
              composable: true
            }
          },
          {
            Thing: { traits: { '@about': null } },
            PortableObject: { bases: ['Thing'] },
            Actor: {
              bases: ['Thing'],
              traits: { inventory: null }
            }
          },
          {
            sword: { bases: ['PortableObject'] },
            Warrior: {
              bases: ['Actor'],
              traits: {
                inventory: ['sword']
              }
            }
          }
        )

        const eidos_state = eidos().origin_state
        const sword = eidos_state.get_belief_by_label('sword')
        const warrior_proto = eidos_state.get_belief_by_label('Warrior')

        const state = createStateInNewMind('world')

        // Student sets empty array (should still compose with inherited items)
        const student = state.add_belief_from_template({
          bases: [warrior_proto],
          traits: {
            inventory: []  // Empty array - should compose with base
          },
          label: 'student'
        })
        state.lock()

        const inventory_tt = Traittype.get_by_label('inventory')

        // Student should still have sword (empty array composes with base)
        const student_inventory = student.get_trait(state, inventory_tt)
        assert.lengthOf(student_inventory, 1, 'empty array should compose with inherited values')

        // Student should appear in sword.rev_trait
        const who_has_sword = [...sword.rev_trait(state, inventory_tt)]
        assert.include(who_has_sword, student, 'empty array should compose - student should have inherited sword')
      })
    })
  })

  describe('Advanced Edge Cases', () => {
    describe('Shared Belief References', () => {
      it('tracks references to shared beliefs (prototypes)', () => {
        DB.reset_registries()
        setupStandardArchetypes()

        // Create shared belief in Eidos
        const eidos_inst = eidos()
        const eidos_state = eidos_inst.create_timed_state(100)

        Archetype.register('Weapon', new Archetype('Weapon', ['Thing']))

        const generic_weapon = eidos_state.add_belief_from_template({
          bases: ['Weapon'],
          traits: {}, label: 'GenericSword'
        })
        generic_weapon.lock(eidos_state)

        // Create belief in world that references the prototype
        const world_state = createStateInNewMind('world')
        Traittype.register('prototype', new Traittype('prototype', 'Subject'))

        const weapon_archetype = Archetype.get_by_label('Weapon')
        weapon_archetype._traits_template.set(Traittype.get_by_label('prototype'), null)

        const player_sword = Belief.from_template(world_state, {
          bases: ['Weapon'],
          traits: {
            prototype: generic_weapon.subject  // References shared belief
          },
          label: 'player_sword'
        })
        world_state.lock()

        // Query: what beliefs reference GenericSword?
        const prototype_traittype = Traittype.get_by_label('prototype')
        const instances = [...generic_weapon.rev_trait(world_state, prototype_traittype)]

        assert.lengthOf(instances, 1)
        assert.strictEqual(instances[0], player_sword)
      })
    })

    describe('Fuzzy Subject References', () => {
      it('tracks all Subject alternatives in Fuzzy trait values', () => {
        DB.reset_registries()
        setupStandardArchetypes()

        const state = createStateInNewMind('world')

        // Create two possible locations
        const location_tt = Traittype.get_by_label('location')
        const workshop = Belief.from_template(state, {
          bases: ['Location'], traits: {}, label: 'workshop'
        })
        const storage = Belief.from_template(state, {
          bases: ['Location'], traits: {}, label: 'storage'
        })

        // Create a tool with uncertain location (Fuzzy)
        const hammer = Belief.from_template(state, {
          bases: ['Tool'], traits: {}, label: 'hammer'
        })
        hammer._set_trait(location_tt, new Fuzzy({
          alternatives: [
            { value: workshop.subject, certainty: 0.6 },
            { value: storage.subject, certainty: 0.4 }
          ]
        }))

        state.lock()

        // rev_trait should find hammer for BOTH locations
        const at_workshop = [...workshop.rev_trait(state, location_tt)]
        const at_storage = [...storage.rev_trait(state, location_tt)]

        assert.lengthOf(at_workshop, 1, 'hammer should appear in workshop rev_trait')
        assert.strictEqual(at_workshop[0], hammer)

        assert.lengthOf(at_storage, 1, 'hammer should appear in storage rev_trait')
        assert.strictEqual(at_storage[0], hammer)
      })
    })

    describe('Self-Reference', () => {
      it('handles self-referencing belief', () => {
        DB.reset_registries()
        setupStandardArchetypes()

        const state = createStateInNewMind('world')

        Traittype.register('parent', new Traittype('parent', 'Subject'))

        const thing_archetype = Archetype.get_by_label('Thing')
        thing_archetype._traits_template.set(Traittype.get_by_label('parent'), null)

        const entity = Belief.from_template(state, {
          bases: ['Thing'],
          traits: {}, label: 'ouroboros'
        })

        // Entity references itself
        const parent_traittype = Traittype.get_by_label('parent')
        entity._set_trait(parent_traittype, entity.subject)
        state.lock()

        // Query should find itself
        const children = [...entity.rev_trait(state, parent_traittype)]

        assert.lengthOf(children, 1)
        assert.strictEqual(children[0], entity)
      })
    })

    describe('Cross-Mind Queries', () => {
      it('queries are state-scoped (cross-mind via shared parent)', () => {
        DB.reset_registries()
        setupStandardArchetypes()

        // Create two minds with shared parent state
        const parent_mind = new Materia(logos(), 'parent')
        const parent_state = parent_mind.create_state(logos().origin_state, {tt: 1})

        const shared_room = Belief.from_template(parent_state, {
          bases: ['Location'],
          traits: {}, label: 'shared_room'
        })
        parent_state.lock()

        // Child mind A
        const mind_a = new Materia(parent_mind, 'child_a')
        const state_a = mind_a.create_state(parent_state)
        const npc_a = Belief.from_template(state_a, {
          bases: ['Actor'],
          traits: {
            location: shared_room.subject
          },
          label: 'npc_a'
        })
        state_a.lock()

        // Child mind B
        const mind_b = new Materia(parent_mind, 'child_b')
        const state_b = mind_b.create_state(parent_state)
        const npc_b = Belief.from_template(state_b, {
          bases: ['Actor'],
          traits: {
            location: shared_room.subject
          },
          label: 'npc_b'
        })
        state_b.lock()

        const location_traittype = Traittype.get_by_label('location')

        // Query from mind_a should only see npc_a
        const occupants_a = [...shared_room.rev_trait(state_a, location_traittype)]
        assert.lengthOf(occupants_a, 1)
        assert.strictEqual(occupants_a[0], npc_a)

        // Query from mind_b should only see npc_b
        const occupants_b = [...shared_room.rev_trait(state_b, location_traittype)]
        assert.lengthOf(occupants_b, 1)
        assert.strictEqual(occupants_b[0], npc_b)
      })
    })
  })
})
