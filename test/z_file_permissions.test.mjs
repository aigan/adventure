import { expect } from 'chai'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Recursively get all files in a directory
 * @param {string} dir
 * @returns {string[]}
 */
function getAllFiles(dir) {
  const files = []
  const entries = readdirSync(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      files.push(...getAllFiles(fullPath))
    } else {
      files.push(fullPath)
    }
  }

  return files
}

describe('File Permissions', () => {
  it('public/worker files should be world-readable', () => {
    const dir = 'public/worker'
    const files = getAllFiles(dir)
    const violations = []

    for (const file of files) {
      const stat = statSync(file)
      const mode = stat.mode

      // Check if world-readable (other read bit = 004 in octal)
      // mode & 0o004 will be non-zero if world-readable
      const worldReadable = (mode & 0o004) !== 0

      if (!worldReadable) {
        const octal = (mode & 0o777).toString(8).padStart(3, '0')
        violations.push({
          file: file.replace(process.cwd() + '/', ''),
          permissions: octal
        })
      }
    }

    if (violations.length > 0) {
      const message = violations.map(v =>
        `${v.file}: ${v.permissions} (not world-readable)`
      ).join('\n')

      throw new Error(
        `Found ${violations.length} file(s) that are not world-readable.\n` +
        `Web server needs world-readable permissions to serve files.\n` +
        `Fix with: chmod o+r <file>\n\n` +
        message
      )
    }

    expect(violations).to.have.lengthOf(0)
  })

  it('public/worker files should have group-readable permissions matching user', () => {
    const dir = 'public/worker'
    const files = getAllFiles(dir)
    const violations = []

    for (const file of files) {
      const stat = statSync(file)
      const mode = stat.mode

      // Extract permission bits for user and group
      const userRead = (mode & 0o400) !== 0
      const groupRead = (mode & 0o040) !== 0
      const userWrite = (mode & 0o200) !== 0
      const groupWrite = (mode & 0o020) !== 0

      // Group should match user permissions
      if (userRead !== groupRead || userWrite !== groupWrite) {
        const octal = (mode & 0o777).toString(8).padStart(3, '0')
        violations.push({
          file: file.replace(process.cwd() + '/', ''),
          permissions: octal
        })
      }
    }

    if (violations.length > 0) {
      const message = violations.map(v =>
        `${v.file}: ${v.permissions} (group permissions differ from user)`
      ).join('\n')

      throw new Error(
        `Found ${violations.length} file(s) with mismatched group permissions.\n` +
        `CLAUDE.md requires group permissions to match user permissions.\n` +
        `Fix with: chmod g=u <file>\n\n` +
        message
      )
    }

    expect(violations).to.have.lengthOf(0)
  })
})
