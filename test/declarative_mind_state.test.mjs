import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';

describe('Mind Trait', () => {
  beforeEach(() => {
    DB.reset_registries();
  });

  it('creates mind from declarative template', () => {
    // Setup archetypes and traits
    const archetypes = {
      ObjectPhysical: {
        traits: {
          '@about': null,
          location: null,
        },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      Actor: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: {
          mind: null,
        },
      },
      Person: {
        bases: ['Actor', 'Mental'],
      },
    };

    const traittypes = {
      '@about': {
        type: 'Subject',
        mind: 'parent'
      },
      location: 'Location',
      mind: 'Mind',
    };

    DB.register(archetypes, traittypes);

    // Create world beliefs
    const world_mind = new Mind(null, 'world');
    const world_state = world_mind.create_state(1);

    const main_area = world_state.add_belief({
      label: 'main_area',
      bases: ['Location'],
    });

    const workshop = world_state.add_belief({
      label: 'workshop',
      bases: ['Location'],
      traits: {
        location: main_area.subject,
      },
    });

    const player_body = world_state.add_belief({
      label: 'player_body',
      bases: ['Person'],
      traits: {
        location: workshop.subject,
      },
    });

    world_state.lock();

    // Create player with mind trait
    const player = Belief.from_template(world_state, {
      bases: [player_body],
      traits: {
        mind: {
          workshop: ['location'],
          player_body: ['location']
        }
      }
    });

    // Verify mind trait returns Mind instance
    const player_mind = player._traits.get('mind');
    expect(player_mind).to.be.instanceOf(Mind);
    expect(player_mind.label).to.be.null;

    // Verify mind has exactly one state
    const states = [...player_mind._states];
    expect(states).to.have.lengthOf(1);

    const state = states[0];
    expect(state).to.be.instanceOf(State);
    expect(state.locked).to.be.true;
    expect(state.ground_state).to.equal(world_state);
    expect(state.self).to.equal(player.subject);

    // Verify beliefs (includes dereferenced beliefs)
    const beliefs = [...state.get_beliefs()];
    expect(beliefs.length).to.be.at.least(2);

    // Find workshop belief
    const workshop_belief = beliefs.find(b => b.get_about(state) === workshop);
    expect(workshop_belief).to.exist;
    expect(workshop_belief._traits.has('location')).to.be.true;

    // Find player belief
    const player_belief = beliefs.find(b => b.get_about(state) === player_body);
    expect(player_belief).to.exist;
    expect(player_belief._traits.has('location')).to.be.true;

    // Verify location dereferencing
    const player_location = player_belief.get_trait(state, 'location');
    //console.log('player_location', player_location);
    expect(player_location).to.equal(workshop_belief.subject);

    // Verify main_area was also dereferenced from workshop's location
    const main_area_belief = beliefs.find(b => b.get_about(state) === main_area);
    expect(main_area_belief).to.exist;
  });

  it('multiple NPCs learn about same shared beliefs', () => {
    // Setup archetypes
    const archetypes = {
      Thing: {
        traits: {
          '@label': null,
          '@timestamp': null,
          '@about': null,  // All beliefs can be "about" something
        },
      },
      ObjectPhysical: {
        bases: ['Thing'],
        traits: {
          location: null,
        },
      },
      Location: {
        bases: ['ObjectPhysical'],
        traits: {
          coordinates: null,
          size: null,
        },
      },
      Actor: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: {
          mind: null,
        },
      },
      Person: {
        bases: ['Actor', 'Mental'],
      },
    };

    const traittypes = {
      '@about': {
        type: 'Subject',
        mind: 'parent'
      },
      '@label': 'string',
      '@timestamp': 'number',
      location: 'Location',
      mind: 'Mind',
      coordinates: 'string',
      size: 'string',
    };

    DB.register(archetypes, traittypes);

    // Create shared belief prototypes (templates for Location types)
    const tavern_proto = Belief.create_shared_from_template(null, ['Location'], {
      '@timestamp': 100,
      '@label': 'TavernPrototype',
      size: 'large'  // Default size for taverns
    });

    const square_proto = Belief.create_shared_from_template(null, ['Location'], {
      '@timestamp': 100,
      '@label': 'SquarePrototype',
      size: 'huge'  // Default size for squares
    });

    // Create world with two NPC bodies
    const world_mind = new Mind(null, 'world');
    const world_state = world_mind.create_state(200);

    // World beliefs inherit from shared prototypes
    const blacksmith_tavern = world_state.add_belief({
      label: 'blacksmith_tavern',
      bases: [tavern_proto],
      traits: {
        coordinates: '50,30'  // Specific location
      }
    });

    const town_square = world_state.add_belief({
      label: 'town_square',
      bases: [square_proto],
      traits: {
        coordinates: '100,100'  // Specific location
      }
    });

    const npc1_body = world_state.add_belief({
      label: 'npc1_body',
      bases: ['Person']
    });

    const npc2_body = world_state.add_belief({
      label: 'npc2_body',
      bases: ['Person']
    });

    world_state.lock();

    // NPC1 learns about world entities (not prototypes)
    const npc1 = Belief.from_template(world_state, {
      bases: [npc1_body],
      traits: {
        '@label': 'npc1',
        mind: {
          blacksmith_tavern: ['coordinates'],
          town_square: ['size']
        }
      }
    });

    // NPC2 learns about same world entities (different trait selections)
    const npc2 = Belief.from_template(world_state, {
      bases: [npc2_body],
      traits: {
        '@label': 'npc2',
        mind: {
          blacksmith_tavern: ['coordinates', 'size'],
          town_square: ['coordinates']
        }
      }
    });

    // Get both minds and their states
    const npc1_mind = npc1._traits.get('mind');
    const npc1_state = [...npc1_mind._states][0];

    const npc2_mind = npc2._traits.get('mind');
    const npc2_state = [...npc2_mind._states][0];

    // Find beliefs in NPC1's mind (about world entities)
    const npc1_beliefs = [...npc1_state.get_beliefs()];
    const npc1_tavern = npc1_beliefs.find(b => b.get_about(npc1_state) === blacksmith_tavern);
    const npc1_square = npc1_beliefs.find(b => b.get_about(npc1_state) === town_square);

    // Find beliefs in NPC2's mind (about same world entities)
    const npc2_beliefs = [...npc2_state.get_beliefs()];
    const npc2_tavern = npc2_beliefs.find(b => b.get_about(npc2_state) === blacksmith_tavern);
    const npc2_square = npc2_beliefs.find(b => b.get_about(npc2_state) === town_square);

    // Verify both NPCs have beliefs about the same world entities
    expect(npc1_tavern).to.exist;
    expect(npc1_square).to.exist;
    expect(npc2_tavern).to.exist;
    expect(npc2_square).to.exist;

    // Verify beliefs are ABOUT the world entities (via @about)
    expect(npc1_tavern.get_about(npc1_state)).to.equal(blacksmith_tavern);
    expect(npc1_square.get_about(npc1_state)).to.equal(town_square);
    expect(npc2_tavern.get_about(npc2_state)).to.equal(blacksmith_tavern);
    expect(npc2_square.get_about(npc2_state)).to.equal(town_square);

    // Verify requested traits were copied from world beliefs
    // NPC1 requested blacksmith_tavern:['coordinates'] and town_square:['size']
    expect(npc1_tavern._traits.has('coordinates')).to.be.true;
    expect(npc1_tavern.get_trait(npc1_state, 'coordinates')).to.equal('50,30');
    expect(npc1_tavern._traits.has('size')).to.be.false;  // Not requested

    expect(npc1_square._traits.has('size')).to.be.true;
    expect(npc1_square.get_trait(npc1_state, 'size')).to.equal('huge');  // Inherited from prototype
    expect(npc1_square._traits.has('coordinates')).to.be.false;  // Not requested

    // NPC2 requested blacksmith_tavern:['coordinates', 'size'] and town_square:['coordinates']
    expect(npc2_tavern._traits.has('coordinates')).to.be.true;
    expect(npc2_tavern._traits.has('size')).to.be.true;
    expect(npc2_tavern.get_trait(npc2_state, 'coordinates')).to.equal('50,30');
    expect(npc2_tavern.get_trait(npc2_state, 'size')).to.equal('large');  // Inherited from prototype

    expect(npc2_square._traits.has('coordinates')).to.be.true;
    expect(npc2_square.get_trait(npc2_state, 'coordinates')).to.equal('100,100');
    expect(npc2_square._traits.has('size')).to.be.false;  // Not requested

    // Both NPCs' beliefs are separate instances
    expect(npc1_tavern).to.not.equal(npc2_tavern);
    expect(npc1_square).to.not.equal(npc2_square);

    // Verify archetypes were copied from world beliefs (which inherit from prototypes)
    const npc1_tavern_archetypes = [...npc1_tavern.get_archetypes()].map(a => a.label);
    expect(npc1_tavern_archetypes).to.include('Location');

    // Verify world beliefs still reference shared prototypes
    expect(blacksmith_tavern._bases.has(tavern_proto)).to.be.true;
    expect(town_square._bases.has(square_proto)).to.be.true;
  });

  it('NPCs learn new traits about entities they already know from cultural knowledge', () => {
    // Setup archetypes
    const archetypes = {
      Thing: {
        traits: {
          '@label': null,
          '@timestamp': null,
          '@about': null,  // All beliefs can be "about" something
        },
      },
      ObjectPhysical: {
        bases: ['Thing'],
        traits: {
          location: null,
        },
      },
      Location: {
        bases: ['ObjectPhysical'],
        traits: {
          coordinates: null,
          size: null,
          owner: null,
        },
      },
      Actor: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: {
          mind: null,
        },
      },
      Person: {
        bases: ['Actor', 'Mental'],
      },
      CulturalKnowledge: {
        bases: ['Thing'],
        traits: {
          size: null,
          owner: null,
          coordinates: null,  // Added so updated beliefs can have observed spatial traits
        },
      },
    };

    const traittypes = {
      '@about': {
        type: 'Subject',
        mind: 'parent'
      },
      '@label': 'string',
      '@timestamp': 'number',
      location: 'Location',
      mind: 'Mind',
      coordinates: 'string',
      size: 'string',
      owner: 'string',
    };

    DB.register(archetypes, traittypes);

    // Create shared prototype
    const tavern_proto = Belief.create_shared_from_template(null, ['Location'], {
      '@timestamp': 100,
      '@label': 'TavernPrototype',
      size: 'large'
    });

    // Create world entity
    const world_mind = new Mind(null, 'world');
    const world_state = world_mind.create_state(200);

    const blacksmith_tavern = world_state.add_belief({
      label: 'blacksmith_tavern',
      bases: [tavern_proto],
      traits: {
        coordinates: '50,30',
        owner: 'blacksmith_guild'
      }
    });

    world_state.lock();

    // Create shared cultural knowledge (what villagers know about the tavern)
    // NOTE: Uses CulturalKnowledge archetype (non-spatial), not Location (spatial)
    // It's a template containing only the culturally known traits
    const cultural_knowledge = Belief.create_shared_from_template(null, ['CulturalKnowledge'], {
      '@timestamp': 200,
      '@label': 'CulturalKnowledge_Tavern',
      size: 'large',  // Everyone knows it's large
      owner: 'blacksmith_guild'  // Everyone knows who owns it
      // NOTE: coordinates are NOT in cultural knowledge - must be observed
    });

    // Create NPC1 with initial cultural knowledge (manual setup, not via mind template)
    const npc1_mind = new Mind(world_mind, 'npc1');
    const npc1_state = npc1_mind.create_state(200, null, world_state, null);

    // NPC1 starts with belief based on cultural knowledge
    // This belief is ABOUT blacksmith_tavern and inherits cultural traits
    const npc1_initial_belief = Belief.from_template(npc1_state, {
      bases: [cultural_knowledge],
      traits: {
        '@about': blacksmith_tavern.subject  // What this belief is about
      }
    });
    npc1_state.insert_beliefs(npc1_initial_belief);
    npc1_state.lock();

    // Create NPC2 with same cultural knowledge
    const npc2_mind = new Mind(world_mind, 'npc2');
    const npc2_state = npc2_mind.create_state(200, null, world_state, null);

    const npc2_initial_belief = Belief.from_template(npc2_state, {
      bases: [cultural_knowledge],
      traits: {
        '@about': blacksmith_tavern.subject  // Same as NPC1
      }
    });
    npc2_state.insert_beliefs(npc2_initial_belief);
    npc2_state.lock();

    // Verify both NPCs have cultural knowledge
    expect(npc1_initial_belief.get_trait(npc1_state, 'size')).to.equal('large');
    expect(npc1_initial_belief.get_trait(npc1_state, 'owner')).to.equal('blacksmith_guild');
    expect(npc2_initial_belief.get_trait(npc2_state, 'size')).to.equal('large');
    expect(npc2_initial_belief.get_trait(npc2_state, 'owner')).to.equal('blacksmith_guild');

    // Both inherit from same shared cultural knowledge
    expect(npc1_initial_belief._bases.has(cultural_knowledge)).to.be.true;
    expect(npc2_initial_belief._bases.has(cultural_knowledge)).to.be.true;

    // NOW: NPC1 visits the tavern and observes the coordinates (new information)
    const npc1_state_after = npc1_state.branch_state(world_state);
    const npc1_updated_belief = npc1_state_after.learn_about(blacksmith_tavern, ['coordinates']);

    // Verify learn_about returned an updated belief
    expect(npc1_updated_belief).to.exist;
    expect(npc1_updated_belief).to.be.instanceOf(Belief);
    expect(npc1_updated_belief).to.not.equal(npc1_initial_belief);  // New version

    npc1_state_after.lock();

    // Verify it has BOTH cultural knowledge AND newly observed trait
    expect(npc1_updated_belief.get_trait(npc1_state_after, 'coordinates')).to.equal('50,30');  // NEW: observed
    expect(npc1_updated_belief.get_trait(npc1_state_after, 'size')).to.equal('large');  // OLD: from culture
    expect(npc1_updated_belief.get_trait(npc1_state_after, 'owner')).to.equal('blacksmith_guild');  // OLD: from culture

    // Verify belief chain: updated → initial → cultural_knowledge
    expect(npc1_updated_belief._bases.has(npc1_initial_belief)).to.be.true;
    expect(npc1_initial_belief._bases.has(cultural_knowledge)).to.be.true;

    // Verify NPC2 still has only cultural knowledge (didn't visit)
    expect(npc2_initial_belief.get_trait(npc2_state, 'coordinates')).to.be.null;  // Hasn't learned this yet
    expect(npc2_initial_belief.get_trait(npc2_state, 'size')).to.equal('large');  // Still has cultural knowledge
  });

  it('empty trait array learns nothing', () => {
    const archetypes = {
      ObjectPhysical: {
        traits: { '@about': null, location: null },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: { mind: null },
      },
    };

    const traittypes = {
      '@about': {
        type: 'Subject',
        mind: 'parent'
      },
      location: 'Location',
      mind: 'Mind',
    };

    DB.register(archetypes, traittypes);

    const world_mind = new Mind(null, 'world');
    const world_state = world_mind.create_state(1);

    const location1 = world_state.add_belief({ label: 'location1', bases: ['Location'] });

    const entity_body = world_state.add_belief({
      label: 'entity_body',
      bases: ['Mental']
    });

    world_state.lock();

    const entity = Belief.from_template(world_state, {
      bases: [entity_body],
      traits: {
        '@label': 'entity',
        mind: {
          location1: []  // Empty array = learn nothing
        }
      }
    });

    const entity_mind = entity._traits.get('mind');
    expect(entity_mind).to.be.instanceOf(Mind);

    const states = [...entity_mind._states];
    const state = states[0];
    const beliefs = [...state.get_beliefs()];

    // Should have no beliefs (empty array means learn nothing)
    expect(beliefs).to.have.lengthOf(0);
  });

  it('throws error for non-existent belief', () => {
    const archetypes = {
      Mental: {
        traits: { mind: null },
      },
    };

    const traittypes = {
      '@about': {
        type: 'Subject',
        mind: 'parent'
      },
      mind: 'Mind',
    };

    DB.register(archetypes, traittypes);

    const world_mind = new Mind(null, 'world');
    const world_state = world_mind.create_state(1);

    const entity_body = world_state.add_belief({
      label: 'entity_body',
      bases: ['Mental']
    });

    world_state.lock();

    expect(() => {
      Belief.from_template(world_state, {
        traits: {
          '@label': 'entity',
          mind: {
            non_existent: ['some_trait']
          }
        },
        bases: [entity_body]
      });
    }).to.throw("Cannot learn about 'non_existent': belief not found");
  });
});
