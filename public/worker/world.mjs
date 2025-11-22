/**
 * Game world setup: archetypes, traittypes, and initial state
 *
 * See docs/SPECIFICATION.md for data model design
 * See .CONTEXT.md for worker implementation details
 * See docs/ALPHA-1.md for development stages
 */

// @ts-nocheck

import * as Cosmos from "./cosmos.mjs"
import * as DB from "./db.mjs"
import { Subject } from "./subject.mjs"
import { Traittype } from "./traittype.mjs"
import { log, assert, sysdesig } from "./debug.mjs"
import { eidos } from './eidos.mjs'

//import {observation,observation_text} from "./observation.mjs";
//import Time from "./time.mjs";
//import * as Ponder from "./ponder.mjs";

/**
 * @typedef {import('./db.mjs').ArchetypeDefinition} ArchetypeDefinition
 * @typedef {import('./db.mjs').TraitTypeSchema} TraitTypeSchema
 */


/** @type {Record<string, string|TraitTypeSchema>} */
const traittypes = {
  '@about': {
    type: 'Subject',
    mind: 'parent',  // Resolve in parent mind's ground state
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
  color: {
    type: 'string',
    exposure: 'visual'  // Observable by looking
  },
  name: 'string',
  inventory: {
    type: 'PortableObject',
    container: Array,
    composable: true  // Compose inventories from multiple bases
  },
  tools: {type: 'string', container: Array},
};

/** @type {Record<string, ArchetypeDefinition>} */
const archetypes = {
  Thing: {
    traits: {
      '@about': null,
    },
  },

  ObjectPhysical: {
    bases: ['Thing'],
    traits: {
      '@form': 'solid',  // Common case: tangible visible objects
      location: null,
      color: null,
    },
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
  PortableObject: {
    bases: ['ObjectPhysical'],
  },
  Person: {
    bases: ['ObjectPhysical', 'Mental'],
    traits: {
      inventory: null,
    },
  },
}

/** @type {Record<string, {bases: string[], traits?: Object}>} */
const prototypes_1 = {
}

DB.register(traittypes, archetypes, prototypes_1)

// Create world mind and initial state
const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world');
let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1});


state.add_beliefs_from_template({
  village: {
    bases: ['Location'],
  },

  workshop: {
    bases: ['Location'],
    traits: {
      location: 'village',
    },
  },

  tavern: {
    bases: ['Location'],
    traits: {location: 'village'}
  },

  hammer: {
    bases: ['PortableObject'],
    traits: {
      location: 'workshop',
      color: 'blue',
    },
  }
})


// Create shared items for prototype inventories
state.add_shared_from_template({
  apprentice_token: {
    bases: ['PortableObject'],
    traits: {color: 'bronze'},
  },
  basic_tools: {
    bases: ['PortableObject'],
    traits: {color: 'gray'},
  },
  guild_badge: {
    bases: ['PortableObject'],
    traits: {color: 'gold'},
  },
})

// Create person prototypes with minds and inventories
state.add_shared_from_template({
  Villager: {
    bases: ['Person'],
    traits: {
      mind: {
        workshop: ['location']
        //tavern: ['location'],
      },
      //inventory: ['apprentice_token', 'basic_tools'],
    },
  },
})

state.add_shared_from_template({
  Blacksmith: {
    bases: ['Person'],
    traits: {
      mind: {
        workshop: ['location', 'tools']
      },
      inventory: ['guild_badge'],
    },
  },
});

//const eidos_state = eidos().origin_state

state.add_beliefs_from_template({
  // Player with multi-base: should compose mind AND inventory from both Villager and Blacksmith
  player: {
    bases: ['Person'],
    traits: {
      mind: {
        hammer: ['color'],
      },
      location: 'workshop',
    },
  }
})

state.lock();
state = state.branch_state(Cosmos.logos_state(), 2)

const player = state.get_belief_by_label('player');
assert(player, 'player belief not found')
const player_state = state.get_active_state_by_host(player)
const hammer = state.get_belief_by_label('hammer')
assert(hammer, 'hammer belief not found')
player_state.learn_about(hammer)


//log('player state', player_state)

//for (const [name, value] of player.get_traits()) {
//  // Use get_trait() for composable traits to show composed value
//  const traittype = Traittype.get_by_label(name)
//  const final_value = traittype?.composable ? player.get_trait(state, name) : value
//  log(`  ${name}:`, sysdesig(state, final_value));
//}


//const player_mind = player.get_trait(state, 'mind');
//let player_state = [...player_mind.states_at_tt(1)][0];
//player_state.lock()

//player_state = player_state.branch_state(state);

state.lock();
//log('state', state._id);
//log("player", player)
//log('inspect', player.to_inspect_view(state));



//log(player_state);

//const ball = state.add_belief_from_template({
//  label: 'ball',
//  bases: ['PortableObject'],
//  traits: {
//    location: 'workshop',
//  },
//});
//
//state.lock();
//state = state.branch_state(DB.get_logos_state(), 2);
//
//state = state.tick_with_traits(ball, 3, {
//  color: 'blue',
//});


// Export world state and player for Session loading
export const world_state = state;
export const player_body = player;

// log(Adventure);


//function inspect( obj ){
//  const e = obj.versions ? obj.versions.slice(-1)[0] : obj;
//  log('👁️', world.sysdesig(obj), e.bake());
//}



  //market: {
  //  bases: ['Location'],
  //},
  //
  //tavern: {
  //  bases: ['Location'],
  //},
  //
  //forge: {
  //  bases: ['Location'],
  //},



  //Blacksmith: {
  //  bases: ['Mental'],
  //  traits: {
  //    mind: {
  //      forge: ['location'],
  //      tools: ['inventory']
  //    }
  //  },
  //},
  //
  //// Demonstrates trait composition from multiple archetypes
  //blacksmith_villager: {
  //  bases: ['Person', 'Villager', 'Blacksmith'],
  //  traits: {
  //    location: 'forge',
  //  },
  //},


  //tools: {
  //  bases: ['PortableObject'],
  //  traits: {
  //    location: 'forge',
  //  },
  //},
  //
  //mayor: {
  //  bases: ['Person'],
  //  traits: {
  //    location: 'tavern',
  //  },
  //},

  //npc1: {
  //  bases: ['Villager'],
  //  traits: {
  //    mind: {
  //      workshop: ['location']
  //    }
  //  },
  //},
