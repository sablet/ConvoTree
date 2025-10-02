module.exports = {
  'max-function-lines-tiered': {
    meta: {
      type: 'suggestion',
      docs: {
        description: 'Enforce tiered maximum function line limits (warn at 150, error at 300)',
        category: 'Best Practices',
      },
      messages: {
        tooLongWarn: 'Function has {{lineCount}} lines. Consider refactoring (warning threshold: {{warnMax}}).',
        tooLongError: 'Function has {{lineCount}} lines. Maximum allowed is {{errorMax}}.',
      },
      schema: [
        {
          type: 'object',
          properties: {
            warnMax: { type: 'integer', minimum: 1 },
            errorMax: { type: 'integer', minimum: 1 },
            skipBlankLines: { type: 'boolean' },
            skipComments: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      ],
    },
    create(context) {
      const options = context.options[0] || {};
      const warnMax = options.warnMax || 150;
      const errorMax = options.errorMax || 300;
      const skipBlankLines = options.skipBlankLines !== false;
      const skipComments = options.skipComments !== false;
      const sourceCode = context.sourceCode || context.getSourceCode();

      function getLineCount(node) {
        const lines = sourceCode.lines.slice(
          node.loc.start.line - 1,
          node.loc.end.line
        );

        return lines.filter(line => {
          const trimmed = line.trim();
          if (skipBlankLines && trimmed === '') return false;
          if (skipComments && (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*'))) return false;
          return true;
        }).length;
      }

      function checkFunction(node) {
        const lineCount = getLineCount(node);

        if (lineCount > errorMax) {
          context.report({
            node,
            messageId: 'tooLongError',
            data: { lineCount, errorMax },
          });
        } else if (lineCount > warnMax) {
          context.report({
            node,
            messageId: 'tooLongWarn',
            data: { lineCount, warnMax },
          });
        }
      }

      return {
        FunctionDeclaration: checkFunction,
        FunctionExpression: checkFunction,
        ArrowFunctionExpression: checkFunction,
      };
    },
  },
};
