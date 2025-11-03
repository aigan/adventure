import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { stdTypes, Thing } from './helpers.mjs';

const logos = () => DB.get_logos_mind();

describe('Traittype', () => {
  beforeEach(() => {
    DB.reset_registries();
    const traittypes = {
      ...stdTypes,
      location: 'Location',
      mind_states: {
        type: 'State',
        container: Array,
        min: 1
      },
      color: 'string',
      count: 'number',
      active: 'boolean',
      states_array: {
        type: 'State',
        container: Array,
        min: 1
      },
      colors_array: {
        type: 'string',
        container: Array,
        min: 2,
        max: 5
      },
      minds_array: {
        type: 'Mind',
        container: Array,
        min: 1
      },
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
          mind_states: null,
          states_array: null,
          minds_array: null,
        },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      TestObject: {
        bases: ['ObjectPhysical'],
        traits: {
          count: null,
          active: null,
          colors_array: null,
        },
      },
    };

    DB.register(traittypes, archetypes, {});
  });

  describe('Simple types (backward compatibility)', () => {
    it('resolves string type', () => {
      const mind = new Mind(logos(), 'test_mind');
      const state = mind.create_state(1, null);
      const obj = Belief.from_template(state, {
        traits: { '@label': 'test_obj', color: 'blue' },
        bases: ['ObjectPhysical']
      });

      expect(obj._traits.get('color')).to.equal('blue');
    });

    it('resolves number type', () => {
      const mind = new Mind(logos(), 'test_mind');
      const state = mind.create_state(1, null);
      const obj = Belief.from_template(state, {
        traits: { '@label': 'test_obj', count: 42 },
        bases: ['TestObject']
      });

      expect(obj._traits.get('count')).to.equal(42);
    });

    it('resolves boolean type', () => {
      const mind = new Mind(logos(), 'test_mind');
      const state = mind.create_state(1, null);
      const obj = Belief.from_template(state, {
        traits: { '@label': 'test_obj', active: true },
        bases: ['TestObject']
      });

      expect(obj._traits.get('active')).to.equal(true);
    });

    it('resolves State type', () => {
      const mind = new Mind(logos(), 'test_mind');
      const state = mind.create_state(1, null);
      const obj = Belief.from_template(state, {
        traits: { '@label': 'test_obj', mind_states: [state] },
        bases: ['Mental']
      });

      expect(obj._traits.get('mind_states')[0]).to.equal(state);
    });
  });

  describe('Array container', () => {
    it('resolves array of States with valid min constraint', () => {
      const mind = new Mind(logos(), 'test_mind');
      const state1 = mind.create_state(1, null);
      const state2 = mind.create_state(2, null);

      const obj = Belief.from_template(state1, {
        traits: { '@label': 'test_obj', states_array: [state1, state2] },
        bases: ['Mental']
      });

      const states = obj._traits.get('states_array');
      expect(Array.isArray(states)).to.be.true;
      expect(states).to.have.lengthOf(2);
      expect(states[0]).to.equal(state1);
      expect(states[1]).to.equal(state2);
    });

    it('resolves array of strings with valid min/max constraints', () => {
      const mind = new Mind(logos(), 'test_mind');
      const state = mind.create_state(1, null);
      const obj = Belief.from_template(state, {
        traits: { '@label': 'test_obj', colors_array: ['red', 'blue', 'green'] },
        bases: ['TestObject']
      });

      const colors = obj._traits.get('colors_array');
      expect(Array.isArray(colors)).to.be.true;
      expect(colors).to.have.lengthOf(3);
      expect(colors).to.deep.equal(['red', 'blue', 'green']);
    });

    it('throws error when array length is below min constraint', () => {
      const mind = new Mind(logos(), 'test_mind');
      const state = mind.create_state(1, null);

      expect(() => {
        Belief.from_template(state, {
          traits: { '@label': 'test_obj', colors_array: ['red'] },  // min is 2
          bases: ['TestObject']
        });
      }).to.throw(/min is 2/);
    });

    it('throws error when array length is above max constraint', () => {
      const mind = new Mind(logos(), 'test_mind');
      const state = mind.create_state(1, null);

      expect(() => {
        Belief.from_template(state, {
          traits: { '@label': 'test_obj', colors_array: ['red', 'blue', 'green', 'yellow', 'purple', 'orange'] },  // max is 5
          bases: ['TestObject']
        });
      }).to.throw(/max is 5/);
    });

    it('throws error when non-array data is passed to array type', () => {
      const mind = new Mind(logos(), 'test_mind');
      const state = mind.create_state(1, null);

      expect(() => {
        Belief.from_template(state, {
          traits: { '@label': 'test_obj', states_array: state },  // Should be an array
          bases: ['Mental']
        });
      }).to.throw(/Expected array/);
    });

    it('throws error when array contains wrong type', () => {
      const mind = new Mind(logos(), 'test_mind');
      const state = mind.create_state(1, null);

      expect(() => {
        Belief.from_template(state, {
          traits: { '@label': 'test_obj', colors_array: ['red', 42, 'blue'] },  // 42 is not a string
          bases: ['TestObject']
        });
      }).to.throw(/Expected string/);
    });

    it('handles empty array when min constraint allows it', () => {
      DB.reset_registries();
      const traittypes = {
        ...stdTypes,
        tags: {
          type: 'string',
          container: Array,
          min: 0
        }
      };

      const archetypes = {
        Thing,
        Tagged: {
          bases: ['Thing'],
          traits: {
            tags: null
          }
        }
      };

      DB.register(traittypes, archetypes, {});

      const mind = new Mind(logos(), 'test_mind');
      const state = mind.create_state(1, null);
      const obj = Belief.from_template(state, {
        traits: { '@label': 'test_obj', tags: [] },
        bases: ['Tagged']
      });

      const tags = obj._traits.get('tags');
      expect(Array.isArray(tags)).to.be.true;
      expect(tags).to.have.lengthOf(0);
    });

    it('resolves array of Minds from templates', () => {
      // Setup world with beliefs to learn about
      const world_mind = new Mind(logos(), 'world');
      const world_state = world_mind.create_state(1, null);

      const workshop = world_state.add_belief_from_template({
        bases: ['Location'],
        traits: { '@label': 'workshop', color: 'brown' }
      });

      const main_area = world_state.add_belief_from_template({
        bases: ['Location'],
        traits: { '@label': 'main_area', color: 'green' }
      });

      // Create belief with array of Mind templates
      const npc = Belief.from_template(world_state, {
        traits: {
          '@label': 'npc',
          minds_array: [
            { workshop: ['color'] },  // Mind template 1
            { main_area: ['color'] }  // Mind template 2
          ]
        },
        bases: ['Mental']
      });

      world_state.lock();

      const minds = npc._traits.get('minds_array');
      expect(Array.isArray(minds)).to.be.true;
      expect(minds).to.have.lengthOf(2);
      expect(minds[0]).to.be.instanceof(Mind);
      expect(minds[1]).to.be.instanceof(Mind);
      expect(minds[0].parent).to.equal(world_mind);
      expect(minds[1].parent).to.equal(world_mind);

      // Verify each mind has learned the specified traits
      const mind0_states = [...minds[0]._states];
      expect(mind0_states).to.have.lengthOf(1);
      const mind0_beliefs = [...mind0_states[0].get_beliefs()];
      expect(mind0_beliefs).to.have.lengthOf(1);
      expect(mind0_beliefs[0].get_trait(mind0_states[0], 'color')).to.equal('brown');

      const mind1_states = [...minds[1]._states];
      expect(mind1_states).to.have.lengthOf(1);
      const mind1_beliefs = [...mind1_states[0].get_beliefs()];
      expect(mind1_beliefs).to.have.lengthOf(1);
      expect(mind1_beliefs[0].get_trait(mind1_states[0], 'color')).to.equal('green');
    });
  });

  describe('Serialization with arrays', () => {
    it('serializes arrays in toJSON', () => {
      const mind = new Mind(logos(), 'test_mind');
      const state1 = mind.create_state(1, null);
      const state2 = mind.create_state(2, null);

      const obj = Belief.from_template(state1, {
        traits: { '@label': 'test_obj', states_array: [state1, state2] },
        bases: ['Mental']
      });

      const json = obj.toJSON();
      expect(json.traits.states_array).to.be.an('array');
      expect(json.traits.states_array).to.have.lengthOf(2);
    });

    it('serializes arrays in inspect', () => {
      const mind = new Mind(logos(), 'test_mind');
      const state1 = mind.create_state(1, null);
      const state2 = mind.create_state(2, null);

      const obj = Belief.from_template(state1, {
        traits: { '@label': 'test_obj', states_array: [state1, state2] },
        bases: ['Mental']
      });

      const inspected = obj.to_inspect_view(state1);
      expect(inspected.traits.states_array).to.be.an('array');
      expect(inspected.traits.states_array).to.have.lengthOf(2);
      expect(inspected.traits.states_array[0]).to.have.property('_ref', state1._id);
      expect(inspected.traits.states_array[1]).to.have.property('_ref', state2._id);
    });
  });

  describe('Resolver pattern efficiency', () => {
    it('uses pre-built resolver function', () => {
      const mind = new Mind(logos(), 'test_mind');
      const state = mind.create_state(1, null);
      const traittype = Traittype.get_by_label('states_array');

      // Verify resolver function exists and is callable (constructed during initialization)
      expect(traittype.resolve_trait_value_from_template).to.be.a('function');

      const belief = Belief.from_template(state, {
        traits: {'@label': 'test'},
        bases: ['Mental']
      });

      const result = traittype.resolve_trait_value_from_template(belief, [state]);

      expect(result).to.be.an('array');
      expect(result[0]).to.equal(state);
    });

    it('resolver is created during construction', () => {
      const traittype = Traittype.get_by_label('colors_array');

      // Verify properties set during construction
      expect(traittype.data_type).to.equal('string');
      expect(traittype.container).to.equal(Array);
      expect(traittype.constraints).to.deep.equal({ min: 2, max: 5 });
      expect(traittype.resolve_trait_value_from_template).to.be.a('function');
    });
  });
});
