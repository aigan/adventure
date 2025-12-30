import { expect } from 'chai'
import { Fuzzy, unknown, _reset_unknown } from '../public/worker/fuzzy.mjs'
import { deserialize_reference } from '../public/worker/serialize.mjs'

describe('Fuzzy', () => {
  beforeEach(() => {
    _reset_unknown()
  })

  describe('construction', () => {
    it('creates Fuzzy with empty alternatives', () => {
      const f = new Fuzzy()
      expect(f.alternatives).to.deep.equal([])
      expect(f.is_unknown).to.be.true
    })

    it('creates Fuzzy with alternatives', () => {
      const f = new Fuzzy({
        alternatives: [
          { value: 'north', certainty: 0.6 },
          { value: 'east', certainty: 0.4 }
        ]
      })
      expect(f.alternatives).to.have.length(2)
      expect(f.is_unknown).to.be.false
    })

    it('freezes alternatives array', () => {
      const f = new Fuzzy({
        alternatives: [{ value: 'north', certainty: 1 }]
      })
      expect(Object.isFrozen(f.alternatives)).to.be.true
    })

    it('freezes instance', () => {
      const f = new Fuzzy()
      expect(Object.isFrozen(f)).to.be.true
    })
  })

  describe('unknown() singleton', () => {
    it('returns same instance on multiple calls', () => {
      const a = unknown()
      const b = unknown()
      expect(a).to.equal(b)
    })

    it('is a Fuzzy instance', () => {
      expect(unknown()).to.be.instanceOf(Fuzzy)
    })

    it('has empty alternatives', () => {
      expect(unknown().alternatives).to.deep.equal([])
    })

    it('is_unknown is true', () => {
      expect(unknown().is_unknown).to.be.true
    })

    it('resets with _reset_unknown', () => {
      const a = unknown()
      _reset_unknown()
      const b = unknown()
      expect(a).to.not.equal(b)
    })
  })

  describe('toJSON', () => {
    it('serializes unknown()', () => {
      const json = unknown().toJSON()
      expect(json).to.deep.equal({
        _type: 'Fuzzy',
        alternatives: []
      })
    })

    it('serializes Fuzzy with alternatives', () => {
      const f = new Fuzzy({
        alternatives: [
          { value: 'north', certainty: 0.6 },
          { value: 'east', certainty: 0.4 }
        ]
      })
      const json = f.toJSON()
      expect(json._type).to.equal('Fuzzy')
      expect(json.alternatives).to.have.length(2)
      expect(json.alternatives[0]).to.deep.equal({ value: 'north', certainty: 0.6 })
    })
  })

  describe('to_inspect_view', () => {
    it('returns unknown marker for unknown()', () => {
      const view = unknown().to_inspect_view(null)
      expect(view).to.deep.equal({
        _type: 'Fuzzy',
        unknown: true
      })
    })

    it('converts alternatives with primitive values', () => {
      const f = new Fuzzy({
        alternatives: [
          { value: 'north', certainty: 0.6 },
          { value: 'east', certainty: 0.4 }
        ]
      })
      const view = f.to_inspect_view(null)
      expect(view._type).to.equal('Fuzzy')
      expect(view.alternatives).to.deep.equal([
        { value: 'north', certainty: 0.6 },
        { value: 'east', certainty: 0.4 }
      ])
    })

    it('calls to_inspect_view on nested values', () => {
      const nested = {
        to_inspect_view: () => ({ _type: 'Subject', sid: 42 })
      }
      const f = new Fuzzy({
        alternatives: [{ value: nested, certainty: 1.0 }]
      })
      const view = f.to_inspect_view(null)
      expect(view.alternatives[0].value).to.deep.equal({ _type: 'Subject', sid: 42 })
    })
  })

  describe('sysdesig', () => {
    it('returns unknown() for singleton', () => {
      expect(unknown().sysdesig()).to.equal('unknown()')
    })

    it('returns Fuzzy[n] for alternatives', () => {
      const f = new Fuzzy({
        alternatives: [
          { value: 'a', certainty: 0.5 },
          { value: 'b', certainty: 0.5 }
        ]
      })
      expect(f.sysdesig()).to.equal('Fuzzy[2]')
    })
  })

  describe('is_certain static method', () => {
    it('returns false for Fuzzy instance', () => {
      expect(Fuzzy.is_certain(null, unknown())).to.be.false
      expect(Fuzzy.is_certain(null, new Fuzzy({ alternatives: [] }))).to.be.false
    })

    it('returns true for non-Fuzzy values', () => {
      expect(Fuzzy.is_certain(null, 'hello')).to.be.true
      expect(Fuzzy.is_certain(null, 42)).to.be.true
      expect(Fuzzy.is_certain(null, null)).to.be.true
      expect(Fuzzy.is_certain(null, {})).to.be.true
    })
  })

  describe('serialization round-trip', () => {
    it('deserializes unknown() to singleton', () => {
      const json = { _type: 'Fuzzy', alternatives: [] }
      const result = deserialize_reference(json)
      expect(result).to.equal(unknown())
    })

    it('deserializes unknown marker to singleton', () => {
      const json = { _type: 'Fuzzy', unknown: true }
      const result = deserialize_reference(json)
      expect(result).to.equal(unknown())
    })

    it('deserializes Fuzzy with alternatives', () => {
      const json = {
        _type: 'Fuzzy',
        alternatives: [
          { value: 'north', certainty: 0.6 },
          { value: 'east', certainty: 0.4 }
        ]
      }
      const result = deserialize_reference(json)
      expect(result).to.be.instanceOf(Fuzzy)
      expect(result).to.not.equal(unknown())
      expect(result.alternatives).to.have.length(2)
      expect(result.alternatives[0]).to.deep.equal({ value: 'north', certainty: 0.6 })
    })

    it('round-trips unknown()', () => {
      const original = unknown()
      const json = original.toJSON()
      const restored = deserialize_reference(json)
      expect(restored).to.equal(unknown())
      expect(restored.is_unknown).to.be.true
    })

    it('round-trips Fuzzy with alternatives', () => {
      const original = new Fuzzy({
        alternatives: [
          { value: 42, certainty: 0.7 },
          { value: 13, certainty: 0.3 }
        ]
      })
      const json = original.toJSON()
      const restored = deserialize_reference(json)
      expect(restored).to.be.instanceOf(Fuzzy)
      expect(restored.is_unknown).to.be.false
      expect(restored.alternatives).to.deep.equal(original.alternatives)
    })
  })
})
