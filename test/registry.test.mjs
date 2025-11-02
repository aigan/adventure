import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { setupMinimalArchetypes, get_first_belief_by_label } from './helpers.mjs';

const logos = () => DB.get_logos_mind();

describe('Registry', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupMinimalArchetypes();
  });

  describe('Label Uniqueness', () => {
    it('currently allows duplicate labels across minds', () => {
      const mind_a = new Mind(logos(), 'mind_a');
      const state_a = mind_a.create_state(1);
      const workshop_a = Belief.from_template(state_a, {traits: {'@label': 'workshop_unique_a'}, bases: ['Location']});

      const mind_b = new Mind(logos(), 'mind_b');
      const state_b = mind_b.create_state(1);
      const workshop_b = Belief.from_template(state_b, {traits: {'@label': 'workshop_unique_b'}, bases: ['Location']});

      // Labels are globally unique now
      expect(get_first_belief_by_label('workshop_unique_a')).to.exist;
      expect(get_first_belief_by_label('workshop_unique_b')).to.exist;
      expect(get_first_belief_by_label('workshop_unique_a')).to.not.equal(
        get_first_belief_by_label('workshop_unique_b')
      );
    });

    it('throws error on duplicate labels', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1);
      Belief.from_template(state, {traits: {'@label': 'item1'}, bases: ['PortableObject']});

      // Adding another with same label should throw
      expect(() => {
        Belief.from_template(state, {traits: {'@label': 'item1'}, bases: ['Location']});
      }).to.throw(/Label 'item1' is already used/);
    });

    it('throws error when belief label matches archetype label', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1);

      // Trying to create belief with same label as archetype should throw
      expect(() => {
        Belief.from_template(state, {traits: {'@label': 'PortableObject'}, bases: ['Location']});
      }).to.throw(/Label 'PortableObject' is already used by an archetype/);
    });
  });
});
