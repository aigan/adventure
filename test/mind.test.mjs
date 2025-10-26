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

  describe('states_valid_at()', () => {
    it('should return outermost state on linear state chain', () => {
      const mind = new Mind(null, 'test');
      const state1 = mind.create_state(100);
      state1.lock();
      const state2 = state1.tick({});
      state2.timestamp = 200;
      state2.lock();
      const state3 = state2.tick({});
      state3.timestamp = 300;
      state3.lock();

      // Query at different times - should return single outermost state
      expect([...mind.states_valid_at(50)]).to.deep.equal([]);  // Before any state
      expect([...mind.states_valid_at(100)]).to.deep.equal([state1]);
      expect([...mind.states_valid_at(150)]).to.deep.equal([state1]);
      expect([...mind.states_valid_at(200)]).to.deep.equal([state2]);
      expect([...mind.states_valid_at(250)]).to.deep.equal([state2]);
      expect([...mind.states_valid_at(300)]).to.deep.equal([state3]);
      expect([...mind.states_valid_at(999)]).to.deep.equal([state3]);
    });

    it('should return outermost states on each branch', () => {
      const mind = new Mind(null, 'test');
      const state1 = mind.create_state(100);
      state1.lock();

      // Create branching state tree:
      // s1(t=100) ← s2(t=200) ← s4(t=300)   [Branch A]
      //     ↑
      //    s3(t=150) ← s5(t=175)            [Branch B]
      const state2 = state1.tick({});
      state2.timestamp = 200;
      state2.lock();

      const state3 = state1.tick({});
      state3.timestamp = 150;
      state3.lock();

      const state4 = state2.tick({});
      state4.timestamp = 300;
      state4.lock();

      const state5 = state3.tick({});
      state5.timestamp = 175;
      state5.lock();

      // Before any state
      expect([...mind.states_valid_at(50)]).to.deep.equal([]);

      // Both branches converge to s1
      expect([...mind.states_valid_at(125)]).to.have.members([state1]);

      // Only branch B has progressed: s3
      const at_160 = [...mind.states_valid_at(160)];
      expect(at_160).to.have.lengthOf(1);
      expect(at_160).to.have.members([state3]);

      // Branch A: s2 (just created), Branch B: s5
      const at_210 = [...mind.states_valid_at(210)];
      expect(at_210).to.have.lengthOf(2);
      expect(at_210).to.have.members([state2, state5]);

      // Branch A: s2 (s4 is at t=300), Branch B: s5
      const at_250 = [...mind.states_valid_at(250)];
      expect(at_250).to.have.lengthOf(2);
      expect(at_250).to.have.members([state2, state5]);

      // Branch A: s4, Branch B: s5 (both tips)
      const at_400 = [...mind.states_valid_at(400)];
      expect(at_400).to.have.lengthOf(2);
      expect(at_400).to.have.members([state4, state5]);
    });

    it('should return empty iterable for empty mind', () => {
      const mind = new Mind(null, 'test');
      expect([...mind.states_valid_at(100)]).to.deep.equal([]);
    });
  });
});
