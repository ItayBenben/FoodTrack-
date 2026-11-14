// RTL is structural (CLAUDE.md rule 6, 05 §2.4): physical left/right is a lint error.
const CLASS_RE = /(^|[\s"'`:])(-?(ml|mr|pl|pr|left|right|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|border-l|border-r|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-[\w./[\]-]+|text-left|text-right|float-left|float-right|clear-left|clear-right|border-l|border-r)(?=$|[\s"'`])/;
const STYLE_KEYS = new Set(['marginLeft', 'marginRight', 'paddingLeft', 'paddingRight', 'left', 'right', 'borderLeft', 'borderRight', 'borderLeftWidth', 'borderRightWidth', 'textAlign']);
const ALLOW_COMMENT = 'logical-allow';

export default {
  meta: { type: 'problem', docs: { description: 'use logical CSS properties only' }, schema: [] },
  create(context) {
    const src = context.sourceCode ?? context.getSourceCode();
    const allowed = (node) => src.getCommentsBefore(node).some((c) => c.value.includes(ALLOW_COMMENT));
    const checkString = (node, value) => {
      if (typeof value !== 'string' || allowed(node)) return;
      const m = value.match(CLASS_RE);
      if (m) context.report({ node, message: `Physical direction class '${m[2]}' — use ps-/pe-/ms-/me-/start-/end-/text-start/text-end.` });
    };
    return {
      Literal(node) { checkString(node, node.value); },
      TemplateElement(node) { checkString(node, node.value.cooked); },
      Property(node) {
        const k = node.key.type === 'Identifier' ? node.key.name : node.key.value;
        if (!STYLE_KEYS.has(k) || allowed(node)) return;
        if (k === 'textAlign' && node.value.type === 'Literal' && !['left', 'right'].includes(node.value.value)) return;
        if (k === 'textAlign' || node.parent?.parent?.type === 'JSXExpressionContainer' || node.parent?.type === 'ObjectExpression') {
          context.report({ node, message: `Physical style '${k}' — use marginInlineStart/insetInlineStart/textAlign:start.` });
        }
      },
    };
  },
};
