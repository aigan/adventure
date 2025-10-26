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
    const world_mind = new Mind('world');
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
    const states = [...player_mind.state];
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
    const player_location = player_belief.get_trait('location');
    //console.log('player_location', player_location);
    expect(player_location).to.equal(workshop_belief.subject);

    // Verify main_area was also dereferenced from workshop's location
    const main_area_belief = beliefs.find(b => b.get_about(state) === main_area);
    expect(main_area_belief).to.exist;
  });

  // TODO: Prototype support can be added later with '@base' syntax
  // See docs/plans/mind-self-refactor-phase2.md for details

  it.skip('applies prototype template', () => {
    const archetypes = {
      ObjectPhysical: {
        traits: { '@about': null, location: null },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: { mind_states: null },
      },
    };

    const traittypes = {
      '@about': {
        type: 'Subject',
        mind: 'parent'
      },
      location: 'Location',
      mind_states: {
        type: 'State',
        container: Array,
        min: 1
      },
    };

    DB.register(archetypes, traittypes);

    const world_mind = new Mind('world');
    const world_state = world_mind.create_state(1);

    const base_location = world_state.add_belief({ label: 'base_location', bases: ['Location'] });
    const location1 = world_state.add_belief({
      label: 'location1',
      bases: ['Location'],
      traits: { location: base_location }
    });
    const location2 = world_state.add_belief({
      label: 'location2',
      bases: ['Location'],
      traits: { location: base_location }
    });

    // Define prototype
    DB.state_by_label.test_prototype = {
      learn: {
        location1: ['location']
      }
    };

    const entity = world_state.add_belief({
      label: 'entity',
      bases: ['Mental'],
      traits: {
        mind: {
          // TODO: Add prototype support - base: 'test_prototype'
        }
      }
    });

    const entity_mind = entity._traits.get('mind');
    const states = [...entity_mind.state];
    const state = states[0];
    const beliefs = [...state.get_beliefs()];

    // Should have learned about location1 from prototype
    const loc1_belief = beliefs.find(b => b.get_about(state) === location1);
    expect(loc1_belief).to.exist;
    expect(loc1_belief._traits.has('location')).to.be.true;
  });

  it.skip('merges prototype and custom learning', () => {
    const archetypes = {
      ObjectPhysical: {
        traits: { '@about': null, location: null },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: { mind_states: null },
      },
    };

    const traittypes = {
      '@about': {
        type: 'Subject',
        mind: 'parent'
      },
      location: 'Location',
      mind_states: {
        type: 'State',
        container: Array,
        min: 1
      },
    };

    DB.register(archetypes, traittypes);

    const world_mind = new Mind('world');
    const world_state = world_mind.create_state(1);

    const base_location = world_state.add_belief({ label: 'base_location', bases: ['Location'] });
    const location1 = world_state.add_belief({
      label: 'location1',
      bases: ['Location'],
      traits: { location: base_location }
    });
    const location2 = world_state.add_belief({
      label: 'location2',
      bases: ['Location'],
      traits: { location: base_location }
    });

    // Prototype learns location1
    DB.state_by_label.test_prototype = {
      learn: {
        location1: ['location']
      }
    };

    // Custom adds location2
    const entity = world_state.add_belief({
      label: 'entity',
      bases: ['Mental'],
      traits: {
        mind: {
          // TODO: Add prototype support - base: 'test_prototype'
          location2: ['location']
        }
      }
    });

    const entity_mind = entity._traits.get('mind');
    const states = [...entity_mind.state];
    const state = states[0];
    const beliefs = [...state.get_beliefs()];

    // Should have both from prototype and custom (plus dereferenced base_location)
    expect(beliefs.length).to.be.at.least(2);

    const loc1_belief = beliefs.find(b => b.get_about(state) === location1);
    expect(loc1_belief).to.exist;

    const loc2_belief = beliefs.find(b => b.get_about(state) === location2);
    expect(loc2_belief).to.exist;

    // Verify base_location was dereferenced
    const base_belief = beliefs.find(b => b.get_about(state) === base_location);
    expect(base_belief).to.exist;
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

    const world_mind = new Mind('world');
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

    const states = [...entity_mind.state];
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

    const world_mind = new Mind('world');
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
