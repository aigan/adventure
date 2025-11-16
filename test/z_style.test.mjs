import { expect } from 'chai'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Recursively get all .mjs files in a directory
 * @param {string} dir
 * @returns {string[]}
 */
function getAllMjsFiles(dir) {
  const files = []
  const entries = readdirSync(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      files.push(...getAllMjsFiles(fullPath))
    } else if (entry.endsWith('.mjs')) {
      files.push(fullPath)
    }
  }

  return files
}

describe('STYLE.md Compliance', () => {
  it('should have no inline imports in JSDoc comments', () => {
    const dirs = ['public/worker', 'test']
    const violations = []

    for (const dir of dirs) {
      const files = getAllMjsFiles(dir)

      for (const file of files) {
        const content = readFileSync(file, 'utf-8')
        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]

          // Check for inline imports in JSDoc type annotations
          // Pattern: @ type {import ('./foo.mjs').Bar} (without spaces)
          // Also check @ param and @ returns
          if (line.match(/@(?:type|param|returns)\s+\{[^}]*import\(/)) {
            violations.push({
              file: file.replace(process.cwd() + '/', ''),
              line: i + 1,
              content: line.trim()
            })
          }
        }
      }
    }

    if (violations.length > 0) {
      const message = violations.map(v =>
        `${v.file}:${v.line}\n  ${v.content}`
      ).join('\n\n')

      throw new Error(
        `Found ${violations.length} inline import(s) in JSDoc.\n` +
        `STYLE.md row 7: Never inline imports - use @typedef at top of file instead.\n\n` +
        message
      )
    }

    expect(violations).to.have.lengthOf(0)
  })
})
