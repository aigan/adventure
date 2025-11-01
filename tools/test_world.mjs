/**
 * Temporary test to verify world.mjs setup works correctly
 * Run with: node tmp/test_world.mjs
 */

import * as DB from '../public/worker/db.mjs'
import { Archetype } from '../public/worker/archetype.mjs'

// Reset state
DB.reset_registries()

// Import world.mjs which will run setupStandardArchetypes()
console.log('Loading world.mjs...')
const world_module = await import('../public/worker/world.mjs')

console.log('\n✓ World module loaded successfully')
console.log('✓ setupStandardArchetypes() executed')

// Check that session exists
console.log('\nSession:', world_module.session ? '✓ Created' : '✗ Missing')

// Check archetypes
const archetypes = ['Thing', 'ObjectPhysical', 'Mental', 'Villager', 'Blacksmith', 'Location', 'PortableObject']
console.log('\nArchetypes:')
for (const label of archetypes) {
  const archetype = Archetype.get_by_label(label)
  console.log(`  ${label}: ${archetype ? '✓' : '✗'}`)
}

// Check prototypes (shared beliefs)
console.log('\nPrototypes (shared beliefs):')
const prototypes = ['Actor', 'Person']
for (const label of prototypes) {
  const subject = DB.get_subject_by_label(label)
  if (subject) {
    const beliefs = [...subject.beliefs_at_tt(1)]
    const timeless_beliefs = [...subject.beliefs_at_tt(-Infinity)]
    console.log(`  ${label}: ✓ (${beliefs.length} at tt=1, ${timeless_beliefs.length} timeless)`)

    if (timeless_beliefs.length > 0) {
      const belief = timeless_beliefs[0]
      console.log(`    - get_tt(): ${belief.get_tt()}`)
      console.log(`    - in_mind: ${belief.in_mind}`)
      console.log(`    - origin_state: ${belief.origin_state}`)
      console.log(`    - bases: ${[...belief.get_archetypes()].map(a => a.label).join(', ')}`)
    }
  } else {
    console.log(`  ${label}: ✗ Subject not found`)
  }
}

// Check session state entities
console.log('\nWorld state entities:')
const state = world_module.session.state
const expected_entities = ['workshop', 'market', 'tavern', 'forge', 'hammer', 'tools', 'mayor', 'npc1', 'blacksmith_villager', 'player']
for (const label of expected_entities) {
  const belief = state.get_belief_by_label(label)
  console.log(`  ${label}: ${belief ? '✓' : '✗'}`)
}

// Check all minds created
console.log('\nMinds created:')
const registries = DB._reflect()
const all_minds = [...registries.mind_by_id.values()]
console.log(`Total minds: ${all_minds.length}`)
for (const mind of all_minds) {
  console.log(`\n  ${mind.label} (id: ${mind._id}, parent: ${mind.parent?.label ?? 'null'})`)

  // Show states for this mind
  const states = [...mind._states]
  console.log(`    - States: ${states.length}`)
  for (const state of states) {
    console.log(`      State ${state._id}: tt=${state.tt}, vt=${state.vt}, locked=${state.locked}`)
  }

  // Show child minds
  if (mind._child_minds.size > 0) {
    console.log(`    - Child minds: ${[...mind._child_minds].map(m => m.label).join(', ')}`)
  }
}

console.log('\n✓ All checks complete')
