import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { setupStandardArchetypes } from './helpers.mjs';

const logos = () => DB.get_logos_mind();

describe('Archetype', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupStandardArchetypes();
  });

  describe('Archetype Composition', () => {
    it('single archetype has correct structure', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1);
      const workshop = Belief.from_template(state, {
        traits: {'@label': 'workshop'},
        bases: ['Location']
      });

      const inspected = workshop.to_inspect_view(state);
      // Location inherits from ObjectPhysical, which inherits from Thing
      expect(inspected.archetypes).to.deep.equal(['Location', 'ObjectPhysical', 'Thing']);
    });

    it('archetype with base inherits traits from parent', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1);
      const hammer = Belief.from_template(state, {
        traits: {
          '@label': 'hammer',
          color: 'black'
        },
        bases: ['PortableObject']
      });

      // PortableObject → ObjectPhysical, so should have color trait
      expect(hammer.can_have_trait('color')).to.be.true;
      expect(hammer.can_have_trait('location')).to.be.true;
    });

    it('Person archetype inherits from multiple bases', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1);
      const player = Belief.from_template(state, {
        traits: {'@label': 'player'},
        bases: ['Person']
      });

      const inspected = player.to_inspect_view(state);
      expect(inspected.archetypes).to.deep.equal(['Person', 'Actor', 'Mental', 'ObjectPhysical', 'Thing']);

      // Person → Actor → ObjectPhysical → Thing (has location, color)
      // Person → Mental (has mind)
      expect(player.can_have_trait('location')).to.be.true;
      expect(player.can_have_trait('mind')).to.be.true;
    });

    it('get_archetypes walks full inheritance chain', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1);
      const player = Belief.from_template(state, {
        traits: {'@label': 'player'},
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
        DB.register({}, {
          BadArchetype: {
            bases: ['NonExistentBase'],
            traits: {}
          }
        }, {});
      }).to.throw('NonExistentBase');
    });
  });

  describe('resolve_trait_value_from_template', () => {
    it('resolves string label to subject', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1);
      const workshop = state.add_belief_from_template({
        bases: ['Location'],
        traits: { '@label': 'workshop', color: 'brown' }
      });

      const traittype = Traittype.get_by_label('location');
      const test_belief = Belief.from_template(state, {
        traits: {'@label': 'test'},
        bases: ['ObjectPhysical']
      });

      const result = Archetype.resolve_trait_value_from_template(traittype, test_belief, 'workshop');

      expect(result).to.equal(workshop.subject);
    });

    it('returns Subject as-is', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1);
      const workshop = state.add_belief_from_template({
        bases: ['Location'],
        traits: {'@label': 'workshop'}
      });

      const traittype = Traittype.get_by_label('location');
      const test_belief = Belief.from_template(state, {
        traits: {'@label': 'test'},
        bases: ['ObjectPhysical']
      });

      const result = Archetype.resolve_trait_value_from_template(traittype, test_belief, workshop.subject);

      expect(result).to.equal(workshop.subject);
    });

    it('throws error when Belief object is passed', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1);
      const workshop = state.add_belief_from_template({
        bases: ['Location'],
        traits: {'@label': 'workshop'}
      });

      const traittype = Traittype.get_by_label('location');
      const test_belief = Belief.from_template(state, {
        traits: {'@label': 'test'},
        bases: ['ObjectPhysical']
      });

      expect(() => {
        Archetype.resolve_trait_value_from_template(traittype, test_belief, workshop);
      }).to.throw(/should use belief labels.*or Subject objects.*not Belief objects/);
    });

    it('throws error when belief label not found', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1);

      const traittype = Traittype.get_by_label('location');
      const test_belief = Belief.from_template(state, {
        traits: {'@label': 'test'},
        bases: ['ObjectPhysical']
      });

      expect(() => {
        Archetype.resolve_trait_value_from_template(traittype, test_belief, 'nonexistent');
      }).to.throw(/Belief not found.*nonexistent/);
    });

    it('throws error when belief has wrong archetype', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1);
      const hammer = state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: {'@label': 'hammer'}
      });

      const traittype = Traittype.get_by_label('location');
      const test_belief = Belief.from_template(state, {
        traits: {'@label': 'test'},
        bases: ['ObjectPhysical']
      });

      expect(() => {
        Archetype.resolve_trait_value_from_template(traittype, test_belief, 'hammer');
      }).to.throw(/does not have required archetype 'Location'/);
    });

    it('works in trait resolution during from_template', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1);
      const workshop = state.add_belief_from_template({
        bases: ['Location'],
        traits: {'@label': 'workshop'}
      });

      // This uses the traittype resolver which delegates to Archetype
      const hammer = Belief.from_template(state, {
        traits: {
          '@label': 'hammer',
          location: 'workshop'
        },
        bases: ['PortableObject']
      });

      expect(hammer.get_trait(state, 'location')).to.equal(workshop.subject);
    });
  });
});
