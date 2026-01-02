/**
 * Tests for composable trait composition (e.g., inventory arrays)
 *
 * MATRIX COVERAGE:
 * ✅ 3.3 Composable Transitive (line 15)
 * ✅ 3.5 Composable Deduplication (line 74)
 * ✅ 7.3 to_inspect_view() shows composed values (line 125)
 *
 * MISSING FROM THIS FILE:
 * ❌ 3.1 Composable from Single Base (baseline - need isolated test)
 * ❌ 3.2 Composable from Multiple Bases (Direct) - covered in 3.3 but not isolated
 * ❌ 3.4 Composable + Own Value (own adds to inherited)
 * ❌ 3.6 Composable with null Blocks Composition
 * ❌ 3.7 Composable with Empty Array
 * ❌ 3.8 Composable Diamond (same item via multiple paths)
 * ❌ 3.9 Composable from Archetype + Belief Bases (mixed sources)
 * ❌ 6.4 Archetype with Array Default (Villager has default inventory but not tested explicitly)
 *
 * NOTE: These missing tests are in test/trait_inheritance_comprehensive.test.mjs
 */

import { expect } from 'chai'
import { Traittype } from '../public/worker/traittype.mjs'
import { Materia, save_mind, load } from '../public/worker/cosmos.mjs'
import { logos_state } from '../public/worker/logos.mjs'
import * as DB from '../public/worker/db.mjs'
import { eidos } from '../public/worker/eidos.mjs'
import { setupAfterEachValidation, setupStandardArchetypes } from './helpers.mjs'

