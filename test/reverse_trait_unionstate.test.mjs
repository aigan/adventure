/**
 * UnionState + rev_trait() Integration Tests
 *
 * These tests verify that reverse trait lookup works correctly with UnionState
 * (multi-parent belief composition).
 *
 * CRITICAL BUG CONFIRMED (2025-11-16):
 * rev_trait() does not traverse UnionState component_states. It stops at UnionState.base (null)
 * instead of iterating through component_states array.
 *
 * Expected: First test will FAIL until bug is fixed in belief.mjs:370
 *
 * See: docs/plans/UNIONSTATE_CRITICAL.md
 */

import { expect } from 'chai'
import { setupStandardArchetypes, createStateInNewMind } from './helpers.mjs'
import { Belief } from '../public/worker/belief.mjs'
import { Traittype } from '../public/worker/traittype.mjs'
import { Archetype } from '../public/worker/archetype.mjs'
import { Mind, Materia, State, Convergence, logos, eidos } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'

describe('UnionState + rev_trait() Integration', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()

    // Register description trait for tests
    Traittype.register('description', new Traittype('description', 'string'))

    // Add description to Location archetype
    const location = Archetype.get_by_label('Location')
    const description_tt = Traittype.get_by_label('description')
    location._traits_template.set(description_tt, null)
  })

  describe('Priority 0: Critical UnionState Bugs', () => {
    it('basic UnionState query - finds references in component states', () => {
      // Setup: Create VillageBlacksmith with Villager + Blacksmith components
      // This is the most common UnionState pattern

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      // Create shared location
      const village = world_state.add_belief_from_template({
        bases: ['Location'],
        traits: {}, label: 'village'
      })

      world_state.lock()

      // Create Villager component mind with location reference
      const villager_mind = new Materia(world_mind, 'villager')
      const villager_state = villager_mind.create_state(world_state)

      const villager_knowledge = villager_state.add_belief_from_template({
        bases: ['Location'],
        traits: {
          '@about': village.subject,
          description: 'Where villagers live'
        },
        label: 'village_knowledge'
      })
      villager_state.lock()

      // Create Blacksmith component mind with location reference
      const blacksmith_mind = new Materia(world_mind, 'blacksmith')
      const blacksmith_state = blacksmith_mind.create_state(world_state)

      const blacksmith_knowledge = blacksmith_state.add_belief_from_template({
        bases: ['Location'],
        traits: {
          '@about': village.subject,
          description: 'Where the forge is'
        },
        label: 'blacksmith_knowledge'
      })
      blacksmith_state.lock()

      // Create VillageBlacksmith with UnionState composing both minds
      const npc_mind = new Materia(world_mind, 'village_blacksmith')
      const union_state = new Convergence(npc_mind, world_state, [villager_state, blacksmith_state])
      union_state.lock()

      // CRITICAL TEST: Does rev_trait traverse UnionState component_states?
      const about_tt = Traittype.get_by_label('@about')
      const beliefs_about_village = village.rev_trait(union_state, about_tt)

      // Expected: Should find BOTH villager_knowledge and blacksmith_knowledge
      expect(beliefs_about_village).to.have.lengthOf(2,
        'Should find beliefs from both UnionState components')
      expect(beliefs_about_village).to.include(villager_knowledge)
      expect(beliefs_about_village).to.include(blacksmith_knowledge)
    })

    it('multiple components with matches in each', () => {
      // Setup: Create UnionState with 3 components, all referencing same location

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      const tavern = world_state.add_belief_from_template({
        bases: ['Location'],
        traits: {}, label: 'tavern'
      })

      world_state.lock()

      // Create 3 component minds, each with a belief about the tavern
      const component_states = []
      const expected_beliefs = []

      for (let i = 1; i <= 3; i++) {
        const component_mind = new Materia(world_mind, `component${i}`)
        const component_state = component_mind.create_state(world_state)

        const knowledge = component_state.add_belief_from_template({
          bases: ['Location'],
          traits: {
            '@about': tavern.subject,
            description: `Component ${i} knows about tavern`
          },
          label: `knowledge${i}`
        })

        component_state.lock()
        component_states.push(component_state)
        expected_beliefs.push(knowledge)
      }

      // Create UnionState combining all 3 components
      const npc_mind = new Materia(world_mind, 'npc')
      const union_state = new Convergence(npc_mind, world_state, component_states)
      union_state.lock()

      // Query: Should find beliefs from ALL components
      const about_tt = Traittype.get_by_label('@about')
      const beliefs_about_tavern = tavern.rev_trait(union_state, about_tt)

      expect(beliefs_about_tavern).to.have.lengthOf(3,
        'Should find beliefs from all 3 UnionState components')

      for (const expected of expected_beliefs) {
        expect(beliefs_about_tavern).to.include(expected,
          `Should include ${expected.get_label()}`)
      }
    })
  })

  describe('Priority 1: UnionState Chain Patterns', () => {
    it('nested UnionState - recursive component traversal', () => {
      // Setup: MasterCraftsman contains VillageBlacksmith UnionState
      // Tests: Does rev_trait recurse through nested UnionStates?

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      const workshop = world_state.add_belief_from_template({
        bases: ['Location'],
        traits: {}, label: 'workshop'
      })

      world_state.lock()

      // Level 1: Villager + Blacksmith UnionState
      const villager_mind = new Materia(world_mind, 'villager')
      const villager_state = villager_mind.create_state(world_state)
      villager_state.add_belief_from_template({
        bases: ['Location'],
        traits: {
          '@about': workshop.subject
        },
        label: 'villager_knowledge'
      })
      villager_state.lock()

      const blacksmith_mind = new Materia(world_mind, 'blacksmith')
      const blacksmith_state = blacksmith_mind.create_state(world_state)
      blacksmith_state.add_belief_from_template({
        bases: ['Location'],
        traits: {
          '@about': workshop.subject
        },
        label: 'blacksmith_knowledge'
      })
      blacksmith_state.lock()

      const village_blacksmith_mind = new Materia(world_mind, 'village_blacksmith')
      const union_state1 = new Convergence(village_blacksmith_mind, world_state,
        [villager_state, blacksmith_state])
      union_state1.lock()

      // Level 2: Add Master component and create nested UnionState
      const master_mind = new Materia(world_mind, 'master')
      const master_state = master_mind.create_state(world_state)
      master_state.add_belief_from_template({
        bases: ['Location'],
        traits: {
          '@about': workshop.subject
        },
        label: 'master_knowledge'
      })
      master_state.lock()

      const master_craftsman_mind = new Materia(world_mind, 'master_craftsman')
      const union_state2 = new Convergence(master_craftsman_mind, world_state,
        [union_state1, master_state])
      union_state2.lock()

      // Query from nested UnionState
      const about_tt = Traittype.get_by_label('@about')
      const beliefs_about_workshop = workshop.rev_trait(union_state2, about_tt)

      // Should find all 3 beliefs through nested UnionState traversal
      expect(beliefs_about_workshop).to.have.lengthOf(3,
        'Should traverse nested UnionState and find all component beliefs')

      const labels = beliefs_about_workshop.map(b => b.get_label())
      expect(labels).to.include('villager_knowledge')
      expect(labels).to.include('blacksmith_knowledge')
      expect(labels).to.include('master_knowledge')
    })

    it('UnionState in middle of chain history', () => {
      // Setup: state3 (regular) → union_state → component (has reference)
      // Tests: Does rev_trait traverse through UnionState in chain middle?

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      const room = world_state.add_belief_from_template({
        bases: ['Location'],
        traits: {}, label: 'room'
      })

      world_state.lock()

      // Component state with reference
      const component_mind = new Materia(world_mind, 'component')
      const component_state = component_mind.create_state(world_state)
      component_state.add_belief_from_template({
        bases: ['Location'],
        traits: {
          '@about': room.subject
        },
        label: 'knowledge'
      })
      component_state.lock()

      // UnionState based on component
      const npc_mind = new Materia(world_mind, 'npc')
      const union_state = new Convergence(npc_mind, world_state, [component_state])
      union_state.lock()

      // Regular state branching from UnionState
      const state3 = union_state.branch_state(world_state, 4)
      state3.lock()

      // Query from state3 - should traverse back through UnionState
      const about_tt = Traittype.get_by_label('@about')
      const beliefs_about_room = room.rev_trait(state3, about_tt)

      expect(beliefs_about_room).to.have.lengthOf(1,
        'Should traverse through UnionState in middle of chain')
      expect(beliefs_about_room[0].get_label()).to.equal('knowledge')
    })

    it('UnionState + composable arrays', () => {
      // Setup: Components have inventory arrays that compose
      // Tests: Does rev_trait find references in composed arrays from UnionState?

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
          shield: { bases: ['PortableObject'] }
        }
      )

      const eidos_state = eidos().origin_state
      const sword = eidos_state.get_belief_by_label('sword')
      const shield = eidos_state.get_belief_by_label('shield')

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})
      world_state.lock()

      // Component 1: Warrior with sword
      const warrior_mind = new Materia(world_mind, 'warrior')
      const warrior_state = warrior_mind.create_state(world_state)
      warrior_state.add_belief_from_template({
        bases: ['Actor'],
        traits: {
          inventory: [sword.subject]
        },
        label: 'warrior_self'
      })
      warrior_state.lock()

      // Component 2: Knight with shield
      const knight_mind = new Materia(world_mind, 'knight')
      const knight_state = knight_mind.create_state(world_state)
      knight_state.add_belief_from_template({
        bases: ['Actor'],
        traits: {
          inventory: [shield.subject]
        },
        label: 'knight_self'
      })
      knight_state.lock()

      // UnionState composing both inventories
      const npc_mind = new Materia(world_mind, 'knight_warrior')
      const union_state = new Convergence(npc_mind, world_state, [warrior_state, knight_state])
      union_state.lock()

      // Query: Should find beliefs from both components
      const inventory_tt = Traittype.get_by_label('inventory')
      const who_has_sword = sword.rev_trait(union_state, inventory_tt)
      const who_has_shield = shield.rev_trait(union_state, inventory_tt)

      expect(who_has_sword).to.have.lengthOf(1,
        'Should find warrior_self from UnionState component')
      expect(who_has_shield).to.have.lengthOf(1,
        'Should find knight_self from UnionState component')
    })
  })

  describe('Priority 3: Performance and Scale', () => {
    it('large UnionState with 20+ components', () => {
      // Tests: Does rev_trait scale with many UnionState components?

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      const location = world_state.add_belief_from_template({
        bases: ['Location'],
        traits: {}, label: 'location'
      })

      world_state.lock()

      // Create 20 component states, each with a reference
      const component_states = []
      for (let i = 1; i <= 20; i++) {
        const component_mind = new Materia(world_mind, `component${i}`)
        const component_state = component_mind.create_state(world_state)

        component_state.add_belief_from_template({
          bases: ['Location'],
          traits: {
            '@about': location.subject
          },
          label: `knowledge${i}`
        })

        component_state.lock()
        component_states.push(component_state)
      }

      // Create large UnionState
      const npc_mind = new Materia(world_mind, 'npc')
      const union_state = new Convergence(npc_mind, world_state, component_states)
      union_state.lock()

      // Query with performance timing
      const about_tt = Traittype.get_by_label('@about')
      const start = Date.now()
      const beliefs = location.rev_trait(union_state, about_tt)
      const duration = Date.now() - start

      expect(beliefs).to.have.lengthOf(20,
        'Should find all 20 beliefs from large UnionState')
      expect(duration).to.be.lessThan(10,
        'Should complete in < 10ms for 20 components')
    })
  })
})
