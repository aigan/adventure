import { expect } from 'chai'
import { Session } from '../public/worker/session.mjs'
import * as narrator from '../public/worker/narrator.mjs'
import * as DB from '../public/worker/db.mjs'
import { Traittype } from '../public/worker/traittype.mjs'
import { stdTypes, Thing, createMindWithBeliefs, setupAfterEachValidation } from './helpers.mjs'

describe('Session', () => {
  beforeEach(() => {
    DB.reset_registries()
  })
  setupAfterEachValidation();


  describe('narrator.desig()', () => {
    it('returns label from Subject', () => {
      const traittypes = {
        ...stdTypes,
        location: 'Location',
      }

      const archetypes = {
        Thing,
        ObjectPhysical: {
          bases: ['Thing'],
          traits: {
            location: null,
          }
        },
        Location: {
          bases: ['ObjectPhysical'],
        }
      }

      DB.register(traittypes, archetypes, {})

      const state = createMindWithBeliefs('world', {
        workshop: {
          bases: ['Location'],
          traits: {}
        },
        player: {
          bases: ['ObjectPhysical'],
          traits: {
            location: 'workshop'
          }
        }
      })

      const world = state.in_mind
      const player = state.get_belief_by_label('player')

      const location_traittype = Traittype.get_by_label('location')
      const loc_subject = player.get_trait(state, location_traittype)
      const designation = narrator.desig(state, loc_subject)

      expect(designation).to.equal('workshop')
    })

    it('returns label from Belief', () => {
      const traittypes = {
        ...stdTypes,
      }

      const archetypes = {
        Thing,
        ObjectPhysical: {
          bases: ['Thing'],
          traits: {}
        },
      }

      DB.register(traittypes, archetypes, {})

      const state = createMindWithBeliefs('world', {
        hammer: {
          bases: ['ObjectPhysical'],
          traits: {}
        },
        player: {
          bases: ['ObjectPhysical'],
          traits: {}
        }
      })

      const world = state.in_mind
      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')

      const designation = narrator.desig(state, hammer)

      expect(designation).to.equal('hammer')
    })

    it('returns null for Belief with no label', () => {
      const traittypes = {
        ...stdTypes,
      }

      const archetypes = {
        Thing,
      }

      DB.register(traittypes, archetypes, {})

      const state = createMindWithBeliefs('world', {
        player: {
          bases: ['Thing'],
          traits: {}
        }
      })

      const world = state.in_mind
      const player = state.get_belief_by_label('player')

      // Create a belief with explicitly no label (don't add to beliefs dict)
      const unlabeled = state.add_belief_from_template({
        bases: ['Thing'],
        traits: {}
      })

      const designation = narrator.desig(state, unlabeled)

      expect(designation).to.equal(null)
    })
  })
})
