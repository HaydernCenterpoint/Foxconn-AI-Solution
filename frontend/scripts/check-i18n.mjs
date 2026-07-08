import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = process.cwd();
const localeFiles = {
  vi: { file: 'src/app/i18n/vi/index.ts', exportName: 'vi' },
  en: { file: 'src/app/i18n/en/index.ts', exportName: 'en' },
  'zh-CN': { file: 'src/app/i18n/zh-CN/index.ts', exportName: 'zhCN' },
};

const userTextAttributes = new Set([
  'alt',
  'aria-label',
  'description',
  'emptyMessage',
  'errorMessage',
  'label',
  'placeholder',
  'subtitle',
  'title',
]);

const allowedInlineText = new Set(['#', 'ID', 'IP', 'PLC', 'CPU', 'RAM', 'ACTIVE']);

function loadLocale({ file, exportName }) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    exports: {},
    module: { exports: {} },
  };
  vm.runInNewContext(js, context, { filename: file });
  return context.exports[exportName] ?? context.module.exports[exportName];
}

function flatten(value, prefix = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  out[prefix] = value;
  return out;
}

function difference(left, right) {
  return [...left].filter((item) => !right.has(item)).sort();
}

function collectStringUnionMembers(sourceFile, typeName) {
  const members = [];

  function visit(node) {
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === typeName &&
      ts.isUnionTypeNode(node.type)
    ) {
      for (const type of node.type.types) {
        if (ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)) {
          members.push(type.literal.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return members;
}

function addStaticKey(key, location, usedKeys) {
  const items = usedKeys.get(key) ?? [];
  items.push(location);
  usedKeys.set(key, items);
}

function walkSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(absolute, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (absolute.includes(`${path.sep}i18n${path.sep}`)) continue;
    out.push(absolute);
  }
  return out;
}

function getLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isHumanText(value) {
  return /[A-Za-zÀ-ỹ\u4e00-\u9fff]/u.test(value);
}

function collectTranslationKeys(expression, out) {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    out.push(expression.text);
    return;
  }
  if (ts.isParenthesizedExpression(expression)) {
    collectTranslationKeys(expression.expression, out);
    return;
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    collectTranslationKeys(expression.left, out);
    collectTranslationKeys(expression.right, out);
    return;
  }
  if (ts.isConditionalExpression(expression)) {
    collectTranslationKeys(expression.whenTrue, out);
    collectTranslationKeys(expression.whenFalse, out);
  }
}

function collectSourceIssues(sourceFiles, localeKeys) {
  const usedKeys = new Map();
  const hardCodedText = [];
  const staleVietnamesePattern =
    /\b(Tong|Thiet|Dang|Khong|Chua|Cai|San|Mat|Luu|Xoa|Huy|Nhap|Tai|Nguoi|duoc|chua|so do|cap nhat|ket qua|Dong|Trang|Ung dung|Vui long|Da|toi thieu|nguoi dung|ky tu)\b/i;
  const domainFile = ts.createSourceFile(
    path.join(root, 'src/shared/types/domain.ts'),
    fs.readFileSync(path.join(root, 'src/shared/types/domain.ts'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const dynamicKeyGroups = [
    ['common.machineStatus', collectStringUnionMembers(domainFile, 'MachineStatus')],
    ['common.role', collectStringUnionMembers(domainFile, 'UserRole')],
    ['pages.machineConfigScreen.approvalStatus', collectStringUnionMembers(domainFile, 'ApprovalStatus')],
  ];

  for (const [prefix, suffixes] of dynamicKeyGroups) {
    for (const suffix of suffixes) {
      addStaticKey(`${prefix}.${suffix}`, `dynamic:${prefix}`, usedKeys);
    }
  }

  for (const absolute of sourceFiles) {
    const source = fs.readFileSync(absolute, 'utf8');
    const relative = path.relative(root, absolute);
    const sourceFile = ts.createSourceFile(
      absolute,
      source,
      ts.ScriptTarget.Latest,
      true,
      absolute.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    function addUsedKey(key, node) {
      addStaticKey(key, `${relative}:${getLine(sourceFile, node)}`, usedKeys);
    }

    function visit(node) {
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(sourceFile);
        if ((callee === 't' || callee === 'translate') && node.arguments[0]) {
          const keys = [];
          collectTranslationKeys(node.arguments[0], keys);
          keys.forEach((key) => addUsedKey(key, node.arguments[0]));
        }
      }

      if (
        ts.isPropertyAssignment(node) &&
        (
          node.name.getText(sourceFile) === 'titleKey' ||
          node.name.getText(sourceFile) === 'labelKey' ||
          node.name.getText(sourceFile) === 'sessionMessage'
        ) &&
        ts.isStringLiteral(node.initializer)
      ) {
        addUsedKey(node.initializer.text, node.initializer);
      }

      if (
        ts.isPropertyAssignment(node) &&
        node.name.getText(sourceFile) === 'message' &&
        ts.isStringLiteral(node.initializer) &&
        node.initializer.text.startsWith('validation.')
      ) {
        addUsedKey(node.initializer.text, node.initializer);
      }

      if (absolute.endsWith('.tsx') && ts.isJsxText(node)) {
        const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
        if (text && isHumanText(text) && !allowedInlineText.has(text)) {
          hardCodedText.push(`${relative}:${getLine(sourceFile, node)}: hard-coded JSX text: ${text}`);
        }
      }

      if (absolute.endsWith('.tsx') && ts.isJsxAttribute(node)) {
        const name = node.name.getText(sourceFile);
        const initializer = node.initializer;
        if (
          initializer &&
          ts.isStringLiteral(initializer) &&
          userTextAttributes.has(name) &&
          isHumanText(initializer.text) &&
          !allowedInlineText.has(initializer.text)
        ) {
          hardCodedText.push(`${relative}:${getLine(sourceFile, node)}: hard-coded ${name}: ${initializer.text}`);
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    if (absolute.endsWith('.tsx')) {
      source.split(/\r?\n/).forEach((line, index) => {
        if (staleVietnamesePattern.test(line) && !line.includes("t('") && !line.includes('t("')) {
          hardCodedText.push(`${relative}:${index + 1}: possible no-accent hard-coded Vietnamese: ${line.trim()}`);
        }
      });
    }
  }

  const missingUsedKeys = [];
  for (const [key, locations] of usedKeys) {
    if (!localeKeys.has(key)) {
      missingUsedKeys.push(`${key} (${locations.join(', ')})`);
    }
  }

  return {
    hardCodedText,
    missingUsedKeys: missingUsedKeys.sort(),
    usedKeyCount: usedKeys.size,
  };
}

const locales = Object.fromEntries(
  Object.entries(localeFiles).map(([language, config]) => [language, flatten(loadLocale(config))]),
);

const errors = [];
const viKeys = new Set(Object.keys(locales.vi));

for (const [language, flat] of Object.entries(locales)) {
  const keys = new Set(Object.keys(flat));
  const missing = difference(viKeys, keys);
  const extra = difference(keys, viKeys);
  const empty = Object.entries(flat)
    .filter(([, value]) => typeof value === 'string' && value.trim().length === 0)
    .map(([key]) => key);

  if (missing.length) errors.push(`${language}: missing keys: ${missing.join(', ')}`);
  if (extra.length) errors.push(`${language}: extra keys: ${extra.join(', ')}`);
  if (empty.length) errors.push(`${language}: empty values: ${empty.join(', ')}`);
}

const sourceIssues = collectSourceIssues(walkSourceFiles(path.join(root, 'src')), viKeys);
if (sourceIssues.missingUsedKeys.length) {
  errors.push(`source: missing translation keys: ${sourceIssues.missingUsedKeys.join(', ')}`);
}
if (sourceIssues.hardCodedText.length) {
  errors.push(sourceIssues.hardCodedText.join('\n'));
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(
  `i18n check passed: ${viKeys.size} keys verified for vi, en, zh-CN; ${sourceIssues.usedKeyCount} source keys checked.`,
);
