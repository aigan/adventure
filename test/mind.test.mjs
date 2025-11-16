import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load, logos, logos_state } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { stdTypes, Thing, createStateInNewMind } from './helpers.mjs';

describe('Mind', () => {
  beforeEach(() => {
    DB.reset_registries();
  });

  it('creates mind with unique ID', () => {
    const mind = new Mind(logos(), 'test_mind');
    expect(mind._id).to.be.a('number');
    expect(mind.label).to.equal('test_mind');
  });

  it('registers mind by id and label', () => {
    const mind = new Mind(logos(), 'registered');
    expect(Mind.get_by_id(mind._id)).to.equal(mind);
    expect(Mind.get_by_label('registered')).to.equal(mind);
  });

  describe('states_at_tt()', () => {
    it('should return outermost state on linear state chain', () => {
      const state1 = createStateInNewMind('test', 100);
      state1.lock();
      const state2 = state1.branch_state(logos().origin_state, 200);
      state2.lock();
      const state3 = state2.branch_state(logos().origin_state, 300);
      state3.lock();

      // Query at different times - should return single outermost state
      expect([...state1.in_mind.states_at_tt(50)]).to.deep.equal([]);  // Before any state
      expect([...state1.in_mind.states_at_tt(100)]).to.deep.equal([state1]);
      expect([...state1.in_mind.states_at_tt(150)]).to.deep.equal([state1]);
      expect([...state1.in_mind.states_at_tt(200)]).to.deep.equal([state2]);
      expect([...state1.in_mind.states_at_tt(250)]).to.deep.equal([state2]);
      expect([...state1.in_mind.states_at_tt(300)]).to.deep.equal([state3]);
      expect([...state1.in_mind.states_at_tt(999)]).to.deep.equal([state3]);
    });

    it('should return outermost states on each branch', () => {
      const state1 = createStateInNewMind('test', 100);
      state1.lock();

      // Create branching state tree:
      // s1(t=100) ← s2(t=200) ← s4(t=300)   [Branch A]
      //     ↑
      //    s3(t=150) ← s5(t=175)            [Branch B]
      const state2 = state1.branch_state(logos().origin_state, 200);
      state2.lock();

      const state3 = state1.branch_state(logos().origin_state, 150);
      state3.lock();

      const state4 = state2.branch_state(logos().origin_state, 300);
      state4.lock();

      const state5 = state3.branch_state(logos().origin_state, 175);
      state5.lock();

      // Before any state
      expect([...state1.in_mind.states_at_tt(50)]).to.deep.equal([]);

      // Both branches converge to s1
      expect([...state1.in_mind.states_at_tt(125)]).to.have.members([state1]);

      // Only branch B has progressed: s3
      const at_160 = [...state1.in_mind.states_at_tt(160)];
      expect(at_160).to.have.lengthOf(1);
      expect(at_160).to.have.members([state3]);

      // Branch A: s2 (just created), Branch B: s5
      const at_210 = [...state1.in_mind.states_at_tt(210)];
      expect(at_210).to.have.lengthOf(2);
      expect(at_210).to.have.members([state2, state5]);

      // Branch A: s2 (s4 is at t=300), Branch B: s5
      const at_250 = [...state1.in_mind.states_at_tt(250)];
      expect(at_250).to.have.lengthOf(2);
      expect(at_250).to.have.members([state2, state5]);

      // Branch A: s4, Branch B: s5 (both tips)
      const at_400 = [...state1.in_mind.states_at_tt(400)];
      expect(at_400).to.have.lengthOf(2);
      expect(at_400).to.have.members([state4, state5]);
    });

    it('should return empty iterable for empty mind', () => {
      const mind = new Mind(logos(), 'test');
      expect([...mind.states_at_tt(100)]).to.deep.equal([]);
    });
  });

  describe('resolve_trait_value_from_template()', () => {
    beforeEach(() => {
      // Setup minimal archetypes for testing
      DB.register({
        ...stdTypes,
        mind: 'Mind',
        name: 'string',
      }, {
        Thing,
        Base: {bases: ['Thing'], traits: {name: null}}
      }, {});
    });

    it('should create Mind from plain object template (learn spec)', () => {
      const world_mind = new Mind(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1});

      // Create a belief that can be learned about
      const workshop_belief = world_state.add_belief_from_template({
        bases: ['Base'],
        traits: {name: 'Workshop'}, label: 'workshop'
      });

      // Create NPC belief that will have a mind trait
      const npc_belief = world_state.add_belief_from_template({
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
      const world_mind = new Mind(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1});

      const workshop_belief = world_state.add_belief_from_template({
        bases: ['Base'],
        traits: {name: 'Workshop'}, label: 'workshop'
      });

      const npc_belief = world_state.add_belief_from_template({
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
      const world_mind = new Mind(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1});

      const npc_belief = world_state.add_belief_from_template({
        bases: ['Base']
      });
      world_state.lock();

      const existing_mind = new Mind(world_mind, 'existing');

      const mind_traittype = Traittype.get_by_label('mind');
      const result = Mind.resolve_trait_value_from_template(mind_traittype, npc_belief, existing_mind);

      expect(result).to.equal(existing_mind);
    });

    it('should return null as-is', () => {
      const world_mind = new Mind(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1});

      const npc_belief = world_state.add_belief_from_template({
        bases: ['Base']
      });
      world_state.lock();

      const mind_traittype = Traittype.get_by_label('mind');
      const result = Mind.resolve_trait_value_from_template(mind_traittype, npc_belief, null);

      expect(result).to.be.null;
    });

    it('should return undefined as-is', () => {
      const world_mind = new Mind(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1});

      const npc_belief = world_state.add_belief_from_template({
        bases: ['Base']
      });
      world_state.lock();

      const mind_traittype = Traittype.get_by_label('mind');
      const result = Mind.resolve_trait_value_from_template(mind_traittype, npc_belief, undefined);

      expect(result).to.be.undefined;
    });

    it('should throw if belief has no origin_state', () => {
      const state = createStateInNewMind('test', 0);
      const belief = new Belief(state);
      belief.origin_state = null;  // Manually break it for testing
      const mind_traittype = Traittype.get_by_label('mind');

      expect(() => {
        Mind.resolve_trait_value_from_template(mind_traittype, belief, {workshop: []});
      }).to.throw(/belief must have origin_state|create_from_template requires State/);
    });
  });

  describe('mind.state property', () => {
    it('tracks unlocked state after create_from_template', () => {
      const world_mind = new Mind(logos(), 'world');
      const world_state = world_mind.create_state(logos_state(), {tt: 1});

      // Just use empty trait spec (no learning needed for this test)
      const npc_belief = world_state.add_belief_from_template({
        bases: []
      });

      // Create mind from template
      const mind = Mind.create_from_template(world_state, npc_belief, {});

      // Should have unlocked state
      expect(mind.state).to.not.be.null;
      expect(mind.state).to.be.instanceof(State);
      expect(mind.state.locked).to.be.false;
    });

    it('clears state property after locking', () => {
      const world_mind = new Mind(logos(), 'world');
      const world_state = world_mind.create_state(logos_state(), {tt: 1});

      // Just use empty trait spec
      const npc_belief = world_state.add_belief_from_template({
        bases: []
      });

      // Create mind from template
      const mind = Mind.create_from_template(world_state, npc_belief, {});

      const state = mind.state;
      expect(state).to.not.be.null;

      // Lock the state
      state.lock();

      // mind.state should now be null
      expect(mind.state).to.be.null;
    });

    it('tracks most recent unlocked state when multiple states exist', () => {
      const mind = new Mind(logos(), 'test');

      // Create first state
      const state1 = mind.create_state(logos_state(), {tt: 100});
      expect(mind.state).to.equal(state1);

      // Lock first state before branching
      state1.lock();

      // Create second state (unlocked)
      const state2 = state1.branch_state(logos().origin_state, 200);
      expect(mind.state).to.equal(state2);

      // Lock second state
      state2.lock();
      expect(mind.state).to.be.null;

      // Create third state
      const state3 = state1.branch_state(logos().origin_state, 300);
      expect(mind.state).to.equal(state3);
    });

    it('is null for new mind with no states', () => {
      const mind = new Mind(logos(), 'test');
      expect(mind.state).to.be.null;
    });
  });
});
