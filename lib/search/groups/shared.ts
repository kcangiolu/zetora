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

export const redditLinkFormatExamples = `

---

## 🔗 CITATION FORMAT - REDDIT SPECIFIC RULES

### Link Formatting (MANDATORY FOR REDDIT)
- ⚠️ **USE POST TITLE FORMAT**: Citations must use format \`[Post Title](url)\` with the actual Reddit post title
- ⚠️ **NO NUMBERED FOOTNOTES**: Never use [1], [2], [3] style references
- ⚠️ **NO REFERENCE SECTIONS**: Never create separate "References", "Sources", or "Links" sections
- ⚠️ **INLINE ONLY**: Citations must appear immediately after the sentence they support
- ⚠️ **USE ACTUAL POST TITLES**: Always use the exact post title from Reddit, not generic text
- ⚠️ **NO FULL STOPS AFTER LINKS**: Never place a period (.) immediately after a citation link
- ⚠️ **NO PIPE CHARACTERS IN CITATION TEXT**: Never include pipe characters (|) in the citation text inside square brackets - remove or replace them

### Correct Reddit Examples:
- "Many users recommend Python for beginners [Python Learning Guide](https://reddit.com/r/learnprogramming/...)"
- "The community discusses AI safety [AI Safety Discussion](url1) [Ethics in AI](url2)"
- "Best practices include version control [Git Workflow Tips](url)"
- "Multiple Reddit sources: [Best Over Ear Headphones under $100](url1) [What are the BEST Budget Headphones?](url2)"

### Incorrect Examples (NEVER DO THIS):
- ❌ "[Source](url)" or "[Link](url)" - too generic, must use actual post title
- ❌ "[Post Title - r/subreddit](url)" - do not include subreddit in citation format
- ❌ "According to Reddit [reddit.com/r/...]" - missing post title
- ❌ "Post Title [1]" with "[1] https://..." at the end - numbered footnotes forbidden
- ❌ Bare URLs: "See https://reddit.com/r/..."
- ❌ Generic text: "[text](url)" without actual post title
- ❌ Grouped citations at end: "Sources: [Post 1](url1) [Post 2](url2)"
- ❌ "Users recommend Python [Python Learning Guide](url)." - full stop after link is FORBIDDEN
- ❌ "Community discusses AI [AI Safety Discussion](url)." - period after citation is FORBIDDEN
- ❌ "Multiple sources: [Post Title 1](url1) | [Post Title 2](url2)" - pipe separator between links is FORBIDDEN, use space instead
- ❌ "Information from [Post 1](url1) | [Post 2](url2)" - never use pipe (|) to separate citation links
- ❌ "[Post Title | Subreddit](url)" - pipe character (|) inside citation text is FORBIDDEN, remove or replace it
- ❌ "[Feature A | Feature B](url)" - pipe characters in post titles must be removed or replaced with commas/spaces

### Key Rules for Reddit:
1. Always use format: \`[Post Title](url)\` with the actual Reddit post title
2. Post Title = exact title of the Reddit post as it appears on Reddit
3. Do NOT include subreddit name (r/subreddit) in the citation format
4. Place citation immediately after the statement
5. Multiple sources: list them inline \`[Post Title 1](url1) [Post Title 2](url2)\` - use spaces, NOT pipe characters
6. Never group citations at the end of paragraphs or documents
7. Never place a full stop (period) immediately after a citation link
8. Never use pipe characters (|) to separate citation links - use spaces instead
9. Never include pipe characters (|) in the citation text inside square brackets - remove or replace them`;
