/**
 * Test utilities for creating consistent test fixtures
 *
 * See .CONTEXT.md for test patterns and conventions
 * See docs/IMPLEMENTATION.md for implementation architecture
 */

import { Mind, State, Belief, Archetype, Traittype, save_mind, load, logos } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';

/**
 * Helper to create a state in a new test mind
 * @param {string} label - Mind label (defaults to 'test')
 * @param {number} tt - Transaction time (defaults to 1)
 * @param {Mind|null} parent_mind - Parent mind (defaults to logos)
 * @returns {State} State (access mind via state.in_mind)
 */
export function createStateInNewMind(label = 'test', tt = 1, parent_mind = logos()) {
  const mind = new Mind(parent_mind, label);
  const ground_state = parent_mind ? parent_mind.origin_state : null;
  return mind.create_state(tt, ground_state);
}

/**
 * Helper to create a mind with initial beliefs and return a state containing them
 * @param {string} label - Mind label
 * @param {Object} beliefs - Belief definitions
 * @param {Mind|null} parent_mind - Parent mind (defaults to logos)
 * @returns {State} State containing the beliefs (access mind via state.in_mind)
 */
export function createMindWithBeliefs(label, beliefs = {}, parent_mind = logos()) {
  const mind = new Mind(parent_mind, label);
  const ground_state = parent_mind ? parent_mind.origin_state : null;
  const state = mind.create_state(1, ground_state);

  for (const [belief_label, def] of Object.entries(beliefs)) {
    const existing_traits = 'traits' in def ? def.traits : {};
    state.add_belief_from_template({...def, traits: {...existing_traits, '@label': belief_label}});
  }

  return state;
}

/**
 * Standard trait types used in most tests
 * Spread this into your test's traittype definition
 *
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
  '@tt': 'number',
  '@about': {
    type: 'Subject',
    mind: 'parent'
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
    '@tt': null,
    '@about': null,
  },
}

/**
 * Standard archetype setup matching world.mjs
 */
export function setupStandardArchetypes() {
  const traittypes = {
    ...stdTypes,
    location: 'Location',
    mind: 'Mind',
    color: 'string',
    // Semantic test traits
    damage: 'number',
    weight: 'number',
    durability: 'number',
    sharpness: 'number',
    bonus: 'number',
    value: 'number',
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
    Mental: {
      traits: {
        mind: null,
      },
    },
    Temporal: {
      traits: {
        '@tt': null,
      },
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
 * Get first belief by label - FOR TESTING ONLY
 *
 * WARNING: This function is non-deterministic and only works reliably when called
 * immediately after creating a belief with a label. It returns an arbitrary belief
 * from the set of beliefs with the given label. Do not use in production code.
 *
 * Use state.get_belief_by_label(label) instead for deterministic lookups within
 * a specific state context.
 *
 * @param {string} label
 * @returns {Belief|null}
 */
export function get_first_belief_by_label(label) {
  const sid = DB._reflect().sid_by_label.get(label)
  if (sid === undefined) return null

  const subject = DB.get_or_create_subject(null, sid)  // Tests use global subjects
  const beliefs = DB._reflect().belief_by_subject.get(subject)
  if (!beliefs || beliefs.size === 0) return null

  return beliefs.values().next().value ?? null
}
