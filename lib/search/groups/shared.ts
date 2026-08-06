import 'server-only';

export const linkFormatExamples = `

---

## 🔗 CITATION FORMAT - CRITICAL RULES

### Link Formatting (MANDATORY)
- ⚠️ **USE INLINE TEXT CITATIONS**: Citations must use markdown link format with text as display text
- ⚠️ **FORMAT**: \`[text](url)\`
- ⚠️ **NO NUMBERED FOOTNOTES**: Never use [1], [2], [3] style references
- ⚠️ **NO REFERENCE SECTIONS**: Never create separate "References", "Sources", or "Links" sections
- ⚠️ **INLINE ONLY**: Citations must appear immediately after the sentence they support
- ⚠️ **NO FULL STOPS AFTER LINKS**: Never place a period (.) immediately after a citation link
- ⚠️ **NO PIPE CHARACTERS IN CITATION TEXT**: Never include pipe characters (|) in the citation text inside square brackets - remove or replace them

### Correct Examples:
- "GPT-5.1 launches with new reasoning features [text](https://platform.openai.com/docs/models)"
- "Zapier offers workflow automation tools [text](https://zapier.com/features)"
- "SEC filings available online [text](https://www.sec.gov/filings)"
- "Multiple sources: [text1](url1) [text2](url2)"

### Incorrect Examples (NEVER DO THIS):
- ❌ "GPT-5.1 launches [1]" with "[1] https://..." at the end
- ❌ "According to OpenAI [platform.openai.com]" without markdown link format
- ❌ Bare URLs: "See https://example.com"
- ❌ Generic text: "[Source](url)" or "[Link](url)"
- ❌ "Feature launches [text](url)." - full stop after link is FORBIDDEN
- ❌ "Information available [text](url)." - period after citation is FORBIDDEN
- ❌ "Multiple sources: [text1](url1) | [text2](url2)" - pipe separator between links is FORBIDDEN, use space instead
- ❌ "Information from [Source 1](url1) | [Source 2](url2)" - never use pipe (|) to separate citation links
- ❌ "[Title | Subtitle](url)" - pipe character (|) inside citation text is FORBIDDEN, remove or replace it
- ❌ "[Feature A | Feature B](url)" - pipe characters in citation text must be removed or replaced with commas/spaces
- ❌ DO NOT WRAP ANYTHING AROUND THE LINKS!

### Key Rules:
1. Always use markdown format: \`[text](url)\`
2. Display text = text snippet provided in the link
3. Place citation immediately after the statement
4. Multiple sources: list them inline \`[text1](url1) [text2](url2)\` - use spaces, NOT pipe characters
5. Never group citations at the end of paragraphs or documents
6. Never place a full stop (period) immediately after a citation link
7. Never use pipe characters (|) to separate citation links - use spaces instead
8. Never include pipe characters (|) in the citation text inside square brackets - remove or replace them`;

export const nestedCodeFenceInstructions = `

---

## 🔲 NESTED CODE FENCES - CRITICAL RULE

- ⚠️ **LONGER OUTER FENCE**: If a code block or copyable snippet itself contains its own \`\`\`fenced\`\`\` blocks (e.g. a prompt, doc, or README you're writing out that shows code examples inside it), open the OUTER block with **four** backticks (\`\`\`\`) instead of three
- ⚠️ **CLOSING FENCE LENGTH**: A fence only closes on a line with the SAME NUMBER OR MORE backticks than its own opening fence — using three backticks for both the outer and inner blocks makes the outer block close early, on the inner block's closing fence
- ⚠️ **RULE OF THUMB**: Outer fence backtick count > any backtick count used inside it`;
