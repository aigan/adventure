import { expect } from 'chai'
import { setupStandardArchetypes, createMindWithBeliefs, createStateInNewMind, get_first_belief_by_label } from './helpers.mjs'
import { Mind } from '../public/worker/mind.mjs'
import { Traittype, logos } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'


describe('Subject.to_inspect_view()', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })

  it('resolves subject in same state', () => {
    const world_state = createMindWithBeliefs('world', {
      workshop: {
        bases: ['Location']
      }
    })

    const workshop = get_first_belief_by_label('workshop')
    const inspected = workshop.subject.to_inspect_view(world_state)

    expect(inspected).to.deep.include({
      _ref: workshop._id,
      _type: 'Belief',
      label: 'workshop',
      mind_id: workshop.in_mind._id,
      mind_label: 'world'
    })
  })

  it('resolves subject with mind_scope=parent (@about case)', () => {
    // Create world with workshop
    const world_state = createMindWithBeliefs('world', {
      workshop: {
        bases: ['Location']
      }
    })
    const workshop = get_first_belief_by_label('workshop')

    // NPC learns about workshop
    const npc_mind = new Mind(world_state.in_mind, 'npc')
    const npc_state = npc_mind.create_state(world_state)
    const workshop_knowledge = npc_state.learn_about(workshop, {traits: []})

    // The @about trait stores workshop.subject
    const about_traittype = Traittype.get_by_label('@about')
    const about_subject = workshop_knowledge.get_trait(npc_state, about_traittype)
    expect(about_subject).to.equal(workshop.subject)

    // When inspecting @about trait, traittype.inspect() will pass ground_state
    // (because @about has mind_scope='parent')
    // So subject.to_inspect_view should receive world_state and find workshop
    const inspected = about_subject.to_inspect_view(world_state)

    expect(inspected).to.deep.include({
      _ref: workshop._id,
      _type: 'Belief',
      label: 'workshop',
      mind_id: workshop.in_mind._id,
      mind_label: 'world'
    })
  })

  it('resolves subject in array trait', () => {
    // Add items traittype and Container archetype for this test
    DB.register({
      items: {
        type: 'PortableObject',
        container: Array
      }
    }, {
      Container: {
        bases: ['Location'],
        traits: {
          items: null
        }
      }
    }, {})

    // Create sword and shield first
    const world_state = createMindWithBeliefs('world', {
      sword: { bases: ['PortableObject'] },
      shield: { bases: ['PortableObject'] }
    })

    const sword = get_first_belief_by_label('sword')
    const shield = get_first_belief_by_label('shield')

    // Then create chest with references to them
    const chest = world_state.add_belief_from_template({
      bases: ['Container'],
      traits: {'@label': 'chest', items: [sword.subject, shield.subject]}
    })

    const items_traittype = Traittype.get_by_label('items')
    const items = chest.get_trait(world_state, items_traittype)

    // Each subject in array should resolve
    const inspected_items = items.map(subject => subject.to_inspect_view(world_state))

    expect(inspected_items[0]).to.deep.include({
      _ref: sword._id,
      _type: 'Belief',
      label: 'sword'
    })

    expect(inspected_items[1]).to.deep.include({
      _ref: shield._id,
      _type: 'Belief',
      label: 'shield'
    })
  })

  it('resolves subject in cross-mind scenario', () => {
    // World has a hammer
    const world_state = createMindWithBeliefs('world', {
      hammer: { bases: ['PortableObject'] }
    })
    const world_hammer = get_first_belief_by_label('hammer')

    // NPC learns about the hammer
    const npc_mind = new Mind(world_state.in_mind, 'npc')
    const npc_state = npc_mind.create_state(world_state)
    const hammer_knowledge = npc_state.learn_about(world_hammer, {traits: []})

    // The learned belief has its OWN subject (not the same as world hammer)
    expect(hammer_knowledge.subject).to.not.equal(world_hammer.subject)

    // But it has @about pointing to world hammer's subject
    const about_traittype = Traittype.get_by_label('@about')
    expect(hammer_knowledge.get_trait(npc_state, about_traittype)).to.equal(world_hammer.subject)

    // When inspecting the learned belief's subject in NPC's state
    const inspected = hammer_knowledge.subject.to_inspect_view(npc_state)

    expect(inspected).to.deep.include({
      _ref: hammer_knowledge._id,
      _type: 'Belief',
      label: null, // NPC didn't give it a label
      mind_id: npc_mind._id,
      mind_label: 'npc'
    })
  })

  it('throws assertion when subject not found in state', () => {
    const world_state = createMindWithBeliefs('world', {
      workshop: { bases: ['Location'] }
    })
    const workshop = get_first_belief_by_label('workshop')

    // Create a different mind without the workshop
    const other_state = createStateInNewMind('other')

    // Trying to inspect workshop.subject in other_state should fail
    expect(() => {
      workshop.subject.to_inspect_view(other_state)
    }).to.throw('Subject must have belief in state or shared beliefs')
  })

  it('handles root state without ground_state', () => {
    const world_state = createMindWithBeliefs('world', {
      workshop: { bases: ['Location'] }
    })

    const workshop = get_first_belief_by_label('workshop')

    // Root state has logos origin_state as ground_state
    expect(world_state.ground_state).to.equal(logos().origin_state)

    // Should still resolve in itself
    const inspected = workshop.subject.to_inspect_view(world_state)

    expect(inspected).to.deep.include({
      _ref: workshop._id,
      _type: 'Belief',
      label: 'workshop'
    })
  })

  it('full inspection flow with belief.to_inspect_view()', () => {
    // This tests the full traittype.inspect() → subject.to_inspect_view() flow
    const world_state = createMindWithBeliefs('world', {
      workshop: { bases: ['Location'] }
    })
    const workshop = get_first_belief_by_label('workshop')

    const npc_mind = new Mind(world_state.in_mind, 'npc')
    const npc_state = npc_mind.create_state(world_state)
    const workshop_knowledge = npc_state.learn_about(workshop, {traits: []})

    // Full inspection should handle @about trait correctly
    const inspected = workshop_knowledge.to_inspect_view(npc_state)

    // @about should be inspected as Belief reference (from world)
    expect(inspected.traits['@about']).to.deep.include({
      _ref: workshop._id,
      _type: 'Belief',
      label: 'workshop',
      mind_label: 'world'
    })
  })
})
