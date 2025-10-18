import * as DB from '../public/worker/db.mjs';

/**
 * Helper to create a mind with initial beliefs and return a state containing them
 * @param {string} label - Mind label
 * @param {Object} beliefs - Belief definitions
 * @returns {DB.State} State containing the beliefs (access mind via state.in_mind)
 */
export function createMindWithBeliefs(label, beliefs = {}) {
  const mind = new DB.Mind(label);
  const state = mind.create_state(1);

  for (const [belief_label, def] of Object.entries(beliefs)) {
    const belief = mind.add({...def, label: belief_label});
    state.insert.push(belief);
  }

  return state;
}

/**
 * Standard archetype setup matching world.mjs
 */
export function setupStandardArchetypes() {
  const traittypes = {
    location: 'Location',
    mind_states: {
      type: 'State',
      container: Array,
      min: 1
    },
    color: 'string',
  };

  const archetypes = {
    ObjectPhysical: {
      traits: {
        location: null,
        color: null,
      },
    },
    Mental: {
      traits: {
        mind_states: null,
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
  };

  DB.register(archetypes, traittypes);
}

/**
 * Minimal archetype setup (without Mental/Person)
 */
export function setupMinimalArchetypes() {
  const traittypes = {
    location: 'Location',
    color: 'string',
  };

  const archetypes = {
    ObjectPhysical: {
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
