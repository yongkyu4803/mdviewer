import { Lexer, Tokenizer, marked } from 'marked';

class StartRegExp extends RegExp {
  override exec(input: string): RegExpExecArray | null {
    // Sticky expressions update lastIndex; each tokenizer call starts at zero.
    this.lastIndex = 0;
    return super.exec(input);
  }
}

function anchorRegExp(rule: RegExp): RegExp {
  return rule.source.startsWith('^') && !rule.global && !rule.multiline
    ? new StartRegExp(rule.source, `${rule.flags.replace('y', '')}y`)
    : rule;
}

function anchorRules<T extends object>(rules: T): T {
  return Object.fromEntries(Object.entries(rules).map(([name, rule]) => [name,
    rule instanceof RegExp ? anchorRegExp(rule) : rule,
  ])) as T;
}

export function lexMarkdown(content: string) {
  const tokenizer = new Tokenizer();
  const lexer = new Lexer({ gfm: true, tokenizer });
  const rules = tokenizer.rules;
  // JavaScriptCore otherwise scans the entire remaining document on failed
  // anchored matches, making large Korean documents take minutes to parse.
  // These non-global, non-multiline rules already require index zero. Explicit
  // sticky matching preserves their meaning without scanning later positions.
  tokenizer.rules = {
    block: anchorRules(rules.block),
    inline: anchorRules(rules.inline),
    other: {
      ...anchorRules(rules.other),
      listItemRegex: (bullet) => anchorRegExp(rules.other.listItemRegex(bullet)),
    },
  };
  // UTF-8 files written by Windows editors may start with a BOM, which would
  // otherwise prevent the first heading or fenced block from being recognized.
  return lexer.lex(content.replace(/^\uFEFF/, ''));
}

export function parseMarkdown(content: string): string {
  return marked.parser(lexMarkdown(content), { gfm: true });
}
