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
      const workshop_a = mind_a.add({label: 'workshop_unique_a', bases: ['Location']});

      const mind_b = new Mind('mind_b');
      const workshop_b = mind_b.add({label: 'workshop_unique_b', bases: ['Location']});

      // Labels are globally unique now
      expect(DB.get_belief_by_label('workshop_unique_a')).to.exist;
      expect(DB.get_belief_by_label('workshop_unique_b')).to.exist;
      expect(DB.get_belief_by_label('workshop_unique_a')).to.not.equal(
        DB.get_belief_by_label('workshop_unique_b')
      );
    });

    it('throws error on duplicate labels', () => {
      const mind = new Mind('test');
      mind.add({label: 'item1', bases: ['PortableObject']});

      // Adding another with same label should throw
      expect(() => {
        mind.add({ label: 'item1', bases: ['Location'] });
      }).to.throw(/Label 'item1' is already used/);
    });

    it('throws error when belief label matches archetype label', () => {
      const mind = new Mind('test');

      // Trying to create belief with same label as archetype should throw
      expect(() => {
        mind.add({ label: 'PortableObject', bases: ['Location'] });
      }).to.throw(/Label 'PortableObject' is already used by an archetype/);
    });
  });
});
