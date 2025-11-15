/**
 * Tests for composable trait composition (e.g., inventory arrays)
 */

import { expect } from 'chai'
import { Traittype } from '../public/worker/traittype.mjs'
import * as DB from '../public/worker/db.mjs'

describe('Composable Traits', () => {
  beforeEach(() => {
    DB.reset_registries()
  })

  describe('Inventory Composition', () => {
    it('composes inventory from multiple bases (transitive)', () => {
      // Register inventory as composable
      DB.register(
        {
          '@about': {type: 'Subject', mind: 'parent'},
          '@label': {type: 'string'},
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

      const eidos_state = DB.get_eidos().origin_state
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

      const eidos_state = DB.get_eidos().origin_state
      const vb = eidos_state.get_belief_by_label('VillageBlacksmith')

      // Should have deduplicated inventory (only 1 hammer, not 2)
      const inventory_traittype = Traittype.get_by_label('inventory')
      const vb_inv = vb.get_trait(eidos_state, inventory_traittype)
      expect(vb_inv).to.be.an('array')
      expect(vb_inv).to.have.lengthOf(1)
      expect(vb_inv[0].get_label()).to.equal('hammer')
    })

    it('composes inventory in to_inspect_view()', () => {
      DB.register(
        {
          '@about': {type: 'Subject', mind: 'parent'},
          '@label': {type: 'string'},
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

      const eidos_state = DB.get_eidos().origin_state
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
