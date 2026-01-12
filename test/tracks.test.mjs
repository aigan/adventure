/**
 * Timeline Inheritance (tracks) Tests - Phase 5a
 *
 * Tests overlay semantics where local beliefs win by subject,
 * and unhandled subjects fall through to tracks.
 */

import { describe, it, beforeEach } from 'mocha'
import { expect } from 'chai'
import { setupStandardArchetypes, setupAfterEachValidation } from './helpers.mjs'
import { Belief, Traittype, DB, Materia, logos, logos_state, save_mind, load, Temporal } from '../public/worker/cosmos.mjs'

describe('Timeline Inheritance (tracks)', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })
  setupAfterEachValidation()

  // ============================================
  // BASIC OVERLAY SEMANTICS
  // ============================================

  describe('Basic overlay semantics', () => {
    it('TRACKS-1: local insert overrides tracked belief for same subject', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      // Core timeline with red hammer
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: { color: 'red' } }
      })
      core_1.lock()

      // Alt timeline with tracks, overrides hammer to blue
      const alt_1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      const hammer_in_core = core_1.get_belief_by_label('hammer')
      hammer_in_core.replace(alt_1, { color: 'blue' })
      alt_1.lock()

      // Query via get_beliefs (now includes tracks)
      const beliefs = [...alt_1.get_beliefs()]
      const hammer = beliefs.find(b => b.get_label() === 'hammer')

      expect(hammer).to.exist
      expect(hammer.get_trait(alt_1, t_color)).to.equal('blue')
    })

    it('TRACKS-2: unhandled subjects fall through to tracks', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      // Core has hammer and anvil
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: { color: 'red' } },
        anvil: { bases: ['ObjectPhysical'], traits: { color: 'black' } }
      })
      core_1.lock()

      // Alt only overrides hammer
      const alt_1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      const hammer_in_core = core_1.get_belief_by_label('hammer')
      hammer_in_core.replace(alt_1, { color: 'blue' })
      alt_1.lock()

      const beliefs = [...alt_1.get_beliefs()]
      const labels = beliefs.map(b => b.get_label()).filter(l => l)

      expect(labels).to.include('hammer')
      expect(labels).to.include('anvil')

      const hammer = beliefs.find(b => b.get_label() === 'hammer')
      const anvil = beliefs.find(b => b.get_label() === 'anvil')

      expect(hammer.get_trait(alt_1, t_color)).to.equal('blue')
      expect(anvil.get_trait(core_1, t_color)).to.equal('black')
    })

    it('TRACKS-3: local remove blocks tracked belief', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: { color: 'red' } }
      })
      const hammer_in_core = core_1.get_belief_by_label('hammer')
      core_1.lock()

      // Alt removes hammer
      const alt_1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      alt_1.remove_beliefs(hammer_in_core)
      alt_1.lock()

      const beliefs = [...alt_1.get_beliefs()]
      const labels = beliefs.map(b => b.get_label()).filter(l => l)

      expect(labels).to.not.include('hammer')
    })

    it('TRACKS-4: theory adds hypothetical beliefs alongside tracked', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // Core: observed facts
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        suspect_a: { bases: ['Person'], traits: {} },
        evidence_1: { bases: ['ObjectPhysical'], traits: { color: 'red' } }
      })
      core_1.lock()

      // Theory: hypothetical scenario tracking core
      const theory_1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      theory_1.add_beliefs_from_template({
        guilt_belief: { bases: ['Thing'], traits: {} }
      })
      theory_1.lock()

      const beliefs = [...theory_1.get_beliefs()]
      const labels = beliefs.map(b => b.get_label()).filter(l => l)

      expect(labels).to.include('suspect_a')
      expect(labels).to.include('evidence_1')
      expect(labels).to.include('guilt_belief')
    })
  })

  // ============================================
  // TIMELINE CONTINUATION WITH TRACKS
  // ============================================

  describe('Timeline continuation with tracks', () => {
    it('tracking timeline can have multiple states with base chain', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      // Core: c1(vt=1) → c2(vt=2)
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: { color: 'red' } }
      })
      core_1.lock()

      const core_2 = core_1.branch(ground, 2)
      core_2.add_beliefs_from_template({
        anvil: { bases: ['ObjectPhysical'], traits: { color: 'black' } }
      })
      core_2.lock()

      // Theory: t1(vt=1, tracks=c1) → t2(vt=2, tracks=c2, base=t1)
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      t1.add_beliefs_from_template({
        sword: { bases: ['ObjectPhysical'], traits: { color: 'silver' } }
      })
      t1.lock()

      const t2 = new Temporal(mind, ground, t1, { tt: 2, tracks: core_2 })
      t2.add_beliefs_from_template({
        shield: { bases: ['ObjectPhysical'], traits: { color: 'gold' } }
      })
      t2.lock()

      // t2 should see: shield (local), sword (from t1 base), hammer+anvil (from tracks)
      const beliefs = [...t2.get_beliefs()]
      const labels = beliefs.map(b => b.get_label()).filter(l => l)

      expect(labels).to.include('shield')
      expect(labels).to.include('sword')
      expect(labels).to.include('hammer')
      expect(labels).to.include('anvil')
    })

    it('branch() auto-updates tracks to latest locked state', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // Core: c1(vt=1, locked) → c2(vt=2, locked)
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.lock()

      const core_2 = core_1.branch(ground, 2)
      core_2.lock()

      // Theory: t1(vt=1, tracks=c1)
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      t1.lock()

      // t2 = t1.branch(ground, 2) - should auto-update tracks to c2
      const t2 = t1.branch(ground, 2)
      t2.lock()

      expect(t2.tracks).to.equal(core_2)
    })

    it('branch() keeps same tracks if no later locked state exists', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // Core: c1(vt=1, locked) → c2(vt=2, unlocked)
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.lock()

      const core_2 = core_1.branch(ground, 2)
      // c2 is NOT locked

      // Theory: t1(vt=1, tracks=c1)
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      t1.lock()

      // t2 = t1.branch(ground, 2) - should keep tracks=c1 since c2 is unlocked
      const t2 = t1.branch(ground, 2)

      expect(t2.tracks).to.equal(core_1)
    })

    it('branch() respects vt constraint when finding tracks', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // Core: c1(vt=1) → c2(vt=3) → c3(vt=5)
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.lock()

      const core_2 = core_1.branch(ground, 3)
      core_2.lock()

      const core_3 = core_2.branch(ground, 5)
      core_3.lock()

      // Theory: t1(vt=1, tracks=c1)
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      t1.lock()

      // t2 = t1.branch(ground, 4) - should get tracks=c2 (c3.vt=5 > 4)
      const t2 = t1.branch(ground, 4)

      expect(t2.tracks).to.equal(core_2)
    })

    it('theory state inherits beliefs from both base chain and tracks', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // Core: c1 has hammer
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: {} }
      })
      core_1.lock()

      // Theory: t1(tracks=c1) adds anvil
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      t1.add_beliefs_from_template({
        anvil: { bases: ['ObjectPhysical'], traits: {} }
      })
      t1.lock()

      // t2(base=t1, tracks=c1) adds sword
      const t2 = new Temporal(mind, ground, t1, { tt: 2, tracks: core_1 })
      t2.add_beliefs_from_template({
        sword: { bases: ['ObjectPhysical'], traits: {} }
      })
      t2.lock()

      // t2 should see: sword (local) + anvil (from base t1) + hammer (from tracks)
      const beliefs = [...t2.get_beliefs()]
      const labels = beliefs.map(b => b.get_label()).filter(l => l)

      expect(labels).to.include('sword')
      expect(labels).to.include('anvil')
      expect(labels).to.include('hammer')
    })
  })

  // ============================================
  // CHAINED TRACKS (3+ levels)
  // ============================================

  describe('Chained tracks', () => {
    it('follows 3-level chain: Theory2 tracks Theory1 tracks Core', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // Core: c1 has hammer
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: {} }
      })
      core_1.lock()

      // Theory1: t1_1 tracks c1, adds anvil
      const t1_1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      t1_1.add_beliefs_from_template({
        anvil: { bases: ['ObjectPhysical'], traits: {} }
      })
      t1_1.lock()

      // Theory2: t2_1 tracks t1_1, adds sword
      const t2_1 = new Temporal(mind, ground, null, { tt: 1, tracks: t1_1 })
      t2_1.add_beliefs_from_template({
        sword: { bases: ['ObjectPhysical'], traits: {} }
      })
      t2_1.lock()

      // t2_1 should see: sword, anvil, hammer
      const beliefs = [...t2_1.get_beliefs()]
      const labels = beliefs.map(b => b.get_label()).filter(l => l)

      expect(labels).to.include('sword')
      expect(labels).to.include('anvil')
      expect(labels).to.include('hammer')
    })

    it('override in middle of chain blocks further inheritance', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      // Core: c1 has hammer(red)
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: { color: 'red' } }
      })
      core_1.lock()

      // Theory1: t1_1 tracks c1, overrides hammer(blue)
      const t1_1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      const hammer_in_core = core_1.get_belief_by_label('hammer')
      hammer_in_core.replace(t1_1, { color: 'blue' })
      t1_1.lock()

      // Theory2: t2_1 tracks t1_1
      const t2_1 = new Temporal(mind, ground, null, { tt: 1, tracks: t1_1 })
      t2_1.lock()

      // t2_1 should see hammer(blue), not hammer(red)
      const beliefs = [...t2_1.get_beliefs()]
      const hammer = beliefs.find(b => b.get_label() === 'hammer')

      expect(hammer).to.exist
      expect(hammer.get_trait(t1_1, t_color)).to.equal('blue')
    })

    it('removal in middle of chain blocks further inheritance', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // Core: c1 has hammer
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: {} }
      })
      core_1.lock()

      // Theory1: t1_1 tracks c1, removes hammer
      const t1_1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      const hammer_in_core = core_1.get_belief_by_label('hammer')
      t1_1.remove_beliefs(hammer_in_core)
      t1_1.lock()

      // Theory2: t2_1 tracks t1_1
      const t2_1 = new Temporal(mind, ground, null, { tt: 1, tracks: t1_1 })
      t2_1.lock()

      // t2_1 should NOT see hammer
      const beliefs = [...t2_1.get_beliefs()]
      const labels = beliefs.map(b => b.get_label()).filter(l => l)

      expect(labels).to.not.include('hammer')
    })

    it('4-level chain works correctly', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // Core → Theory1 → Theory2 → Theory3
      // Each adds unique belief
      const core = mind.create_state(ground, { tt: 1 })
      core.add_beliefs_from_template({ obj_core: { bases: ['ObjectPhysical'], traits: {} } })
      core.lock()

      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core })
      t1.add_beliefs_from_template({ obj_t1: { bases: ['ObjectPhysical'], traits: {} } })
      t1.lock()

      const t2 = new Temporal(mind, ground, null, { tt: 1, tracks: t1 })
      t2.add_beliefs_from_template({ obj_t2: { bases: ['ObjectPhysical'], traits: {} } })
      t2.lock()

      const t3 = new Temporal(mind, ground, null, { tt: 1, tracks: t2 })
      t3.add_beliefs_from_template({ obj_t3: { bases: ['ObjectPhysical'], traits: {} } })
      t3.lock()

      const beliefs = [...t3.get_beliefs()]
      const labels = beliefs.map(b => b.get_label()).filter(l => l)

      expect(labels).to.include('obj_core')
      expect(labels).to.include('obj_t1')
      expect(labels).to.include('obj_t2')
      expect(labels).to.include('obj_t3')
    })

    it('partial override in chain - some subjects shadowed, others pass through', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      // Core: hammer(red), anvil(black)
      const core = mind.create_state(ground, { tt: 1 })
      core.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: { color: 'red' } },
        anvil: { bases: ['ObjectPhysical'], traits: { color: 'black' } }
      })
      core.lock()

      // Theory1 tracks Core, overrides hammer(blue)
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core })
      const hammer_in_core = core.get_belief_by_label('hammer')
      hammer_in_core.replace(t1, { color: 'blue' })
      t1.lock()

      // Theory2 tracks Theory1, overrides anvil(white)
      const t2 = new Temporal(mind, ground, null, { tt: 1, tracks: t1 })
      const anvil_in_t1 = t1.get_belief_by_label('anvil')
      anvil_in_t1.replace(t2, { color: 'white' })
      t2.lock()

      const beliefs = [...t2.get_beliefs()]
      const hammer = beliefs.find(b => b.get_label() === 'hammer')
      const anvil = beliefs.find(b => b.get_label() === 'anvil')

      // hammer should be blue (from t1), anvil should be white (from t2)
      expect(hammer.get_trait(t1, t_color)).to.equal('blue')
      expect(anvil.get_trait(t2, t_color)).to.equal('white')
    })
  })

  // ============================================
  // VALIDATION
  // ============================================

  describe('Validation', () => {
    it('cannot track unlocked state', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      const core_1 = mind.create_state(ground, { tt: 1 })
      // core_1 is NOT locked

      expect(() => {
        new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      }).to.throw(/Cannot track unlocked state/)
    })

    it('cannot track future state', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      const core_2 = mind.create_state(ground, { tt: 2 })
      core_2.lock()

      // Try to create t1(vt=1) tracking core_2(vt=2)
      expect(() => {
        new Temporal(mind, ground, null, { tt: 1, tracks: core_2 })
      }).to.throw(/Cannot track future state/)
    })

    it('base cannot be in tracked timeline - direct base', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // Core: c1 → c2
      const c1 = mind.create_state(ground, { tt: 1 })
      c1.lock()

      const c2 = c1.branch(ground, 2)
      c2.lock()

      // Try: bad(tracks=c2, base=c1) - c1 is in c2's base chain
      expect(() => {
        new Temporal(mind, ground, c1, { tt: 2, tracks: c2 })
      }).to.throw(/base cannot be in tracked timeline/)
    })

    it('base cannot be in tracked timeline - ancestor in base chain', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // Core: c1 → c2 → c3
      const c1 = mind.create_state(ground, { tt: 1 })
      c1.lock()

      const c2 = c1.branch(ground, 2)
      c2.lock()

      const c3 = c2.branch(ground, 3)
      c3.lock()

      // Try: bad(tracks=c3, base=c1) - c1 is ancestor in c3's chain
      expect(() => {
        new Temporal(mind, ground, c1, { tt: 3, tracks: c3 })
      }).to.throw(/base cannot be in tracked timeline/)
    })

    it('base can be in different timeline (same mind)', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // Core: c1
      const c1 = mind.create_state(ground, { tt: 1 })
      c1.lock()

      // Theory: t1(tracks=c1, base=null)
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: c1 })
      t1.lock()

      // t2(tracks=c1, base=t1) - should succeed (t1 not in c1's chain)
      const t2 = new Temporal(mind, ground, t1, { tt: 2, tracks: c1 })
      expect(t2.tracks).to.equal(c1)
      expect(t2.base).to.equal(t1)
    })

    it('tracks and base can both be null', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // First state: tracks=null, base=null → OK
      const s1 = new Temporal(mind, ground, null, { tt: 1 })
      expect(s1.tracks).to.be.null
      expect(s1.base).to.be.null
    })
  })

  // ============================================
  // CYCLE DETECTION
  // ============================================

  describe('Cycle detection', () => {
    it('no false positives - legitimate chain not detected as cycle', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // A tracks B tracks C (no cycle)
      const c = mind.create_state(ground, { tt: 1 })
      c.add_beliefs_from_template({ obj_c: { bases: ['ObjectPhysical'], traits: {} } })
      c.lock()

      const b = new Temporal(mind, ground, null, { tt: 1, tracks: c })
      b.add_beliefs_from_template({ obj_b: { bases: ['ObjectPhysical'], traits: {} } })
      b.lock()

      const a = new Temporal(mind, ground, null, { tt: 1, tracks: b })
      a.add_beliefs_from_template({ obj_a: { bases: ['ObjectPhysical'], traits: {} } })
      a.lock()

      // All beliefs visible correctly
      const beliefs = [...a.get_beliefs()]
      const labels = beliefs.map(b => b.get_label()).filter(l => l)

      expect(labels).to.include('obj_a')
      expect(labels).to.include('obj_b')
      expect(labels).to.include('obj_c')
    })
  })

  // ============================================
  // CACHING (get_belief_by_subject)
  // ============================================

  describe('Caching with tracks', () => {
    it('get_belief_by_subject returns belief from tracks', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // Core: c1 has hammer
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: {} }
      })
      core_1.lock()

      // Theory: t1 tracks c1, no local hammer
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      t1.lock()

      const hammer_subject = core_1.get_belief_by_label('hammer').subject
      const found = t1.get_belief_by_subject(hammer_subject)

      expect(found).to.exist
      expect(found.get_label()).to.equal('hammer')
    })

    it('_subject_index cache includes beliefs from tracks', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // Core: c1 has hammer
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: {} }
      })
      core_1.lock()

      // Theory: t1 tracks c1
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      t1.lock()

      // Trigger cache build
      const hammer_subject = core_1.get_belief_by_label('hammer').subject
      t1.get_belief_by_subject(hammer_subject)

      // Cache should contain tracked beliefs
      expect(t1._subject_index).to.exist
      expect(t1._subject_index.has(hammer_subject)).to.be.true
    })

    it('local belief shadows tracked belief in cache', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      // Core: hammer(red)
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: { color: 'red' } }
      })
      core_1.lock()

      // Theory: tracks core, hammer(blue)
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      const hammer_in_core = core_1.get_belief_by_label('hammer')
      hammer_in_core.replace(t1, { color: 'blue' })
      t1.lock()

      const hammer_subject = hammer_in_core.subject
      const found = t1.get_belief_by_subject(hammer_subject)

      expect(found.get_trait(t1, t_color)).to.equal('blue')
    })

    it('cache works with chained tracks', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // 3-level chain, all locked
      const core = mind.create_state(ground, { tt: 1 })
      core.add_beliefs_from_template({ hammer: { bases: ['ObjectPhysical'], traits: {} } })
      core.lock()

      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core })
      t1.lock()

      const t2 = new Temporal(mind, ground, null, { tt: 1, tracks: t1 })
      t2.lock()

      // get_belief_by_subject finds belief from deepest level
      const hammer_subject = core.get_belief_by_label('hammer').subject
      const found = t2.get_belief_by_subject(hammer_subject)

      expect(found).to.exist
      expect(found.get_label()).to.equal('hammer')
    })
  })

  // ============================================
  // TRAIT RESOLUTION
  // ============================================

  describe('Trait resolution across tracks', () => {
    it('get_trait on tracked belief resolves correctly', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      // Core: hammer with color=red
      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: { color: 'red' } }
      })
      core_1.lock()

      // Theory: t1 tracks c1
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      t1.lock()

      const hammer = t1.get_belief_by_label('hammer')
      expect(hammer.get_trait(t1, t_color)).to.equal('red')
    })
  })

  // ============================================
  // SERIALIZATION
  // ============================================

  describe('Serialization', () => {
    it('tracks persists through save/load', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      const core_1 = mind.create_state(ground, { tt: 1 })
      core_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: {} }
      })
      core_1.lock()

      const alt_1 = new Temporal(mind, ground, null, { tt: 1, tracks: core_1 })
      alt_1.lock()

      const alt_1_id = alt_1._id
      const core_1_id = core_1._id

      const json = save_mind(mind)
      DB.reset_registries()
      setupStandardArchetypes()
      load(json)

      const loaded_alt = DB.get_state_by_id(alt_1_id)
      expect(loaded_alt.tracks).to.exist
      expect(loaded_alt.tracks._id).to.equal(core_1_id)
    })

    it('chained tracks persists through save/load', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // 3-level chain
      const core = mind.create_state(ground, { tt: 1 })
      core.lock()

      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core })
      t1.lock()

      const t2 = new Temporal(mind, ground, null, { tt: 1, tracks: t1 })
      t2.lock()

      const t2_id = t2._id
      const t1_id = t1._id
      const core_id = core._id

      const json = save_mind(mind)
      DB.reset_registries()
      setupStandardArchetypes()
      load(json)

      const loaded_t2 = DB.get_state_by_id(t2_id)
      const loaded_t1 = DB.get_state_by_id(t1_id)

      expect(loaded_t2.tracks._id).to.equal(t1_id)
      expect(loaded_t1.tracks._id).to.equal(core_id)
    })

    it('timeline continuation tracks persists', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // t1 → t2 both with tracks
      const core = mind.create_state(ground, { tt: 1 })
      core.lock()

      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: core })
      t1.lock()

      const t2 = new Temporal(mind, ground, t1, { tt: 2, tracks: core })
      t2.lock()

      const t1_id = t1._id
      const t2_id = t2._id
      const core_id = core._id

      const json = save_mind(mind)
      DB.reset_registries()
      setupStandardArchetypes()
      load(json)

      const loaded_t1 = DB.get_state_by_id(t1_id)
      const loaded_t2 = DB.get_state_by_id(t2_id)

      expect(loaded_t1.tracks._id).to.equal(core_id)
      expect(loaded_t2.tracks._id).to.equal(core_id)
      expect(loaded_t2.base._id).to.equal(t1_id)
    })
  })

  // ============================================
  // TIMELINE BRANCHING
  // ============================================

  describe('Timeline branching', () => {
    it('single branch: follows only child', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // c1 → c2 (single branch)
      const c1 = mind.create_state(ground, { tt: 1 })
      c1.lock()

      const c2 = c1.branch(ground, 2)
      c2.lock()

      // t1 tracks c1, branch to vt=2 should get c2
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: c1 })
      t1.lock()

      const t2 = t1.branch(ground, 2)
      expect(t2.tracks).to.equal(c2)
    })

    it('no valid branch: stays at current', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // c1 → c2(vt=3)
      const c1 = mind.create_state(ground, { tt: 1 })
      c1.lock()

      const c2 = c1.branch(ground, 3)
      c2.lock()

      // t1 tracks c1, branch to vt=2 should stay at c1 (c2.vt > 2)
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: c1 })
      t1.lock()

      const t2 = t1.branch(ground, 2)
      expect(t2.tracks).to.equal(c1)
    })

    it('skips unlocked branches', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // c1(locked) → c2(locked) → c3(unlocked)
      // When branching to vt=3, should get c2 (last locked), not c3
      const c1 = mind.create_state(ground, { tt: 1 })
      c1.lock()

      const c2 = c1.branch(ground, 2)
      c2.lock()

      const c3 = c2.branch(ground, 3)
      // c3 NOT locked - stays unlocked

      // t1 tracks c1, branch to vt=3 should get c2 (c3 is unlocked)
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: c1 })
      t1.lock()

      const t2 = t1.branch(ground, 3)
      expect(t2.tracks).to.equal(c2)  // c2 is last locked state
    })
  })

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge cases', () => {
    it('state without tracks uses normal get_beliefs behavior', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      const state_1 = mind.create_state(ground, { tt: 1 })
      state_1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: {} }
      })
      state_1.lock()

      const beliefs = [...state_1.get_beliefs()]
      expect(beliefs).to.have.lengthOf(1)
    })

    it('tracks pointing to empty state', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // c1 has no beliefs
      const c1 = mind.create_state(ground, { tt: 1 })
      c1.lock()

      // t1 tracks c1, has hammer
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: c1 })
      t1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: {} }
      })
      t1.lock()

      const beliefs = [...t1.get_beliefs()]
      expect(beliefs).to.have.lengthOf(1)
      expect(beliefs[0].get_label()).to.equal('hammer')
    })

    it('same belief subject in both base chain and tracks', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      // c1 has hammer(blue)
      const c1 = mind.create_state(ground, { tt: 1 })
      c1.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: { color: 'blue' } }
      })
      c1.lock()

      // t1 has hammer(red) - different from c1
      const t1 = new Temporal(mind, ground, null, { tt: 1, tracks: c1 })
      t1.add_beliefs_from_template({
        my_hammer: { bases: ['ObjectPhysical'], traits: { color: 'red' } }
      })
      t1.lock()

      // t2(base=t1, tracks=c1)
      // Note: this creates a new version of hammer in t1, not the same subject as c1
      // So both should be visible
      const t2 = new Temporal(mind, ground, t1, { tt: 2, tracks: c1 })
      t2.lock()

      const beliefs = [...t2.get_beliefs()]
      const labels = beliefs.map(b => b.get_label()).filter(l => l)

      // Both hammers should be visible (different subjects)
      expect(labels).to.include('hammer')
      expect(labels).to.include('my_hammer')
    })

    it('tracks.vt equals this.vt exactly', () => {
      const mind = Materia.create_world('test')
      const ground = logos_state()

      // c1(vt=5)
      const c1 = mind.create_state(ground, { tt: 5 })
      c1.lock()

      // t1(vt=5, tracks=c1) → OK, not future
      const t1 = new Temporal(mind, ground, null, { tt: 5, tracks: c1 })
      expect(t1.tracks).to.equal(c1)
    })
  })
})
