/**
 * Tests for object similarity and difference detection
 *
 * Stage 2 requirement: Compare compositional objects
 * - "Is this the same object" (identity)
 * - "What is different" (difference detection)
 */

import { expect } from 'chai'
import { Traittype, Belief, Materia, logos, logos_state } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'
import { setupStandardArchetypes } from './helpers.mjs'

describe('Similarity', function() {
  let world_state
  let hammer1, hammer2
  let hammer1_head, hammer2_head
  let hammer1_handle, hammer2_handle

  beforeEach(function() {
    DB.reset_registries()
    setupStandardArchetypes()

    // Register hammer-specific traittypes and archetypes
    DB.register({
      material: { type: 'string', exposure: 'visual' },
      length: { type: 'string', values: ['short', 'medium', 'long'], exposure: 'visual' },
      head: { type: 'HammerHead', exposure: 'visual' },
      handle: { type: 'HammerHandle', exposure: 'visual' },
    }, {
      HammerHead: {
        bases: ['ObjectPhysical'],
        traits: { material: null, color: null }
      },
      HammerHandle: {
        bases: ['ObjectPhysical'],
        traits: { material: null, color: null, length: null }
      },
      Hammer: {
        bases: ['PortableObject'],
        traits: { head: null, handle: null }
      },
    }, {})

    // Create world with two hammers
    const world_mind = new Materia(logos(), 'world')
    const state = world_mind.create_state(logos_state(), { tt: 1 })

    state.add_beliefs_from_template({
      workshop: { bases: ['Location'] },

      // Hammer 1: short brown handle
      hammer1_head: {
        bases: ['HammerHead'],
        traits: { material: 'iron', color: 'black' }
      },
      hammer1_handle: {
        bases: ['HammerHandle'],
        traits: { material: 'wood', color: 'brown', length: 'short' }
      },
      hammer1: {
        bases: ['Hammer'],
        traits: { head: 'hammer1_head', handle: 'hammer1_handle', location: 'workshop' }
      },

      // Hammer 2: long dark handle
      hammer2_head: {
        bases: ['HammerHead'],
        traits: { material: 'iron', color: 'black' }
      },
      hammer2_handle: {
        bases: ['HammerHandle'],
        traits: { material: 'wood', color: 'dark_brown', length: 'long' }
      },
      hammer2: {
        bases: ['Hammer'],
        traits: { head: 'hammer2_head', handle: 'hammer2_handle', location: 'workshop' }
      },
    })

    state.lock()
    world_state = state

    hammer1 = world_state.get_belief_by_label('hammer1')
    hammer2 = world_state.get_belief_by_label('hammer2')
    hammer1_head = world_state.get_belief_by_label('hammer1_head')
    hammer2_head = world_state.get_belief_by_label('hammer2_head')
    hammer1_handle = world_state.get_belief_by_label('hammer1_handle')
    hammer2_handle = world_state.get_belief_by_label('hammer2_handle')
  })

  describe('identity (is_same)', function() {
    it('should identify same belief as same', function() {
      expect(hammer1).to.equal(hammer1)
      expect(hammer1.subject).to.equal(hammer1.subject)
    })

    it('should identify different beliefs as different', function() {
      expect(hammer1).to.not.equal(hammer2)
      expect(hammer1.subject).to.not.equal(hammer2.subject)
    })

    it('should identify same parts as same', function() {
      expect(hammer1_head).to.equal(hammer1_head)
      expect(hammer1_handle).to.equal(hammer1_handle)
    })
  })

  describe('trait comparison', function() {
    it('should show hammer heads have same traits', function() {
      const t_material = Traittype.get_by_label('material')
      const t_color = Traittype.get_by_label('color')

      expect(hammer1_head.get_trait(world_state, t_material)).to.equal('iron')
      expect(hammer2_head.get_trait(world_state, t_material)).to.equal('iron')

      expect(hammer1_head.get_trait(world_state, t_color)).to.equal('black')
      expect(hammer2_head.get_trait(world_state, t_color)).to.equal('black')
    })

    it('should show hammer handles have different traits', function() {
      const t_color = Traittype.get_by_label('color')
      const t_length = Traittype.get_by_label('length')

      expect(hammer1_handle.get_trait(world_state, t_color)).to.equal('brown')
      expect(hammer2_handle.get_trait(world_state, t_color)).to.equal('dark_brown')

      expect(hammer1_handle.get_trait(world_state, t_length)).to.equal('short')
      expect(hammer2_handle.get_trait(world_state, t_length)).to.equal('long')
    })
  })

  describe('compositional structure', function() {
    it('should access parts through references', function() {
      const t_handle = Traittype.get_by_label('handle')
      const t_head = Traittype.get_by_label('head')

      // Get Subject references
      const h1_handle_ref = hammer1.get_trait(world_state, t_handle)
      const h1_head_ref = hammer1.get_trait(world_state, t_head)

      expect(h1_handle_ref).to.exist
      expect(h1_head_ref).to.exist

      // Resolve to beliefs
      const h1_handle_belief = world_state.get_belief_by_subject(h1_handle_ref)
      const h1_head_belief = world_state.get_belief_by_subject(h1_head_ref)

      expect(h1_handle_belief).to.equal(hammer1_handle)
      expect(h1_head_belief).to.equal(hammer1_head)
    })

    it('should traverse to nested traits', function() {
      const t_handle = Traittype.get_by_label('handle')
      const t_color = Traittype.get_by_label('color')

      // Get handle reference from hammer1
      const h1_handle_ref = hammer1.get_trait(world_state, t_handle)
      const h1_handle_belief = world_state.get_belief_by_subject(h1_handle_ref)

      // Get color from handle
      const handle_color = h1_handle_belief.get_trait(world_state, t_color)
      expect(handle_color).to.equal('brown')
    })
  })

  describe('similarity detection (is_similar)', function() {
    // TODO: Implement is_similar function
    it.skip('should detect similar heads', function() {
      // hammer1_head and hammer2_head have same material and color
      // is_similar(hammer1_head, hammer2_head, world_state) => true
    })

    it.skip('should detect dissimilar handles', function() {
      // hammer1_handle and hammer2_handle have different color and length
      // is_similar(hammer1_handle, hammer2_handle, world_state) => false
    })
  })

  describe('difference detection (get_differences)', function() {
    // TODO: Implement get_differences function
    it.skip('should return empty for identical traits', function() {
      // get_differences(hammer1_head, hammer2_head, world_state) => {}
    })

    it.skip('should return differing traits', function() {
      // get_differences(hammer1_handle, hammer2_handle, world_state) =>
      // { color: ['brown', 'dark_brown'], length: ['short', 'long'] }
    })

    it.skip('should detect deep differences through composition', function() {
      // get_differences(hammer1, hammer2, world_state) =>
      // { handle: { color: ['brown', 'dark_brown'], length: ['short', 'long'] } }
    })
  })
})
