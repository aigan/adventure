import { expect } from 'chai'
import { Belief, Traittype } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'
import { setupStandardArchetypes, createStateInNewMind, setupAfterEachValidation } from './helpers.mjs'

// Tests for belief.branch() and belief.replace() patterns
describe('Belief versioning: branch() and replace()', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()

    // Register compositional hammer archetypes
    DB.register({
      material: { type: 'string', exposure: 'visual' },
      head: { type: 'HammerHead', exposure: 'visual' },
      handle: { type: 'HammerHandle', exposure: 'visual' },
    }, {
      HammerHead: {
        bases: ['ObjectPhysical'],
        traits: { material: null, color: null }
      },
      HammerHandle: {
        bases: ['ObjectPhysical'],
        traits: { material: null, color: null }
      },
      Hammer: {
        bases: ['PortableObject'],
        traits: { head: null, handle: null }
      },
    }, {})
  })
  setupAfterEachValidation();


  describe('replace()', () => {
    it('creates new belief and removes old one from state', () => {
      const state = createStateInNewMind()

      const hammer = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red' },
        label: 'hammer'
      })

      const hammer_v2 = hammer.replace(state, { color: 'blue' })

      const color_tt = Traittype.get_by_label('color')

      // New belief has updated trait
      expect(hammer_v2.get_trait(state, color_tt)).to.equal('blue')

      // They share the same subject
      expect(hammer_v2.subject).to.equal(hammer.subject)

      // Old belief is removed from state
      const beliefs = [...state.get_beliefs()]
      expect(beliefs).to.have.lengthOf(1)
      expect(beliefs[0]).to.equal(hammer_v2)
    })

    it('works with locked belief in unlocked state', () => {
      const state1 = createStateInNewMind()

      const hammer = Belief.from_template(state1, {
        bases: ['PortableObject'],
        traits: { color: 'red' },
        label: 'hammer'
      })

      state1.lock()

      // Create new state
      const state2 = state1.branch(state1.ground_state, 2)

      // Can replace locked belief in new state
      const hammer_v2 = hammer.replace(state2, { color: 'blue' })

      const color_tt = Traittype.get_by_label('color')
      expect(hammer_v2.get_trait(state2, color_tt)).to.equal('blue')
    })

    it('fails when state is locked', () => {
      const state = createStateInNewMind()

      const hammer = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red' }
      })

      state.lock()

      expect(() => hammer.replace(state, { color: 'blue' }))
        .to.throw(/Cannot replace into locked state/)
    })
  })

  describe('branch()', () => {
    it('creates new belief while keeping old one in state', () => {
      const state = createStateInNewMind()

      const hammer = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red' },
        label: 'hammer'
      })

      const hammer_v2 = hammer.branch(state, { color: 'blue' })

      const color_tt = Traittype.get_by_label('color')

      // New belief has updated trait
      expect(hammer_v2.get_trait(state, color_tt)).to.equal('blue')

      // Old belief has original trait
      expect(hammer.get_trait(state, color_tt)).to.equal('red')

      // They share the same subject
      expect(hammer_v2.subject).to.equal(hammer.subject)

      // Both beliefs exist in state (superposition)
      const beliefs = [...state.get_beliefs()]
      expect(beliefs).to.have.lengthOf(2)
      expect(beliefs).to.include(hammer)
      expect(beliefs).to.include(hammer_v2)
    })

    it('allows multiple branches from same belief', () => {
      const state = createStateInNewMind()

      const hammer = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red' }
      })

      const hammer_blue = hammer.branch(state, { color: 'blue' })
      const hammer_green = hammer.branch(state, { color: 'green' })

      const color_tt = Traittype.get_by_label('color')

      // All three versions exist in state
      const beliefs = [...state.get_beliefs()]
      expect(beliefs).to.have.lengthOf(3)

      // Each has correct color
      expect(hammer.get_trait(state, color_tt)).to.equal('red')
      expect(hammer_blue.get_trait(state, color_tt)).to.equal('blue')
      expect(hammer_green.get_trait(state, color_tt)).to.equal('green')

      // All share same subject
      expect(hammer_blue.subject).to.equal(hammer.subject)
      expect(hammer_green.subject).to.equal(hammer.subject)
    })

    it('fails when state is locked', () => {
      const state = createStateInNewMind()

      const hammer = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red' }
      })

      state.lock()

      expect(() => hammer.branch(state, { color: 'blue' }))
        .to.throw(/Cannot branch into locked state/)
    })
  })

  describe('Compositional updates (head/handle)', () => {
    it('replace() updates hammer handle reference', () => {
      const state = createStateInNewMind()

      // Create hammer parts
      const old_handle = Belief.from_template(state, {
        bases: ['HammerHandle'],
        traits: { material: 'wood', color: 'brown' },
        label: 'old_handle'
      })

      const new_handle = Belief.from_template(state, {
        bases: ['HammerHandle'],
        traits: { material: 'oak', color: 'dark' },
        label: 'new_handle'
      })

      const head = Belief.from_template(state, {
        bases: ['HammerHead'],
        traits: { material: 'iron', color: 'black' },
        label: 'head'
      })

      // Create hammer with old handle
      const hammer = Belief.from_template(state, {
        bases: ['Hammer'],
        traits: { head: head.subject, handle: old_handle.subject },
        label: 'hammer'
      })

      // Replace hammer with new handle
      const hammer_v2 = hammer.replace(state, { handle: new_handle.subject })

      const handle_tt = Traittype.get_by_label('handle')

      // New hammer has new handle
      expect(hammer_v2.get_trait(state, handle_tt)).to.equal(new_handle.subject)

      // Old hammer no longer in state
      const beliefs = [...state.get_beliefs()]
      expect(beliefs).to.include(hammer_v2)
      expect(beliefs).to.not.include(hammer)

      // But old hammer still had old handle (immutable)
      expect(hammer.get_trait(state, handle_tt)).to.equal(old_handle.subject)
    })

    it('branch() creates multiple hammer versions with different parts', () => {
      const state = createStateInNewMind()

      // Create multiple handles
      const handle1 = Belief.from_template(state, {
        bases: ['HammerHandle'],
        traits: { material: 'wood', color: 'brown' }
      })

      const handle2 = Belief.from_template(state, {
        bases: ['HammerHandle'],
        traits: { material: 'oak', color: 'dark' }
      })

      const head = Belief.from_template(state, {
        bases: ['HammerHead'],
        traits: { material: 'iron', color: 'black' }
      })

      // Create base hammer
      const hammer = Belief.from_template(state, {
        bases: ['Hammer'],
        traits: { head: head.subject, handle: handle1.subject },
        label: 'hammer'
      })

      // Branch with different handle
      const hammer_alt = hammer.branch(state, { handle: handle2.subject })

      const handle_tt = Traittype.get_by_label('handle')

      // Both versions exist
      const beliefs = [...state.get_beliefs()]
      expect(beliefs).to.include(hammer)
      expect(beliefs).to.include(hammer_alt)

      // Each has correct handle
      expect(hammer.get_trait(state, handle_tt)).to.equal(handle1.subject)
      expect(hammer_alt.get_trait(state, handle_tt)).to.equal(handle2.subject)

      // Same subject (different versions)
      expect(hammer_alt.subject).to.equal(hammer.subject)
    })

    it('replace() works across state branches with compositional updates', () => {
      const state1 = createStateInNewMind()

      const head = Belief.from_template(state1, {
        bases: ['HammerHead'],
        traits: { material: 'iron', color: 'black' }
      })

      const handle1 = Belief.from_template(state1, {
        bases: ['HammerHandle'],
        traits: { material: 'wood', color: 'brown' }
      })

      const hammer = Belief.from_template(state1, {
        bases: ['Hammer'],
        traits: { head: head.subject, handle: handle1.subject }
      })

      state1.lock()

      // Branch state
      const state2 = state1.branch(state1.ground_state, 2)

      // Create new handle in state2
      const handle2 = Belief.from_template(state2, {
        bases: ['HammerHandle'],
        traits: { material: 'oak', color: 'dark' }
      })

      // Replace hammer with new handle
      const hammer_v2 = hammer.replace(state2, { handle: handle2.subject })

      const handle_tt = Traittype.get_by_label('handle')

      // State2 has new version with new handle
      expect(hammer_v2.get_trait(state2, handle_tt)).to.equal(handle2.subject)

      // State1 still has original hammer with original handle
      expect(hammer.get_trait(state1, handle_tt)).to.equal(handle1.subject)

      // State2 doesn't include old hammer
      const beliefs2 = [...state2.get_beliefs()]
      expect(beliefs2).to.include(hammer_v2)
      expect(beliefs2.map(b => b._id)).to.not.include(hammer._id)
    })

    it('branch() allows updating both head and handle', () => {
      const state = createStateInNewMind()

      const head1 = Belief.from_template(state, {
        bases: ['HammerHead'],
        traits: { material: 'iron', color: 'black' }
      })

      const head2 = Belief.from_template(state, {
        bases: ['HammerHead'],
        traits: { material: 'steel', color: 'silver' }
      })

      const handle1 = Belief.from_template(state, {
        bases: ['HammerHandle'],
        traits: { material: 'wood', color: 'brown' }
      })

      const handle2 = Belief.from_template(state, {
        bases: ['HammerHandle'],
        traits: { material: 'fiberglass', color: 'red' }
      })

      const hammer = Belief.from_template(state, {
        bases: ['Hammer'],
        traits: { head: head1.subject, handle: handle1.subject }
      })

      // Create variant with both parts changed
      const hammer_v2 = hammer.branch(state, {
        head: head2.subject,
        handle: handle2.subject
      })

      const head_tt = Traittype.get_by_label('head')
      const handle_tt = Traittype.get_by_label('handle')

      // Original unchanged
      expect(hammer.get_trait(state, head_tt)).to.equal(head1.subject)
      expect(hammer.get_trait(state, handle_tt)).to.equal(handle1.subject)

      // Variant has new parts
      expect(hammer_v2.get_trait(state, head_tt)).to.equal(head2.subject)
      expect(hammer_v2.get_trait(state, handle_tt)).to.equal(handle2.subject)

      // Both exist
      const beliefs = [...state.get_beliefs()]
      expect(beliefs).to.include(hammer)
      expect(beliefs).to.include(hammer_v2)
    })
  })
})
