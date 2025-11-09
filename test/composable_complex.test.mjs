/**
 * Complex scenarios for composable trait composition
 * Tests edge cases with branching, temporal evolution, and nullification
 */

import { expect } from 'chai'
import * as DB from '../public/worker/db.mjs'
import { Mind } from '../public/worker/mind.mjs'

describe('Composable Traits - Complex Scenarios', () => {
  beforeEach(() => {
    DB.reset_registries()
  })

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

      const world_mind = new Mind(DB.get_logos_mind(), 'world')
      const state = world_mind.create_state(DB.get_logos_state(), {tt: 1})

      // NPC with two prototype bases
      const npc = state.add_belief_from_template({
        bases: ['Villager', 'Guard'],
        traits: {
          '@label': 'guard_npc'
        }
      })

      // Should compose from both prototypes
      const inv = npc.get_trait(state, 'inventory')
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

      const eidos_state = DB.get_eidos().origin_state
      const master = eidos_state.get_belief_by_label('MasterCraftsman')

      // Should compose from entire chain: Villager -> Blacksmith -> MasterCraftsman + Guard
      const inv = master.get_trait(eidos_state, 'inventory')
      expect(inv).to.have.lengthOf(4)
      const labels = inv.map(b => b.get_label()).sort()
      expect(labels).to.deep.equal(['badge', 'hammer', 'sword', 'token'])
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

      const eidos_state = DB.get_eidos().origin_state
      const blacksmith = eidos_state.get_belief_by_label('Blacksmith')

      // Should have null (blocks composition from Villager)
      const inv = blacksmith.get_trait(eidos_state, 'inventory')
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

      const world_mind = new Mind(DB.get_logos_mind(), 'world')
      const state = world_mind.create_state(DB.get_logos_state(), {tt: 1})

      // Create player inheriting from Blacksmith
      const player = state.add_belief_from_template({
        bases: ['Blacksmith'],
        traits: {
          '@label': 'player'
        }
      })

      // Player should have null inventory (inherited from Blacksmith)
      // NOT apprentice_token from Villager (blocked by Blacksmith's null)
      const inv = player.get_trait(state, 'inventory')
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

      const world_mind = new Mind(DB.get_logos_mind(), 'world')
      const state = world_mind.create_state(DB.get_logos_state(), {tt: 1})

      // Create NPC with explicit inventory referencing shared beliefs from Eidos
      // Should compose: Villager[token] + Guard[sword] + [token, sword] from own trait
      const npc = state.add_belief_from_template({
        bases: ['Villager', 'Guard'],
        traits: {
          '@label': 'npc',
          inventory: ['apprentice_token', 'sword']  // Explicit refs to Eidos shared beliefs
        }
      })

      // Should compose all sources, deduplicating by subject.sid
      // Villager[token] + Guard[sword] + own[token, sword] = [token, sword] (deduplicated)
      const inv = npc.get_trait(state, 'inventory')
      expect(inv).to.be.an('array')
      expect(inv).to.have.lengthOf(2)
      const labels = inv.map(b => b.get_label()).sort()
      expect(labels).to.deep.equal(['apprentice_token', 'sword'])
    })

    it('explicit empty array COMPOSES with base values (adds nothing)', () => {
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

      const world_mind = new Mind(DB.get_logos_mind(), 'world')
      const state = world_mind.create_state(DB.get_logos_state(), {tt: 1})

      // NPC with explicit empty inventory - still composes with base!
      // Empty array is not null, so composition happens: [token] + [] = [token]
      const npc = state.add_belief_from_template({
        bases: ['Villager'],
        traits: {
          '@label': 'villager_npc',
          inventory: []
        }
      })

      // Still has token from base (empty array composes to base + empty = base)
      const inv = npc.get_trait(state, 'inventory')
      expect(inv).to.be.an('array')
      expect(inv).to.have.lengthOf(1)
      expect(inv[0].get_label()).to.equal('token')
    })

    it('own trait blocks composition lookup (but creation composes)', () => {
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

      const world_mind = new Mind(DB.get_logos_mind(), 'world')
      const state = world_mind.create_state(DB.get_logos_state(), {tt: 1})

      // Create sword in world state
      state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: {
          '@label': 'sword'
        }
      })

      // NPC with own inventory - composition happens at creation
      const npc = state.add_belief_from_template({
        bases: ['Villager'],
        traits: {
          '@label': 'guard',
          inventory: ['sword']  // Own trait: composes [token] + [sword] at creation
        }
      })

      // Has both token (from base) and sword (own) via creation-time composition
      const inv = npc.get_trait(state, 'inventory')
      expect(inv).to.be.an('array')
      expect(inv).to.have.lengthOf(2)
      const labels = inv.map(b => b.get_label()).sort()
      expect(labels).to.deep.equal(['sword', 'token'])

      // Own trait blocks lookup composition (get_trait returns own value)
      // But it was already composed at creation, so we still get both
    })
  })

  describe('Temporal evolution', () => {
    it.skip('NPC adds base from eidos at tick 2 (requires with_bases API)', () => {
      // TODO: Implement with_bases() API to support dynamic base changes
      // This would allow NPCs to gain new prototype bases over time
    })

    it('NPC gains own inventory at tick 2 (composes with base)', () => {
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

      const world_mind = new Mind(DB.get_logos_mind(), 'world')
      let state = world_mind.create_state(DB.get_logos_state(), {tt: 1})

      // Create sword in world state
      state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: {
          '@label': 'sword'
        }
      })

      // Tick 1: Create NPC inheriting from Villager (has token via composition)
      const npc = state.add_belief_from_template({
        bases: ['Villager'],
        traits: {
          '@label': 'npc'
        }
      })

      const inv1 = npc.get_trait(state, 'inventory')
      expect(inv1).to.have.lengthOf(1)
      expect(inv1[0].get_label()).to.equal('token')

      state.lock()

      // Tick 2: NPC acquires sword (should compose with prototype Villager's token)
      state = state.branch_state(DB.get_logos_state(), 2)
      state = state.tick_with_traits(npc, 2, {
        inventory: ['sword']  // Should compose: Villager[token] + [sword] = [token, sword]
      })

      const npc_v2 = state.get_belief_by_subject(npc.subject)
      const inv2 = npc_v2.get_trait(state, 'inventory')
      expect(inv2).to.be.an('array')

      // Actual behavior: tick_with_traits creates new belief with same bases
      // Composition happens: Villager[token] + [sword]
      expect(inv2).to.have.lengthOf(2)
      const labels = inv2.map(b => b.get_label()).sort()
      expect(labels).to.deep.equal(['sword', 'token'])
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

      const world_mind = new Mind(DB.get_logos_mind(), 'world')
      const state1 = world_mind.create_state(DB.get_logos_state(), {tt: 1})

      const npc = state1.add_belief_from_template({
        bases: ['Villager'],
        traits: {
          '@label': 'npc'
        }
      })

      state1.lock()

      // Branch at different vt
      const state2 = state1.branch_state(DB.get_logos_state(), 2)

      // Composition should work in both states
      const inv1 = npc.get_trait(state1, 'inventory')
      const inv2 = npc.get_trait(state2, 'inventory')

      expect(inv1).to.have.lengthOf(1)
      expect(inv2).to.have.lengthOf(1)
      expect(inv1[0].get_label()).to.equal('token')
      expect(inv2[0].get_label()).to.equal('token')

      // Cache should be separate per state
      expect(npc._cache.has(state1)).to.be.true
      expect(npc._cache.has(state2)).to.be.true
    })
  })

  describe('Mixed scenarios', () => {
    it('deep inheritance + empty array + temporal evolution', () => {
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

      const world_mind = new Mind(DB.get_logos_mind(), 'world')
      let state = world_mind.create_state(DB.get_logos_state(), {tt: 1})

      // Create sword in world state
      state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: {
          '@label': 'sword'
        }
      })

      // Tick 1: NPC inherits from deep chain (Blacksmith -> Villager)
      const npc = state.add_belief_from_template({
        bases: ['Blacksmith'],
        traits: {
          '@label': 'npc'
        }
      })

      // Should have token + hammer via composition
      const inv1 = npc.get_trait(state, 'inventory')
      expect(inv1).to.have.lengthOf(2)
      const labels1 = inv1.map(b => b.get_label()).sort()
      expect(labels1).to.deep.equal(['hammer', 'token'])

      state.lock()

      // Tick 2: NPC gains sword (composes with existing inventory)
      state = state.branch_state(DB.get_logos_state(), 2)
      state = state.tick_with_traits(npc, 2, {
        inventory: ['sword']  // Composes: [token, hammer] + [sword]
      })

      const npc_v2 = state.get_belief_by_subject(npc.subject)
      const inv2 = npc_v2.get_trait(state, 'inventory')
      expect(inv2).to.have.lengthOf(3)
      const labels2 = inv2.map(b => b.get_label()).sort()
      expect(labels2).to.deep.equal(['hammer', 'sword', 'token'])
    })
  })
})
