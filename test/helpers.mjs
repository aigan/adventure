/**
 * Test utilities for creating consistent test fixtures
 *
 * See CLAUDE.md for test patterns and conventions
 * See docs/IMPLEMENTATION.md for implementation architecture
 */

import { Mind, Materia, State, Belief, Archetype, Traittype, Subject, save_mind, load, logos, logos_state } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { sysdesig } from '../public/worker/debug.mjs';

// Browser API mocks for Node.js test environment

/**
 * Mock BroadcastChannel for tests
 */
export class MockBroadcastChannel {
  constructor(name) {
    this.name = name
    this.onmessage = null
    this.messages = []
  }
  postMessage(data) {
    this.messages.push(data)
  }
  close() {}
}

/**
 * Create mock indexedDB for tests
 * @returns {object} Mock indexedDB object
 */
export function createMockIndexedDB() {
  let counter = 0
  return {
    open: () => {
      const request = {
        onupgradeneeded: null,
        onsuccess: null,
        result: null
      }
      setTimeout(() => {
        const mockDB = {
          createObjectStore: () => {},
          transaction: () => ({
            objectStore: () => ({
              get: () => {
                const getRequest = {
                  onsuccess: null,
                  result: counter
                }
                setTimeout(() => {
                  if (getRequest.onsuccess) getRequest.onsuccess()
                }, 0)
                return getRequest
              },
              put: (value) => {
                counter = value
              }
            })
          })
        }
        request.result = mockDB
        if (request.onsuccess) request.onsuccess({ target: request })
      }, 0)
      return request
    }
  }
}

/**
 * Setup browser API mocks (BroadcastChannel, indexedDB)
 * Call in before() hook for tests that need channel/session functionality
 */
export function setupBrowserMocks() {
  global.BroadcastChannel = MockBroadcastChannel
  global.indexedDB = createMockIndexedDB()
}

/**
 * Cleanup browser API mocks
 * Call in after() hook
 */
export function cleanupBrowserMocks() {
  delete global.BroadcastChannel
  delete global.indexedDB
}

/**
 * Helper to create a state in a new test mind
 * @param {string} label - Mind label (defaults to 'test')
 * @param {number} tt - Transaction time (defaults to 1)
 * @param {Mind|null} parent_mind - Parent mind (defaults to logos)
 * @returns {State} State (access mind via state.in_mind)
 */
export function createStateInNewMind(label = 'test', tt = 1, parent_mind = logos()) {
  const mind = new Materia(parent_mind, label);
  const ground_state = parent_mind === logos() ? logos_state() : parent_mind.origin_state;
  return mind.create_state(ground_state, {tt});
}

/**
 * Helper to create a mind with initial beliefs and return a state containing them
 * @param {string} label - Mind label
 * @param {Object} beliefs - Belief definitions
 * @param {Mind|null} parent_mind - Parent mind (defaults to logos)
 * @returns {State} State containing the beliefs (access mind via state.in_mind)
 */
export function createMindWithBeliefs(label, beliefs = {}, parent_mind = logos()) {
  const mind = new Materia(parent_mind, label);
  const ground_state = parent_mind === logos() ? logos_state() : parent_mind.origin_state;
  const state = mind.create_state(ground_state, {tt: 1});

  for (const [belief_label, def] of Object.entries(beliefs)) {
    state.add_belief_from_template({...def, label: belief_label});
  }

  return state;
}

/**
 * Standard trait types used in most tests
 * Spread this into your test's traittype definition
 * @example
 * import { stdTypes, Thing } from './helpers.mjs';
 *
 * const traittypes = {
 *   ...stdTypes,
 *   location: 'Location',
 *   color: 'string',
 * };
 *
 * const archetypes = {
 *   Thing,
 *   ObjectPhysical: {
 *     bases: ['Thing'],
 *     traits: { location: null, color: null }
 *   }
 * };
 *
 * DB.register(traittypes, archetypes, {});
 */
export const stdTypes = {
  '@about': {
    type: 'Subject',
    mind: 'parent',
    exposure: 'internal'
  },
}

/**
 * Thing archetype definition (base for all entities)
 * Spread this into your test's archetype definition
 *
 * See stdTypes for usage example
 */
export const Thing = {
  traits: {
    '@about': null,
  },
}

/**
 * Standard archetype setup matching world.mjs
 */
