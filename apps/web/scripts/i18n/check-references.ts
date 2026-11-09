import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(process.cwd(), 'src');
const catalog: unknown = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'));
const errors: string[] = [];
let checked = 0;
let dynamic = 0;
function exists(path: string): boolean {
  let node: unknown = catalog;
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object' || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string';
}
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : /\.[jt]sx?$/.test(entry.name) ? [join(dir, entry.name)] : []);
}
for (const file of files(root)) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (!ts.isCallExpression(init)) { ts.forEachChild(node, visit); return; }
      const callee = init.expression;
      if (ts.isIdentifier(callee) && ['useTranslations', 'getTranslations'].includes(callee.text) && init.arguments.length === 1 && ts.isStringLiteral(init.arguments[0]!)) {
        const namespace = init.arguments[0].text;
        const variable = node.name.text;
        let scope: ts.Node = node;
        while (scope.parent && !ts.isBlock(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
        function inspect(current: ts.Node) {
          if (ts.isCallExpression(current)) {
            const expression = current.expression;
            const direct = ts.isIdentifier(expression) && expression.text === variable;
            const method = ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === variable && ['rich', 'markup', 'raw'].includes(expression.name.text);
            if ((direct || method) && current.arguments.length) {
              const key = current.arguments[0]!;
              if (ts.isStringLiteral(key)) {
                checked++;
                const full = `${namespace}.${key.text}`;
                if (!exists(full)) {
                  const pos = source.getLineAndCharacterOfPosition(key.getStart(source));
                  errors.push(`${file.slice(root.length + 1)}:${pos.line + 1}: missing ${full}`);
                }
              } else dynamic++;
            }
          }
          ts.forEachChild(current, inspect);
        }
        inspect(scope);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
console.log(`Checked ${checked} static translation references; ${dynamic} dynamic references require manual review.`);
