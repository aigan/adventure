import { expect } from 'chai';
import { execSync } from 'child_process';

describe('ESLint', () => {
  it('passes with no errors', () => {
    try {
      execSync('npx eslint public', { encoding: 'utf-8' });
      // If no errors, eslint exits with 0 and output is empty or just warnings
      expect(true).to.be.true;
    } catch (error) {
      // If eslint found errors, it exits with non-zero
      throw new Error(`ESLint errors found:\n${error.stdout}`);
    }
  });
});
