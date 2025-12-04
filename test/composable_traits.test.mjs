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
import * as DB from '../public/worker/db.mjs'
import { eidos } from '../public/worker/eidos.mjs'

describe('Composable Traits', () => {
  beforeEach(() => {
    DB.reset_registries()
  })

  describe('Inventory Composition', () => {
    // Matrix 3.3: Composable Transitive (A→B→C)
    it('composes inventory from multiple bases (transitive)', () => {
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

      // Verify Blacksmith composes all three items transitively
      // (token from Villager + hammer + badge from own inventory)
      const inventory_traittype = Traittype.get_by_label('inventory')
      const blacksmith_inv = blacksmith.get_trait(eidos_state, inventory_traittype)
      expect(blacksmith_inv).to.be.an('array')
      expect(blacksmith_inv).to.have.lengthOf(3)

      const labels = blacksmith_inv.map(b => b.get_label()).sort()
      expect(labels).to.deep.equal(['badge', 'hammer', 'token'])
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
    it('composes inventory in to_inspect_view()', () => {
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

      // Check to_inspect_view shows composed inventory
      const view = blacksmith.to_inspect_view(eidos_state)
      expect(view.traits.inventory).to.be.an('array')
      expect(view.traits.inventory).to.have.lengthOf(2)

      const labels = view.traits.inventory.map(item => item.label).sort()
      expect(labels).to.deep.equal(['hammer', 'token'])
    })
  })

  // Note: Mind composition tests are in integration.test.mjs (P1.1 test)
  // as they require a full world setup with shared beliefs
})
