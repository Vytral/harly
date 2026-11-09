import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(process.cwd(), 'src');
const attributes = new Set(['aria-label', 'aria-description', 'title', 'placeholder', 'alt']);
const findings: { file: string; line: number; kind: string; text: string }[] = [];
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : /\.tsx$/.test(entry.name) && !/\.(test|spec)\.tsx$/.test(entry.name) ? [join(dir, entry.name)] : []);
}
for (const file of files(root)) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function add(node: ts.Node, kind: string, text: string) {
    const value = text.replace(/\s+/g, ' ').trim();
    if (!/[\p{L}]/u.test(value)) return;
    findings.push({ file: relative(root, file), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind, text: value });
  }
  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) add(node, 'jsx-text', node.text);
    if (ts.isJsxAttribute(node) && attributes.has(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) add(node, node.name.getText(source), node.initializer.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
}
console.log(JSON.stringify(findings, null, 2));