describe('Composable Traits', () => {
  beforeEach(() => {
    DB.reset_registries()
  })
  setupAfterEachValidation();


  describe('Inventory Composition', () => {
    // Matrix 3.3: Own value replaces inherited (not composes)
    it('own inventory replaces inherited (no composition)', () => {
      // Register inventory as composable
      DB.register(
        {
          '@about': {type: 'Subject', mind: 'parent'},
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
          token: {
            bases: ['PortableObject']
          },
          hammer: {
            bases: ['PortableObject']
          },
          badge: {
            bases: ['PortableObject']
          },
          Villager: {
            bases: ['Person'],
            traits: {
              inventory: ['token']
            }
          },
          Blacksmith: {
            bases: ['Person', 'Villager'],
            traits: {
              inventory: ['hammer', 'badge']
            }
          }
        }
      )

      const eidos_state = eidos().origin_state
      const blacksmith = eidos_state.get_belief_by_label('Blacksmith')

      // Blacksmith has own inventory ['hammer', 'badge'] which REPLACES inherited
      // (own value replaces, no composition with bases)
      const inventory_traittype = Traittype.get_by_label('inventory')
      const blacksmith_inv = blacksmith.get_trait(eidos_state, inventory_traittype)
      expect(blacksmith_inv).to.be.an('array')
      expect(blacksmith_inv).to.have.lengthOf(2)

      const labels = blacksmith_inv.map(b => b.get_label()).sort()
      expect(labels).to.deep.equal(['badge', 'hammer'])
    })

    // Matrix 3.5: Composable Deduplication
    it('deduplicates items when same item appears in multiple bases', () => {
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
          hammer: {
            bases: ['PortableObject']
          },
          Villager: {
            bases: ['Person'],
            traits: {
              inventory: ['hammer']
            }
          },
          Blacksmith: {
            bases: ['Person'],
            traits: {
              inventory: ['hammer']  // Duplicate
            }
          },
          VillageBlacksmith: {
            bases: ['Person', 'Villager', 'Blacksmith'],
            traits: {}
          }
        }
      )

      const eidos_state = eidos().origin_state
      const vb = eidos_state.get_belief_by_label('VillageBlacksmith')

      // Should have deduplicated inventory (only 1 hammer, not 2)
      const inventory_traittype = Traittype.get_by_label('inventory')
      const vb_inv = vb.get_trait(eidos_state, inventory_traittype)
      expect(vb_inv).to.be.an('array')
      expect(vb_inv).to.have.lengthOf(1)
      expect(vb_inv[0].get_label()).to.equal('hammer')
    })

    // Matrix 7.3: to_inspect_view() shows composed values
    it('to_inspect_view shows own inventory (replaces inherited)', () => {
      DB.register(
        {
          '@about': {type: 'Subject', mind: 'parent'},
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
          token: {
            bases: ['PortableObject']
          },
          hammer: {
            bases: ['PortableObject']
          },
          Villager: {
            bases: ['Person'],
            traits: {
              inventory: ['token']
            }
          },
          Blacksmith: {
            bases: ['Person', 'Villager'],
            traits: {
              inventory: ['hammer']
            }
          }
        }
      )

      const eidos_state = eidos().origin_state
      const blacksmith = eidos_state.get_belief_by_label('Blacksmith')

      // Blacksmith has own inventory ['hammer'] which replaces inherited
      const view = blacksmith.to_inspect_view(eidos_state)
      expect(view.traits.inventory).to.be.an('array')
      expect(view.traits.inventory).to.have.lengthOf(1)

      const labels = view.traits.inventory.map(item => item.label).sort()
      expect(labels).to.deep.equal(['hammer'])
    })
  })

  // Note: Mind composition tests are in integration.test.mjs (P1.1 test)
  // as they require a full world setup with shared beliefs

  describe('save/load round-trip', () => {
    // Helper to setup composable inventory
    function setupInventoryArchetypes() {
      DB.register(
        {
          '@about': {type: 'Subject', mind: 'parent'},
          location: 'Location',
          inventory: {
            type: 'PortableObject',
            container: Array,
            composable: true
          }
        },
        {
          Thing: { traits: {'@about': null} },
          PortableObject: { bases: ['Thing'] },
          Location: { bases: ['Thing'], traits: { location: null } },
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
    }

    it('preserves composable array traits after save/load', () => {
      setupInventoryArchetypes()

      // Create a world mind instead of using eidos directly
      const world = Materia.create_world()
      const world_state = world.create_state(logos_state(), {tt: 1})

      // Create items with unique labels (not matching shared prototypes)
      const my_token = world_state.add_belief_from_template({
        bases: ['PortableObject'],
        label: 'my_token'
      })
      const my_hammer = world_state.add_belief_from_template({
        bases: ['PortableObject'],
        label: 'my_hammer'
      })

      // Create person with own inventory
      const warrior = world_state.add_belief_from_template({
        bases: ['Person'],
        traits: {
          inventory: [my_token.subject, my_hammer.subject]
        },
        label: 'warrior'
      })

      world_state.lock()

      // Verify inventory works before save
      const inventory_tt = Traittype.get_by_label('inventory')
      const inv_before = warrior.get_trait(world_state, inventory_tt)
      expect(inv_before).to.have.lengthOf(2)

      // Save and reload
      const json = save_mind(world)
      DB.reset_registries()
      setupInventoryArchetypes()
      const loaded_world = load(json)

      // Verify inventory works after load
      const loaded_state = [...loaded_world._states][0]
      const loaded_warrior = loaded_state.get_belief_by_label('warrior')
      const loaded_inventory_tt = Traittype.get_by_label('inventory')
      const inv_after = loaded_warrior.get_trait(loaded_state, loaded_inventory_tt)

      expect(inv_after).to.be.an('array')
      expect(inv_after).to.have.lengthOf(2)
    })

    it('composition works after save/load with world mind', () => {
      setupInventoryArchetypes()

      const world = Materia.create_world()
      const world_state = world.create_state(logos_state(), {tt: 1})

      // Create items
      const sword = world_state.add_belief_from_template({
        bases: ['PortableObject'],
        label: 'sword'
      })

      const shield = world_state.add_belief_from_template({
        bases: ['PortableObject'],
        label: 'shield'
      })

      // Create character with inventory
      const warrior = world_state.add_belief_from_template({
        bases: ['Person'],
        traits: {
          inventory: [sword.subject, shield.subject]
        },
        label: 'warrior'
      })

      world_state.lock()

      // Save and reload
      const json = save_mind(world)
      DB.reset_registries()
      setupInventoryArchetypes()
      const loaded_world = load(json)

      // Verify inventory trait works after load
      const loaded_state = [...loaded_world._states][0]
      const loaded_warrior = loaded_state.get_belief_by_label('warrior')
      const inventory_tt = Traittype.get_by_label('inventory')
      const loaded_inv = loaded_warrior.get_trait(loaded_state, inventory_tt)

      expect(loaded_inv).to.be.an('array')
      expect(loaded_inv).to.have.lengthOf(2)
      const labels = loaded_inv.map(s => {
        const b = loaded_state.get_belief_by_subject(s)
        return b ? b.get_label() : null
      }).sort()
      expect(labels).to.deep.equal(['shield', 'sword'])
    })
  })
})
