/**
 * ESLint ローカルプラグイン設定
 *
 * eslint-plugin-local-rules を使わずに、直接カスタムルールを登録する方法
 */

module.exports = {
  rules: {
    'no-direct-data-source': require('./eslint-rules/no-direct-data-source'),
  },
};
