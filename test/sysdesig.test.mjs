import { expect } from 'chai'
import { setupStandardArchetypes, createMindWithBeliefs, get_first_belief_by_label } from './helpers.mjs'
import * as DB from '../public/worker/db.mjs'
import { Mind } from '../public/worker/mind.mjs'
import { State } from '../public/worker/state.mjs'
import { Belief } from '../public/worker/belief.mjs'
import { Archetype } from '../public/worker/archetype.mjs'
import { sysdesig } from '../public/lib/debug.mjs'
import { logos } from '../public/worker/cosmos.mjs';


describe('sysdesig', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })

  describe('sysdesig() helper function', () => {
    it('calls obj.sysdesig() if method exists', () => {
      const mind = new Mind(logos(), 'test')
      const result = sysdesig(mind)
      expect(result).to.be.a('string')
      expect(result).to.include('test')
      expect(result).to.include('Mind')
    })

    it('returns object as-is if no sysdesig method', () => {
      const plain = { foo: 'bar' }
      const result = sysdesig(plain)
      expect(result).to.equal(plain)
    })

    it('passes additional arguments to sysdesig method', () => {
      const state = createMindWithBeliefs('test', {
        hammer: { bases: ['PortableObject'] }
      })
      const hammer = get_first_belief_by_label('hammer')

      const result = sysdesig(hammer, state)
      expect(result).to.be.a('string')
      expect(result).to.include('#')
    })
  })

  describe('Mind.sysdesig()', () => {
    it('includes label and ID', () => {
      const mind = new Mind(logos(), 'world')
      const result = mind.sysdesig()

      expect(result).to.include('world')
      expect(result).to.include('Mind#')
      expect(result).to.include(mind._id.toString())
    })

    it('shows parent info for child mind', () => {
      const parent = new Mind(logos(), 'world')
      const child = new Mind(parent, 'npc')
      const result = child.sysdesig()

      expect(result).to.include('npc')
      expect(result).to.include('child of world')
    })

    it('works without label', () => {
      const mind = new Mind(logos())
      const result = mind.sysdesig()

      expect(result).to.include('Mind#')
      expect(result).to.include(mind._id.toString())
    })
  })

  describe('State.sysdesig()', () => {
    it('includes mind label, ID, and tt', () => {
      const mind = new Mind(logos(), 'test')
      const state = mind.create_state(logos().origin_state, {tt: 42})
      const result = state.sysdesig()

      expect(result).to.include('test')
      expect(result).to.include('State#')
      expect(result).to.include('tt:42')
    })

    it('shows vt when different from tt', () => {
      const mind = new Mind(logos(), 'test')
      const state1 = mind.create_state(logos().origin_state, {tt: 100})
      state1.lock()

      // Create state with explicit vt different from tt
      // vt must be set via State constructor directly
      const state2 = new State(mind, logos().origin_state, state1, {tt: 50, vt: 75})
      const result = state2.sysdesig()

      expect(result).to.include('tt:50')
      expect(result).to.include('vt:75')
    })

    it('shows 🔓 for unlocked states', () => {
      const mind = new Mind(logos(), 'test')
      const state = mind.create_state(logos().origin_state, {tt: 1})
      const result = state.sysdesig()

      expect(result).to.include('🔓')
    })

    it('shows 🔒 for locked states', () => {
      const mind = new Mind(logos(), 'test')
      const state = mind.create_state(logos().origin_state, {tt: 1})
      state.lock()
      const result = state.sysdesig()

      expect(result).to.include('🔒')
    })
  })

  describe('Belief.sysdesig()', () => {
    it('includes label, archetypes, ID, and lock status', () => {
      const state = createMindWithBeliefs('test', {
        hammer: {
          bases: ['PortableObject'],
          traits: { color: 'brown' }
        }
      })
      const hammer = get_first_belief_by_label('hammer')
      const result = hammer.sysdesig(state)

      expect(result).to.include('hammer')
      expect(result).to.include('[PortableObject]')
      expect(result).to.include(`#${hammer._id}`)
      expect(result).to.include('🔓')
    })

    it('works without label', () => {
      const mind = new Mind(logos(), 'test')
      const state = mind.create_state(logos().origin_state, {tt: 1})
      const belief = Belief.from_template(state, {
        bases: ['Location']
      })
      const result = belief.sysdesig(state)

      expect(result).to.include('[Location]')
      expect(result).to.include(`#${belief._id}`)
    })

    it('shows @about when belief is about something', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: { bases: ['Location'] }
      })
      const workshop = get_first_belief_by_label('workshop')

      const npc_mind = new Mind(world_state.in_mind, 'npc')
      const npc_state = npc_mind.create_state(world_state)
      const knowledge = npc_state.learn_about(workshop, [])

      const result = knowledge.sysdesig(npc_state)
      expect(result).to.include('about workshop')
    })

    it('shows 🔒 for locked belief', () => {
      const state = createMindWithBeliefs('test', {
        hammer: { bases: ['PortableObject'] }
      })
      const hammer = get_first_belief_by_label('hammer')
      hammer.lock()
      const result = hammer.sysdesig(state)

      expect(result).to.include('🔒')
    })
  })

  describe('Subject.sysdesig()', () => {
    it('includes label, sid, and ground_mind', () => {
      const state = createMindWithBeliefs('test', {
        hammer: { bases: ['PortableObject'] }
      })
      const hammer = get_first_belief_by_label('hammer')
      const subject = hammer.subject
      const result = subject.sysdesig()

      expect(result).to.include('hammer')
      expect(result).to.include(`sid=${subject.sid}`)
      expect(result).to.include('@')
    })

    it('shows @logos for subjects scoped to logos', () => {
      const mind = new Mind(logos(), 'test')
      const state = mind.create_state(logos().origin_state, {tt: 1})
      const belief = Belief.from_template(state, {
        bases: ['Location']
      })
      const subject = belief.subject
      const result = subject.sysdesig()

      // Subject's ground_mind is logos (parent of 'test' mind)
      expect(result).to.include('@logos')
    })

    it('works without label', () => {
      const mind = new Mind(logos(), 'test')
      const state = mind.create_state(logos().origin_state, {tt: 1})
      const belief = Belief.from_template(state, {
        bases: ['Location']
      })
      const subject = belief.subject
      const result = subject.sysdesig()

      expect(result).to.include('Subject')
      expect(result).to.include(`sid=${subject.sid}`)
    })
  })

  describe('Archetype.sysdesig()', () => {
    it('includes label and bases', () => {
      const archetype = Archetype.get_by_label('PortableObject')
      const result = archetype.sysdesig()

      expect(result).to.include('Archetype PortableObject')
      expect(result).to.include('bases: ObjectPhysical')
    })

    it('works for archetype without bases', () => {
      const archetype = Archetype.get_by_label('Thing')
      const result = archetype.sysdesig()

      expect(result).to.equal('Archetype Thing')
    })
  })
})
