import { expect } from 'chai';
import * as DB from '../public/worker/db.mjs';

describe('Mind', () => {
  it('creates mind with unique ID', () => {
    const mind = new DB.Mind('test_mind', {});
    expect(mind._id).to.be.a('number');
    expect(mind.label).to.equal('test_mind');
  });

  it('registers mind by id and label', () => {
    const mind = new DB.Mind('registered', {});
    expect(DB.Mind.get_by_id(mind._id)).to.equal(mind);
    expect(DB.Mind.get_by_label('registered')).to.equal(mind);
  });
});
