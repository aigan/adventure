import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { setupMinimalArchetypes } from './helpers.mjs';

describe('Registry', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupMinimalArchetypes();
  });

  describe('Label Uniqueness', () => {
    it('currently allows duplicate labels across minds', () => {
      const mind_a = new Mind('mind_a');
      const workshop_a = Belief.from_template(mind_a, {label: 'workshop_unique_a', bases: ['Location']});

      const mind_b = new Mind('mind_b');
      const workshop_b = Belief.from_template(mind_b, {label: 'workshop_unique_b', bases: ['Location']});

      // Labels are globally unique now
      expect(DB.get_first_belief_by_label('workshop_unique_a')).to.exist;
      expect(DB.get_first_belief_by_label('workshop_unique_b')).to.exist;
      expect(DB.get_first_belief_by_label('workshop_unique_a')).to.not.equal(
        DB.get_first_belief_by_label('workshop_unique_b')
      );
    });

    it('throws error on duplicate labels', () => {
      const mind = new Mind('test');
      Belief.from_template(mind, {label: 'item1', bases: ['PortableObject']});

      // Adding another with same label should throw
      expect(() => {
        Belief.from_template(mind, { label: 'item1', bases: ['Location'] });
      }).to.throw(/Label 'item1' is already used/);
    });

    it('throws error when belief label matches archetype label', () => {
      const mind = new Mind('test');

      // Trying to create belief with same label as archetype should throw
      expect(() => {
        Belief.from_template(mind, { label: 'PortableObject', bases: ['Location'] });
      }).to.throw(/Label 'PortableObject' is already used by an archetype/);
    });
  });

  describe('Temporal Queries', () => {
    it('should return most recent belief valid at timestamp', () => {
      const mind = new Mind('test');
      const state1 = mind.create_state(100);
      const state2 = mind.create_state(200);
      const state3 = mind.create_state(300);

      // Create belief versions at different times
      const hammer_v1 = Belief.from_template(mind, {label: 'hammer', bases: ['PortableObject']}, state1);
      const hammer_v2 = Belief.from_template(mind, {sid: hammer_v1.subject.sid, bases: ['PortableObject']}, state2);
      const hammer_v3 = Belief.from_template(mind, {sid: hammer_v1.subject.sid, bases: ['PortableObject']}, state3);

      const subject = hammer_v1.subject;

      // Query at different times
      expect(DB.valid_at(subject, 50)).to.be.null;  // Before any version
      expect(DB.valid_at(subject, 100)).to.equal(hammer_v1);
      expect(DB.valid_at(subject, 150)).to.equal(hammer_v1);
      expect(DB.valid_at(subject, 200)).to.equal(hammer_v2);
      expect(DB.valid_at(subject, 250)).to.equal(hammer_v2);
      expect(DB.valid_at(subject, 300)).to.equal(hammer_v3);
      expect(DB.valid_at(subject, 999)).to.equal(hammer_v3);
    });

    it('should return null for non-existent subject', () => {
      const mind = new Mind('test');
      const nonexistent_subject = DB.get_or_create_subject(999);

      expect(DB.valid_at(nonexistent_subject, 100)).to.be.null;
    });
  });
});
