/**
 * Temporary test to verify world.mjs setup works correctly
 * Shows what's created using to_inspect_view() format (matches inspect GUI)
 *
 * Note: Prototypes (shared beliefs) are locked after creation. The "locked" field
 * only appears in output when false (to highlight mutable state), so locked prototypes
 * won't show a "locked" field.
 *
 * Run with: node tools/test_world.mjs
 */

import * as DB from '../public/worker/db.mjs'
import { Archetype } from '../public/worker/archetype.mjs'

// Import world.mjs to get world state
console.log('Loading world.mjs...')
const world_module = await import('../public/worker/world.mjs')

console.log('\n✓ World module loaded successfully')
console.log('✓ Calling init_world()...')

const { world_state: state, player_body: player } = world_module.init_world()

console.log('\nWorld state:', state ? '✓ Available' : '✗ Missing')
console.log('Player:', player ? '✓ Available' : '✗ Missing')
const registries = DB._reflect()

// ============================================================================
// ARCHETYPES
// ============================================================================
console.log('\n' + '='.repeat(80))
console.log('ARCHETYPES')
console.log('='.repeat(80))

const archetype_labels = Object.keys(registries.archetype_by_label).sort()
for (const label of archetype_labels) {
  const archetype = registries.archetype_by_label[label]
  console.log(`\n${label}:`)
  console.log(`  bases: ${[...archetype._bases].map(b => b.label).join(', ') || '(none)'}`)
  const trait_entries = archetype.get_trait_entries()
  if (trait_entries.length > 0) {
    console.log(`  traits:`)
    for (const [trait_label, trait_value] of trait_entries) {
      console.log(`    ${trait_label}: ${JSON.stringify(trait_value)}`)
    }
  }
}

// ============================================================================
// PROTOTYPES (Shared Beliefs)
// ============================================================================
console.log('\n' + '='.repeat(80))
console.log('PROTOTYPES (Shared Beliefs)')
console.log('='.repeat(80))

const shared_beliefs = [...registries.belief_by_id.values()]
  .filter(b => b.in_mind === null && b.origin_state === null)

if (shared_beliefs.length === 0) {
  console.log('(none)')
} else {
  for (const belief of shared_beliefs) {
    const view = belief.to_inspect_view(state)
    console.log(`\n${view.label || `(unlabeled belief ${belief._id})`}:`)
    console.log(JSON.stringify(view, null, 2))
  }
}

// ============================================================================
// WORLD STATE
// ============================================================================
console.log('\n' + '='.repeat(80))
console.log('WORLD STATE')
console.log('='.repeat(80))

if (!state) {
  console.log('No state found')
} else {
  console.log(`\nState info:`)
  console.log(`  _id: ${state._id}`)
  console.log(`  tt: ${state.tt}`)
  console.log(`  vt: ${state.vt}`)
  console.log(`  locked: ${state.locked}`)
  console.log(`  in_mind: ${state.in_mind?.label || 'null'} (${state.in_mind?._id})`)

  const beliefs = [...state.get_beliefs()]
  console.log(`\nBeliefs in world state: ${beliefs.length}`)

  for (const belief of beliefs) {
    const view = belief.to_inspect_view(state)
    console.log(`\n${view.label || `(unlabeled belief ${belief._id})`}:`)
    console.log(JSON.stringify(view, null, 2))
  }
}

// ============================================================================
// MINDS
// ============================================================================
console.log('\n' + '='.repeat(80))
console.log('MINDS')
console.log('='.repeat(80))

const all_minds = [...registries.mind_by_id.values()]
console.log(`\nTotal minds: ${all_minds.length}`)

