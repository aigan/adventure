import { expect } from 'chai';
import { Mind, Belief } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { setupMinimalArchetypes } from './helpers.mjs';

describe('Subject', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupMinimalArchetypes();
  });

  describe('beliefs_at_tt()', () => {
    it('should return outermost belief on linear version chain', () => {
      const mind = new Mind(null, 'test');
      const state1 = mind.create_state(100);
      const state2 = mind.create_state(200);
      const state3 = mind.create_state(300);

      // Create linear version chain: v1 ← v2 ← v3
      const hammer_v1 = Belief.from_template(state1, {traits: {'@label': 'hammer'}, bases: ['PortableObject']});
      const hammer_v2 = Belief.from_template(state2, {sid: hammer_v1.subject.sid, bases: [hammer_v1]});
      const hammer_v3 = Belief.from_template(state3, {sid: hammer_v1.subject.sid, bases: [hammer_v2]});

      const subject = hammer_v1.subject;

      // Query at different times - should return single outermost node
      expect([...subject.beliefs_at_tt(50)]).to.deep.equal([]);  // Before any version
      expect([...subject.beliefs_at_tt(100)]).to.deep.equal([hammer_v1]);
      expect([...subject.beliefs_at_tt(150)]).to.deep.equal([hammer_v1]);
      expect([...subject.beliefs_at_tt(200)]).to.deep.equal([hammer_v2]);
      expect([...subject.beliefs_at_tt(250)]).to.deep.equal([hammer_v2]);
      expect([...subject.beliefs_at_tt(300)]).to.deep.equal([hammer_v3]);
      expect([...subject.beliefs_at_tt(999)]).to.deep.equal([hammer_v3]);
    });

    it('should return outermost beliefs on each branch', () => {
      const mind = new Mind(null, 'test');
      const state1 = mind.create_state(100);
      const state2 = mind.create_state(200);
      const state3 = mind.create_state(150);
      const state4 = mind.create_state(300);
      const state5 = mind.create_state(175);

      // Create branching version tree:
      // v1(t=100) ← v2(t=200) ← v4(t=300)   [Branch A]
      //     ↑
      //    v3(t=150) ← v5(t=175)            [Branch B]
      const hammer_v1 = Belief.from_template(state1, {traits: {'@label': 'hammer'}, bases: ['PortableObject']});
      const hammer_v2 = Belief.from_template(state2, {sid: hammer_v1.subject.sid, bases: [hammer_v1]});  // Branch A from v1
      const hammer_v3 = Belief.from_template(state3, {sid: hammer_v1.subject.sid, bases: [hammer_v1]});  // Branch B from v1
      const hammer_v4 = Belief.from_template(state4, {sid: hammer_v1.subject.sid, bases: [hammer_v2]});  // Continue branch A
      const hammer_v5 = Belief.from_template(state5, {sid: hammer_v1.subject.sid, bases: [hammer_v3]});  // Continue branch B

      const subject = hammer_v1.subject;

      // Before any version
      expect([...subject.beliefs_at_tt(50)]).to.deep.equal([]);

      // Both branches converge to v1
      expect([...subject.beliefs_at_tt(125)]).to.have.members([hammer_v1]);

      // Only branch B has progressed: v3
      const at_160 = [...subject.beliefs_at_tt(160)];
      expect(at_160).to.have.lengthOf(1);
      expect(at_160).to.have.members([hammer_v3]);

      // Branch A: v2 (just created), Branch B: v5
      const at_210 = [...subject.beliefs_at_tt(210)];
      expect(at_210).to.have.lengthOf(2);
      expect(at_210).to.have.members([hammer_v2, hammer_v5]);

      // Branch A: v2 (v4 is at t=300), Branch B: v5
      const at_250 = [...subject.beliefs_at_tt(250)];
      expect(at_250).to.have.lengthOf(2);
      expect(at_250).to.have.members([hammer_v2, hammer_v5]);

      // Branch A: v4, Branch B: v5 (both tips)
      const at_400 = [...subject.beliefs_at_tt(400)];
      expect(at_400).to.have.lengthOf(2);
      expect(at_400).to.have.members([hammer_v4, hammer_v5]);
    });

    it('should return empty iterable for non-existent subject', () => {
      const mind = new Mind(null, 'test');
      const nonexistent_subject = DB.get_or_create_subject(null, 999);  // Global subject for test

      expect([...nonexistent_subject.beliefs_at_tt(100)]).to.deep.equal([]);
    });
  });
});
