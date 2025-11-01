import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';

describe('Mind', () => {
  beforeEach(() => {
    DB.reset_registries();
  });

  it('creates mind with unique ID', () => {
    const mind = new Mind(null, 'test_mind');
    expect(mind._id).to.be.a('number');
    expect(mind.label).to.equal('test_mind');
  });

  it('registers mind by id and label', () => {
    const mind = new Mind(null, 'registered');
    expect(Mind.get_by_id(mind._id)).to.equal(mind);
    expect(Mind.get_by_label('registered')).to.equal(mind);
  });

  describe('states_at_tt()', () => {
    it('should return outermost state on linear state chain', () => {
      const mind = new Mind(null, 'test');
      const state1 = mind.create_state(100);
      state1.lock();
      const state2 = state1.tick(null, 200);
      state2.lock();
      const state3 = state2.tick(null, 300);
      state3.lock();

      // Query at different times - should return single outermost state
      expect([...mind.states_at_tt(50)]).to.deep.equal([]);  // Before any state
      expect([...mind.states_at_tt(100)]).to.deep.equal([state1]);
      expect([...mind.states_at_tt(150)]).to.deep.equal([state1]);
      expect([...mind.states_at_tt(200)]).to.deep.equal([state2]);
      expect([...mind.states_at_tt(250)]).to.deep.equal([state2]);
      expect([...mind.states_at_tt(300)]).to.deep.equal([state3]);
      expect([...mind.states_at_tt(999)]).to.deep.equal([state3]);
    });

    it('should return outermost states on each branch', () => {
      const mind = new Mind(null, 'test');
      const state1 = mind.create_state(100);
      state1.lock();

      // Create branching state tree:
      // s1(t=100) ← s2(t=200) ← s4(t=300)   [Branch A]
      //     ↑
      //    s3(t=150) ← s5(t=175)            [Branch B]
      const state2 = state1.tick(null, 200);
      state2.lock();

      const state3 = state1.tick(null, 150);
      state3.lock();

      const state4 = state2.tick(null, 300);
      state4.lock();

      const state5 = state3.tick(null, 175);
      state5.lock();

      // Before any state
      expect([...mind.states_at_tt(50)]).to.deep.equal([]);

      // Both branches converge to s1
      expect([...mind.states_at_tt(125)]).to.have.members([state1]);

      // Only branch B has progressed: s3
      const at_160 = [...mind.states_at_tt(160)];
      expect(at_160).to.have.lengthOf(1);
      expect(at_160).to.have.members([state3]);

      // Branch A: s2 (just created), Branch B: s5
      const at_210 = [...mind.states_at_tt(210)];
      expect(at_210).to.have.lengthOf(2);
      expect(at_210).to.have.members([state2, state5]);

      // Branch A: s2 (s4 is at t=300), Branch B: s5
      const at_250 = [...mind.states_at_tt(250)];
      expect(at_250).to.have.lengthOf(2);
      expect(at_250).to.have.members([state2, state5]);

      // Branch A: s4, Branch B: s5 (both tips)
      const at_400 = [...mind.states_at_tt(400)];
      expect(at_400).to.have.lengthOf(2);
      expect(at_400).to.have.members([state4, state5]);
    });

    it('should return empty iterable for empty mind', () => {
      const mind = new Mind(null, 'test');
      expect([...mind.states_at_tt(100)]).to.deep.equal([]);
    });
  });

  describe('resolve_trait_value_from_template()', () => {
    beforeEach(() => {
      // Setup minimal archetypes for testing
      DB.register({
        Base: {traits: {name: null, '@about': null}}
      }, {
        mind: 'Mind',
        name: 'string',
        '@about': {type: 'Subject', mind: 'parent'}
      });
    });

    it('should create Mind from plain object template (learn spec)', () => {
      const world_mind = new Mind(null, 'world');
      const world_state = world_mind.create_state(1);

      // Create a belief that can be learned about
      const workshop_belief = world_state.add_belief({
        label: 'workshop',
        bases: ['Base'],
        traits: {name: 'Workshop'}
      });

      // Create NPC belief that will have a mind trait
      const npc_belief = world_state.add_belief({
        bases: ['Base']
      });

      // Plain object template (learn spec)
      const template_data = {
        workshop: ['name']
      };

      const mind_traittype = Traittype.get_by_label('mind');
      const result = Mind.resolve_trait_value_from_template(mind_traittype, npc_belief, template_data);

      world_state.lock();

      expect(result).to.be.instanceof(Mind);
      expect(result.parent).to.equal(world_mind);
      expect(result._states.size).to.equal(1);
    });

    it('should create Mind from explicit template with _type field', () => {
      const world_mind = new Mind(null, 'world');
      const world_state = world_mind.create_state(1);

      const workshop_belief = world_state.add_belief({
        label: 'workshop',
        bases: ['Base'],
        traits: {name: 'Workshop'}
      });

      const npc_belief = world_state.add_belief({
        bases: ['Base']
      });

      // Explicit template with _type
      const template_data = {
        _type: 'Mind',
        workshop: ['name']
      };

      const mind_traittype = Traittype.get_by_label('mind');
      const result = Mind.resolve_trait_value_from_template(mind_traittype, npc_belief, template_data);

      world_state.lock();

      expect(result).to.be.instanceof(Mind);
      expect(result.parent).to.equal(world_mind);
    });

    it('should return Mind instance as-is (not a template)', () => {
      const world_mind = new Mind(null, 'world');
      const world_state = world_mind.create_state(1);

      const npc_belief = world_state.add_belief({
        bases: ['Base']
      });
      world_state.lock();

      const existing_mind = new Mind(world_mind, 'existing');

      const mind_traittype = Traittype.get_by_label('mind');
      const result = Mind.resolve_trait_value_from_template(mind_traittype, npc_belief, existing_mind);

      expect(result).to.equal(existing_mind);
    });

    it('should return null as-is', () => {
      const world_mind = new Mind(null, 'world');
      const world_state = world_mind.create_state(1);

      const npc_belief = world_state.add_belief({
        bases: ['Base']
      });
      world_state.lock();

      const mind_traittype = Traittype.get_by_label('mind');
      const result = Mind.resolve_trait_value_from_template(mind_traittype, npc_belief, null);

      expect(result).to.be.null;
    });

    it('should return undefined as-is', () => {
      const world_mind = new Mind(null, 'world');
      const world_state = world_mind.create_state(1);

      const npc_belief = world_state.add_belief({
        bases: ['Base']
      });
      world_state.lock();

      const mind_traittype = Traittype.get_by_label('mind');
      const result = Mind.resolve_trait_value_from_template(mind_traittype, npc_belief, undefined);

      expect(result).to.be.undefined;
    });

    it('should throw if belief has no origin_state', () => {
      const belief = new Belief(null);
      const mind_traittype = Traittype.get_by_label('mind');

      expect(() => {
        Mind.resolve_trait_value_from_template(mind_traittype, belief, {workshop: []});
      }).to.throw('belief must have origin_state');
    });
  });
});
