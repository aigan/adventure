/**
 * Tests for Archetype functionality
 *
 * MATRIX COVERAGE:
 * ✅ 1.6 Multi-Archetype Inheritance (Partial) - Person has multiple bases (line 43)
 * ⚠️  MISSING: Diamond archetype conflict - what happens when same trait appears in multiple paths?
 *
 * NON-MATRIX: Archetype composition, structure, validation (most of file)
 */

import { expect } from 'chai';
import { Mind, Materia, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import { A } from '../public/worker/archetype.mjs';
import { logos, logos_state } from '../public/worker/logos.mjs'
import * as DB from '../public/worker/db.mjs';
import { setupStandardArchetypes, createStateInNewMind } from './helpers.mjs';

describe('Archetype', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupStandardArchetypes();
  });

  describe('Archetype Composition', () => {
    it('single archetype has correct structure', () => {
      const state = createStateInNewMind('test', 1, logos());
      const workshop = Belief.from_template(state, {
        traits: {}, label: 'workshop',
        bases: ['Location']
      });

      const inspected = workshop.to_inspect_view(state);
      // Location inherits from ObjectPhysical, which inherits from Thing
      expect(inspected.archetypes).to.deep.equal(['Location', 'ObjectPhysical', 'Thing']);
    });

    it('archetype with base inherits traits from parent', () => {
      const state = createStateInNewMind();
      const hammer = Belief.from_template(state, {
        traits: {
          color: 'black'
        },
        label: 'hammer',
        bases: ['PortableObject']
      });

      // PortableObject → ObjectPhysical, so should have color trait
      const color_traittype = Traittype.get_by_label('color');
      const location_traittype = Traittype.get_by_label('location');
      expect(hammer.can_have_trait(color_traittype)).to.be.true;
      expect(hammer.can_have_trait(location_traittype)).to.be.true;
    });

    // Matrix 1.6: Multi-Archetype Inheritance (Partial - doesn't test conflict resolution)
    it('Person archetype inherits from multiple bases', () => {
      const state = createStateInNewMind();
      const player = Belief.from_template(state, {
        traits: {}, label: 'player',
        bases: ['Person']
      });

      const inspected = player.to_inspect_view(state);
      expect(inspected.archetypes).to.deep.equal(['Person', 'Actor', 'Mental', 'ObjectPhysical', 'Thing']);

      // Person → Actor → ObjectPhysical → Thing (has location, color)
      // Person → Mental (has mind)
      const location_traittype = Traittype.get_by_label('location');
      const mind_traittype = Traittype.get_by_label('mind');
      expect(player.can_have_trait(location_traittype)).to.be.true;
      expect(player.can_have_trait(mind_traittype)).to.be.true;
    });

    it('get_archetypes walks full inheritance chain', () => {
      const state = createStateInNewMind();
      const player = Belief.from_template(state, {
        traits: {}, label: 'player',
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
      const state = createStateInNewMind();
      const workshop = state.add_belief_from_template({
        bases: ['Location'],
        traits: { color: 'brown' },
        label: 'workshop'
      });

      const traittype = Traittype.get_by_label('location');
      const test_belief = Belief.from_template(state, {
        traits: {}, label: 'test',
        bases: ['ObjectPhysical']
      });

      const result = Archetype.resolve_trait_value_from_template(traittype, test_belief, 'workshop');

      expect(result).to.equal(workshop.subject);
    });

    it('returns Subject as-is', () => {
      const state = createStateInNewMind();
      const workshop = state.add_belief_from_template({
        bases: ['Location'],
        traits: {}, label: 'workshop'
      });

      const traittype = Traittype.get_by_label('location');
      const test_belief = Belief.from_template(state, {
        traits: {}, label: 'test',
        bases: ['ObjectPhysical']
      });

      const result = Archetype.resolve_trait_value_from_template(traittype, test_belief, workshop.subject);

      expect(result).to.equal(workshop.subject);
    });

    it('throws error when Belief object is passed', () => {
      const state = createStateInNewMind();
      const workshop = state.add_belief_from_template({
        bases: ['Location'],
        traits: {}, label: 'workshop'
      });

      const traittype = Traittype.get_by_label('location');
      const test_belief = Belief.from_template(state, {
        traits: {}, label: 'test',
        bases: ['ObjectPhysical']
      });

      expect(() => {
        Archetype.resolve_trait_value_from_template(traittype, test_belief, workshop);
      }).to.throw(/should use belief labels.*or Subject objects.*not Belief objects/);
    });

    it('throws error when belief label not found', () => {
      const state = createStateInNewMind();

      const traittype = Traittype.get_by_label('location');
      const test_belief = Belief.from_template(state, {
        traits: {}, label: 'test',
        bases: ['ObjectPhysical']
      });

      expect(() => {
        Archetype.resolve_trait_value_from_template(traittype, test_belief, 'nonexistent');
      }).to.throw(/Belief not found.*nonexistent/);
    });

    it('throws error when belief has wrong archetype', () => {
      const state = createStateInNewMind();
      const hammer = state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: {}, label: 'hammer'
      });

      const traittype = Traittype.get_by_label('location');
      const test_belief = Belief.from_template(state, {
        traits: {}, label: 'test',
        bases: ['ObjectPhysical']
      });

      expect(() => {
        Archetype.resolve_trait_value_from_template(traittype, test_belief, 'hammer');
      }).to.throw(/does not have required archetype 'Location'/);
    });

    it('works in trait resolution during from_template', () => {
      const state = createStateInNewMind();
      const workshop = state.add_belief_from_template({
        bases: ['Location'],
        traits: {}, label: 'workshop'
      });

      // This uses the traittype resolver which delegates to Archetype
      const hammer = Belief.from_template(state, {
        traits: {
          location: 'workshop'
        },
        label: 'hammer',
        bases: ['PortableObject']
      });

      const location_traittype = Traittype.get_by_label('location');
      expect(hammer.get_trait(state, location_traittype)).to.equal(workshop.subject);
    });
  });

  describe('A proxy', () => {
    it('provides convenient archetype access', () => {
      const archetype = A.PortableObject
      expect(archetype).to.be.instanceof(Archetype)
      expect(archetype.label).to.equal('PortableObject')
    })

    it('matches Archetype.get_by_label()', () => {
      expect(A.PortableObject).to.equal(Archetype.get_by_label('PortableObject'))
      expect(A.Location).to.equal(Archetype.get_by_label('Location'))
      expect(A.Actor).to.equal(Archetype.get_by_label('Actor'))
    })

    it('returns undefined for non-existent archetypes', () => {
      expect(A.NonExistentArchetype).to.be.undefined
    })

    it('works with Belief.from()', () => {
      const state = createStateInNewMind()
      const workshop = Belief.from(state, [A.Location], {})
      state.insert_beliefs(workshop)

      const archetypes = [...workshop.get_archetypes()].map(a => a.label)
      expect(archetypes).to.include('Location')
    })
  })
});
