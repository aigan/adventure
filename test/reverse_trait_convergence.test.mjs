/**
 * Convergence + rev_trait() Integration Tests
 *
 * Tests that reverse trait lookup works correctly with Convergence
 * (multi-parent belief composition).
 *
 * rev_trait() properly traverses Convergence
 * component_states via polymorphic rev_base() method.
 */

import { expect } from 'chai'
import { setupStandardArchetypes, createStateInNewMind } from './helpers.mjs'
import { Belief } from '../public/worker/belief.mjs'
import { Traittype } from '../public/worker/traittype.mjs'
import { Archetype } from '../public/worker/archetype.mjs'
import { Mind, Materia, State, Convergence, logos, eidos } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'

describe('Convergence + rev_trait() Integration', () => {
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

  describe('Convergence Traversal', () => {
    it('basic Convergence query - finds references in component states', () => {
      // Setup: Create VillageBlacksmith with Villager + Blacksmith components
      // This is the most common Convergence pattern

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

      // Create VillageBlacksmith with Convergence composing both minds
      const npc_mind = new Materia(world_mind, 'village_blacksmith')
      const union_state = new Convergence(npc_mind, world_state, [villager_state, blacksmith_state])
      union_state.lock()

      // Verify rev_trait traverses Convergence component_states
      const about_tt = Traittype.get_by_label('@about')
      const beliefs_about_village = [...village.rev_trait(union_state, about_tt)]

      // Expected: Should find BOTH villager_knowledge and blacksmith_knowledge
      expect(beliefs_about_village).to.have.lengthOf(2,
        'Should find beliefs from both Convergence components')
      expect(beliefs_about_village).to.include(villager_knowledge)
      expect(beliefs_about_village).to.include(blacksmith_knowledge)
    })

    it('multiple components with matches in each', () => {
      // Setup: Create Convergence with 3 components, all referencing same location

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

      // Create Convergence combining all 3 components
      const npc_mind = new Materia(world_mind, 'npc')
      const union_state = new Convergence(npc_mind, world_state, component_states)
      union_state.lock()

      // Query: Should find beliefs from ALL components
      const about_tt = Traittype.get_by_label('@about')
      const beliefs_about_tavern = [...tavern.rev_trait(union_state, about_tt)]

      expect(beliefs_about_tavern).to.have.lengthOf(3,
        'Should find beliefs from all 3 Convergence components')

      for (const expected of expected_beliefs) {
        expect(beliefs_about_tavern).to.include(expected,
          `Should include ${expected.get_label()}`)
      }
    })
  })

  describe('Priority 1: Convergence Chain Patterns', () => {
    it('nested Convergence - recursive component traversal', () => {
      // Setup: MasterCraftsman contains VillageBlacksmith Convergence
      // Tests: Does rev_trait recurse through nested Convergences?

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      const workshop = world_state.add_belief_from_template({
        bases: ['Location'],
        traits: {}, label: 'workshop'
      })

      world_state.lock()

      // Level 1: Villager + Blacksmith Convergence
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

      // Level 2: Add Master component and create nested Convergence
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

      // Query from nested Convergence
      const about_tt = Traittype.get_by_label('@about')
      const beliefs_about_workshop = [...workshop.rev_trait(union_state2, about_tt)]

      // Should find all 3 beliefs through nested Convergence traversal
      expect(beliefs_about_workshop).to.have.lengthOf(3,
        'Should traverse nested Convergence and find all component beliefs')

      const labels = beliefs_about_workshop.map(b => b.get_label())
      expect(labels).to.include('villager_knowledge')
      expect(labels).to.include('blacksmith_knowledge')
      expect(labels).to.include('master_knowledge')
    })

    it('Convergence in middle of chain history', () => {
      // Setup: state3 (regular) → union_state → component (has reference)
      // Tests: Does rev_trait traverse through Convergence in chain middle?

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

      // Convergence based on component
      const npc_mind = new Materia(world_mind, 'npc')
      const union_state = new Convergence(npc_mind, world_state, [component_state])
      union_state.lock()

      // Regular state branching from Convergence
      const state3 = union_state.branch_state(world_state, 4)
      state3.lock()

      // Query from state3 - should traverse back through Convergence
      const about_tt = Traittype.get_by_label('@about')
      const beliefs_about_room = [...room.rev_trait(state3, about_tt)]

      expect(beliefs_about_room).to.have.lengthOf(1,
        'Should traverse through Convergence in middle of chain')
      expect(beliefs_about_room[0].get_label()).to.equal('knowledge')
    })

    it('Convergence + composable arrays', () => {
      // Setup: Components have inventory arrays that compose
      // Tests: Does rev_trait find references in composed arrays from Convergence?

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

      // Convergence composing both inventories
      const npc_mind = new Materia(world_mind, 'knight_warrior')
      const union_state = new Convergence(npc_mind, world_state, [warrior_state, knight_state])
      union_state.lock()

      // Query: Should find beliefs from both components
      const inventory_tt = Traittype.get_by_label('inventory')
      const who_has_sword = [...sword.rev_trait(union_state, inventory_tt)]
      const who_has_shield = [...shield.rev_trait(union_state, inventory_tt)]

      expect(who_has_sword).to.have.lengthOf(1,
        'Should find warrior_self from Convergence component')
      expect(who_has_shield).to.have.lengthOf(1,
        'Should find knight_self from Convergence component')
    })
  })

  describe('Priority 3: Performance and Scale', () => {
    it('large Convergence with 20+ components', () => {
      // Tests: Does rev_trait scale with many Convergence components?

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

      // Create large Convergence
      const npc_mind = new Materia(world_mind, 'npc')
      const union_state = new Convergence(npc_mind, world_state, component_states)
      union_state.lock()

      // Query with performance timing
      const about_tt = Traittype.get_by_label('@about')
      const start = Date.now()
      const beliefs = [...location.rev_trait(union_state, about_tt)]
      const duration = Date.now() - start

      expect(beliefs).to.have.lengthOf(20,
        'Should find all 20 beliefs from large Convergence')
      expect(duration).to.be.lessThan(10,
        'Should complete in < 10ms for 20 components')
    })
  })
})
