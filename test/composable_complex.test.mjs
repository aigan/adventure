/**
 * Complex scenarios for composable trait composition
 * Tests edge cases with branching, temporal evolution, and nullification
 */

import { expect } from 'chai'
import * as DB from '../public/worker/db.mjs'
import { Mind, Materia, Belief, Traittype, save_mind, load } from '../public/worker/cosmos.mjs'
import { eidos } from '../public/worker/eidos.mjs'
import { logos, logos_state } from '../public/worker/logos.mjs'
import { setupAfterEachValidation } from './helpers.mjs'

describe('Composable Traits - Complex Scenarios', () => {
  beforeEach(() => {
    DB.reset_registries()
  })
  setupAfterEachValidation();


  describe('Multi-level prototype inheritance', () => {
    it('NPC inherits from two prototypes directly', () => {
      DB.register(
        {
          inventory: {
            type: 'PortableObject',
            container: Array,
            composable: true
          }
        },
        {
          Thing: {},
          PortableObject: { bases: ['Thing'] },
          Person: {
            bases: ['Thing'],
            traits: { inventory: null }
          }
        },
        {
          token: { bases: ['PortableObject'] },
          sword: { bases: ['PortableObject'] },
          Villager: {
            bases: ['Person'],
            traits: { inventory: ['token'] }
          },
          Guard: {
            bases: ['Person'],
            traits: { inventory: ['sword'] }
          }
        }
      )

      const world_mind = new Materia(logos(), 'world')
      const state = world_mind.create_state(logos_state(), {tt: 1})

      // NPC with two prototype bases
      const npc = state.add_belief_from_template({
        bases: ['Villager', 'Guard'],
        traits: {},
        label: 'guard_npc'
      })

      // Should compose from both prototypes
      const inv = npc.get_trait(state, Traittype.get_by_label('inventory'))
      expect(inv).to.have.lengthOf(2)
      const labels = inv.map(b => b.get_label()).sort()
      expect(labels).to.deep.equal(['sword', 'token'])
    })

    it('NPC inherits from prototype that inherits from two, one of which inherits from third (deep chain)', () => {
      DB.register(
        {
          inventory: {
            type: 'PortableObject',
            container: Array,
            composable: true
          }
        },
        {
          Thing: {},
          PortableObject: { bases: ['Thing'] },
          Person: {
            bases: ['Thing'],
            traits: { inventory: null }
          }
        },
        {
          token: { bases: ['PortableObject'] },
          hammer: { bases: ['PortableObject'] },
          badge: { bases: ['PortableObject'] },
          sword: { bases: ['PortableObject'] },
          // Level 1: Base prototype
          Villager: {
            bases: ['Person'],
            traits: { inventory: ['token'] }
          },
          // Level 2: Inherits from Villager
          Blacksmith: {
            bases: ['Person', 'Villager'],
            traits: { inventory: ['hammer', 'badge'] }
          },
          // Level 2: Independent prototype
          Guard: {
            bases: ['Person'],
            traits: { inventory: ['sword'] }
          },
          // Level 3: Inherits from Blacksmith (which inherits from Villager) AND Guard
          MasterCraftsman: {
            bases: ['Person', 'Blacksmith', 'Guard'],
            traits: {}
          }
        }
      )

      const eidos_state = eidos().origin_state
      const master = eidos_state.get_belief_by_label('MasterCraftsman')

      // MasterCraftsman has no own, composes from Blacksmith and Guard
      // Blacksmith's [hammer, badge] replaces Villager's [token]
      // Guard has [sword]
      const inv = master.get_trait(eidos_state, Traittype.get_by_label('inventory'))
      expect(inv).to.have.lengthOf(3)
      const labels = inv.map(b => b.get_label()).sort()
      expect(labels).to.deep.equal(['badge', 'hammer', 'sword'])
    })
  })

  describe('Own trait override behavior', () => {
    it('explicit null blocks composition and clears inherited values', () => {
      DB.register(
        {
          inventory: {
            type: 'PortableObject',
            container: Array,
            composable: true
          }
        },
        {
          Thing: {},
          PortableObject: { bases: ['Thing'] },
          Person: {
            bases: ['Thing'],
            traits: { inventory: null }
          }
        },
        {
          token: { bases: ['PortableObject'] },
          Villager: {
            bases: ['Person'],
            traits: { inventory: ['token'] }
          },
          Blacksmith: {
            bases: ['Person', 'Villager'],
            traits: { inventory: null }  // Explicit null clears Villager's inventory
          }
        }
      )

      const eidos_state = eidos().origin_state
      const blacksmith = eidos_state.get_belief_by_label('Blacksmith')

      // Should have null (blocks composition from Villager)
      const inv = blacksmith.get_trait(eidos_state, Traittype.get_by_label('inventory'))
      expect(inv).to.be.null
    })

    it('null trait blocks composition in instances (world player scenario)', () => {
      DB.register(
        {
          inventory: {
            type: 'PortableObject',
            container: Array,
            composable: true
          }
        },
        {
          Thing: {},
          PortableObject: { bases: ['Thing'] },
          Person: {
            bases: ['Thing'],
            traits: { inventory: null }
          }
        },
        {
          apprentice_token: { bases: ['PortableObject'] },
          Villager: {
            bases: ['Person'],
            traits: { inventory: ['apprentice_token'] }
          },
          Blacksmith: {
            bases: ['Person', 'Villager'],
            traits: { inventory: null }  // Explicit null blocks Villager's inventory
          }
        }
      )

      const world_mind = new Materia(logos(), 'world')
      const state = world_mind.create_state(logos_state(), {tt: 1})

      // Create player inheriting from Blacksmith
      const player = state.add_belief_from_template({
        bases: ['Blacksmith'],
        traits: {},
        label: 'player'
      })

      // Player should have null inventory (inherited from Blacksmith)
      // NOT apprentice_token from Villager (blocked by Blacksmith's null)
      const inv = player.get_trait(state, Traittype.get_by_label('inventory'))
      expect(inv).to.be.null
    })

    it('instance can explicitly reference shared beliefs from Eidos', () => {
      DB.register(
        {
          inventory: {
            type: 'PortableObject',
            container: Array,
            composable: true
          }
        },
        {
          Thing: {},
          PortableObject: { bases: ['Thing'] },
          Person: {
            bases: ['Thing'],
            traits: { inventory: null }
          }
        },
        {
          apprentice_token: { bases: ['PortableObject'] },
          sword: { bases: ['PortableObject'] },
          Villager: {
            bases: ['Person'],
            traits: { inventory: ['apprentice_token'] }
          },
          Guard: {
            bases: ['Person'],
            traits: { inventory: ['sword'] }
          }
        }
      )

      const world_mind = new Materia(logos(), 'world')
      const state = world_mind.create_state(logos_state(), {tt: 1})

      // Create NPC with explicit inventory referencing shared beliefs from Eidos
      // Should compose: Villager[token] + Guard[sword] + [token, sword] from own trait
      const npc = state.add_belief_from_template({
        bases: ['Villager', 'Guard'],
        traits: {
          inventory: ['apprentice_token', 'sword']  // Explicit refs to Eidos shared beliefs
        },
        label: 'npc'
      })

      // Should compose all sources, deduplicating by subject.sid
      // Villager[token] + Guard[sword] + own[token, sword] = [token, sword] (deduplicated)
      const inv = npc.get_trait(state, Traittype.get_by_label('inventory'))
      expect(inv).to.be.an('array')
      expect(inv).to.have.lengthOf(2)
      const labels = inv.map(b => b.get_label()).sort()
      expect(labels).to.deep.equal(['apprentice_token', 'sword'])
    })

    it('explicit empty array REPLACES base values (own value)', () => {
      DB.register(
        {
          inventory: {
            type: 'PortableObject',
            container: Array,
            composable: true
          }
        },
        {
          Thing: {},
          PortableObject: { bases: ['Thing'] },
          Person: {
            bases: ['Thing'],
            traits: { inventory: null }
          }
        },
        {
          token: { bases: ['PortableObject'] },
          Villager: {
            bases: ['Person'],
            traits: { inventory: ['token'] }
          }
        }
      )

      const world_mind = new Materia(logos(), 'world')
      const state = world_mind.create_state(logos_state(), {tt: 1})

      // NPC with explicit empty inventory - own replaces inherited
      const npc = state.add_belief_from_template({
        bases: ['Villager'],
        traits: {
          inventory: []  // Own [] replaces Villager's [token]
        },
        label: 'villager_npc'
      })

      // Empty array replaces inherited (own value replaces)
      const inv = npc.get_trait(state, Traittype.get_by_label('inventory'))
      expect(inv).to.be.an('array')
      expect(inv).to.have.lengthOf(0)
    })

    it('own trait replaces inherited (no composition)', () => {
      DB.register(
        {
          inventory: {
            type: 'PortableObject',
            container: Array,
            composable: true
          }
        },
        {
          Thing: {},
          PortableObject: { bases: ['Thing'] },
          Person: {
            bases: ['Thing'],
            traits: { inventory: null }
          }
        },
        {
          token: { bases: ['PortableObject'] },
          Villager: {
            bases: ['Person'],
            traits: { inventory: ['token'] }
          }
        }
      )

      const world_mind = new Materia(logos(), 'world')
      const state = world_mind.create_state(logos_state(), {tt: 1})

      // Create sword in world state
      state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: {},
        label: 'sword'
      })

      // NPC with own inventory - replaces inherited
      const npc = state.add_belief_from_template({
        bases: ['Villager'],
        traits: {
          inventory: ['sword']  // Own trait: replaces Villager's [token]
        },
        label: 'guard'
      })

      // Own [sword] replaces inherited [token]
      const inv = npc.get_trait(state, Traittype.get_by_label('inventory'))
      expect(inv).to.be.an('array')
      expect(inv).to.have.lengthOf(1)
      expect(inv[0].get_label()).to.equal('sword')
    })
  })

  describe('Temporal evolution', () => {
    it('NPC adds base from eidos at tick 2 (versioning with additional bases)', () => {
      DB.register(
        {
          inventory: {
            type: 'PortableObject',
            container: Array,
            composable: true
          }
        },
        {
          Thing: {},
          PortableObject: { bases: ['Thing'] },
          Person: {
            bases: ['Thing'],
            traits: { inventory: null }
          }
        },
        {
          token: { bases: ['PortableObject'] },
          sword: { bases: ['PortableObject'] },
          Villager: {
            bases: ['Person'],
            traits: { inventory: ['token'] }
          },
          Guard: {
            bases: ['Person'],
            traits: { inventory: ['sword'] }
          }
        }
      )

      const world_mind = new Materia(logos(), 'world')
      let state = world_mind.create_state(logos_state(), {tt: 1})

      // Tick 1: Create NPC as just a Villager (has token)
      const npc = state.add_belief_from_template({
        bases: ['Villager'],
        traits: {},
        label: 'npc'
      })

      const inv1 = npc.get_trait(state, Traittype.get_by_label('inventory'))
      expect(inv1).to.have.lengthOf(1)
      expect(inv1[0].get_label()).to.equal('token')

      state.lock()

      // Tick 2: NPC joins the guard (gains Guard base in addition to Villager)
      // Create a new belief with same subject but additional bases
      state = state.branch(logos_state(), 2)

      const npc_v2 = Belief.from_template(state, {
        sid: npc.subject.sid,  // Same subject
        bases: ['Villager', 'Guard'],  // Now has both bases
        traits: {},
        label: 'npc'
      })

      state.replace_beliefs(npc_v2)

      const npc_final = state.get_belief_by_subject(npc.subject)
      const inv2 = npc_final.get_trait(state, Traittype.get_by_label('inventory'))

      // Should compose from both Villager (token) and Guard (sword)
      expect(inv2).to.be.an('array')
      expect(inv2).to.have.lengthOf(2)
      const labels = inv2.map(b => b.get_label()).sort()
      expect(labels).to.deep.equal(['sword', 'token'])
    })

    it('NPC gains own inventory at tick 2 (replaces inherited)', () => {
      DB.register(
        {
          inventory: {
            type: 'PortableObject',
            container: Array,
            composable: true
          }
        },
        {
          Thing: {},
          PortableObject: { bases: ['Thing'] },
          Person: {
            bases: ['Thing'],
            traits: { inventory: null }
          }
        },
        {
          token: { bases: ['PortableObject'] },
          Villager: {
            bases: ['Person'],
            traits: { inventory: ['token'] }
          }
        }
      )

      const world_mind = new Materia(logos(), 'world')
      let state = world_mind.create_state(logos_state(), {tt: 1})

      // Create sword in world state
      state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: {},
        label: 'sword'
      })

      // Tick 1: Create NPC inheriting from Villager (has token via inheritance)
      const npc = state.add_belief_from_template({
        bases: ['Villager'],
        traits: {},
        label: 'npc'
      })

      const inv1 = npc.get_trait(state, Traittype.get_by_label('inventory'))
      expect(inv1).to.have.lengthOf(1)
      expect(inv1[0].get_label()).to.equal('token')

      state.lock()

      // Tick 2: NPC acquires sword (own replaces inherited token)
      state = state.branch(logos_state(), 2)
      state = state.tick_with_template(npc, 2, {
        inventory: ['sword']  // Own [sword] replaces inherited [token]
      })

      const npc_v2 = state.get_belief_by_subject(npc.subject)
      const inv2 = npc_v2.get_trait(state, Traittype.get_by_label('inventory'))
      expect(inv2).to.be.an('array')

      // Own [sword] replaces inherited [token]
      expect(inv2).to.have.lengthOf(1)
      expect(inv2[0].get_label()).to.equal('sword')
    })

    it('composition works across state branches with different timestamps', () => {
      DB.register(
        {
          inventory: {
            type: 'PortableObject',
            container: Array,
            composable: true
          }
        },
        {
          Thing: {},
          PortableObject: { bases: ['Thing'] },
          Person: {
            bases: ['Thing'],
            traits: { inventory: null }
          }
        },
        {
          token: { bases: ['PortableObject'] },
          Villager: {
            bases: ['Person'],
            traits: { inventory: ['token'] }
          }
        }
      )

      const world_mind = new Materia(logos(), 'world')
      const state1 = world_mind.create_state(logos_state(), {tt: 1})

      const npc = state1.add_belief_from_template({
        bases: ['Villager'],
        traits: {},
        label: 'npc'
      })

      state1.lock()

      // Branch at different vt
      const state2 = state1.branch(logos_state(), 2)
      state2.lock()

      // Composition should work in both states
      const inv1 = npc.get_trait(state1, Traittype.get_by_label('inventory'))
      const inv2 = npc.get_trait(state2, Traittype.get_by_label('inventory'))

      expect(inv1).to.have.lengthOf(1)
      expect(inv2).to.have.lengthOf(1)
      expect(inv1[0].get_label()).to.equal('token')
      expect(inv2[0].get_label()).to.equal('token')

      // Cache is per belief (trait values are stable per belief)
      const inventory_traittype = Traittype.get_by_label('inventory')
      expect(npc._cache.has(inventory_traittype)).to.be.true
      // Same cached value for all states since traits don't change
      const cached_inv = npc._cache.get(inventory_traittype)
      expect(cached_inv).to.have.lengthOf(1)
      expect(inv1).to.equal(cached_inv)
    })
  })

  describe('Mixed scenarios', () => {
    it('deep inheritance + own replaces + temporal evolution', () => {
      DB.register(
        {
          inventory: {
            type: 'PortableObject',
            container: Array,
            composable: true
          }
        },
        {
          Thing: {},
          PortableObject: { bases: ['Thing'] },
          Person: {
            bases: ['Thing'],
            traits: { inventory: null }
          }
        },
        {
          token: { bases: ['PortableObject'] },
          hammer: { bases: ['PortableObject'] },
          Villager: {
            bases: ['Person'],
            traits: { inventory: ['token'] }
          },
          Blacksmith: {
            bases: ['Person', 'Villager'],
            traits: { inventory: ['hammer'] }
          }
        }
      )

      const world_mind = new Materia(logos(), 'world')
      let state = world_mind.create_state(logos_state(), {tt: 1})

      // Create sword in world state
      state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: {},
        label: 'sword'
      })

      // Tick 1: NPC inherits from Blacksmith (whose [hammer] replaced Villager's [token])
      const npc = state.add_belief_from_template({
        bases: ['Blacksmith'],
        traits: {},
        label: 'npc'
      })

      // Blacksmith has [hammer] (replaced [token]), NPC inherits [hammer]
      const inv1 = npc.get_trait(state, Traittype.get_by_label('inventory'))
      expect(inv1).to.have.lengthOf(1)
      expect(inv1[0].get_label()).to.equal('hammer')

      state.lock()

      // Tick 2: NPC gains sword (replaces inherited inventory)
      state = state.branch(logos_state(), 2)
      state = state.tick_with_template(npc, 2, {
        inventory: ['sword']  // Own [sword] replaces inherited [hammer]
      })

      const npc_v2 = state.get_belief_by_subject(npc.subject)
      const inv2 = npc_v2.get_trait(state, Traittype.get_by_label('inventory'))
      expect(inv2).to.have.lengthOf(1)
      expect(inv2[0].get_label()).to.equal('sword')
    })
  })

  describe('save/load round-trip', () => {
    function setupComplexArchetypes() {
      DB.reset_registries()
      DB.register({
        inventory: {
          type: 'Subject',
          container: Array,
          composable: true
        }
      }, {
        Thing: {},
        PortableObject: { bases: ['Thing'] },
        Person: {
          bases: ['Thing'],
          traits: { inventory: null }
        }
      }, {
        token: { bases: ['PortableObject'] },
        sword: { bases: ['PortableObject'] },
        shield: { bases: ['PortableObject'] }
      })
    }

    it('own value replaces inherited after save/load', () => {
      setupComplexArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const state = world_mind.create_state(logos_state(), { tt: 1 })

      // Get prototypes from eidos
      const eidos_state = eidos().origin_state
      const token = eidos_state.get_belief_by_label('token')
      const sword = eidos_state.get_belief_by_label('sword')
      const shield = eidos_state.get_belief_by_label('shield')

      // Grandparent with token
      const base = state.add_belief_from_template({
        bases: ['Person'],
        traits: { inventory: [token.subject] },
        label: 'base'
      })

      // Parent adds sword (replaces base's token)
      const parent = state.add_belief_from_template({
        bases: [base],
        traits: { inventory: [sword.subject] },
        label: 'parent'
      })

      // Child adds shield (replaces parent's sword)
      const child = state.add_belief_from_template({
        bases: [parent],
        traits: { inventory: [shield.subject] },
        label: 'child'
      })

      state.lock()

      // Verify before save - child has own [shield] which replaces inherited
      const inv_tt = Traittype.get_by_label('inventory')
      const inv_before = child.get_trait(state, inv_tt)
      expect(inv_before).to.have.lengthOf(1)
      expect(inv_before[0].get_label()).to.equal('shield')

      // Save and reload
      const json = save_mind(world_mind)
      DB.reset_registries()
      setupComplexArchetypes()
      const loaded_mind = load(json)
      const loaded_state = [...loaded_mind._states][0]
      const loaded_child = loaded_state.get_belief_by_label('child')

      // Verify own replaces inherited works after load
      const loaded_inv_tt = Traittype.get_by_label('inventory')
      const inv_after = loaded_child.get_trait(loaded_state, loaded_inv_tt)
      expect(inv_after).to.have.lengthOf(1)
    })

    it('null blocking works after save/load', () => {
      setupComplexArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const state = world_mind.create_state(logos_state(), { tt: 1 })

      // Get prototype from eidos
      const eidos_state = eidos().origin_state
      const sword = eidos_state.get_belief_by_label('sword')

      const warrior = state.add_belief_from_template({
        bases: ['Person'],
        traits: { inventory: [sword.subject] },
        label: 'warrior'
      })

      // Pacifist blocks inventory with null
      const pacifist = state.add_belief_from_template({
        bases: [warrior],
        traits: { inventory: null },
        label: 'pacifist'
      })

      state.lock()

      // Verify null blocks before save
      const inv_tt = Traittype.get_by_label('inventory')
      expect(pacifist.get_trait(state, inv_tt)).to.be.null

      // Save and reload
      const json = save_mind(world_mind)
      DB.reset_registries()
      setupComplexArchetypes()
      const loaded_mind = load(json)
      const loaded_state = [...loaded_mind._states][0]
      const loaded_pacifist = loaded_state.get_belief_by_label('pacifist')

      // Null should still block after load
      const loaded_inv_tt = Traittype.get_by_label('inventory')
      expect(loaded_pacifist.get_trait(loaded_state, loaded_inv_tt)).to.be.null
    })
  })

  describe('get_defined_traits() branch stopping per-traittype', () => {
    it('Test 1: different composable traits on sibling bases', () => {
      // A (inventory=[token])     B (skills=[smithing])
      //  \                        /
      //           C (this)
      DB.register(
        {
          inventory: { type: 'Item', container: Array, composable: true },
          skills: { type: 'Skill', container: Array, composable: true }
        },
        {
          Thing: {},
          Item: { bases: ['Thing'] },
          Skill: { bases: ['Thing'] },
          Person: { bases: ['Thing'], traits: { inventory: null, skills: null } }
        },
        {
          token: { bases: ['Item'] },
          smithing: { bases: ['Skill'] },
          Merchant: { bases: ['Person'], traits: { inventory: ['token'] } },
          Craftsman: { bases: ['Person'], traits: { skills: ['smithing'] } }
        }
      )

      const eidos_state = eidos().origin_state
      const world_mind = new Materia(logos(), 'world')
      const state = world_mind.create_state(logos_state(), {tt: 1})

      const merchant = eidos_state.get_belief_by_label('Merchant')
      const craftsman = eidos_state.get_belief_by_label('Craftsman')

      // NPC with two bases having different composable traits
      const npc = state.add_belief_from_template({
        bases: [merchant, craftsman],
        traits: {},
        label: 'merchant_craftsman'
      })
      state.lock()

      const inv_tt = Traittype.get_by_label('inventory')
      const skills_tt = Traittype.get_by_label('skills')

      // Call get_defined_traits FIRST (before get_trait populates cache)
      const defined = new Map(npc.get_defined_traits())
      expect(defined.has(inv_tt), 'get_defined_traits should include inventory').to.be.true
      expect(defined.has(skills_tt), 'get_defined_traits should include skills').to.be.true

      // get_trait should also work
      const inv_via_get_trait = npc.get_trait(state, inv_tt)
      const skills_via_get_trait = npc.get_trait(state, skills_tt)
      expect(inv_via_get_trait).to.have.lengthOf(1)
      expect(skills_via_get_trait).to.have.lengthOf(1)
    })

    it('Test 2: composable shadows but ancestor has different composable (THE BUG)', () => {
      // A (inventory=[token], skills=[farming])
      // |
      // B (inventory=[sword])  ← B shadows A's inventory
      // |
      // C (this)
      DB.register(
        {
          inventory: { type: 'Item', container: Array, composable: true },
          skills: { type: 'Skill', container: Array, composable: true }
        },
        {
          Thing: {},
          Item: { bases: ['Thing'] },
          Skill: { bases: ['Thing'] },
          Person: { bases: ['Thing'], traits: { inventory: null, skills: null } }
        },
        {
          token: { bases: ['Item'] },
          sword: { bases: ['Item'] },
          farming: { bases: ['Skill'] },
          // A: has both inventory and skills
          Peasant: { bases: ['Person'], traits: { inventory: ['token'], skills: ['farming'] } },
          // B: shadows inventory, no skills
          Warrior: { bases: ['Peasant'], traits: { inventory: ['sword'] } }
        }
      )

      const eidos_state = eidos().origin_state
      const world_mind = new Materia(logos(), 'world')
      const state = world_mind.create_state(logos_state(), {tt: 1})

      const warrior = eidos_state.get_belief_by_label('Warrior')

      // C inherits from Warrior (B)
      const npc = state.add_belief_from_template({
        bases: [warrior],
        traits: {},
        label: 'soldier'
      })
      state.lock()

      const inv_tt = Traittype.get_by_label('inventory')
      const skills_tt = Traittype.get_by_label('skills')

      // Call get_defined_traits FIRST (before get_trait populates cache)
      const defined = new Map(npc.get_defined_traits())
      expect(defined.has(inv_tt), 'get_defined_traits should include inventory').to.be.true
      expect(defined.has(skills_tt), 'get_defined_traits should include skills').to.be.true
      expect(defined.get(inv_tt)).to.have.lengthOf(1)
      expect(defined.get(skills_tt)).to.have.lengthOf(1)

      // get_trait should also work (verifies both methods agree)
      const inv_via_get_trait = npc.get_trait(state, inv_tt)
      const skills_via_get_trait = npc.get_trait(state, skills_tt)
      expect(inv_via_get_trait).to.have.lengthOf(1)
      expect(inv_via_get_trait[0].get_label()).to.equal('sword')
      expect(skills_via_get_trait).to.have.lengthOf(1)
      expect(skills_via_get_trait[0].get_label()).to.equal('farming')
    })

    it('Test 3: mixed composable + non-composable ancestor', () => {
      // A (inventory=[token], @name="Alice")
      // |
      // B (inventory=[sword])
      // |
      // C (this)
      DB.register(
        {
          inventory: { type: 'Item', container: Array, composable: true },
          '@name': { type: 'string' }
        },
        {
          Thing: {},
          Item: { bases: ['Thing'] },
          Person: { bases: ['Thing'], traits: { '@name': null, inventory: null } }
        },
        {
          token: { bases: ['Item'] },
          sword: { bases: ['Item'] },
          // A: has inventory and name
          Alice: { bases: ['Person'], traits: { inventory: ['token'], '@name': 'Alice' } },
          // B: shadows inventory only
          AliceWarrior: { bases: ['Alice'], traits: { inventory: ['sword'] } }
        }
      )

      const eidos_state = eidos().origin_state
      const world_mind = new Materia(logos(), 'world')
      const state = world_mind.create_state(logos_state(), {tt: 1})

      const alice_warrior = eidos_state.get_belief_by_label('AliceWarrior')

      // C inherits from AliceWarrior (B)
      const npc = state.add_belief_from_template({
        bases: [alice_warrior],
        traits: {},
        label: 'alice_soldier'
      })
      state.lock()

      const inv_tt = Traittype.get_by_label('inventory')
      const name_tt = Traittype.get_by_label('@name')

      // Call get_defined_traits FIRST (before get_trait populates cache)
      const defined = new Map(npc.get_defined_traits())
      expect(defined.has(inv_tt), 'get_defined_traits should include inventory').to.be.true
      expect(defined.has(name_tt), 'get_defined_traits should include @name').to.be.true
      expect(defined.get(name_tt)).to.equal('Alice')

      // get_trait should also work
      expect(npc.get_trait(state, inv_tt)).to.have.lengthOf(1)
      expect(npc.get_trait(state, name_tt)).to.equal('Alice')
    })

    it('Test 4: deep chain with multiple shadow points', () => {
      // A (T1=[a], T2=[b], T3=[c])
      // |
      // B (T1=[x])  ← shadows T1
      // |
      // C (T2=[y])  ← shadows T2
      // |
      // D (this)
      DB.register(
        {
          T1: { type: 'Item', container: Array, composable: true },
          T2: { type: 'Item', container: Array, composable: true },
          T3: { type: 'Item', container: Array, composable: true }
        },
        {
          Thing: {},
          Item: { bases: ['Thing'] },
          Base: { bases: ['Thing'], traits: { T1: null, T2: null, T3: null } }
        },
        {
          a: { bases: ['Item'] },
          b: { bases: ['Item'] },
          c: { bases: ['Item'] },
          x: { bases: ['Item'] },
          y: { bases: ['Item'] },
          // A: has all three
          LevelA: { bases: ['Base'], traits: { T1: ['a'], T2: ['b'], T3: ['c'] } },
          // B: shadows T1 only
          LevelB: { bases: ['LevelA'], traits: { T1: ['x'] } },
          // C: shadows T2 only
          LevelC: { bases: ['LevelB'], traits: { T2: ['y'] } }
        }
      )

      const eidos_state = eidos().origin_state
      const world_mind = new Materia(logos(), 'world')
      const state = world_mind.create_state(logos_state(), {tt: 1})

      const level_c = eidos_state.get_belief_by_label('LevelC')

      // D inherits from LevelC
      const npc = state.add_belief_from_template({
        bases: [level_c],
        traits: {},
        label: 'level_d'
      })
      state.lock()

      const t1_tt = Traittype.get_by_label('T1')
      const t2_tt = Traittype.get_by_label('T2')
      const t3_tt = Traittype.get_by_label('T3')

      // Call get_defined_traits FIRST (before get_trait populates cache)
      const defined = new Map(npc.get_defined_traits())
      expect(defined.has(t1_tt), 'should have T1').to.be.true
      expect(defined.has(t2_tt), 'should have T2').to.be.true
      expect(defined.has(t3_tt), 'should have T3').to.be.true
      expect(defined.get(t1_tt)[0].get_label()).to.equal('x')
      expect(defined.get(t2_tt)[0].get_label()).to.equal('y')
      expect(defined.get(t3_tt)[0].get_label()).to.equal('c')

      // get_trait should also work
      expect(npc.get_trait(state, t1_tt)[0].get_label()).to.equal('x')
      expect(npc.get_trait(state, t2_tt)[0].get_label()).to.equal('y')
      expect(npc.get_trait(state, t3_tt)[0].get_label()).to.equal('c')
    })

    it('Test 5: get_trait() vs get_defined_traits() consistency', () => {
      // Verify all traits return same value from both methods
      DB.register(
        {
          inventory: { type: 'Item', container: Array, composable: true },
          skills: { type: 'Skill', container: Array, composable: true },
          '@name': { type: 'string' }
        },
        {
          Thing: {},
          Item: { bases: ['Thing'] },
          Skill: { bases: ['Thing'] },
          Person: { bases: ['Thing'], traits: { '@name': null, inventory: null, skills: null } }
        },
        {
          token: { bases: ['Item'] },
          sword: { bases: ['Item'] },
          farming: { bases: ['Skill'] },
          combat: { bases: ['Skill'] },
          // Complex chain
          Base: { bases: ['Person'], traits: { '@name': 'Base', inventory: ['token'], skills: ['farming'] } },
          Mid: { bases: ['Base'], traits: { inventory: ['sword'] } },
          Top: { bases: ['Mid'], traits: { skills: ['combat'] } }
        }
      )

      const eidos_state = eidos().origin_state
      const world_mind = new Materia(logos(), 'world')
      const state = world_mind.create_state(logos_state(), {tt: 1})

      const top = eidos_state.get_belief_by_label('Top')

      const npc = state.add_belief_from_template({
        bases: [top],
        traits: {},
        label: 'test_npc'
      })
      state.lock()

      // Collect all traits from get_defined_traits
      const defined = new Map(npc.get_defined_traits())

      // For each traittype, verify get_trait returns same value
      for (const [traittype, defined_value] of defined) {
        const trait_value = npc.get_trait(state, traittype)
        if (Array.isArray(defined_value)) {
          expect(trait_value, `${traittype.label} should match`).to.deep.equal(defined_value)
        } else {
          expect(trait_value, `${traittype.label} should match`).to.equal(defined_value)
        }
      }
    })
  })
})
