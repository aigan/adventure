/**
 * Test utilities for creating consistent test fixtures
 *
 * See .CONTEXT.md for test patterns and conventions
 * See docs/IMPLEMENTATION.md for implementation architecture
 */

import { Mind, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';

/**
 * Helper to create a mind with initial beliefs and return a state containing them
 * @param {string} label - Mind label
 * @param {Object} beliefs - Belief definitions
 * @param {Mind|null} parent_mind - Parent mind (null for root minds)
 * @returns {State} State containing the beliefs (access mind via state.in_mind)
 */
export function createMindWithBeliefs(label, beliefs = {}, parent_mind = null) {
  const mind = new Mind(parent_mind, label);
  const state = mind.create_state(1);

  for (const [belief_label, def] of Object.entries(beliefs)) {
    state.add_belief({...def, label: belief_label});
  }

  return state;
}

/**
 * Standard archetype setup matching world.mjs
 */
export function setupStandardArchetypes() {
  const traittypes = {
    '@label': 'string',
    '@timestamp': 'number',
    '@about': {
      type: 'Subject',
      mind: 'parent'
    },
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
    Thing: {
      traits: {
        '@label': null,
        '@timestamp': null,
        '@about': null,
      },
    },
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
        '@timestamp': null,
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

  DB.register(archetypes, traittypes);
}

/**
 * Minimal archetype setup (without Mental/Person)
 */
export function setupMinimalArchetypes() {
  const traittypes = {
    '@label': 'string',
    '@timestamp': 'number',
    '@about': {
      type: 'Subject',
      mind: 'parent'
    },
    location: 'Location',
    color: 'string',
  };

  const archetypes = {
    Thing: {
      traits: {
        '@label': null,
        '@timestamp': null,
        '@about': null,
      },
    },
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

  DB.register(archetypes, traittypes);
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

  const subject = DB.get_or_create_subject(sid)
  const beliefs = DB._reflect().belief_by_subject.get(subject)
  if (!beliefs || beliefs.size === 0) return null

  return beliefs.values().next().value ?? null
}
