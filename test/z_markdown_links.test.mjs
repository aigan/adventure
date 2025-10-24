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

  it('should have valid relative links in .mjs file comments', () => {
    // Find all .mjs files excluding node_modules, lab, and this test file
    const mjs_files = execSync(
      'find . -name "*.mjs" -not -path "./node_modules/*" -not -path "./lab/*" -not -path "./test/z_markdown_links.test.mjs"',
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    )
      .trim()
      .split('\n')
      .filter(Boolean)

    expect(mjs_files.length).to.be.greaterThan(0, 'Should find at least one .mjs file')

    const errors = []

    // Regex to match markdown links in comments: [text](path)
    // Excludes http/https URLs and anchors
    const link_regex = /\[([^\]]+)\]\(([^)]+)\)/g

    for (const mjs_file of mjs_files) {
      const file_path = join(PROJECT_ROOT, mjs_file)
      const content = readFileSync(file_path, 'utf-8')
      const file_dir = dirname(file_path)

      // Extract all comments (single-line // and multi-line /* */)
      const comment_regex = /\/\/.*$|\/\*[\s\S]*?\*\//gm
      let comment_match
      while ((comment_match = comment_regex.exec(content)) !== null) {
        const comment_text = comment_match[0]
        const comment_start = comment_match.index

        // Look for markdown links within this comment
        let link_match
        const link_regex_copy = new RegExp(link_regex.source, link_regex.flags)
        while ((link_match = link_regex_copy.exec(comment_text)) !== null) {
          const link_text = link_match[1]
          const link_path = link_match[2]

          // Skip external URLs and anchor links
          if (link_path.startsWith('http://') ||
              link_path.startsWith('https://') ||
              link_path.startsWith('#')) {
            continue
          }

          // Resolve relative path from the .mjs file's directory
          const resolved_path = resolve(file_dir, link_path)

          // Check if file exists
          if (!existsSync(resolved_path)) {
            const line = content.substring(0, comment_start + link_match.index).split('\n').length
            errors.push({
              file: mjs_file,
              link_text,
              link_path,
              resolved_path,
              line
            })
          }
        }
      }
    }

    // Report all errors at once
    if (errors.length > 0) {
      const error_msg = errors.map(e =>
        `  ${e.file}:${e.line}\n    Link: [${e.link_text}](${e.link_path})\n    Resolved to: ${e.resolved_path}\n    Status: File not found`
      ).join('\n\n')

      throw new Error(`Found ${errors.length} broken link(s) in .mjs comments:\n\n${error_msg}`)
    }
  })
})
