/**
 * Tests for State.rev_base() and UnionState.rev_base()
 *
 * These polymorphic methods enable rev_trait() to traverse both regular State chains
 * and UnionState component_states arrays using the same interface.
 *
 * NOTE: Full integration tests for rev_trait() with UnionState are in composable_mind.test.mjs
 * and reverse_trait.test.mjs. These tests focus on the rev_base() interface itself.
 */

import { expect } from 'chai'
import { setupStandardArchetypes, createStateInNewMind } from './helpers.mjs'
import { Belief } from '../public/worker/belief.mjs'
import { Traittype } from '../public/worker/traittype.mjs'
import { Mind, TemporalMind, logos } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'

describe('State.rev_base() and UnionState.rev_base()', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })

  describe('State.rev_base() - Basic Interface', () => {
    it('returns array with single next state when skip pointer exists', () => {
      const state1 = createStateInNewMind('world', 1)

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'room'
      })

      const person = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {location: room.subject}, label: 'person'
      })

      state1.lock()

      // Create state2 with location change
      const state2 = state1.branch_state(state1.ground_state, 2)

      const hallway = Belief.from_template(state2, {
        bases: ['Location'],
        traits: {}, label: 'hallway'
      })

      const person2 = Belief.from_template(state2, {
        bases: [person],
        traits: {location: hallway.subject}
      })
      state2.replace_beliefs(person2)
      state2.lock()

      // Create state3 with no changes
      const state3 = state2.branch_state(state2.ground_state, 3)
      state3.lock()

      const location_tt = Traittype.get_by_label('location')

      // state3 should have skip pointer to state2
      const next_states = state3.rev_base(room.subject, location_tt)

      expect(next_states).to.be.an('array')
      expect(next_states).to.have.lengthOf(1)
      expect(next_states[0]).to.equal(state2)
    })

    it('returns array with base state when no skip pointer exists', () => {
      const state1 = createStateInNewMind('world', 1)

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'room'
      })

      state1.lock()

      // Create state2 with NO location changes
      const state2 = state1.branch_state(state1.ground_state, 2)
      state2.lock()

      const location_tt = Traittype.get_by_label('location')

      // state2 has no skip pointer, should return base (state1)
      const next_states = state2.rev_base(room.subject, location_tt)

      expect(next_states).to.be.an('array')
      expect(next_states).to.have.lengthOf(1)
      expect(next_states[0]).to.equal(state1)
    })

    it('returns empty array when no skip pointer and no base', () => {
      const state1 = createStateInNewMind('world', 1)

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'room'
      })

      state1.lock()

      const location_tt = Traittype.get_by_label('location')

      // state1 has no base (it's root), should return empty array
      const next_states = state1.rev_base(room.subject, location_tt)

      expect(next_states).to.be.an('array')
      expect(next_states).to.have.lengthOf(0)
    })

    it('returns array (possibly with base) for unreferenced subject', () => {
      const state1 = createStateInNewMind('world', 1)

      const unreferenced = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'unreferenced'
      })

      state1.lock()

      const state2 = state1.branch_state(state1.ground_state, 2)
      state2.lock()

      const location_tt = Traittype.get_by_label('location')

      // unreferenced has no skip pointer, returns base
      const next_states = state2.rev_base(unreferenced.subject, location_tt)

      expect(next_states).to.be.an('array')
      expect(next_states).to.have.lengthOf(1)
      expect(next_states[0]).to.equal(state1)
    })
  })

  describe('UnionState.rev_base() - Basic Interface', () => {
    it('returns array (polymorphic with State)', () => {
      // Setup world with Mind composition
      const world = TemporalMind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']},
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        },
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {}}
        }
      })

      // Create VillageBlacksmith with composed mind (creates UnionState)
      const vb = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {
          mind: {}
        },
        label: 'village_blacksmith'
      })

      world_state.lock()

      const vb_belief = world_state.get_belief_by_label('village_blacksmith')
      const vb_mind = vb_belief.get_trait(world_state, Traittype.get_by_label('mind'))
      const vb_mind_state = vb_mind.origin_state

      // Verify it's a UnionState
      expect(vb_mind_state.is_union).to.be.true

      const tavern = world_state.get_belief_by_label('tavern')
      const location_tt = Traittype.get_by_label('location')

      // Get next states - should return an array (polymorphic)
      const tavern_next = vb_mind_state.rev_base(tavern.subject, location_tt)
      expect(tavern_next).to.be.an('array')

      // Each element should be a State
      for (const state of tavern_next) {
        expect(state.constructor.name).to.match(/State|UnionState/)
      }
    })

    it('filters out null/undefined next states from components', () => {
      const world = TemporalMind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_shared_from_template({
        Villager: {bases: ['Person'], traits: {mind: {}}},
        Blacksmith: {bases: ['Person'], traits: {mind: {}}}
      })

      const vb = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {
          mind: {}
        },
        label: 'village_blacksmith'
      })

      world_state.lock()

      const vb_belief = world_state.get_belief_by_label('village_blacksmith')
      const vb_mind = vb_belief.get_trait(world_state, Traittype.get_by_label('mind'))
      const vb_mind_state = vb_mind.origin_state

      const fake_subject = {sid: 99999, _type: 'Subject'}
      const location_tt = Traittype.get_by_label('location')

      // Get next states for non-existent subject
      const next_states = vb_mind_state.rev_base(fake_subject, location_tt)

      expect(next_states).to.be.an('array')

      // All returned states should be truthy (no null/undefined)
      for (const state of next_states) {
        expect(state).to.not.be.null
        expect(state).to.not.be.undefined
      }
    })
  })

  describe('Polymorphism: Both return arrays', () => {
    it('both State and UnionState can be spread into queue', () => {
      const state1 = createStateInNewMind('world', 1)

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'room'
      })

      state1.lock()

      const location_tt = Traittype.get_by_label('location')

      // State.rev_base returns array
      const state_result = state1.rev_base(room.subject, location_tt)
      expect(state_result).to.be.an('array')

      // Can be spread into array
      const queue = []
      queue.push(...state_result)
      expect(queue).to.be.an('array')
    })

    it('can be used interchangeably in queue-based traversal', () => {
      const world = TemporalMind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']}
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      const vb = Belief.from_template(world_state, {
        bases: ['Villager'],
        traits: {
          mind: {}
        },
        label: 'villager'
      })

      world_state.lock()

      const vb_belief = world_state.get_belief_by_label('villager')
      const vb_mind = vb_belief.get_trait(world_state, Traittype.get_by_label('mind'))
      const vb_mind_state = vb_mind.origin_state

      const tavern = world_state.get_belief_by_label('tavern')
      const location_tt = Traittype.get_by_label('location')

      // Simulate queue-based traversal mixing State and potentially UnionState
      const queue = [vb_mind_state]
      const visited = []

      while (queue.length > 0) {
        const current = queue.shift()
        visited.push(current)

        const next_states = current.rev_base(tavern.subject, location_tt)
        expect(next_states).to.be.an('array')

        queue.push(...next_states)

        // Safety: limit iterations
        if (visited.length > 10) break
      }

      expect(visited.length).to.be.greaterThan(0)
    })
  })

  describe('P0 Critical: Skip Pointer Edge Cases', () => {
    it('handles explicit null skip pointer value', () => {
      const state1 = createStateInNewMind('world', 1)

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'room'
      })

      const person = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {location: room.subject}, label: 'person'
      })

      state1.lock()

      const state2 = state1.branch_state(state1.ground_state, 2)
      state2.lock()

      const location_tt = Traittype.get_by_label('location')

      // Manually inspect _rev_base structure
      const person_map = state2._rev_base.get(room.subject)

      // If the map exists, location_tt could have undefined or not exist
      // This tests that we handle undefined correctly in rev_base()
      const next_states = state2.rev_base(room.subject, location_tt)

      expect(next_states).to.be.an('array')
      expect(next_states).to.have.lengthOf(1)
      expect(next_states[0]).to.equal(state1)
    })

    it('creates skip pointer via rev_del when belief is removed', () => {
      const state1 = createStateInNewMind('world', 1)

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'room'
      })

      const person = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {location: room.subject}, label: 'person'
      })

      state1.lock()

      // State 2: Remove person's location reference
      const state2 = state1.branch_state(state1.ground_state, 2)
      const person2 = Belief.from_template(state2, {
        bases: [person],
        traits: {location: null}
      })
      state2.replace_beliefs(person2)
      state2.lock()

      // State 3: No changes
      const state3 = state2.branch_state(state2.ground_state, 3)
      state3.lock()

      const location_tt = Traittype.get_by_label('location')

      // state3 should have skip pointer to state2 (where deletion happened)
      const next_states = state3.rev_base(room.subject, location_tt)

      expect(next_states).to.be.an('array')
      expect(next_states).to.have.lengthOf(1)
      expect(next_states[0]).to.equal(state2)
    })

    it('UnionState.rev_base() returns array from multiple components', () => {
      const world = TemporalMind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']},
        workshop: {bases: ['Location']}
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        },
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {workshop: ['location']}}
        }
      })

      // Create VillageBlacksmith with composed mind (creates UnionState)
      const vb = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {
          mind: {}
        },
        label: 'village_blacksmith'
      })

      world_state.lock()

      const vb_belief = world_state.get_belief_by_label('village_blacksmith')
      const vb_mind = vb_belief.get_trait(world_state, Traittype.get_by_label('mind'))
      const vb_mind_state = vb_mind.origin_state

      // Verify it's a UnionState with multiple components
      expect(vb_mind_state.is_union).to.be.true
      expect(vb_mind_state.component_states.length).to.be.greaterThan(1)

      // Create a fake subject to test rev_base behavior
      const fake_subject = {sid: 99999, _type: 'Subject'}
      const location_tt = Traittype.get_by_label('location')

      // rev_base should return array (even if empty or with bases)
      const next_states = vb_mind_state.rev_base(fake_subject, location_tt)

      expect(next_states).to.be.an('array')
      // All returned states should be State instances
      for (const state of next_states) {
        expect(state.constructor.name).to.match(/State|UnionState/)
      }
    })

    it('no skip pointer when inherited Subject reference not changed', () => {
      const state1 = createStateInNewMind('world', 1)

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'room'
      })

      const person = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {location: room.subject}, label: 'person'
      })

      state1.lock()

      // State 2: Version person but don't change location
      const state2 = state1.branch_state(state1.ground_state, 2)
      const person2 = Belief.from_template(state2, {
        bases: [person],
        traits: {}, label: 'person_v2'  // Change label but not location
      })
      state2.replace_beliefs(person2)
      state2.lock()

      const location_tt = Traittype.get_by_label('location')

      // state2 should NOT have a skip pointer for room+location (inherited, not changed)
      // So rev_base should return base (state1)
      const next_states = state2.rev_base(room.subject, location_tt)

      expect(next_states).to.be.an('array')
      expect(next_states).to.have.lengthOf(1)
      expect(next_states[0]).to.equal(state1)
    })
  })

  describe('P1 High Priority: Additional Edge Cases', () => {
    it('handles multiple subjects with same traittype', () => {
      const state1 = createStateInNewMind('world', 1)

      const room1 = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'room1'
      })

      const room2 = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'room2'
      })

      const person1 = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {location: room1.subject}, label: 'person1'
      })

      const person2 = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {location: room2.subject}, label: 'person2'
      })

      state1.lock()

      const state2 = state1.branch_state(state1.ground_state, 2)
      state2.lock()

      const location_tt = Traittype.get_by_label('location')

      // state2 can track skip pointers for both room1 and room2
      const room1_next = state2.rev_base(room1.subject, location_tt)
      const room2_next = state2.rev_base(room2.subject, location_tt)

      expect(room1_next).to.be.an('array')
      expect(room2_next).to.be.an('array')
      expect(room1_next).to.have.lengthOf(1)
      expect(room2_next).to.have.lengthOf(1)
    })

    it('returns base when subject was never referenced', () => {
      const state1 = createStateInNewMind('world', 1)

      const room = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'room'
      })

      state1.lock()

      const state2 = state1.branch_state(state1.ground_state, 2)
      state2.lock()

      const location_tt = Traittype.get_by_label('location')

      // Never-referenced subject has no skip pointer, returns base
      const next_states = state2.rev_base(room.subject, location_tt)

      expect(next_states).to.be.an('array')
      expect(next_states).to.have.lengthOf(1)
      expect(next_states[0]).to.equal(state1)
    })

    it('handles nested UnionState (UnionState containing UnionState components)', () => {
      const world = TemporalMind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']},
        workshop: {bases: ['Location']},
        market: {bases: ['Location']}
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        },
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {workshop: ['location']}}
        }
      })

      // First create VillageBlacksmith (creates UnionState)
      world_state.add_shared_from_template({
        VillageBlacksmith: {
          bases: ['Villager', 'Blacksmith'],
          traits: {mind: {market: ['location']}}
        }
      })

      // Then create Guild with mind
      world_state.add_shared_from_template({
        Guild: {
          bases: ['Person'],
          traits: {mind: {}}
        }
      })

      // Create MasterCraftsman from VillageBlacksmith + Guild
      // This creates nested UnionState: VillageBlacksmith's mind is already a UnionState
      const mc = Belief.from_template(world_state, {
        bases: ['VillageBlacksmith', 'Guild'],
        traits: {
          mind: {}
        },
        label: 'master_craftsman'
      })

      world_state.lock()

      const mc_belief = world_state.get_belief_by_label('master_craftsman')
      const mc_mind = mc_belief.get_trait(world_state, Traittype.get_by_label('mind'))
      const mc_mind_state = mc_mind.origin_state

      // Should be a UnionState
      expect(mc_mind_state.is_union).to.be.true

      const fake_subject = {sid: 99999, _type: 'Subject'}
      const location_tt = Traittype.get_by_label('location')

      // rev_base should handle nested UnionState components
      const next_states = mc_mind_state.rev_base(fake_subject, location_tt)

      expect(next_states).to.be.an('array')
      // All returned states should be valid State instances
      for (const state of next_states) {
        expect(state.constructor.name).to.match(/State|UnionState/)
      }
    })

    it('tracks skip pointers for multiple Subject references in single belief', () => {
      const state1 = createStateInNewMind('world', 1)

      const room1 = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'room1'
      })

      const room2 = Belief.from_template(state1, {
        bases: ['Location'],
        traits: {}, label: 'room2'
      })

      // Person has location reference
      const person = Belief.from_template(state1, {
        bases: ['Actor'],
        traits: {location: room1.subject}, label: 'person'
      })

      state1.lock()

      // State 2: Change person's location from room1 to room2
      const state2 = state1.branch_state(state1.ground_state, 2)
      const person2 = Belief.from_template(state2, {
        bases: [person],
        traits: {location: room2.subject}
      })
      state2.replace_beliefs(person2)
      state2.lock()

      const location_tt = Traittype.get_by_label('location')

      // state2 should have skip pointer for room1 (old location)
      const room1_next = state2.rev_base(room1.subject, location_tt)
      // state2 should have skip pointer for room2 (new location)
      const room2_next = state2.rev_base(room2.subject, location_tt)

      expect(room1_next).to.be.an('array')
      expect(room2_next).to.be.an('array')
      // Both should have skip pointers created
      expect(room1_next).to.have.lengthOf(1)
      expect(room2_next).to.have.lengthOf(1)
    })
  })
})
