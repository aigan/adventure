import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { setupStandardArchetypes } from './helpers.mjs';

describe('Archetype', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupStandardArchetypes();
  });

  describe('Archetype Composition', () => {
    it('single archetype has correct structure', () => {
      const mind = new Mind('test');
      const state = mind.create_state(1);
      const workshop = mind.add({
        label: 'workshop',
        bases: ['Location']
      });

      const inspected = workshop.inspect(state);
      // Location inherits from ObjectPhysical, so we get both
      expect(inspected.archetypes).to.deep.equal(['Location', 'ObjectPhysical']);
    });

    it('archetype with base inherits traits from parent', () => {
      const mind = new Mind('test');
      const hammer = mind.add({
        label: 'hammer',
        bases: ['PortableObject'],
        traits: {
          color: 'black'
        }
      });

      // PortableObject → ObjectPhysical, so should have color trait
      expect(hammer.can_have_trait('color')).to.be.true;
      expect(hammer.can_have_trait('location')).to.be.true;
    });

    it('Person archetype inherits from multiple bases', () => {
      const mind = new Mind('test');
      const state = mind.create_state(1);
      const player = mind.add({
        label: 'player',
        bases: ['Person']
      });

      const inspected = player.inspect(state);
      expect(inspected.archetypes).to.deep.equal(['Person', 'Actor', 'Mental', 'ObjectPhysical']);

      // Person → Actor → ObjectPhysical (has location, color)
      // Person → Mental (has mind_states)
      expect(player.can_have_trait('location')).to.be.true;
      expect(player.can_have_trait('mind_states')).to.be.true;
    });

    it('get_archetypes walks full inheritance chain', () => {
      const mind = new Mind('test');
      const player = mind.add({
        label: 'player',
        bases: ['Person']
      });

      const archetype_labels = [...player.get_archetypes()].map(a => a.label);

      expect(archetype_labels).to.include('Person');
      expect(archetype_labels).to.include('Actor');
      expect(archetype_labels).to.include('Mental');
      expect(archetype_labels).to.include('ObjectPhysical');
    });

    it('throws error when archetype base does not exist', () => {
      DB.reset_registries();

      expect(() => {
        DB.register({
          BadArchetype: {
            bases: ['NonExistentBase'],
            traits: {}
          }
        }, {});
      }).to.throw('NonExistentBase');
    });
  });
});
