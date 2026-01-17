#!/usr/bin/env node
/**
 * Test workshop scenario setup - shows created entities
 *
 * Run with: ./tools/test_world.mjs
 */

import * as DB from '../public/worker/db.mjs'
import { Archetype } from '../public/worker/archetype.mjs'

console.log('Loading workshop scenario...')
const { workshop_scenario } = await import('../public/worker/scenarios/workshop.mjs')

const { world_state: state, avatar: player } = await workshop_scenario.setup_world()

const registries = DB._reflect()
const archetype_labels = Object.keys(Archetype._registry).sort()
const beliefs = [...state.get_beliefs()]
const all_minds = [...registries.mind_by_id.values()]

// ============================================================================
// OUTPUT
// ============================================================================
console.log('\n' + '='.repeat(60))
console.log('WORKSHOP SCENARIO')
console.log('='.repeat(60))

console.log(`\nState: id=${state._id}, tt=${state.tt}, vt=${state.vt}, locked=${state.locked}`)
console.log(`Player: ${player.get_label()} (sid=${player.sid})`)

console.log(`\nArchetypes (${archetype_labels.length}): ${archetype_labels.join(', ')}`)

console.log(`\nBeliefs (${beliefs.length}):`)
for (const b of beliefs) {
  console.log(`  ${b.get_label() || '(unlabeled)'} (id=${b._id})`)
}

console.log(`\nMinds (${all_minds.length}):`)
for (const m of all_minds) {
  const states_count = [...m._states].length
  console.log(`  ${m.label || '(unlabeled)'} (id=${m._id}, states=${states_count})`)
}

console.log('\n✓ Setup complete')
