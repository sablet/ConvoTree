/**
 * ESLint カスタムルール: リポジトリパターンの強制
 *
 * 目的: data-source層やcache層への直接アクセスを禁止し、
 *       repository層を経由することを強制する
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce repository pattern by preventing direct access to data sources and cache',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noDirectDataSourceLoad:
        'Direct call to dataSourceManager.loadChatData() is not allowed. Use chatRepository.loadChatData() instead.',
      noDirectCacheAccess:
        'Direct access to localStorageCache is not allowed. Use chatRepository methods instead.',
      noDirectDataSourceImport:
        'Direct import from data-source layer is not allowed in {{ layer }}. Use repository layer instead.',
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();

    // data-source層とrepository層内のファイルは除外
    const isInDataSourceLayer = filename.includes('/lib/data-source/');
    const isInRepositoryLayer = filename.includes('/lib/repositories/');

    if (isInDataSourceLayer || isInRepositoryLayer) {
      return {};
    }

    // ファイルの層を判定
    const getLayer = () => {
      if (filename.includes('/components/')) return 'components';
      if (filename.includes('/hooks/')) return 'hooks';
      if (filename.includes('/app/')) return 'pages';
      if (filename.includes('/lib/')) return 'lib';
      return 'application';
    };

    return {
      // Import文のチェック
      ImportDeclaration(node) {
        const importPath = node.source.value;

        // data-source層からの直接importを禁止
        if (importPath.includes('/lib/data-source/') &&
            !importPath.includes('/lib/data-source/base') && // 型定義は許可
            !importPath.includes('/lib/data-source/factory') && // factoryのDataSource型は許可
            !importPath.includes('/lib/data-source/index')) {

          context.report({
            node,
            messageId: 'noDirectDataSourceImport',
            data: {
              layer: getLayer(),
            },
          });
        }

        // cache層からの直接importを禁止
        if (importPath.includes('/lib/data-source/cache')) {
          context.report({
            node,
            messageId: 'noDirectDataSourceImport',
            data: {
              layer: getLayer(),
            },
          });
        }
      },

      // メソッド呼び出しのチェック
      MemberExpression(node) {
        // dataSourceManager.loadChatData() の検出
        if (
          node.object.name === 'dataSourceManager' &&
          node.property.name === 'loadChatData'
        ) {
          context.report({
            node,
            messageId: 'noDirectDataSourceLoad',
          });
        }

        // localStorageCache.load() / .save() の検出
        if (
          node.object.name === 'localStorageCache' &&
          (node.property.name === 'load' ||
           node.property.name === 'save' ||
           node.property.name === 'clear')
        ) {
          context.report({
            node,
            messageId: 'noDirectCacheAccess',
          });
        }
      },
    };
  },
};
