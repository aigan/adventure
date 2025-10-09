import { expect } from 'chai';
import { execSync } from 'child_process';

describe('TypeScript Type Checking', () => {
  it('passes with no errors', () => {
    try {
      execSync('npm run typecheck', { encoding: 'utf-8' });
      expect(true).to.be.true;
    } catch (error) {
      throw new Error(`TypeScript errors found:\n${error.stdout}`);
    }
  });
});
