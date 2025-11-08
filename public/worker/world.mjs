/**
 * Game world setup: archetypes, traittypes, and initial state
 *
 * See docs/SPECIFICATION.md for data model design
 * See .CONTEXT.md for worker implementation details
 * See docs/ALPHA-1.md for development stages
 */

import * as Cosmos from "./cosmos.mjs"
import * as DB from "./db.mjs"
import { Session } from "./session.mjs"
import { Subject } from "./subject.mjs"
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
    mind: 'parent'  // Resolve in parent mind's ground state
  },
  '@tt': 'number',
  location: 'Location',
  mind: 'Mind',  // Singular Mind reference
  color: 'string',
  name: 'string',
  inventory: 'PortableObject',
};

/** @type {Record<string, ArchetypeDefinition>} */
const archetypes = {
  Thing: {
    traits: {
      '@about': null,
      '@tt': null,
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
    bases: ['Thing'],
    traits: {
      mind: null,
    },
  },
  Location: {
    bases: ['ObjectPhysical'],
  },
  PortableObject: {
    bases: ['ObjectPhysical'],
  },
}

/** @type {Record<string, {bases: string[], traits?: Object}>} */
const prototypes_1 = {
  Person: {
    bases: ['ObjectPhysical', 'Mental'],
  },
}

DB.register(traittypes, archetypes, prototypes_1)

// Create world mind and initial state
const world_mind = new Cosmos.Mind(Cosmos.logos(), 'world');
const state = world_mind.create_state(Cosmos.logos_state(), {tt: 1});


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

  hammer: {
    bases: ['PortableObject'],
    traits: {
      location: 'workshop',
      color: 'blue',
    },
  }
})


state.add_shared_from_template({
  Villager: {
    bases: ['Person'],
    traits: {
      mind: {
        workshop: ['location'],
        hammer: ['color'],
      }
    },
  },
});

state.add_beliefs_from_template({
  player: {
    bases: ['Villager'],
    traits: {
      location: 'workshop',
      mind: {
        hammer: ['location']
      }
    },
  }
})





const player = state.get_belief_by_label('player');
if (!player) throw new Error('Player belief not found');

log({player});
for (const [name, value] of player.get_traits()) {
  log(`  ${name}:`, sysdesig(state, value));
}



//const player_mind = player.get_trait(state, 'mind');
//let player_state = [...player_mind.states_at_tt(1)][0];
//player_state.lock()

//player_state = player_state.branch_state(state);
//player_state.learn_about(state.get_belief_by_label('hammer'), ['location']);



state.lock();
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


// Create game session
export const session = new Session(world_mind, state, player);

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
