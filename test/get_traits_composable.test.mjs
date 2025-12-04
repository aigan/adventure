/**
 * Test that get_traits() and get_trait() return consistent values for composable traits
 *
 * These tests verify that get_traits() properly composes trait values from multiple bases,
 * matching the behavior of get_trait() for composable traits like inventory and mind.
 *
 * MATRIX COVERAGE:
 * ✅ 7.1 get_trait() vs get_traits() Consistency (entire file)
 * ✅ 3.2 Composable from Multiple Bases (Direct) - line 18
 * ✅ 3.3 Composable Transitive - line 117
 *
 * NOTE: This file is entirely focused on verifying consistency between the two APIs
 */

import { expect } from 'chai';
import { Mind, Materia, Traittype } from '../public/worker/cosmos.mjs';
import { eidos } from '../public/worker/eidos.mjs'
import * as DB from '../public/worker/db.mjs';
import { createStateInNewMind, stdTypes, Thing } from './helpers.mjs';

describe('get_traits() composable trait consistency', () => {
  beforeEach(() => {
    DB.reset_registries();
  });

  // Matrix 7.1 + 3.2: get_trait() vs get_traits() consistency + Composable from Multiple Bases
  it('composes from multiple bases consistently with get_trait()', () => {
    // Setup with composable inventory trait
    const traittypes = {
      ...stdTypes,
      inventory: {
        type: 'Subject',
        container: Array,
        composable: true,
        exposure: 'spatial'
      }
    };

    const archetypes = {
      Thing,
      PortableObject: {
        bases: ['Thing'],
      },
      HasInventory: {
        traits: {
          inventory: null,
        },
      },
    };

    DB.register(traittypes, archetypes, {});

    const state = createStateInNewMind('test', 1);

    // Create items
    const sword = state.add_belief_from_template({
      bases: ['PortableObject'],
      traits: {}, label: 'sword'
    });

    const shield = state.add_belief_from_template({
      bases: ['PortableObject'],
      traits: {}, label: 'shield'
    });

    // Create TWO base prototypes, each with different inventory items
    const eidos_mind = eidos();
    const eidos_state = eidos_mind.create_timed_state(100);

    const warrior_proto = eidos_state.add_belief_from_template({
      bases: ['HasInventory'],
      traits: {
        inventory: [sword.subject]  // Has sword
      },
      label: 'WarriorProto'
    });
    warrior_proto.lock(eidos_state);

    const defender_proto = eidos_state.add_belief_from_template({
      bases: ['HasInventory'],
      traits: {
        inventory: [shield.subject]  // Has shield
      },
      label: 'DefenderProto'
    });
    defender_proto.lock(eidos_state);

    // Create belief that inherits from BOTH prototypes
    // Should compose inventory from both bases
    const knight = state.add_belief_from_template({
      bases: [warrior_proto, defender_proto],  // Multiple bases!
      traits: {
        // NOT setting inventory here - should be composed from both bases
      },
      label: 'knight'
    });

    // State is unlocked
    expect(state.locked).to.be.false;

    // Knight should NOT have inventory in own _traits (it's inherited)
    expect(knight._traits.has(Traittype.get_by_label('inventory'))).to.be.false;

    // get_trait() composes from both bases
    const inventory_traittype = Traittype.get_by_label('inventory');
    const inventory_from_get_trait = knight.get_trait(state, inventory_traittype);
    expect(inventory_from_get_trait).to.be.an('array');
    expect(inventory_from_get_trait).to.have.lengthOf(2, 'get_trait() composes sword + shield');

    // get_traits() should return the SAME composed inventory
    const traits_map = new Map();
    for (const [traittype, value] of knight.get_traits()) {
      traits_map.set(traittype.label, value);
    }
    const inventory_from_get_traits = traits_map.get('inventory');

    expect(inventory_from_get_traits).to.be.an('array');
    expect(inventory_from_get_traits).to.have.lengthOf(2,
      'get_traits() should compose from all bases like get_trait() does');

    // Both methods should return identical values
    expect(inventory_from_get_traits).to.deep.equal(inventory_from_get_trait,
      'get_traits() and get_trait() should return identical composed values');
  });

  // Matrix 7.1 + 3.3: get_trait() vs get_traits() consistency + Composable Transitive
  it('returns inherited composed trait consistently', () => {
    // Test: belief inherits a composable trait that was itself composed
    const traittypes = {
      ...stdTypes,
      inventory: {
        type: 'Subject',
        container: Array,
        composable: true,
        exposure: 'spatial'
      }
    };

    const archetypes = {
      Thing,
      PortableObject: {
        bases: ['Thing'],
      },
      HasInventory: {
        traits: {
          inventory: null,
        },
      },
    };

    DB.register(traittypes, archetypes, {});

    const state = createStateInNewMind('test', 1);

    const sword = state.add_belief_from_template({
      bases: ['PortableObject'],
      traits: {}, label: 'sword'
    });

    const shield = state.add_belief_from_template({
      bases: ['PortableObject'],
      traits: {}, label: 'shield'
    });

    // Create a base prototype that itself inherits and adds to inventory
    const eidos_mind = eidos();
    const eidos_state = eidos_mind.create_timed_state(100);

    const warrior_proto = eidos_state.add_belief_from_template({
      bases: ['HasInventory'],
      traits: {
        inventory: [sword.subject]
      },
      label: 'WarriorProto'
    });
    warrior_proto.lock(eidos_state);

    // Knight prototype inherits from warrior and adds shield
    const knight_proto = eidos_state.add_belief_from_template({
      bases: [warrior_proto],
      traits: {
        inventory: [shield.subject]  // This composes with inherited sword during creation
      },
      label: 'KnightProto'
    });
    knight_proto.lock(eidos_state);

    // Instance inherits from knight_proto WITHOUT setting inventory
    const knight_instance = state.add_belief_from_template({
      bases: [knight_proto],
      traits: {
        // NOT setting inventory - should inherit composed [sword, shield]
      },
      label: 'knight_instance'
    });

    // Instance should NOT have inventory in own _traits
    const inventory_traittype = Traittype.get_by_label('inventory');
    expect(knight_instance._traits.has(inventory_traittype)).to.be.false;

    // get_trait() should return the composed inventory from knight_proto
    const inventory_from_get_trait = knight_instance.get_trait(state, inventory_traittype);

    // get_traits() should return the same
    const traits_map = new Map();
    for (const [traittype, value] of knight_instance.get_traits()) {
      traits_map.set(traittype.label, value);
    }
    const inventory_from_get_traits = traits_map.get('inventory');

    // Both should return the same composed array
    expect(inventory_from_get_traits).to.deep.equal(inventory_from_get_trait,
      'get_traits() should return same value as get_trait() for inherited composable trait');

    // Verify we got the expected composed result
    expect(inventory_from_get_traits).to.be.an('array');
    expect(inventory_from_get_traits).to.have.lengthOf(2, 'Should have sword + shield');
  });
});
