import { expect } from 'chai';
import { Mind, Belief } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { setupMinimalArchetypes } from './helpers.mjs';

describe('Subject', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupMinimalArchetypes();
  });

  describe('beliefs_valid_at()', () => {
    it('should return outermost belief on linear version chain', () => {
      const mind = new Mind('test');
      const state1 = mind.create_state(100);
      const state2 = mind.create_state(200);
      const state3 = mind.create_state(300);

      // Create linear version chain: v1 ← v2 ← v3
      const hammer_v1 = Belief.from_template(mind, {label: 'hammer', bases: ['PortableObject']}, state1);
      const hammer_v2 = Belief.from_template(mind, {sid: hammer_v1.subject.sid, bases: [hammer_v1]}, state2);
      const hammer_v3 = Belief.from_template(mind, {sid: hammer_v1.subject.sid, bases: [hammer_v2]}, state3);

      const subject = hammer_v1.subject;

      // Query at different times - should return single outermost node
      expect([...subject.beliefs_valid_at(50)]).to.deep.equal([]);  // Before any version
      expect([...subject.beliefs_valid_at(100)]).to.deep.equal([hammer_v1]);
      expect([...subject.beliefs_valid_at(150)]).to.deep.equal([hammer_v1]);
      expect([...subject.beliefs_valid_at(200)]).to.deep.equal([hammer_v2]);
      expect([...subject.beliefs_valid_at(250)]).to.deep.equal([hammer_v2]);
      expect([...subject.beliefs_valid_at(300)]).to.deep.equal([hammer_v3]);
      expect([...subject.beliefs_valid_at(999)]).to.deep.equal([hammer_v3]);
    });

    it('should return outermost beliefs on each branch', () => {
      const mind = new Mind('test');
      const state1 = mind.create_state(100);
      const state2 = mind.create_state(200);
      const state3 = mind.create_state(150);
      const state4 = mind.create_state(300);
      const state5 = mind.create_state(175);

      // Create branching version tree:
      // v1(t=100) ← v2(t=200) ← v4(t=300)   [Branch A]
      //     ↑
      //    v3(t=150) ← v5(t=175)            [Branch B]
      const hammer_v1 = Belief.from_template(mind, {label: 'hammer', bases: ['PortableObject']}, state1);
      const hammer_v2 = Belief.from_template(mind, {sid: hammer_v1.subject.sid, bases: [hammer_v1]}, state2);  // Branch A from v1
      const hammer_v3 = Belief.from_template(mind, {sid: hammer_v1.subject.sid, bases: [hammer_v1]}, state3);  // Branch B from v1
      const hammer_v4 = Belief.from_template(mind, {sid: hammer_v1.subject.sid, bases: [hammer_v2]}, state4);  // Continue branch A
      const hammer_v5 = Belief.from_template(mind, {sid: hammer_v1.subject.sid, bases: [hammer_v3]}, state5);  // Continue branch B

      const subject = hammer_v1.subject;

      // Before any version
      expect([...subject.beliefs_valid_at(50)]).to.deep.equal([]);

      // Both branches converge to v1
      expect([...subject.beliefs_valid_at(125)]).to.have.members([hammer_v1]);

      // Only branch B has progressed: v3
      const at_160 = [...subject.beliefs_valid_at(160)];
      expect(at_160).to.have.lengthOf(1);
      expect(at_160).to.have.members([hammer_v3]);

      // Branch A: v2 (just created), Branch B: v5
      const at_210 = [...subject.beliefs_valid_at(210)];
      expect(at_210).to.have.lengthOf(2);
      expect(at_210).to.have.members([hammer_v2, hammer_v5]);

      // Branch A: v2 (v4 is at t=300), Branch B: v5
      const at_250 = [...subject.beliefs_valid_at(250)];
      expect(at_250).to.have.lengthOf(2);
      expect(at_250).to.have.members([hammer_v2, hammer_v5]);

      // Branch A: v4, Branch B: v5 (both tips)
      const at_400 = [...subject.beliefs_valid_at(400)];
      expect(at_400).to.have.lengthOf(2);
      expect(at_400).to.have.members([hammer_v4, hammer_v5]);
    });

    it('should return empty iterable for non-existent subject', () => {
      const mind = new Mind('test');
      const nonexistent_subject = DB.get_or_create_subject(999);

      expect([...nonexistent_subject.beliefs_valid_at(100)]).to.deep.equal([]);
    });
  });
});
