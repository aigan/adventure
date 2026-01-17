/**
 * Schema definitions: traittypes and archetypes
 *
 * Extracted from world.mjs to allow lazy loading of scenarios
 * while keeping schema registration centralized.
 *
 * NO module-level side effects - call register_schema() explicitly.
 */

import * as DB from "./db.mjs"
import { Archetype } from "./archetype.mjs"

/**
 * @typedef {import('./db.mjs').ArchetypeDefinition} ArchetypeDefinition
 * @typedef {import('./db.mjs').TraitTypeSchema} TraitTypeSchema
 */

/** @type {Record<string, string|TraitTypeSchema>} */
export const traittypes = {
  '@about': {
    type: 'Subject',  // Could be simplified to type Thing
    mind: 'parent',  // Resolve in parent mind's ground state
    exposure: 'internal'  // Not directly observable
  },
  '@uncertain_identity': {
    type: 'boolean',
    exposure: 'internal'  // Not directly observable
  },
  '@form': {
    type: 'string',
    values: ['solid', 'liquid', 'vapor', 'olfactory', 'auditory', 'intangible']
  },
  location: {
    type: 'Location',
    exposure: 'spatial'  // Observable through spatial awareness
  },
  mind: {
    type: 'Mind',
    composable: true,  // Compose minds from multiple bases
    exposure: 'internal'  // Not physically observable
  },
  content: {
    type: 'Thing',
    container: Array,
  },
  color: {
    type: 'string',
    exposure: 'visual'  // Observable by looking
  },
  material: {
    type: 'string',
    exposure: 'visual'
  },
  length: {
    type: 'string',
    values: ['short', 'medium', 'long'],
    exposure: 'visual'
  },
  head: {
    type: 'HammerHead',
    exposure: 'visual'
  },
  handle: {
    type: 'HammerHandle',
    exposure: 'visual'
  },
  name: 'string',
  tools: {
    type: 'string',
    container: Array,
  },
  direction: {
    type: 'string',
    values: ['north', 'east', 'south', 'west'],
    exposure: 'visual'
  },
}

/** @type {Record<string, ArchetypeDefinition>} */
export const archetypes = {
  Thing: {
    traits: {
      '@about': null,
      '@uncertain_identity': null,
    },
  },

  EventAwareness: {
    bases: ['Thing'],
    traits: {
      content: null,
    },
  },

  EventPerception: {
    bases: ['EventAwareness'],
    traits: {
      content: null,  // Inherited from EventAwareness
    },
  },

  ObjectPhysical: {
    bases: ['Thing'],
    traits: {
      '@form': 'solid',  // Common case: tangible visible objects
      location: null,
      material: null,
      length: null,
      color: null,
    },
  },


  PortableObject: {
    bases: ['ObjectPhysical'],
  },

  Compass: {
    bases: ['PortableObject'],
    traits: { direction: null }
  },

  HammerHead: {
    bases: ['ObjectPhysical'],
    traits: { material: null, color: null }
  },
  HammerHandle: {
    bases: ['ObjectPhysical'],
    traits: { material: null, color: null, length: null }
  },
  Hammer: {
    bases: ['PortableObject'],
    traits: { head: 'HammerHead', handle: 'HammerHandle' }
  },


  Mental: {
    bases: ['Thing'],
    traits: {
      mind: null,
      // No @form - intangible mental states
    },
  },
  Location: {
    bases: ['ObjectPhysical'],
    traits: {location: null, tools: null}
  },
  Person: {
    bases: ['ObjectPhysical', 'Mental'],
  },
}

/** @type {Record<string, {bases: string[], traits?: Object}>} */
export const prototypes_1 = {
}

/** @type {boolean} */
let _registered = false

/**
 * Register schemas with DB (idempotent)
 * Call this before using archetypes/traittypes in world setup
 */
export function register_schema() {
  if (_registered && Archetype.get_by_label('Thing')) {
    return
  }
  DB.register(traittypes, archetypes, prototypes_1)
  _registered = true
}

/**
 * Reset registration flag (for tests that call reset_registries)
 */
export function reset_schema_registration() {
  _registered = false
}
