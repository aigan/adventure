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

// Reset state
DB.reset_registries()

// Import world.mjs which will run setupStandardArchetypes()
console.log('Loading world.mjs...')
const world_module = await import('../public/worker/world.mjs')

console.log('\n✓ World module loaded successfully')
console.log('✓ setupStandardArchetypes() executed')

// Check that session exists
console.log('\nSession:', world_module.session ? '✓ Created' : '✗ Missing')

const state = world_module.session?.state
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
// DIAGNOSTIC: Mind Inheritance
// ============================================================================
console.log('\n' + '='.repeat(80))
console.log('DIAGNOSTIC: Mind Inheritance Analysis')
console.log('='.repeat(80))

const player_belief = [...state.get_beliefs()].find(b => b.get_label() === 'player')
if (player_belief) {
  console.log('\nPlayer belief:')
  console.log(`  Has own 'mind' trait: ${player_belief._traits.has('mind')}`)
  console.log(`  Inherited mind from bases: ${player_belief.get_trait(state, 'mind') !== player_belief._traits.get('mind') && player_belief.get_trait(state, 'mind') !== null}`)

  const player_mind = player_belief._traits.get('mind')
  if (player_mind) {
    console.log(`\nPlayer's OWN mind (Mind#${player_mind._id}):`)
    const player_mind_state = [...player_mind._states][0]
    if (player_mind_state) {
      const beliefs_in_player_mind = [...player_mind_state.get_beliefs()]
      console.log(`  Beliefs count: ${beliefs_in_player_mind.length}`)
      for (const b of beliefs_in_player_mind) {
        const about = b.get_about(player_mind_state)
        const traits_obj = {}
        for (const [k, v] of b._traits) {
          if (k.startsWith('@')) continue
          traits_obj[k] = v?.get_label?.() || v
        }
        console.log(`    - ${about?.get_label() || '(unknown)'}: ${JSON.stringify(traits_obj)}`)
      }
    }
  }

  // Check inherited mind - find Villager belief dynamically
  const villager_belief = [...player_belief._bases].find(b => b.get_label?.() === 'Villager')
  if (villager_belief) {
    console.log(`\nVillager prototype (player's base):`)
    console.log(`  Has 'mind' trait: ${villager_belief._traits.has('mind')}`)

    const villager_mind = villager_belief._traits.get('mind')
    if (villager_mind) {
      console.log(`  Villager's mind (Mind#${villager_mind._id}):`)
      const villager_mind_state = [...villager_mind._states][0]
      if (villager_mind_state) {
        const beliefs_in_villager_mind = [...villager_mind_state.get_beliefs()]
        console.log(`    Beliefs count: ${beliefs_in_villager_mind.length}`)
        for (const b of beliefs_in_villager_mind) {
          const about = b.get_about(villager_mind_state)
          const traits_obj = {}
          for (const [k, v] of b._traits) {
            if (k.startsWith('@')) continue
            traits_obj[k] = v?.get_label?.() || v
          }
          console.log(`      - ${about?.get_label() || '(unknown)'}: ${JSON.stringify(traits_obj)}`)
        }
      }
    }
  }

  console.log(`\n⚠️  ISSUE: Player's mind REPLACES Villager's mind`)
  console.log(`    Expected: Player knows workshop location + hammer color (from Villager) + hammer location (own)`)
  console.log(`    Actual:   Player only has beliefs from its own mind template`)
  console.log(`    Missing:  Villager's knowledge (workshop location, hammer color) is lost`)
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
