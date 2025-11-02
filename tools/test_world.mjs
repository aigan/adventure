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
  console.log(`\n  ${mind.label} (id: ${mind._id}, parent: ${mind.parent?._id ?? 'null'})`)

  // Show states for this mind
  const states = [...mind._states]
  console.log(`    - States: ${states.length}`)
  for (const state of states) {
    console.log(`      State ${state._id}: tt=${state.tt}, vt=${state.vt}, locked=${state.locked}`)
  }

  // Show child minds
  if (mind._child_minds.size > 0) {
    console.log(`    - Child minds: ${[...mind._child_minds].map(m => m._id).join(', ')}`)
  }
}

// Detailed inspection of player
console.log('\n=== PLAYER ANALYSIS ===')
const player = state.get_belief_by_label('player')
if (player) {
  console.log('\nPlayer belief:')
  console.log(`  _id: ${player._id}`)
  console.log(`  in_mind: ${player.in_mind?.label} (${player.in_mind?._id})`)
  console.log(`  bases: ${[...player._bases].map(b => b.label || b.get_label?.() || `Belief(${b._id})`).join(', ')}`)
  console.log(`  archetypes: ${[...player.get_archetypes()].map(a => a.label).join(', ')}`)

  console.log('\n  Direct traits (_traits):')
  for (const [key, value] of player._traits) {
    if (key === 'mind') {
      console.log(`    ${key}: Mind(id=${value._id}, label=${value.label}, states=${value._states.size}, children=${value._child_minds.size})`)
    } else {
      console.log(`    ${key}: ${value}`)
    }
  }
}

// Check mayor's traits
console.log('\n=== MAYOR ANALYSIS ===')
const mayor = state.get_belief_by_label('mayor')
if (mayor) {
  console.log('\nMayor belief:')
  console.log(`  _id: ${mayor._id}`)
  console.log(`  archetypes: ${[...mayor.get_archetypes()].map(a => a.label).join(', ')}`)

  console.log('\n  Direct traits (_traits):')
  for (const [key, value] of mayor._traits) {
    if (key === 'mind') {
      console.log(`    ${key}: Mind(id=${value._id}, label=${value.label})`)
    } else {
      console.log(`    ${key}: ${value}`)
    }
  }

  console.log('\n  Resolved trait values (via get_trait):')
  const trait_names = ['name', 'location']
  for (const trait of trait_names) {
    const value = mayor.get_trait(state, trait)
    console.log(`    ${trait}: ${value} (type: ${typeof value}, ${value?.constructor?.name || 'primitive'})`)
  }
}

// Check the mysterious child mind
console.log('\n=== CHILD MIND ANALYSIS (id: 37) ===')
const child_mind = registries.mind_by_id.get(37)
if (child_mind) {
  console.log(`Label: ${child_mind.label}`)
  console.log(`Parent: ${child_mind.parent?.label} (${child_mind.parent?._id})`)
  console.log(`States: ${child_mind._states.size}`)

  for (const child_state of child_mind._states) {
    console.log(`\n  State ${child_state._id}:`)
    console.log(`    ground_state: ${child_state.ground_state?._id} (in mind: ${child_state.ground_state?.in_mind?.label})`)
    console.log(`    self: ${child_state.self?.get_label?.()} (sid: ${child_state.self?.sid})`)

    const beliefs = child_state.get_beliefs()
    console.log(`    Beliefs in this state: ${beliefs.length}`)
    for (const belief of beliefs) {
      console.log(`      - ${belief.get_label() || 'unlabeled'} (id: ${belief._id}, sid: ${belief.subject.sid})`)
      console.log(`        archetypes: ${[...belief.get_archetypes()].map(a => a.label).join(', ')}`)
      console.log(`        traits: ${[...belief._traits.keys()].join(', ')}`)
    }
  }
}

// What is sid=35?
console.log('\n=== SID 35 LOOKUP ===')
const sid35_subject = registries.subject_by_sid.get(35)
if (sid35_subject) {
  console.log(`Subject sid=35: label=${sid35_subject.get_label()}, ground_mind=${sid35_subject.ground_mind?.label ?? 'null'}`)
  const beliefs_for_sid35 = [...(registries.belief_by_subject.get(sid35_subject) || [])]
  console.log(`Beliefs for this subject: ${beliefs_for_sid35.length}`)
  for (const b of beliefs_for_sid35) {
    console.log(`  - Belief ${b._id} in mind ${b.in_mind?.label ?? 'shared'}, label=${b.get_label()}`)
    console.log(`    archetypes: ${[...b.get_archetypes()].map(a => a.label).join(', ')}`)
    console.log(`    traits: ${[...b._traits.keys()].join(', ') || '(none)'}`)
    // Check if it has a mind trait
    if (b._traits.has('mind')) {
      const mind_val = b._traits.get('mind')
      console.log(`    !! HAS MIND TRAIT: Mind(id=${mind_val._id}, label=${mind_val.label})`)
    }
  }
} else {
  console.log('Subject sid=35 not found in registry')
}

// Check player's mind state (32)
console.log('\n=== PLAYER MIND STATE 32 ===')
const player_mind_state = registries.state_by_id.get(32)
if (player_mind_state) {
  console.log(`State 32: in_mind=${player_mind_state.in_mind.label}, tt=${player_mind_state.tt}`)
  const beliefs_in_state = player_mind_state.get_beliefs()
  console.log(`Beliefs: ${beliefs_in_state.length}`)
  for (const b of beliefs_in_state) {
    console.log(`  - ${b.get_label() || 'unlabeled'} (id: ${b._id}, sid: ${b.subject.sid})`)

    // Check what this sid is in the world state
    const world_subject = registries.subject_by_sid.get(b.subject.sid)
    if (world_subject) {
      const world_label = world_subject.get_label()
      console.log(`    -> sid ${b.subject.sid} in world: label="${world_label}"`)
    }

    if (b._traits.has('@about')) {
      const about_val = b._traits.get('@about')
      console.log(`    @about: Subject(sid=${about_val.sid}, label="${about_val.get_label()}")`)
    }

    if (b._traits.has('mind')) {
      const mind_val = b._traits.get('mind')
      console.log(`    HAS MIND: Mind(id=${mind_val._id}, label=${mind_val.label})`)
    }
  }
}

console.log('\n✓ All checks complete')
