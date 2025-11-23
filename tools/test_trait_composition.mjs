/**
 * Test trait composition patterns
 *
 * Run with: node tools/test_trait_composition.mjs
 *
 * This tests:
 * - Mind composition: knowledge from multiple prototype bases
 * - Inventory composition: items from multiple roles
 * - Location override: physical constraint (can only be in one place)
 */

import * as DB from '../public/worker/db.mjs'
import { Mind } from '../public/worker/mind.mjs'
import { Materia } from '../public/worker/materia.mjs'
import { sysdesig } from '../public/worker/debug.mjs'

// Reset for clean test
DB.reset_registries()

// Define traittypes
DB.register({
  '@about': {type: 'Subject', mind: 'parent'},
  location: 'Location',
  mind: {type: 'Mind', composable: true},
  inventory: {type: 'PortableObject', container: Array, composable: true},
  color: 'string',
}, {
  Thing: {
    traits: {'@about': null}
  },
  Location: {
    bases: ['Thing'],
  },
  PortableObject: {
    bases: ['Thing'],
    traits: {color: null}
  },
  Mental: {
    bases: ['Thing'],
    traits: {mind: null}
  },
  Person: {
    bases: ['Thing'],
    traits: {
      location: null,
      inventory: null,
    }
  },
}, {})

// Create world
const world = Materia.create_world()
const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

// Create locations
world_state.add_beliefs_from_template({
  village: {bases: ['Location']},
  tavern: {bases: ['Location']},
  workshop: {bases: ['Location']},
})

// Create shared items (in Eidos for prototype inventories)
world_state.add_shared_from_template({
  apprentice_token: {
    bases: ['PortableObject'],
    traits: {color: 'bronze'}
  },
  basic_hammer: {
    bases: ['PortableObject'],
    traits: {color: 'gray'}
  },
  guild_badge: {
    bases: ['PortableObject'],
    traits: {color: 'gold'}
  },
  master_tools: {
    bases: ['PortableObject'],
    traits: {color: 'silver'}
  },
})

// Create base prototypes
world_state.add_shared_from_template({
  Villager: {
    bases: ['Person', 'Mental'],
    traits: {
      mind: {
        tavern: ['location']
      },
      inventory: ['apprentice_token'],
    },
  },

  Blacksmith: {
    bases: ['Person', 'Mental'],
    traits: {
      mind: {
        workshop: ['location']
      },
      inventory: ['basic_hammer', 'master_tools'],
    },
  },
})

// Lock base prototypes before using as bases
const eidos = DB.get_eidos()
const eidos_s1 = eidos.origin_state
eidos_s1.lock()

// Create new Eidos state for VillageBlacksmith
const eidos_s2 = eidos_s1.branch_state(DB.get_logos_state())
eidos_s2.add_beliefs_from_template({
  VillageBlacksmith: {
    bases: ['Villager', 'Blacksmith'],
  },
})
eidos_s2.lock()

// Create instance with explicit mind override
world_state.add_beliefs_from_template({
  player: {
    bases: ['VillageBlacksmith'],
    traits: {
      mind: {}  // Explicit empty mind (no prototype knowledge)
    }
  }
})

world_state.lock()

// ============================================================================
// ANALYSIS
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('TRAIT COMPOSITION TEST')
console.log('='.repeat(80))

function describe_trait(state, belief, trait_name) {
  try {
    const value = belief.get_trait(state, trait_name)
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'string') return `"${value}"`
    if (Array.isArray(value)) {
      return `[${value.map(v => v.get_label?.() || sysdesig(state, v)).join(', ')}]`
    }
    if (value.constructor?.name === 'Mind') {
      const mind_state = value.origin_state
      if (!mind_state) return 'Mind (no origin_state)'
      const beliefs = [...mind_state.get_beliefs()]
      const about_labels = beliefs
        .map(b => {
          const about = b.get_about(mind_state)
          return about?.subject.get_label?.()
        })
        .filter(Boolean)
      return `Mind knowing: [${about_labels.join(', ')}]`
    }
    return sysdesig(state, value)
  } catch (e) {
    return `ERROR: ${e.message}`
  }
}

// Test base prototypes
console.log('\n--- Base Prototypes ---')
const villager = world_state.get_belief_by_label('Villager')
const blacksmith = world_state.get_belief_by_label('Blacksmith')

console.log('Villager:')
console.log('  mind:', describe_trait(world_state, villager, 'mind'))
console.log('  inventory:', describe_trait(world_state, villager, 'inventory'))

console.log('\nBlacksmith:')
console.log('  mind:', describe_trait(world_state, blacksmith, 'mind'))
console.log('  inventory:', describe_trait(world_state, blacksmith, 'inventory'))

// Test multi-base prototype
console.log('\n--- VillageBlacksmith (Villager + Blacksmith) ---')
const vb = world_state.get_belief_by_label('VillageBlacksmith')
if (vb) {
  console.log('ACTUAL:')
  console.log('  mind:', describe_trait(world_state, vb, 'mind'))
  console.log('  inventory:', describe_trait(world_state, vb, 'inventory'))
  console.log('  location:', describe_trait(world_state, vb, 'location'))

  console.log('\nEXPECTED (with composition):')
  console.log('  mind: Mind knowing: [tavern, workshop]')
  console.log('  inventory: [apprentice_token, basic_hammer, master_tools]')
  console.log('  location: null (no explicit location in bases)')
}

// Test instance with override
console.log('\n--- Person1 (bases: VillageBlacksmith, explicit empty mind) ---')
const person1 = world_state.get_belief_by_label('person1')
if (person1) {
  console.log('ACTUAL:')
  console.log('  mind:', describe_trait(world_state, person1, 'mind'))
  console.log('  inventory:', describe_trait(world_state, person1, 'inventory'))

  console.log('\nEXPECTED:')
  console.log('  mind: Mind knowing: [] (explicit override)')
  console.log('  inventory: [apprentice_token, basic_hammer, master_tools] (inherits from VillageBlacksmith)')
}

console.log('\n' + '='.repeat(80))
console.log('SUMMARY')
console.log('='.repeat(80))
console.log(`
Current behavior (first-wins):
  ✗ VillageBlacksmith.mind = Villager's mind only
  ✗ VillageBlacksmith.inventory = [apprentice_token] only

Desired behavior (with composition):
  ✓ VillageBlacksmith.mind = Convergence merging both minds
  ✓ VillageBlacksmith.inventory = array concatenation of both

Implementation strategy:
  1. Mark traittypes with {composable: true}
  2. Belief.get_trait() checks if trait is composable
  3. If composable + multiple bases with trait:
     - Collect all values from bases (breadth-first search)
     - Compose via Type.compose() method OR array concatenation
     - Cache result in _cache[state_id][trait_name]
  4. Subsequent accesses hit cache (O(1))

Cache usage aligns with "Lazy Version Propagation":
  - _cache stores ALL resolved traits (branches + composition)
  - Not serialized (rebuild on load)
  - Invalidated when belief structure changes
`)
console.log('='.repeat(80))
