import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load , logos } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { stdTypes, Thing, createStateInNewMind } from './helpers.mjs';


describe('Traittype', () => {
  beforeEach(() => {
    DB.reset_registries();
    const traittypes = {
      ...stdTypes,
      mind: 'Mind',
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
      const state = createStateInNewMind('test_mind');
      const obj = Belief.from_template(state, {
        traits: { color: 'blue' },
        bases: ['ObjectPhysical']
      });

      expect(obj._traits.get(Traittype.get_by_label('color'))).to.equal('blue');
    });

    it('resolves number type', () => {
      const state = createStateInNewMind('test_mind');
      const obj = Belief.from_template(state, {
        traits: { count: 42 },
        bases: ['TestObject']
      });

      expect(obj._traits.get(Traittype.get_by_label('count'))).to.equal(42);
    });

    it('resolves boolean type', () => {
      const state = createStateInNewMind('test_mind');
      const obj = Belief.from_template(state, {
        traits: { active: true },
        bases: ['TestObject']
      });

      expect(obj._traits.get(Traittype.get_by_label('active'))).to.equal(true);
    });

    it('resolves State type', () => {
      const state = createStateInNewMind('test_mind');
      const obj = Belief.from_template(state, {
        traits: { mind_states: [state] },
        bases: ['Mental']
      });

      expect(obj._traits.get(Traittype.get_by_label('mind_states'))[0]).to.equal(state);
    });
  });

  /**
   * MATRIX COVERAGE: Array container
   * ✅ 4.3 Mind Array from Own (line 223)
   * ✅ 5.1 State from Own (line 104, 116)
   *
   * MISSING:
   * ❌ 4.4 Mind Array Composable
   * ❌ 5.2 State from Archetype
   * ❌ 5.3 State Array Composable
   */
  describe('Array container', () => {
    // Matrix 5.1: State from Own
    it('resolves array of States with valid min constraint', () => {
      const state1 = createStateInNewMind('test_mind');
      const state2 = createStateInNewMind('test_mind', 2);

      const obj = Belief.from_template(state1, {
        traits: { states_array: [state1, state2] },
        bases: ['Mental']
      });

      const states = obj._traits.get(Traittype.get_by_label('states_array'));
      expect(Array.isArray(states)).to.be.true;
      expect(states).to.have.lengthOf(2);
      expect(states[0]).to.equal(state1);
      expect(states[1]).to.equal(state2);
    });

    it('resolves array of strings with valid min/max constraints', () => {
      const state = createStateInNewMind('test_mind');
      const obj = Belief.from_template(state, {
        traits: { colors_array: ['red', 'blue', 'green'] },
        bases: ['TestObject']
      });

      const colors = obj._traits.get(Traittype.get_by_label('colors_array'));
      expect(Array.isArray(colors)).to.be.true;
      expect(colors).to.have.lengthOf(3);
      expect(colors).to.deep.equal(['red', 'blue', 'green']);
    });

    it('throws error when array length is below min constraint', () => {
      const state = createStateInNewMind('test_mind');

      expect(() => {
        Belief.from_template(state, {
          traits: { colors_array: ['red'] },  // min is 2
          bases: ['TestObject']
        });
      }).to.throw(/min is 2/);
    });

    it('throws error when array length is above max constraint', () => {
      const state = createStateInNewMind('test_mind');

      expect(() => {
        Belief.from_template(state, {
          traits: { colors_array: ['red', 'blue', 'green', 'yellow', 'purple', 'orange'] },  // max is 5
          bases: ['TestObject']
        });
      }).to.throw(/max is 5/);
    });

    it('throws error when non-array data is passed to array type', () => {
      const state = createStateInNewMind('test_mind');

      expect(() => {
        Belief.from_template(state, {
          traits: { states_array: state },  // Should be an array
          bases: ['Mental']
        });
      }).to.throw(/Expected array/);
    });

    it('throws error when array contains wrong type', () => {
      const state = createStateInNewMind('test_mind');

      expect(() => {
        Belief.from_template(state, {
          traits: { colors_array: ['red', 42, 'blue'] },  // 42 is not a string
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

      const state = createStateInNewMind('test_mind');
      const obj = Belief.from_template(state, {
        traits: { tags: [] },
        bases: ['Tagged']
      });

      const tags = obj._traits.get(Traittype.get_by_label('tags'));
      expect(Array.isArray(tags)).to.be.true;
      expect(tags).to.have.lengthOf(0);
    });

    // Matrix 4.3: Mind Array from Own
    it('resolves array of Minds from templates', () => {
      // Setup world with beliefs to learn about
      const world_mind = new Mind(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1});

      const workshop = world_state.add_belief_from_template({
        bases: ['Location'],
        traits: { color: 'brown' },
        label: 'workshop'
      });

      const main_area = world_state.add_belief_from_template({
        bases: ['Location'],
        traits: { color: 'green' },
        label: 'main_area'
      });

      // Create belief with array of Mind templates
      const npc = Belief.from_template(world_state, {
        traits: {
          minds_array: [
            { workshop: ['color'] },  // Mind template 1
            { main_area: ['color'] }  // Mind template 2
          ]
        },
        bases: ['Mental'],
        label: 'npc'
      });

      world_state.lock();

      const minds = npc._traits.get(Traittype.get_by_label('minds_array'));
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
      const color_traittype = Traittype.get_by_label('color');
      expect(mind0_beliefs[0].get_trait(mind0_states[0], color_traittype)).to.equal('brown');

      const mind1_states = [...minds[1]._states];
      expect(mind1_states).to.have.lengthOf(1);
      const mind1_beliefs = [...mind1_states[0].get_beliefs()];
      expect(mind1_beliefs).to.have.lengthOf(1);
      expect(mind1_beliefs[0].get_trait(mind1_states[0], color_traittype)).to.equal('green');
    });
  });

  describe('Serialization with arrays', () => {
    it('serializes arrays in toJSON', () => {
      const state1 = createStateInNewMind('test_mind');
      const state2 = createStateInNewMind('test_mind', 2);

      const obj = Belief.from_template(state1, {
        traits: { states_array: [state1, state2] },
        bases: ['Mental']
      });

      const json = obj.toJSON();
      expect(json.traits.states_array).to.be.an('array');
      expect(json.traits.states_array).to.have.lengthOf(2);
    });

    it('serializes arrays in inspect', () => {
      const state1 = createStateInNewMind('test_mind');
      const state2 = createStateInNewMind('test_mind', 2);

      const obj = Belief.from_template(state1, {
        traits: { states_array: [state1, state2] },
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
      const state = createStateInNewMind('test_mind');
      const traittype = Traittype.get_by_label('states_array');

      // Verify resolver function exists and is callable (constructed during initialization)
      expect(traittype.resolve_trait_value_from_template).to.be.a('function');

      const belief = Belief.from_template(state, {
        traits: {},
        bases: ['Mental'],
        label: 'test'
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

  describe('Enum validation', () => {
    beforeEach(() => {
      DB.reset_registries();
      const traittypes = {
        ...stdTypes,
        form: {
          type: 'string',
          values: ['solid', 'liquid', 'vapor', 'intangible']
        },
        size: {
          type: 'string',
          values: ['small', 'medium', 'large']
        },
      };

      const archetypes = {
        Thing,
        Physical: {
          bases: ['Thing'],
          traits: {
            form: null,
            size: null,
          },
        },
      };

      DB.register(traittypes, archetypes, {});
    });

    it('accepts valid enum value', () => {
      const state = createStateInNewMind('test_mind');
      const obj = Belief.from_template(state, {
        traits: { form: 'solid' },
        bases: ['Physical']
      });

      expect(obj._traits.get(Traittype.get_by_label('form'))).to.equal('solid');
    });

    it('accepts all valid enum values', () => {
      const state = createStateInNewMind('test_mind');

      for (const value of ['solid', 'liquid', 'vapor', 'intangible']) {
        const obj = Belief.from_template(state, {
          traits: { form: value },
          bases: ['Physical'],
          label: `test_${value}`
        });
        expect(obj._traits.get(Traittype.get_by_label('form'))).to.equal(value);
      }
    });

    it('rejects invalid enum value', () => {
      const state = createStateInNewMind('test_mind');

      expect(() => {
        Belief.from_template(state, {
          traits: { form: 'plasma' },  // Not in enum values
          bases: ['Physical']
        });
      }).to.throw(/Invalid value 'plasma' for trait 'form'/);
    });

    it('enum error message lists allowed values', () => {
      const state = createStateInNewMind('test_mind');

      expect(() => {
        Belief.from_template(state, {
          traits: { form: 'invalid' },
          bases: ['Physical']
        });
      }).to.throw(/Must be one of: solid, liquid, vapor, intangible/);
    });

    it('stores values property on traittype', () => {
      const traittype = Traittype.get_by_label('form');

      expect(traittype.values).to.be.an('array');
      expect(traittype.values).to.deep.equal(['solid', 'liquid', 'vapor', 'intangible']);
    });

    it('values defaults to null when not specified', () => {
      DB.reset_registries();
      const traittypes = {
        ...stdTypes,
        name: 'string',  // No values specified
      };

      const archetypes = {
        Thing,
        Named: {
          bases: ['Thing'],
          traits: { name: null }
        }
      };

      DB.register(traittypes, archetypes, {});

      const traittype = Traittype.get_by_label('name');
      expect(traittype.values).to.be.null;

      // Should accept any string when no enum values
      const state = createStateInNewMind('test_mind');
      const obj = Belief.from_template(state, {
        traits: { name: 'anything' },
        bases: ['Named']
      });
      expect(obj._traits.get(Traittype.get_by_label('name'))).to.equal('anything');
    });
  });

  /**
   * MATRIX COVERAGE: Exposure metadata
   * ✅ 1.2 Single Archetype Inheritance (line 530 - "@form trait inherits")
   * ✅ 6.1 Archetype with Primitive Default (line 530, 595)
   * ✅ 6.2 Archetype with null Default (line 595 - "archetype default values appear")
   * ✅ 7.2 get_defined_traits() includes null traits (line 595)
   */
  describe('Exposure metadata', () => {
    beforeEach(() => {
      DB.reset_registries();
      const traittypes = {
        ...stdTypes,
        '@form': {
          type: 'string',
          values: ['solid', 'liquid', 'vapor', 'intangible']
        },
        color: {
          type: 'string',
          exposure: 'visual'
        },
        weight: {
          type: 'number',
          exposure: 'tactile'
        },
        location: {
          type: 'Location',
          exposure: 'spatial'
        },
        mind_states: {
          type: 'State',
          container: Array,
          min: 1,
          exposure: 'internal'
        },
      };

      const archetypes = {
        Thing: {
          traits: {
            '@form': null,  // Allow @form trait on Thing
          },
        },
        Location: {
          bases: ['Thing'],
        },
        ObjectPhysical: {
          bases: ['Thing'],
          traits: {
            '@form': 'solid',
            location: null,
            color: null,
            weight: null,
          },
        },
        PortableObject: {
          bases: ['ObjectPhysical'],
        },
        Mental: {
          bases: ['Thing'],
          traits: {
            mind_states: null,
          },
        },
      };

      DB.register(traittypes, archetypes, {});
    });

    it('stores exposure on traittype', () => {
      const color_tt = Traittype.get_by_label('color');
      expect(color_tt.exposure).to.equal('visual');

      const weight_tt = Traittype.get_by_label('weight');
      expect(weight_tt.exposure).to.equal('tactile');

      const location_tt = Traittype.get_by_label('location');
      expect(location_tt.exposure).to.equal('spatial');

      const mind_states_tt = Traittype.get_by_label('mind_states');
      expect(mind_states_tt.exposure).to.equal('internal');
    });

    it('exposure defaults to null when not specified', () => {
      const form_tt = Traittype.get_by_label('@form');
      expect(form_tt.exposure).to.be.null;
    });

    // Matrix 1.2: Single Archetype Inheritance + 6.1: Archetype with Primitive Default
    it('@form trait inherits through archetype bases', () => {
      const state = createStateInNewMind('test_mind');

      // PortableObject extends ObjectPhysical which has @form: 'solid'
      const hammer = Belief.from_template(state, {
        traits: {},
        bases: ['PortableObject'],
        label: 'hammer'
      });

      const form_traittype = Traittype.get_by_label('@form');
      expect(hammer.get_trait(state, form_traittype)).to.equal('solid');
    });

    it('@form validates against enum values', () => {
      const state = createStateInNewMind('test_mind');

      // Valid value should work
      const vapor_entity = Belief.from_template(state, {
        traits: { '@form': 'vapor' },
        bases: ['Thing'],
        label: 'fog'
      });
      expect(vapor_entity._traits.get(Traittype.get_by_label('@form'))).to.equal('vapor');

      // Invalid value should throw
      expect(() => {
        Belief.from_template(state, {
          traits: { '@form': 'plasma' },
          bases: ['Thing'],
          label: 'invalid'
        });
      }).to.throw(/Invalid value 'plasma' for trait '@form'/);
    });

    it('@form can override inherited value', () => {
      const state = createStateInNewMind('test_mind');

      // Override solid with vapor
      const fog = Belief.from_template(state, {
        traits: { '@form': 'vapor' },
        bases: ['ObjectPhysical'],  // Has @form: 'solid' by default
        label: 'fog'
      });

      expect(fog._traits.get(Traittype.get_by_label('@form'))).to.equal('vapor');
    });

    it('@form appears in get_traits() iteration', () => {
      const state = createStateInNewMind('test_mind');

      const hammer = Belief.from_template(state, {
        traits: { color: 'black' },
        bases: ['PortableObject'],  // Inherits @form: 'solid' from ObjectPhysical
        label: 'hammer'
      });

      // Should be accessible via get_trait
      const form_traittype = Traittype.get_by_label('@form');
      expect(hammer.get_trait(state, form_traittype)).to.equal('solid');

      // Should appear when iterating with get_traits()
      const traits = Array.from(hammer.get_traits());
      const form_traittype_obj = Traittype.get_by_label('@form');
      const form_entry = traits.find(([traittype]) => traittype === form_traittype_obj);

      expect(form_entry).to.not.be.undefined;
      expect(form_entry[1]).to.equal('solid');
    });

    // Matrix 6.1, 6.2, 7.2: Archetype defaults and iteration
    it('archetype default values appear in iteration', () => {
      const state = createStateInNewMind('test_mind');

      const obj = Belief.from_template(state, {
        traits: { weight: 5 },
        bases: ['ObjectPhysical']
      });

      const form_traittype = Traittype.get_by_label('@form');
      const trait_map = new Map();
      for (const [traittype, value] of obj.get_defined_traits()) {
        trait_map.set(traittype.label, value);
      }

      // Explicitly set trait
      expect(trait_map.get('weight')).to.equal(5);

      // Archetype default value
      expect(trait_map.get('@form')).to.equal('solid');

      // Archetype null value (now appears as null)
      expect(trait_map.has('color')).to.be.true;
      expect(trait_map.get('color')).to.be.null;
    });
  });
});
