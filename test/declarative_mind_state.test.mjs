import { expect } from 'chai';
import * as DB from '../public/worker/db.mjs';

describe('Declarative Mind State Construction', () => {
  beforeEach(() => {
    DB.reset_registries();
  });

  it('creates mind state from declarative template', () => {
    // Setup archetypes and traits
    const archetypes = {
      ObjectPhysical: {
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
          mind_states: null,
        },
      },
      Player: {
        bases: ['Actor', 'Mental'],
      },
    };

    const traittypes = {
      location: 'Location',
      mind_states: {
        type: 'State',
        container: Array,
        min: 1
      },
    };

    DB.register(archetypes, traittypes);

    // Create world beliefs
    const world_mind = new DB.Mind('world');
    const world_state = world_mind.create_state(1);

    const main_area = world_mind.add({
      label: 'main_area',
      bases: ['Location'],
    });

    const workshop = world_mind.add({
      label: 'workshop',
      bases: ['Location'],
      traits: {
        location: main_area,
      },
    });

    const player_body = world_mind.add({
      label: 'player_body',
      bases: ['Player'],
      traits: {
        location: workshop,
      },
    });

    world_state.insert.push(main_area, workshop, player_body);

    // Define state prototype
    DB.State.by_label.player_mind = {
      learn: {
        workshop: ['location']
      }
    };

    // Create player with declarative mind_states
    const player = player_body.with_traits({
      mind_states: {
        _type: 'State',
        base: 'player_mind',
        learn: {
          player_body: ['location']
        },
        ground_state: world_state
      }
    });

    // Verify mind_states trait
    const mind_states = player.traits.get('mind_states');
    expect(mind_states).to.be.an('array');
    expect(mind_states).to.have.lengthOf(1);

    const state = mind_states[0];
    expect(state).to.be.instanceOf(DB.State);
    expect(state.locked).to.be.true;
    expect(state.ground_state).to.equal(world_state);

    // Verify mind is unlabeled
    expect(state.in_mind.label).to.be.null;

    // Verify beliefs (includes dereferenced beliefs)
    const beliefs = [...state.get_beliefs()];
    expect(beliefs.length).to.be.at.least(2);

    // Find workshop belief
    const workshop_belief = beliefs.find(b => b.about === workshop);
    expect(workshop_belief).to.exist;
    expect(workshop_belief.traits.has('location')).to.be.true;

    // Find player belief
    const player_belief = beliefs.find(b => b.about === player_body);
    expect(player_belief).to.exist;
    expect(player_belief.traits.has('location')).to.be.true;

    // Verify location dereferencing
    const player_location = player_belief.traits.get('location');
    expect(player_location).to.equal(workshop_belief);

    // Verify main_area was also dereferenced from workshop's location
    const main_area_belief = beliefs.find(b => b.about === main_area);
    expect(main_area_belief).to.exist;
  });

  it('applies prototype template', () => {
    const archetypes = {
      ObjectPhysical: {
        traits: { location: null },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: { mind_states: null },
      },
    };

    const traittypes = {
      location: 'Location',
      mind_states: {
        type: 'State',
        container: Array,
        min: 1
      },
    };

    DB.register(archetypes, traittypes);

    const world_mind = new DB.Mind('world');
    const world_state = world_mind.create_state(1);

    const base_location = world_mind.add({ label: 'base_location', bases: ['Location'] });
    const location1 = world_mind.add({
      label: 'location1',
      bases: ['Location'],
      traits: { location: base_location }
    });
    const location2 = world_mind.add({
      label: 'location2',
      bases: ['Location'],
      traits: { location: base_location }
    });
    world_state.insert.push(base_location, location1, location2);

    // Define prototype
    DB.State.by_label.test_prototype = {
      learn: {
        location1: ['location']
      }
    };

    const entity = world_mind.add({
      label: 'entity',
      bases: ['Mental'],
      traits: {
        mind_states: {
          _type: 'State',
          base: 'test_prototype',
          ground_state: world_state
        }
      }
    });

    const mind_states = entity.traits.get('mind_states');
    const state = mind_states[0];
    const beliefs = [...state.get_beliefs()];

    // Should have learned about location1 from prototype
    const loc1_belief = beliefs.find(b => b.about === location1);
    expect(loc1_belief).to.exist;
    expect(loc1_belief.traits.has('location')).to.be.true;
  });

  it('merges prototype and custom learning', () => {
    const archetypes = {
      ObjectPhysical: {
        traits: { location: null },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: { mind_states: null },
      },
    };

    const traittypes = {
      location: 'Location',
      mind_states: {
        type: 'State',
        container: Array,
        min: 1
      },
    };

    DB.register(archetypes, traittypes);

    const world_mind = new DB.Mind('world');
    const world_state = world_mind.create_state(1);

    const base_location = world_mind.add({ label: 'base_location', bases: ['Location'] });
    const location1 = world_mind.add({
      label: 'location1',
      bases: ['Location'],
      traits: { location: base_location }
    });
    const location2 = world_mind.add({
      label: 'location2',
      bases: ['Location'],
      traits: { location: base_location }
    });
    world_state.insert.push(base_location, location1, location2);

    // Prototype learns location1
    DB.State.by_label.test_prototype = {
      learn: {
        location1: ['location']
      }
    };

    // Custom adds location2
    const entity = world_mind.add({
      label: 'entity',
      bases: ['Mental'],
      traits: {
        mind_states: {
          _type: 'State',
          base: 'test_prototype',
          learn: {
            location2: ['location']
          },
          ground_state: world_state
        }
      }
    });

    const mind_states = entity.traits.get('mind_states');
    const state = mind_states[0];
    const beliefs = [...state.get_beliefs()];

    // Should have both from prototype and custom (plus dereferenced base_location)
    expect(beliefs.length).to.be.at.least(2);

    const loc1_belief = beliefs.find(b => b.about === location1);
    expect(loc1_belief).to.exist;

    const loc2_belief = beliefs.find(b => b.about === location2);
    expect(loc2_belief).to.exist;

    // Verify base_location was dereferenced
    const base_belief = beliefs.find(b => b.about === base_location);
    expect(base_belief).to.exist;
  });

  it('empty trait array learns nothing', () => {
    const archetypes = {
      ObjectPhysical: {
        traits: { location: null },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: { mind_states: null },
      },
    };

    const traittypes = {
      location: 'Location',
      mind_states: {
        type: 'State',
        container: Array,
        min: 1
      },
    };

    DB.register(archetypes, traittypes);

    const world_mind = new DB.Mind('world');
    const world_state = world_mind.create_state(1);

    const location1 = world_mind.add({ label: 'location1', bases: ['Location'] });
    world_state.insert.push(location1);

    const entity = world_mind.add({
      label: 'entity',
      bases: ['Mental'],
      traits: {
        mind_states: {
          _type: 'State',
          learn: {
            location1: []  // Empty array = learn nothing
          },
          ground_state: world_state
        }
      }
    });

    const mind_states = entity.traits.get('mind_states');
    const state = mind_states[0];
    const beliefs = [...state.get_beliefs()];

    // Should have no beliefs (empty array means learn nothing)
    expect(beliefs).to.have.lengthOf(0);
  });

  it('throws error for non-existent belief', () => {
    const archetypes = {
      Mental: {
        traits: { mind_states: null },
      },
    };

    const traittypes = {
      mind_states: {
        type: 'State',
        container: Array,
        min: 1
      },
    };

    DB.register(archetypes, traittypes);

    const world_mind = new DB.Mind('world');
    const world_state = world_mind.create_state(1);

    expect(() => {
      world_mind.add({
        label: 'entity',
        bases: ['Mental'],
        traits: {
          mind_states: {
            _type: 'State',
            learn: {
              non_existent: ['some_trait']
            },
            ground_state: world_state
          }
        }
      });
    }).to.throw("Cannot learn about 'non_existent': belief not found");
  });
});
