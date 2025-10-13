import { expect } from 'chai';
import * as DB from '../public/worker/db.mjs';
import { createMindWithBeliefs, setupStandardArchetypes } from './helpers.mjs';

describe('Belief', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupStandardArchetypes();
  });

  describe('Belief Versioning', () => {
    it('with_traits creates new belief with base reference', () => {
      const mind = createMindWithBeliefs('test', {
        workshop: {
          bases: ['Location']
        }
      });

      const ball = mind.add({
        label: 'ball',
        bases: ['PortableObject'],
        traits: {
          location: 'workshop'
        }
      });

      const ball_v2 = new DB.Belief(ball.in_mind, {
        bases: [ball],
        traits: { color: 'blue' }
      });

      const inspected = ball_v2.inspect();
      expect(inspected.bases).to.include(ball._id);
      expect(inspected.traits.color).to.equal('blue');

      // Should still have location from base
      expect(ball_v2.can_have_trait('location')).to.be.true;
    });

    it('versioned belief inherits archetypes from base', () => {
      const mind = new DB.Mind('test');
      const hammer = mind.add({
        label: 'hammer',
        bases: ['PortableObject']
      });

      const hammer_v2 = new DB.Belief(hammer.in_mind, {
        bases: [hammer],
        traits: { color: 'black' }
      });

      const inspected = hammer_v2.inspect();
      // hammer_v2 doesn't directly have archetypes in bases, inherits from base belief
      expect(inspected.bases).to.include(hammer._id);

      // But get_archetypes should walk to base
      const archetype_labels = [...hammer_v2.get_archetypes()].map(a => a.label);
      expect(archetype_labels).to.include('PortableObject');
      expect(archetype_labels).to.include('ObjectPhysical');
    });
  });

  describe('Mind Isolation', () => {
    it('beliefs store in_mind reference', () => {
      const mind = new DB.Mind('test');
      mind.add({label: 'workshop', bases: ['Location']});

      const workshop = DB.Belief.by_label.get('workshop');
      expect(workshop.in_mind).to.equal(mind);
    });

    it('each mind has independent belief storage', () => {
      const mind_a = new DB.Mind('mind_a');
      const mind_b = new DB.Mind('mind_b');

      const item_a = mind_a.add({ label: 'item_unique_a', bases: ['PortableObject'] });
      const item_b = mind_b.add({ label: 'item_unique_b', bases: ['PortableObject'] });

      // Stored in different minds
      expect(item_a.in_mind).to.equal(mind_a);
      expect(item_b.in_mind).to.equal(mind_b);

      expect(item_a.in_mind).to.not.equal(mind_b);
      expect(item_b.in_mind).to.not.equal(mind_a);
    });

    it('currently allows referencing other mind\'s beliefs in bases', () => {
      const mind_a = new DB.Mind('mind_a');
      mind_a.add({label: 'workshop', bases: ['Location']});

      const mind_b = new DB.Mind('mind_b');

      // Currently this works - mind_b can reference mind_a's belief
      const workshop_a = DB.Belief.by_label.get('workshop');
      const item = mind_b.add({
        label: 'item',
        bases: [workshop_a]  // Using belief from another mind
      });

      expect(item.bases.has(workshop_a)).to.be.true;
    });
  });
});