export function setupStandardArchetypes() {
  const traittypes = {
    ...stdTypes,
    location: {
      type: 'Location',
      exposure: 'spatial'
    },
    mind: {
      type: 'Mind',
      exposure: 'internal'
    },
    color: {
      type: 'string',
      exposure: 'visual'
    },
    // Add enum trait for validation tests
    '@form': {
      type: 'string',
      values: ['solid', 'liquid', 'vapor'],
      exposure: 'visual'
    },
    // Semantic test traits
    damage: 'number',
    weight: 'number',
    durability: 'number',
    sharpness: 'number',
    bonus: 'number',
    value: 'number',
    // Array validation test traits
    colors: { type: 'string', container: Array },
    tags: { type: 'string', container: Array, min: 2, max: 5 },
  };

  const archetypes = {
    Thing,
    ObjectPhysical: {
      bases: ['Thing'],
      traits: {
        location: null,
        color: null,
        '@form': null,
      },
    },
    Mental: {
      traits: {
        mind: null,
      },
    },
    Temporal: {
      traits: {},
    },
    Location: {
      bases: ['ObjectPhysical'],
    },
    PortableObject: {
      bases: ['ObjectPhysical'],
    },
    Actor: {
      bases: ['ObjectPhysical'],
    },
    Person: {
      bases: ['Actor', 'Mental'],
    },
    // Semantic archetypes for testing shared beliefs
    MeleeWeapon: {
      bases: ['ObjectPhysical'],
      traits: {
        damage: null,
        sharpness: null,
        weight: null,
      },
    },
    Tool: {
      bases: ['ObjectPhysical'],
      traits: {
        durability: null,
        weight: null,
      },
    },
    Item: {
      bases: ['ObjectPhysical'],
      traits: {
        value: null,
      },
    },
    // Test archetype with array traits for validation testing
    TestEntity: {
      bases: ['Thing'],
      traits: {
        colors: null,    // Array of strings
        tags: null,      // Array with constraints
        weight: null,    // Number for validation tests
      },
    },
    Effect: {
      bases: ['Thing'],  // Non-physical, just temporal
      traits: {
        bonus: null,
      },
    },
  };

  DB.register(traittypes, archetypes, {});
}

/**
 * Minimal archetype setup (without Mental/Person)
 */
export function setupMinimalArchetypes() {
  const traittypes = {
    ...stdTypes,
    location: 'Location',
    color: 'string',
  };

  const archetypes = {
    Thing,
    ObjectPhysical: {
      bases: ['Thing'],
      traits: {
        location: null,
        color: null,
      },
    },
    Location: {
      bases: ['ObjectPhysical'],
    },
    PortableObject: {
      bases: ['ObjectPhysical'],
    },
  };

  DB.register(traittypes, archetypes, {});
}

/**
 * Debugging helper: Show what knowledge beliefs were created by perceive()
 * @param {State} state - Player state containing the perception
 * @param {Belief} perception - Perception belief to inspect
 * @returns {string} Formatted output showing perception contents
 */
export function inspect_perception(state, perception) {
  const content_tt = Traittype.get_by_label('content')
  const about_tt = Traittype.get_by_label('@about')
  const content = perception.get_trait(state, content_tt)

  if (!content || content.length === 0) {
    return 'Perception is empty'
  }

  const lines = [`Perception #${perception._id} contains ${content.length} knowledge belief(s):`]

  for (let i = 0; i < content.length; i++) {
    const knowledge = state.get_belief_by_subject(content[i])
    const about = knowledge.get_trait(state, about_tt)
    const archetypes = [...knowledge.get_archetypes()].map(a => a.label)

    lines.push(`  ${i + 1}. ${knowledge.label || 'unlabeled'}#${knowledge._id} (@about: ${about ? about.sid : 'null'})`)
    lines.push(`     archetypes: [${archetypes.join(', ')}]`)

    // Show all traits
    for (const [tt, value] of knowledge._traits.entries()) {
      const tt_label = tt.label || '(unlabeled trait)'
      let display
      if (value === null) {
        display = 'null'
      } else if (value === undefined) {
        display = 'undefined'
      } else if (Array.isArray(value)) {
        display = `[${value.length} items]`
      } else {
        display = sysdesig(state, value)
      }
      lines.push(`     ${tt_label}: ${display}`)
    }
  }

  return lines.join('\n')
}

/**
 * Debugging helper: Show full trait resolution path (own → derived → bases)
 * @param {State} state - State context for resolution
 * @param {Belief} belief - Belief to trace trait on
 * @param {string} traittype_label - Label of trait to trace
 * @returns {string} Formatted output showing resolution path
 */
