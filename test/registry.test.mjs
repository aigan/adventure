import { expect } from 'chai';
import { Mind, Materia, State, Belief, Archetype, Traittype, save_mind, load , logos } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { setupMinimalArchetypes, get_first_belief_by_label, createStateInNewMind } from './helpers.mjs';


describe('Registry', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupMinimalArchetypes();
  });

  describe('Label Uniqueness', () => {
    it('currently allows duplicate labels across minds', () => {
      const state_a = createStateInNewMind('mind_a');
      const workshop_a = Belief.from_template(state_a, {traits: {}, bases: ['Location'], label: 'workshop_unique_a'});

      const state_b = createStateInNewMind('mind_b');
      const workshop_b = Belief.from_template(state_b, {traits: {}, bases: ['Location'], label: 'workshop_unique_b'});

      // Labels are globally unique now
      expect(get_first_belief_by_label('workshop_unique_a')).to.exist;
      expect(get_first_belief_by_label('workshop_unique_b')).to.exist;
      expect(get_first_belief_by_label('workshop_unique_a')).to.not.equal(
        get_first_belief_by_label('workshop_unique_b')
      );
    });

    it('throws error on duplicate labels', () => {
      const state = createStateInNewMind();
      Belief.from_template(state, {traits: {}, bases: ['PortableObject'], label: 'item1'});

      // Adding another with same label should throw
      expect(() => {
        Belief.from_template(state, {traits: {}, bases: ['Location'], label: 'item1'});
      }).to.throw(/Label 'item1' is already used/);
    });

    it('throws error when belief label matches archetype label', () => {
      const state = createStateInNewMind();

      // Trying to create belief with same label as archetype should throw
      expect(() => {
        Belief.from_template(state, {traits: {}, bases: ['Location'], label: 'PortableObject'});
      }).to.throw(/Label 'PortableObject' is already used by an archetype/);
    });
  });
});
