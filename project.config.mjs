/**
 * Project-wide configuration
 * Single source of truth for directories and paths
 */

export const PROJECT_DIRS = {
  /** Source code directories to lint and analyze */
  source: ['app', 'components', 'hooks', 'lib'],

  /** Output directories (excluded from checks) */
  output: ['out', 'output', '.next', 'node_modules', 'public'],

  /** Script directories */
  scripts: ['scripts'],
}

export const PROJECT_PATHS = {
  /** All source directories as space-separated string (for CLI) */
  sourceString: PROJECT_DIRS.source.map(d => `./${d}`).join(' '),

  /** All source directories as array */
  sourceArray: PROJECT_DIRS.source,
}
