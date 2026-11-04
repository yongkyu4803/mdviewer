import { describe, expect, it } from 'vitest';
import { marked } from 'marked';
import { parseMarkdown } from '../src/lib/markdownParser';

describe('WebKit-compatible Markdown parsing', () => {
  it('recognizes the first heading in Windows UTF-8 BOM / CRLF files', () => {
    expect(parseMarkdown('\uFEFF# 예산안\r\n\r\n본문\r\n'))
      .toBe('<h1>예산안</h1>\n<p>본문</p>\n');
  });

  const examples = [
    '# 제목\n\n본문 **강조**와 *기울임*, ~~취소선~~, `code` 및 한글입니다.\n',
    '제목\n===\n\n소제목\n---\n\n첫 문단\n\n둘째 문단\n\n***\n',
    '- [x] 완료\n- [ ] 진행\n  - 중첩\n\n3. 항목\n4. 항목\n\n끝\n',
    '> ## 인용 제목\n>\n> **인용문**\n> - 항목\n\n바깥 문단\n',
    '```html\n<table>\n\n# literal\n</table>\n```\n\n    indented code\n',
    '| 구분 | 값 |\n| :--- | ---: |\n| a\\|b | 10 |\n| *항목* | 20 |\n',
    '<table>\n<tr><th rowspan="2">회계</th><th colspan="2">예산</th></tr>\n<tr><td>2026<br>예산</td><td>2027</td></tr>\n</table>\n\n다음 문단\n',
    '[자료][budget]\n\n![그림][image]\n\n[budget]: https://example.com "예산"\n[image]: images/chart.png\n',
    '<div>\n\n**HTML 안의 문단**\n\n</div>\n\n&lt;태그&gt;  \n줄바꿈\n',
    'A ***강조*** B\n\n![이미지](images/%ED%95%9C%EA%B8%80.PNG)\n\n<https://example.com>\n',
  ];

  it.each(examples)('preserves standard Markdown output for %j', (source) => {
    expect(parseMarkdown(source)).toBe(marked.parse(source));
  });

  it('resets sticky state across repeated blocks and separate documents', () => {
    const source = examples.join('\n').repeat(100);
    const expected = marked.parse(source);
    expect(parseMarkdown(source)).toBe(expected);
    expect(parseMarkdown(source)).toBe(expected);
    expect(parseMarkdown('# 다음 문서')).toBe(marked.parse('# 다음 문서'));
  });
});
