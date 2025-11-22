import { expect } from 'chai'
import { setupStandardArchetypes, createMindWithBeliefs, get_first_belief_by_label } from './helpers.mjs'
import * as DB from '../public/worker/db.mjs'
import { Mind, TemporalMind, State, Belief, Archetype, logos } from '../public/worker/cosmos.mjs'
import { sysdesig } from '../public/worker/debug.mjs'


describe('sysdesig', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })

  describe('sysdesig() helper function', () => {
    it('calls obj.sysdesig(state) if method exists', () => {
      const mind = new TemporalMind(logos(), 'test')
      const result = sysdesig(null, mind)
      expect(result).to.be.a('string')
      expect(result).to.include('test')
      expect(result).to.include('Mind')
    })

    it('returns object as-is if no sysdesig method', () => {
      const plain = { foo: 'bar' }
      const result = sysdesig(null, plain)
      expect(result).to.deep.equal({ foo: 'bar' })
    })

    it('passes state to sysdesig method', () => {
      const state = createMindWithBeliefs('test', {
        hammer: { bases: ['PortableObject'] }
      })
      const hammer = get_first_belief_by_label('hammer')

      const result = sysdesig(state, hammer)
      expect(result).to.be.a('string')
      expect(result).to.include('#')
    })

    it('handles multiple arguments', () => {
      const mind1 = new TemporalMind(logos(), 'alice')
      const mind2 = new TemporalMind(logos(), 'bob')

      const result = sysdesig(null, mind1, mind2)
      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.be.a('string')
      expect(result[0]).to.include('alice')
      expect(result[1]).to.be.a('string')
      expect(result[1]).to.include('bob')
    })

    it('handles arrays by calling sysdesig on each element', () => {
      const mind1 = new TemporalMind(logos(), 'alice')
      const mind2 = new TemporalMind(logos(), 'bob')
      const arr = [mind1, mind2]

      const result = sysdesig(null, arr)
      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.be.a('string')
      expect(result[0]).to.include('alice')
      expect(result[1]).to.be.a('string')
      expect(result[1]).to.include('bob')
    })

    it('handles arrays with mixed types', () => {
      const mind = new TemporalMind(logos(), 'test')
      const arr = [mind, 42, 'hello', { foo: 'bar' }]

      const result = sysdesig(null, arr)
      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(4)
      expect(result[0]).to.be.a('string')
      expect(result[0]).to.include('test')
      expect(result[1]).to.equal(42)
      expect(result[2]).to.equal('hello')
      expect(result[3]).to.deep.equal({ foo: 'bar' })
    })

    it('handles nested arrays', () => {
      const mind1 = new TemporalMind(logos(), 'alice')
      const mind2 = new TemporalMind(logos(), 'bob')
      const arr = [[mind1], [mind2]]

      const result = sysdesig(null, arr)
      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.be.an('array')
      expect(result[0][0]).to.be.a('string')
      expect(result[0][0]).to.include('alice')
      expect(result[1][0]).to.be.a('string')
      expect(result[1][0]).to.include('bob')
    })

    it('handles plain objects by calling sysdesig on each value', () => {
      const mind1 = new TemporalMind(logos(), 'alice')
      const mind2 = new TemporalMind(logos(), 'bob')
      const obj = { a: mind1, b: mind2 }

      const result = sysdesig(null, obj)
      expect(result).to.be.an('object')
      expect(result.a).to.be.a('string')
      expect(result.a).to.include('alice')
      expect(result.b).to.be.a('string')
      expect(result.b).to.include('bob')
    })

    it('handles plain objects with mixed value types', () => {
      const mind = new TemporalMind(logos(), 'test')
      const obj = {
        mind: mind,
        number: 42,
        string: 'hello',
        nested: { foo: 'bar' }
      }

      const result = sysdesig(null, obj)
      expect(result).to.be.an('object')
      expect(result.mind).to.be.a('string')
      expect(result.mind).to.include('test')
      expect(result.number).to.equal(42)
      expect(result.string).to.equal('hello')
      expect(result.nested).to.deep.equal({ foo: 'bar' })
    })

    it('handles nested plain objects', () => {
      const mind1 = new TemporalMind(logos(), 'alice')
      const mind2 = new TemporalMind(logos(), 'bob')
      const obj = {
        level1: {
          level2: {
            a: mind1,
            b: mind2
          }
        }
      }

      const result = sysdesig(null, obj)
      expect(result).to.be.an('object')
      expect(result.level1.level2.a).to.be.a('string')
      expect(result.level1.level2.a).to.include('alice')
      expect(result.level1.level2.b).to.be.a('string')
      expect(result.level1.level2.b).to.include('bob')
    })

    it('passes arguments through arrays and objects', () => {
      const state = createMindWithBeliefs('test', {
        hammer: { bases: ['PortableObject'] },
        anvil: { bases: ['PortableObject'] }
      })
      const hammer = get_first_belief_by_label('hammer')
      const anvil = get_first_belief_by_label('anvil')

      const result = sysdesig(state, hammer, anvil)

      expect(result).to.be.an('array')
      expect(result[0]).to.be.a('string')
      expect(result[0]).to.include('hammer')
      expect(result[1]).to.be.a('string')
      expect(result[1]).to.include('anvil')
    })

    it('handles null and undefined', () => {
      expect(sysdesig(null, null)).to.be.null
      expect(sysdesig(null, undefined)).to.be.undefined
    })

    it('does not recurse into class instances without sysdesig', () => {
      class Custom {
        constructor() {
          this.value = 42
        }
      }
      const custom = new Custom()
      const result = sysdesig(null, custom)
      expect(result).to.equal(custom)
    })
  })

  describe('Mind.sysdesig()', () => {
    it('includes label and ID', () => {
      const mind = new TemporalMind(logos(), 'world')
      const result = mind.sysdesig()

      expect(result).to.include('world')
      expect(result).to.include('Mind#')
      expect(result).to.include(mind._id.toString())
    })

    it('shows parent info for child mind', () => {
      const parent = new TemporalMind(logos(), 'world')
      const child = new TemporalMind(parent, 'npc')
      const result = child.sysdesig()

      expect(result).to.include('npc')
      expect(result).to.include('child of world')
    })

    it('works without label', () => {
      const mind = new TemporalMind(logos())
      const result = mind.sysdesig()

      expect(result).to.include('Mind#')
      expect(result).to.include(mind._id.toString())
    })
  })

  describe('State.sysdesig()', () => {
    it('includes mind label, ID, and tt', () => {
      const mind = new TemporalMind(logos(), 'test')
      const state = mind.create_state(logos().origin_state, {tt: 42})
      const result = state.sysdesig()

      expect(result).to.include('test')
      expect(result).to.include('State#')
      expect(result).to.include('tt:42')
    })

    it('shows vt when different from tt', () => {
      const mind = new TemporalMind(logos(), 'test')
      const state1 = mind.create_state(logos().origin_state, {tt: 100})
      state1.lock()

      // Create state with explicit vt different from tt
      // vt must be set via State constructor directly
      const state2 = new State(mind, logos().origin_state, state1, {tt: 50, vt: 75})
      const result = state2.sysdesig()

      expect(result).to.include('tt:50')
      expect(result).to.include('vt:75')
    })

    it('does not show lock symbol for unlocked states', () => {
      const mind = new TemporalMind(logos(), 'test')
      const state = mind.create_state(logos().origin_state, {tt: 1})
      const result = state.sysdesig()

      expect(result).to.not.include('🔒')
      expect(result).to.not.include('🔓')
    })

    it('shows 🔒 for locked states', () => {
      const mind = new TemporalMind(logos(), 'test')
      const state = mind.create_state(logos().origin_state, {tt: 1})
      state.lock()
      const result = state.sysdesig()

      expect(result).to.include('🔒')
    })
  })

  describe('Belief.sysdesig()', () => {
    it('includes label, archetypes, and ID', () => {
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
      // Unlocked beliefs don't show lock symbol
      expect(result).to.not.include('🔒')
    })

    it('works without label', () => {
      const mind = new TemporalMind(logos(), 'test')
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

      const npc_mind = new TemporalMind(world_state.in_mind, 'npc')
      const npc_state = npc_mind.create_state(world_state)
      const knowledge = npc_state.learn_about(workshop, {traits: []})

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
      const mind = new TemporalMind(logos(), 'test')
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
      const mind = new TemporalMind(logos(), 'test')
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