export function trace_trait(state, belief, traittype_label) {
  const tt = Traittype.get_by_label(traittype_label)
  if (!tt) return `Traittype '${traittype_label}' not found`

  const lines = [`Tracing '${traittype_label}' on ${belief.label || 'unlabeled'}#${belief._id}:`]

  // Check own traits
  if (belief._traits.has(tt)) {
    const value = belief._traits.get(tt)
    lines.push(`  ✓ Own traits: ${sysdesig(state, value)}`)
    lines.push(`    → RESOLVED: ${sysdesig(state, value)}`)
    return lines.join('\n')
  } else {
    lines.push(`  ✗ Own traits: (not set)`)
  }

  // Check derived/composable traits
  // Note: This is simplified - full implementation would need to check composable logic

  // Check bases (recursively)
  if (belief.bases && belief.bases.length > 0) {
    for (const base of belief.bases) {
      const base_label = base.is_archetype ? `archetype ${base.label}` : `${base.label || 'unlabeled'}#${base._id}`

      if (base.is_archetype) {
        // Check archetype default value
        if (base.traits && base.traits[traittype_label] !== undefined) {
          const archetype_value = base.traits[traittype_label]
          lines.push(`  Base ${base_label}:`)
          lines.push(`    ✓ Archetype default: ${sysdesig(state, archetype_value)}`)
          lines.push(`    → RESOLVED: ${sysdesig(state, archetype_value)}`)
          return lines.join('\n')
        }
      } else {
        // Check belief base
        const base_value = base.get_trait(state, tt)
        if (base_value !== null) {
          lines.push(`  Base ${base_label}:`)
          lines.push(`    ✓ Inherited: ${sysdesig(state, base_value)}`)
          lines.push(`    → RESOLVED: ${sysdesig(state, base_value)}`)
          return lines.join('\n')
        }
      }
    }
  }

  lines.push(`  → NOT FOUND (returns null)`)
  return lines.join('\n')
}

/**
 * Debugging helper: Show why recognize() found or didn't find knowledge
 * @param {State} state - Player state to search in
 * @param {Belief} world_entity - World entity to search for
 * @returns {string} Formatted output showing recognition results
 */
export function explain_recognize(state, world_entity) {
  const about_tt = Traittype.get_by_label('@about')
  const candidates = []

  for (const belief of state.get_beliefs()) {
    const about = belief.get_trait(state, about_tt)
    if (about && about.sid === world_entity.subject.sid) {
      candidates.push(belief)
    }
  }

  const lines = [
    `Searching for knowledge about ${world_entity.label || 'unlabeled'}#${world_entity._id} (sid: ${world_entity.subject.sid}) in ${state.in_mind.label}_state:`,
    `  Candidates with @about = ${world_entity.subject.sid}:`
  ]

  if (candidates.length === 0) {
    lines.push(`    (none found)`)
  } else {
    for (const c of candidates) {
      lines.push(`    #${c._id} ${c.label || 'unlabeled'} - MATCHED`)
    }
  }

  lines.push(`  Result: ${candidates.length} knowledge belief(s) found`)
  return lines.join('\n')
}

/**
 * Debugging helper: Show all registered archetypes and traittypes
 * Useful for understanding what's available in the registry
 */
export function dump_registry() {
  const reflection = DB._reflect()

  console.log('=== ARCHETYPES ===')
  for (const [label, archetype] of reflection.archetype_by_label.entries()) {
    console.log(label)
    const base_labels = archetype.bases ? archetype.bases.map(b => b.label) : []
    console.log(`  bases: [${base_labels.join(', ')}]`)
    console.log(`  traits:`, archetype.traits || {})
  }

  console.log('\n=== TRAITTYPES ===')
  for (const [label, tt] of reflection.traittype_by_label.entries()) {
    console.log(label)
    console.log(`  type: ${tt.type}`)
    if (tt.container) console.log(`  container: ${tt.container.name}`)
    if (tt.composable !== undefined) console.log(`  composable: ${tt.composable}`)
    if (tt.exposure) console.log(`  exposure: ${tt.exposure}`)
  }
}

/**
 * Get world entity that a player knowledge belief is about
 * @param {State} player_state - Player's state containing knowledge
 * @param {Subject} knowledge_subject - Subject of player's knowledge belief
 * @returns {Subject|null} World entity subject, or null if not found
 */
export function get_knowledge_about(player_state, knowledge_subject) {
  const knowledge = player_state.get_belief_by_subject(knowledge_subject)
  if (!knowledge) return null

  const about_tt = Traittype.get_by_label('@about')
  if (!about_tt) return null

  return knowledge.get_trait(player_state, about_tt)
}
