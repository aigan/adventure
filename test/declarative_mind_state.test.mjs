import { expect } from 'chai';
import { Mind, TemporalMind, State, Belief, Archetype, Traittype, save_mind, load , logos } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { stdTypes, Thing, createStateInNewMind } from './helpers.mjs';


describe('Mind Trait', () => {
  beforeEach(() => {
    DB.reset_registries();
  });

  it('creates mind from declarative template', () => {
    // Setup archetypes and traits
    const archetypes = {
      Thing,
      ObjectPhysical: {
        bases: ['Thing'],
        traits: {
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
      ...stdTypes,
      location: 'Location',
      mind: 'Mind',
    };

    DB.register(traittypes, archetypes, {});

    // Create world beliefs
    const world_mind = new TemporalMind(logos(), 'world');
    const world_state = world_mind.create_state(logos().origin_state, {tt: 1});

    const main_area = world_state.add_belief_from_template({
      traits: {}, label: 'main_area',
      bases: ['Location'],
    });

    const workshop = world_state.add_belief_from_template({
            bases: ['Location'],
      traits: {location: main_area.subject,}, label: 'workshop',
    });

    const player_body = world_state.add_belief_from_template({
            bases: ['Person'],
      traits: {location: workshop.subject,}, label: 'player_body',
    });

    // Create player with mind trait (before locking state)
    const player = Belief.from_template(world_state, {
      bases: [player_body],
      traits: {
        mind: {
          workshop: ['location'],
          player_body: ['location']
        }
      }
    });
    world_state.replace_beliefs(player);

    world_state.lock();

    // Verify mind trait returns Mind instance
    const player_mind = player._traits.get(Traittype.get_by_label('mind'));
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
    expect(workshop_belief._traits.has(Traittype.get_by_label('location'))).to.be.true;

    // Find player belief
    const player_belief = beliefs.find(b => b.get_about(state) === player_body);
    expect(player_belief).to.exist;
    const location_traittype = Traittype.get_by_label('location');
    expect(player_belief._traits.has(location_traittype)).to.be.true;

    // Verify location dereferencing
    const player_location = player_belief.get_trait(state, location_traittype);
    //console.log('player_location', player_location);
    expect(player_location).to.equal(workshop_belief.subject);

    // Verify main_area was also dereferenced from workshop's location
    const main_area_belief = beliefs.find(b => b.get_about(state) === main_area);
    expect(main_area_belief).to.exist;
  });

  it('multiple NPCs learn about same shared beliefs', () => {
    // Setup archetypes
    const archetypes = {
      Thing,
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
      ...stdTypes,
      location: 'Location',
      mind: 'Mind',
      coordinates: 'string',
      size: 'string',
    };

    DB.register(traittypes, archetypes, {});

    // Create shared belief prototypes (templates for Location types)
    const eidos = DB.get_eidos();
    const state_100 = eidos.create_timed_state(100);
    const tavern_proto = state_100.add_belief_from_template({
      bases: ['Location'],
      traits: {
        size: 'large'  // Default size for taverns
      },
      label: 'TavernPrototype'
    });

    const square_proto = state_100.add_belief_from_template({
      bases: ['Location'],
      traits: {
        size: 'huge'  // Default size for squares
      },
      label: 'SquarePrototype'
    });

    // Create world with two NPC bodies
    const world_mind = new TemporalMind(logos(), 'world');
    const world_state = world_mind.create_state(logos().origin_state, {tt: 200});

    // World beliefs inherit from shared prototypes
    const blacksmith_tavern = world_state.add_belief_from_template({
      bases: [tavern_proto],
      traits: {coordinates: '50,30'}, label: 'blacksmith_tavern'  // Specific location
    });

    const town_square = world_state.add_belief_from_template({
      bases: [square_proto],
      traits: {coordinates: '100,100'}, label: 'town_square'  // Specific location
    });

    const npc1_body = world_state.add_belief_from_template({
      traits: {}, label: 'npc1_body',
      bases: ['Person']
    });

    const npc2_body = world_state.add_belief_from_template({
      traits: {}, label: 'npc2_body',
      bases: ['Person']
    });

    // NPC1 learns about world entities (not prototypes)
    const npc1 = Belief.from_template(world_state, {
      bases: [npc1_body],
      traits: {
        mind: {
          blacksmith_tavern: ['coordinates'],
          town_square: ['size']
        }
      },
      label: 'npc1'
    });
    world_state.replace_beliefs(npc1);

    // NPC2 learns about same world entities (different trait selections)
    const npc2 = Belief.from_template(world_state, {
      bases: [npc2_body],
      traits: {
        mind: {
          blacksmith_tavern: ['coordinates', 'size'],
          town_square: ['coordinates']
        }
      },
      label: 'npc2'
    });
    world_state.replace_beliefs(npc2);

    world_state.lock();

    // Get both minds and their states
    const npc1_mind = npc1._traits.get(Traittype.get_by_label('mind'));
    const npc1_state = [...npc1_mind._states][0];

    const npc2_mind = npc2._traits.get(Traittype.get_by_label('mind'));
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
    const coordinates_traittype = Traittype.get_by_label('coordinates');
    const size_traittype = Traittype.get_by_label('size');
    expect(npc1_tavern._traits.has(coordinates_traittype)).to.be.true;
    expect(npc1_tavern.get_trait(npc1_state, coordinates_traittype)).to.equal('50,30');
    expect(npc1_tavern._traits.has(size_traittype)).to.be.false;  // Not requested

    expect(npc1_square._traits.has(size_traittype)).to.be.true;
    expect(npc1_square.get_trait(npc1_state, size_traittype)).to.equal('huge');  // Inherited from prototype
    expect(npc1_square._traits.has(coordinates_traittype)).to.be.false;  // Not requested

    // NPC2 requested blacksmith_tavern:['coordinates', 'size'] and town_square:['coordinates']
    expect(npc2_tavern._traits.has(coordinates_traittype)).to.be.true;
    expect(npc2_tavern._traits.has(size_traittype)).to.be.true;
    expect(npc2_tavern.get_trait(npc2_state, coordinates_traittype)).to.equal('50,30');
    expect(npc2_tavern.get_trait(npc2_state, size_traittype)).to.equal('large');  // Inherited from prototype

    expect(npc2_square._traits.has(coordinates_traittype)).to.be.true;
    expect(npc2_square.get_trait(npc2_state, coordinates_traittype)).to.equal('100,100');
    expect(npc2_square._traits.has(size_traittype)).to.be.false;  // Not requested

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
      Thing,
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
      ...stdTypes,
      location: 'Location',
      mind: 'Mind',
      coordinates: 'string',
      size: 'string',
      owner: 'string',
    };

    DB.register(traittypes, archetypes, {});

    // Create shared prototype
    const eidos = DB.get_eidos();
    const state_100 = eidos.create_timed_state(100);
    const tavern_proto = state_100.add_belief_from_template({
      bases: ['Location'],
      traits: {
        size: 'large'
      },
      label: 'TavernPrototype'
    });

    // Create world entity
    const world_mind = new TemporalMind(logos(), 'world');
    const world_state = world_mind.create_state(logos().origin_state, {tt: 200});

    const blacksmith_tavern = world_state.add_belief_from_template({
            bases: [tavern_proto],
      traits: {coordinates: '50,30',
        owner: 'blacksmith_guild'}, label: 'blacksmith_tavern'
    });

    world_state.lock();

    // Create shared cultural knowledge (what villagers know about the tavern)
    // NOTE: Uses CulturalKnowledge archetype (non-spatial), not Location (spatial)
    // It's a template containing only the culturally known traits
    const state_200 = eidos.create_timed_state(200);
    const cultural_knowledge = state_200.add_belief_from_template({
      bases: ['CulturalKnowledge'],
      traits: {
        size: 'large',  // Everyone knows it's large
        owner: 'blacksmith_guild'  // Everyone knows who owns it
        // NOTE: coordinates are NOT in cultural knowledge - must be observed
      },
      label: 'CulturalKnowledge_Tavern'
    });

    // Create NPC1 with initial cultural knowledge (manual setup, not via mind template)
    const npc1_mind = new TemporalMind(world_mind, 'npc1');
    const npc1_state = npc1_mind.create_state(world_state);

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
    const npc2_mind = new TemporalMind(world_mind, 'npc2');
    const npc2_state = npc2_mind.create_state(world_state);

    const npc2_initial_belief = Belief.from_template(npc2_state, {
      bases: [cultural_knowledge],
      traits: {
        '@about': blacksmith_tavern.subject  // Same as NPC1
      }
    });
    npc2_state.insert_beliefs(npc2_initial_belief);
    npc2_state.lock();

    // Verify both NPCs have cultural knowledge
    const size_traittype = Traittype.get_by_label('size');
    const owner_traittype = Traittype.get_by_label('owner');
    const coordinates_traittype = Traittype.get_by_label('coordinates');
    expect(npc1_initial_belief.get_trait(npc1_state, size_traittype)).to.equal('large');
    expect(npc1_initial_belief.get_trait(npc1_state, owner_traittype)).to.equal('blacksmith_guild');
    expect(npc2_initial_belief.get_trait(npc2_state, size_traittype)).to.equal('large');
    expect(npc2_initial_belief.get_trait(npc2_state, owner_traittype)).to.equal('blacksmith_guild');

    // Both inherit from same shared cultural knowledge
    expect(npc1_initial_belief._bases.has(cultural_knowledge)).to.be.true;
    expect(npc2_initial_belief._bases.has(cultural_knowledge)).to.be.true;

    // NOW: NPC1 visits the tavern and observes the coordinates (new information)
    const npc1_state_after = npc1_state.branch_state(world_state);
    const npc1_updated_belief = npc1_state_after.learn_about(blacksmith_tavern, {traits: ['coordinates']});

    // Verify learn_about returned an updated belief
    expect(npc1_updated_belief).to.exist;
    expect(npc1_updated_belief).to.be.instanceOf(Belief);
    expect(npc1_updated_belief).to.not.equal(npc1_initial_belief);  // New version

    npc1_state_after.lock();

    // Verify it has BOTH cultural knowledge AND newly observed trait
    expect(npc1_updated_belief.get_trait(npc1_state_after, coordinates_traittype)).to.equal('50,30');  // NEW: observed
    expect(npc1_updated_belief.get_trait(npc1_state_after, size_traittype)).to.equal('large');  // OLD: from culture
    expect(npc1_updated_belief.get_trait(npc1_state_after, owner_traittype)).to.equal('blacksmith_guild');  // OLD: from culture

    // Verify belief chain: updated → initial → cultural_knowledge
    expect(npc1_updated_belief._bases.has(npc1_initial_belief)).to.be.true;
    expect(npc1_initial_belief._bases.has(cultural_knowledge)).to.be.true;

    // Verify NPC2 still has only cultural knowledge (didn't visit)
    expect(npc2_initial_belief.get_trait(npc2_state, coordinates_traittype)).to.be.null;  // Hasn't learned this yet
    expect(npc2_initial_belief.get_trait(npc2_state, size_traittype)).to.equal('large');  // Still has cultural knowledge
  });

  it('empty trait array learns nothing', () => {
    const archetypes = {
      Thing,
      ObjectPhysical: {
        bases: ['Thing'],
        traits: { location: null },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: { mind: null },
      },
    };

    const traittypes = {
      ...stdTypes,
      location: 'Location',
      mind: 'Mind',
    };

    DB.register(traittypes, archetypes, {});

    const world_mind = new TemporalMind(logos(), 'world');
    const world_state = world_mind.create_state(logos().origin_state, {tt: 1});

    const location1 = world_state.add_belief_from_template({ bases: ['Location'], traits: {}, label: 'location1' });

    const entity_body = world_state.add_belief_from_template({
      bases: ['Mental'],
      traits: {}, label: 'entity_body'
    });

    const entity = Belief.from_template(world_state, {
      bases: [entity_body],
      traits: {
        mind: {
          location1: []  // Empty array = learn nothing
        }
      },
      label: 'entity'
    });
    world_state.replace_beliefs(entity);

    world_state.lock();

    const entity_mind = entity._traits.get(Traittype.get_by_label('mind'));
    expect(entity_mind).to.be.instanceOf(Mind);

    const states = [...entity_mind._states];
    const state = states[0];
    const beliefs = [...state.get_beliefs()];

    // Should have no beliefs (empty array means learn nothing)
    expect(beliefs).to.have.lengthOf(0);
  });

  it('throws error for non-existent belief', () => {
    const archetypes = {
      Thing,
      Mental: {
        traits: { mind: null },
      },
    };

    const traittypes = {
      ...stdTypes,
      mind: 'Mind',
    };

    DB.register(traittypes, archetypes, {});

    const world_state = createStateInNewMind('world');

    const entity_body = world_state.add_belief_from_template({
      traits: {}, label: 'entity_body',
      bases: ['Mental']
    });

    world_state.lock();

    expect(() => {
      Belief.from_template(world_state, {
        traits: {
          mind: {
            non_existent: ['some_trait']
          }
        },
        label: 'entity',
        bases: [entity_body]
      });
    }).to.throw("Cannot learn about 'non_existent': belief not found");
  });
});
