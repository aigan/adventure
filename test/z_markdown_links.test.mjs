import { expect } from 'chai'
import { readFileSync, existsSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, '..')

describe('Markdown Links', () => {
  it('should have valid relative links in all markdown files', () => {
    // Find all .md files excluding node_modules and lab
    const md_files = execSync(
      'find . -name "*.md" -not -path "./node_modules/*" -not -path "./lab/*"',
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    )
      .trim()
      .split('\n')
      .filter(Boolean)

    expect(md_files.length).to.be.greaterThan(0, 'Should find at least one markdown file')

    const errors = []

    // Regex to match markdown links: [text](path)
    // Excludes http/https URLs and anchors
    const link_regex = /\[([^\]]+)\]\(([^)]+)\)/g

    for (const md_file of md_files) {
      const file_path = join(PROJECT_ROOT, md_file)
      const content = readFileSync(file_path, 'utf-8')
      const file_dir = dirname(file_path)

      let match
      while ((match = link_regex.exec(content)) !== null) {
        const link_text = match[1]
        const link_path = match[2]

        // Skip external URLs and anchor links
        if (link_path.startsWith('http://') ||
            link_path.startsWith('https://') ||
            link_path.startsWith('#')) {
          continue
        }

        // Resolve relative path from the markdown file's directory
        const resolved_path = resolve(file_dir, link_path)

        // Check if file exists
        if (!existsSync(resolved_path)) {
          errors.push({
            file: md_file,
            link_text,
            link_path,
            resolved_path,
            line: content.substring(0, match.index).split('\n').length
          })
        }
      }
    }

    // Report all errors at once
    if (errors.length > 0) {
      const error_msg = errors.map(e =>
        `  ${e.file}:${e.line}\n    Link: [${e.link_text}](${e.link_path})\n    Resolved to: ${e.resolved_path}\n    Status: File not found`
      ).join('\n\n')

      throw new Error(`Found ${errors.length} broken markdown link(s):\n\n${error_msg}`)
    }
  })
})
