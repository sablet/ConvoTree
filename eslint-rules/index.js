/**
 * ESLint Local Rules Plugin
 *
 * プロジェクト固有のカスタムルールを登録
 */

module.exports = {
  rules: {
    'no-direct-data-source': require('./no-direct-data-source'),
  },
};
