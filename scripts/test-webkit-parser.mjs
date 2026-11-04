import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { marked } from 'marked';
import ts from 'typescript';

// Node/V8 does not reproduce the anchored-regex slowdown in the macOS app.
if (process.platform !== 'darwin') {
  console.log('WebKit parser check requires macOS (JavaScriptCore).');
  process.exit(0);
}

const directory = await mkdtemp(join(tmpdir(), 'markmd-webkit-'));
try {
  const source = process.argv[2] ? await readFile(process.argv[2], 'utf8') : `
# 과학기술정보통신부 예산안

사업설명자료 **계속사업** 예산안 설명입니다.

- 계속사업
- 시설지원

<table>
<tr><th rowspan="2">사업명</th><th colspan="2">예산</th></tr>
<tr><td>2026<br>본예산</td><td>2027<br>예산안</td></tr>
</table>

| 구분 | 예산 |
| --- | --- |
| 시설지원 | 1,813 |

`.repeat(2000);
  const parser = await readFile(new URL('../src/lib/markdownParser.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(parser, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const library = await readFile(new URL('../node_modules/marked/lib/marked.umd.js', import.meta.url), 'utf8');
  await Promise.all([
    writeFile(join(directory, 'source.md'), source),
    writeFile(join(directory, 'expected.html'), marked.parse(source.replace(/^\uFEFF/, ''))),
    writeFile(join(directory, 'parser.js'), `${library}\nvar exports = {};\nfunction require() { return marked; }\n${compiled}\nglobalThis.parseUnderTest = exports.parseMarkdown;`),
    writeFile(join(directory, 'check.swift'), `
import Foundation
import JavaScriptCore
let context = JSContext()!
context.exceptionHandler = { _, exception in
  fputs("JavaScriptCore: \\(exception?.toString() ?? "unknown error")\\n", stderr)
}
context.evaluateScript(try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8))
if context.exception != nil { exit(1) }
context.setObject(try String(contentsOfFile: CommandLine.arguments[2], encoding: .utf8), forKeyedSubscript: "source" as NSString)
context.setObject(try String(contentsOfFile: CommandLine.arguments[3], encoding: .utf8), forKeyedSubscript: "expected" as NSString)
let result = context.evaluateScript("(() => { const start = Date.now(); const html = parseUnderTest(source); return JSON.stringify({ ms: Date.now() - start, matches: html === expected, characters: html.length }); })()")
if context.exception != nil { exit(1) }
print(result!.toString()!)
`),
  ]);
  const result = spawnSync('swift', [join(directory, 'check.swift'),
    join(directory, 'parser.js'), join(directory, 'source.md'), join(directory, 'expected.html')],
  { encoding: 'utf8', timeout: 30_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'JavaScriptCore check failed');
  const outcome = JSON.parse(result.stdout);
  if (!outcome.matches) throw new Error('JavaScriptCore output differs from marked');
  if (outcome.ms > 15_000) throw new Error(`WebKit parsing took ${outcome.ms} ms`);
  console.log(`WebKit parser: ${outcome.ms} ms; output matches marked (${outcome.characters} characters).`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