for (const mind of all_minds) {
  console.log(`\n${'─'.repeat(80)}`)
  console.log(`Mind: ${mind.label || '(unlabeled)'} (id: ${mind._id})`)
  console.log(`─`.repeat(80))
  console.log(`  parent: ${mind.parent?.label || 'null'} (${mind.parent?._id ?? 'null'})`)
  console.log(`  child minds: ${mind._child_minds.size > 0 ? [...mind._child_minds].map(m => `${m.label}(${m._id})`).join(', ') : '(none)'}`)

  const states = [...mind._states]
  console.log(`\n  States: ${states.length}`)
  for (const s of states) {
    console.log(`    State ${s._id}: tt=${s.tt}, vt=${s.vt}, locked=${s.locked}`)
    console.log(`      ground_state: ${s.ground_state?._id ?? 'null'} (in mind: ${s.ground_state?.in_mind?.label ?? 'null'})`)

    const beliefs_in_state = [...s.get_beliefs()]
    if (beliefs_in_state.length > 0) {
      console.log(`      beliefs: ${beliefs_in_state.length}`)
      for (const b of beliefs_in_state) {
        const view = b.to_inspect_view(s)
        console.log(`\n        ${view.label || `(unlabeled ${b._id})`}:`)
        console.log('        ' + JSON.stringify(view, null, 2).split('\n').join('\n        '))
      }
    } else {
      console.log(`      beliefs: (none)`)
    }
  }
}

// ============================================================================
// DIAGNOSTIC: do_look simulation
// ============================================================================
console.log('\n' + '='.repeat(80))
console.log('DIAGNOSTIC: do_look simulation')
console.log('='.repeat(80))

import { Traittype } from '../public/worker/traittype.mjs'

const player_state_before = state.get_active_state_by_host(player)
console.log('\nPlayer state:', player_state_before._id, 'locked:', player_state_before.locked)

const beliefs_before = [...player_state_before.get_beliefs()]
console.log(`\n  Beliefs in player mind (${beliefs_before.length}):`)
for (const b of beliefs_before) {
  const about_tt = Traittype.get_by_label('@about')
  const about = b.get_trait(player_state_before, about_tt)
  console.log(`    #${b._id} ${b.get_label() || '(unlabeled)'} @about=${about?.sid}`)
}

// Simulate do_look
const location_traittype = Traittype.get_by_label('location')
const workshop = state.get_belief_by_label('workshop')
const content = [...workshop.rev_trait(state, location_traittype)]
console.log(`\nContent at workshop: ${content.map(b => `#${b._id} ${b.get_label()}`).join(', ')}`)

const player_state = state.get_active_state_by_host(player)
console.log(`\nPlayer state for do_look: ${player_state._id}, same as before: ${player_state === player_state_before}`)

for (const item of content) {
  console.log(`\n  Learning about: #${item._id} ${item.get_label()}`)
  const existing = player_state.recognize(item)
  console.log(`    recognize() found: ${existing.length} beliefs: ${existing.map(b => `#${b._id}`).join(', ')}`)
  player_state.learn_about(item)
}

const beliefs_after = [...player_state.get_beliefs()]
console.log(`\n  Beliefs in player mind AFTER do_look (${beliefs_after.length}):`)
for (const b of beliefs_after) {
  const about_tt = Traittype.get_by_label('@about')
  const about = b.get_trait(player_state, about_tt)
  console.log(`    #${b._id} ${b.get_label() || '(unlabeled)'} @about=${about?.sid}`)
}

// ============================================================================
// DIAGNOSTIC: Player Subject Inspection
// ============================================================================
console.log('\n' + '='.repeat(80))
console.log('DIAGNOSTIC: Player Subject Inspection')
console.log('='.repeat(80))

const player_belief = [...state.get_beliefs()].find(b => b.get_label() === 'player')
if (player_belief) {
  console.log('\nCalling player.subject.to_inspect_view(state)...\n')
  try {
    const inspect_view = player_belief.subject.to_inspect_view(state)
    console.log(JSON.stringify(inspect_view, null, 2))
  } catch (e) {
    console.log('ERROR:', e.message)
    console.log('Stack:', e.stack)
  }
} else {
  console.log('Player belief not found')
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(80))
console.log('SUMMARY')
console.log('='.repeat(80))
console.log(`Archetypes: ${archetype_labels.length}`)
console.log(`Prototypes: ${shared_beliefs.length}`)
console.log(`  All prototypes locked: ${shared_beliefs.every(b => b.locked) ? '✓' : '✗'}`)
console.log(`World state beliefs: ${state ? [...state.get_beliefs()].length : 0}`)
console.log(`Minds: ${all_minds.length}`)
console.log('\n✓ All checks complete')
