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

  it('should have @heavy comments for potentially expensive iterations', () => {
    const dirs = ['public/worker']  // Production code only
    const violations = []

    // Method calls that require @heavy acknowledgment
    const heavy_patterns = [
      /\.get_beliefs\(/,
      /\.get_beliefs_by_\w+\(/,
      /\.get_traits\(/,
      /\.get_states_by_\w+\(/,
      /DB\._reflect\(/,
    ]

    // Patterns for .beliefs that indicate iteration (not O(1) operations)
    const beliefs_iteration_patterns = [
      /yield\*.*\.beliefs/,           // yield* subject.beliefs
      /for\s*\([^)]*of[^)]*\.beliefs/, // for (const b of this.beliefs)
      /\[\s*\.\.\..*\.beliefs/,       // [...subject.beliefs]
    ]

    // Lines to skip entirely (comments, O(1) operations)
    const skip_patterns = [
      /^\s*\/\//,           // Line comments
      /^\s*\*/,             // Block comment lines
    ]

    /**
     * @param {string} line
     * @returns {boolean}
     */
    function should_skip(line) {
      return skip_patterns.some(p => p.test(line))
    }

    /**
     * @param {string} line
     * @returns {boolean}
     */
    function has_heavy_pattern(line) {
      if (should_skip(line)) return false

      // Check explicit heavy method patterns
      if (heavy_patterns.some(p => p.test(line))) return true

      // Check .beliefs iteration patterns
      if (beliefs_iteration_patterns.some(p => p.test(line))) return true

      return false
    }

    for (const dir of dirs) {
      const files = getAllMjsFiles(dir)
      for (const file of files) {
        const content = readFileSync(file, 'utf-8')
        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (has_heavy_pattern(line)) {
            // Check current line and adjacent lines for @heavy
            const prev = lines[i - 1] || ''
            const next = lines[i + 1] || ''
            if (![prev, line, next].some(l => l.includes('@heavy'))) {
              violations.push({
                file: file.replace(process.cwd() + '/', ''),
                line: i + 1,
                content: line.trim()
              })
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      const message = violations.map(v =>
        `${v.file}:${v.line}\n  ${v.content}`
      ).join('\n\n')

      throw new Error(
        `Found ${violations.length} heavy method call(s) without @heavy comment.\n` +
        `See docs/STYLE.md section "@heavy Annotation"\n\n` +
        message
      )
    }

    expect(violations).to.have.lengthOf(0)
  })
})
