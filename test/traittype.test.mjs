import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';

describe('Traittype', () => {
  beforeEach(() => {
    DB.reset_registries();
    const traittypes = {
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
      }
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
          states_array: null,
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

    DB.register(archetypes, traittypes);
  });

  describe('Simple types (backward compatibility)', () => {
    it('resolves string type', () => {
      const mind = new Mind('test_mind');
      const obj = new Belief(mind, {
        label: 'test_obj',
        bases: ['ObjectPhysical'],
        traits: { color: 'blue' }
      });

      expect(obj.traits.get('color')).to.equal('blue');
    });

    it('resolves number type', () => {
      const mind = new Mind('test_mind');
      const obj = new Belief(mind, {
        label: 'test_obj',
        bases: ['TestObject'],
        traits: { count: 42 }
      });

      expect(obj.traits.get('count')).to.equal(42);
    });

    it('resolves boolean type', () => {
      const mind = new Mind('test_mind');
      const obj = new Belief(mind, {
        label: 'test_obj',
        bases: ['TestObject'],
        traits: { active: true }
      });

      expect(obj.traits.get('active')).to.equal(true);
    });

    it('resolves State type', () => {
      const mind = new Mind('test_mind');
      const state = mind.create_state(1);
      const obj = new Belief(mind, {
        label: 'test_obj',
        bases: ['Mental'],
        traits: { mind_states: [state] }
      });

      expect(obj.traits.get('mind_states')[0]).to.equal(state);
    });
  });

  describe('Array container', () => {
    it('resolves array of States with valid min constraint', () => {
      const mind = new Mind('test_mind');
      const state1 = mind.create_state(1);
      const state2 = mind.create_state(2);

      const obj = new Belief(mind, {
        label: 'test_obj',
        bases: ['Mental'],
        traits: { states_array: [state1, state2] }
      });

      const states = obj.traits.get('states_array');
      expect(Array.isArray(states)).to.be.true;
      expect(states).to.have.lengthOf(2);
      expect(states[0]).to.equal(state1);
      expect(states[1]).to.equal(state2);
    });

    it('resolves array of strings with valid min/max constraints', () => {
      const mind = new Mind('test_mind');
      const obj = new Belief(mind, {
        label: 'test_obj',
        bases: ['TestObject'],
        traits: { colors_array: ['red', 'blue', 'green'] }
      });

      const colors = obj.traits.get('colors_array');
      expect(Array.isArray(colors)).to.be.true;
      expect(colors).to.have.lengthOf(3);
      expect(colors).to.deep.equal(['red', 'blue', 'green']);
    });

    it('throws error when array length is below min constraint', () => {
      const mind = new Mind('test_mind');

      expect(() => {
        new Belief(mind, {
          label: 'test_obj',
          bases: ['TestObject'],
          traits: { colors_array: ['red'] }  // min is 2
        });
      }).to.throw(/min is 2/);
    });

    it('throws error when array length is above max constraint', () => {
      const mind = new Mind('test_mind');

      expect(() => {
        new Belief(mind, {
          label: 'test_obj',
          bases: ['TestObject'],
          traits: { colors_array: ['red', 'blue', 'green', 'yellow', 'purple', 'orange'] }  // max is 5
        });
      }).to.throw(/max is 5/);
    });

    it('throws error when non-array data is passed to array type', () => {
      const mind = new Mind('test_mind');
      const state = mind.create_state(1);

      expect(() => {
        new Belief(mind, {
          label: 'test_obj',
          bases: ['Mental'],
          traits: { states_array: state }  // Should be an array
        });
      }).to.throw(/Expected array/);
    });

    it('throws error when array contains wrong type', () => {
      const mind = new Mind('test_mind');

      expect(() => {
        new Belief(mind, {
          label: 'test_obj',
          bases: ['TestObject'],
          traits: { colors_array: ['red', 42, 'blue'] }  // 42 is not a string
        });
      }).to.throw(/Expected string/);
    });

    it('handles empty array when min constraint allows it', () => {
      DB.reset_registries();
      const traittypes = {
        tags: {
          type: 'string',
          container: Array,
          min: 0
        }
      };

      const archetypes = {
        Tagged: {
          traits: {
            tags: null
          }
        }
      };

      DB.register(archetypes, traittypes);

      const mind = new Mind('test_mind');
      const obj = new Belief(mind, {
        label: 'test_obj',
        bases: ['Tagged'],
        traits: { tags: [] }
      });

      const tags = obj.traits.get('tags');
      expect(Array.isArray(tags)).to.be.true;
      expect(tags).to.have.lengthOf(0);
    });
  });

  describe('Serialization with arrays', () => {
    it('serializes arrays in toJSON', () => {
      const mind = new Mind('test_mind');
      const state1 = mind.create_state(1);
      const state2 = mind.create_state(2);

      const obj = new Belief(mind, {
        label: 'test_obj',
        bases: ['Mental'],
        traits: { states_array: [state1, state2] }
      });

      const json = obj.toJSON();
      expect(json.traits.states_array).to.be.an('array');
      expect(json.traits.states_array).to.have.lengthOf(2);
    });

    it('serializes arrays in inspect', () => {
      const mind = new Mind('test_mind');
      const state1 = mind.create_state(1);
      const state2 = mind.create_state(2);

      const obj = new Belief(mind, {
        label: 'test_obj',
        bases: ['Mental'],
        traits: { states_array: [state1, state2] }
      });

      const inspected = obj.inspect(state1);
      expect(inspected.traits.states_array).to.be.an('array');
      expect(inspected.traits.states_array).to.have.lengthOf(2);
      expect(inspected.traits.states_array[0]).to.have.property('_ref', state1._id);
      expect(inspected.traits.states_array[1]).to.have.property('_ref', state2._id);
    });
  });

  describe('Resolver pattern efficiency', () => {
    it('uses pre-built resolver function', () => {
      const mind = new Mind('test_mind');
      const traittype = DB.traittype_by_label['states_array'];

      // Verify resolver function exists and is callable
      expect(traittype._resolver).to.be.a('function');

      const state1 = mind.create_state(1);
      const result = traittype.resolve(mind, [state1]);

      expect(result).to.be.an('array');
      expect(result[0]).to.equal(state1);
    });

    it('resolver is created during construction', () => {
      const traittype = DB.traittype_by_label['colors_array'];

      // Verify properties set during construction
      expect(traittype.data_type).to.equal('string');
      expect(traittype.container).to.equal(Array);
      expect(traittype.constraints).to.deep.equal({ min: 2, max: 5 });
      expect(traittype._resolver).to.be.a('function');
    });
  });
});
