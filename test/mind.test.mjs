import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';

describe('Mind', () => {
  beforeEach(() => {
    DB.reset_registries();
  });

  it('creates mind with unique ID', () => {
    const mind = new Mind('test_mind');
    expect(mind._id).to.be.a('number');
    expect(mind.label).to.equal('test_mind');
  });

  it('registers mind by id and label', () => {
    const mind = new Mind('registered');
    expect(Mind.get_by_id(mind._id)).to.equal(mind);
    expect(Mind.get_by_label('registered')).to.equal(mind);
  });
});
