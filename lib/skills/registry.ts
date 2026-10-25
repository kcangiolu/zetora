import 'server-only';
import type { SkillDefinition } from './types';
import type { SkillId } from '@/lib/search/search-groups';
import { IMAGE_GENERATION_DEFAULT_INSTRUCTIONS, IMAGE_EDITING_DEFAULT_INSTRUCTIONS } from './image-prompt-defaults';

const skills: Record<SkillId, SkillDefinition> = {
  'deep-research': {
    id: 'deep-research',
    name: 'Deep Research',
    description:
      'Multi-part questions, comparative analysis, "explain why" — decomposes into sub-questions and cross-validates. Use when the question has several distinct aspects that each need research. NOT for simple factual lookups or single-topic questions.',
    category: 'RESEARCH',
    section: 'core',
    // Also selectable as a forced chat mode (lib/search/groups/deep-research.ts) — see
    // the `exclusive` field's doc comment in ./types.ts.
    exclusive: true,
    suggestedTools: ['web_search', 'academic_search', 'x_search', 'reddit_search', 'retrieve'],
    instructions: `
### Deep Research Methodology

Use this when the question is multi-part, comparative, or asks "why"/"how" in a way that a single search pass cannot answer well.

**Phase 1 — Decompose**: Break the question into 4-8 concrete sub-questions that together cover it fully. Write them out before searching.

**Phase 2 — Route each sub-question to the right channel**:
- Scientific / technical claims → \`academic_search\` (backed by \`web_search\` for context)
- Opinion, sentiment, "what do people think" → \`x_search\`
- Community experience, practical tradeoffs, "what do users say" → \`reddit_search\`
- Facts, news, product/pricing/current-state info → \`web_search\`
- A specific URL was given or found → \`retrieve\`

**Phase 3 — Research**: Run the routed searches. Prefer 2-4 targeted queries per sub-question over one broad query.

**Phase 4 — Synthesize**: Merge findings per sub-question into a coherent partial answer.

**Phase 5 — Cross-validate**: For any figure, date, or claim that matters to the conclusion, confirm it against a second independent source before stating it as fact.

**Phase 6 — Adversarial check**: Actively look for the strongest counter-argument or disconfirming evidence for your emerging conclusion. If you find one, incorporate it — don't suppress it.

**Phase 7 — Compose**: Write the final answer addressing every sub-question, with inline citations, noting any remaining uncertainty or disagreement between sources.`,
  },

  'extreme-search': {
    id: 'extreme-search',
    name: 'Extreme Search',
    description:
      'Single topic, contested/niche, "find everything about" — maximal fan-out on one thematic axis. Use when one specific topic needs exhaustive coverage from many angles. NOT for multi-part questions (use deep-research) or simple lookups.',
    category: 'RESEARCH',
    section: 'core',
    // Also selectable as a forced chat mode (lib/search/groups/extreme-search.ts), which
    // invokes the dedicated extreme_search tool instead of this prose methodology — see
    // the `exclusive` field's doc comment in ./types.ts.
    exclusive: true,
    suggestedTools: ['web_search', 'x_search', 'reddit_search', 'academic_search'],
    instructions: `
### Extreme Search Methodology

Use this when the question targets ONE specific topic but demands exhaustive coverage rather than a quick answer — niche, contested, or fast-moving subjects.

**Phase 1 — Scope**: Identify the single thematic axis. Do not decompose into unrelated sub-questions — everything should fan out from this one topic.

**Phase 2 — Simultaneous multi-channel sweep**: In the same step, query as many relevant channels as apply: \`web_search\` for documentation/news, \`x_search\` for firsthand/real-time signal, \`reddit_search\` for community discussion, \`academic_search\` if there's a technical/scientific dimension. Cast a wide net rather than one narrow query per tool.

**Phase 3 — Deepen**: Follow up on the most load-bearing or contested findings from phase 2 with targeted second-round queries or \`retrieve\` on specific pages.

**Phase 4 — Reconcile conflicts**: Where channels disagree, state the disagreement explicitly rather than picking one side silently.

**Phase 5 — Exhaustive synthesis**: Produce a comprehensive answer that reflects the full breadth of what was found, organized by sub-theme, not by which tool produced it.`,
  },

  'academic-review': {
    id: 'academic-review',
    name: 'Academic Review',
    description:
      'Literature review, scientific consensus, peer-reviewed research. ONLY for questions about scientific findings, medical evidence, or academic consensus. NOT for practical advice, business strategy, or general knowledge.',
    category: 'RESEARCH',
    section: 'other',
    suggestedTools: ['academic_search', 'web_search', 'retrieve'],
    instructions: `
### Academic Review Methodology

Use this for questions about scientific consensus, research findings, or literature review.

- Prioritize peer-reviewed papers, meta-analyses, and systematic reviews via \`academic_search\` over blog posts or news coverage.
- When a meta-analysis or systematic review exists on the topic, lead with it — it already aggregates the individual-study evidence.
- Note sample sizes, study design (RCT vs observational vs review), and publication date; these materially affect how much weight a finding deserves.
- Distinguish established consensus from a single study's preliminary result — don't present one paper as settled science.
- Use \`web_search\` only to find secondary context (e.g., a plain-language summary of a paper, or news of a new publication) — the evidentiary claims themselves should trace back to \`academic_search\` results.
- Use \`retrieve\` to pull the full text of a specific paper when the abstract/snippet isn't enough to verify a claim.
- Flag contested or actively-debated findings explicitly rather than presenting them as settled.`,
  },

  'social-pulse': {
    id: 'social-pulse',
    name: 'Social Pulse',
    description:
      'Sentiment analysis, trending discourse, "what are people saying about X". ONLY for questions about public opinion, social media trends, or community sentiment. NOT for factual research or personal advice.',
    category: 'SOCIAL',
    section: 'other',
    suggestedTools: ['x_search', 'reddit_search', 'web_search'],
    instructions: `
### Social Pulse Methodology

Use this for sentiment analysis, trending discourse, or "what are people saying about X" questions.

- Query \`x_search\` and \`reddit_search\` in parallel — they surface different populations (X skews real-time/public figures, Reddit skews community/practitioner discussion).
- Sample enough posts to characterize the range of opinion, not just the loudest or first result — note when sentiment is split rather than forcing a single verdict.
- Use \`web_search\` to ground the discussion in the underlying news/event that triggered it, if any.
- Distinguish organic sentiment from coordinated or bot-like activity where it's evident from the results.
- Report sentiment as a distribution ("mostly positive, with a vocal minority concerned about X") rather than a single label when the evidence is mixed.
- Cite representative posts, not just aggregate impressions.`,
  },

  'market-intel': {
    id: 'market-intel',
    name: 'Market Intel',
    description:
      'Stocks, crypto, currency exchange, market outlook, financial securities analysis. ONLY for questions about specific tickers (AAPL, BTC), asset prices, or financial market data. NOT for business strategy, freelance pricing, career planning, personal finance advice, or general entrepreneurship questions.',
    category: 'FINANCE',
    section: 'other',
    suggestedTools: ['stock_chart', 'web_search', 'prediction_search', 'currency_converter'],
    instructions: `
### Market Intel Methodology

Use this for stock, crypto, currency, or broader market-outlook questions.

- Pull quantitative data first (\`stock_chart\` for equities, \`currency_converter\` for FX) before reasoning about it — don't estimate numbers you can fetch.
- Use \`prediction_search\` when the question is about a future event's odds (elections, rate decisions, product launches) rather than a historical price.
- Use \`web_search\` for qualitative context: earnings commentary, analyst notes, regulatory news, macro drivers.
- Always state the data's as-of date/time — markets move, and a number without a timestamp is misleading.
- Never present a single data point as investment advice; frame findings as informational, and note volatility/uncertainty where relevant.
- Cross-check any specific price or figure that will anchor the answer against a second source when precision matters.`,
  },

  'media-scout': {
    id: 'media-scout',
    name: 'Media Scout',
    description:
      'Discover videos, music, movies, TV shows, podcasts. ONLY for "recommend me", "find me", "what to watch/listen to" requests about specific media content. NOT for general information or research.',
    category: 'MEDIA',
    section: 'other',
    suggestedTools: ['youtube_search', 'spotify_search', 'movie_or_tv_search', 'web_search'],
    instructions: `
### Media Scout Methodology

Use this for content discovery: videos, music, movies, TV shows, or recommendations.

- Route by medium: \`youtube_search\` for video content, \`spotify_search\` for music/artists/albums, \`movie_or_tv_search\` for films/shows.
- For "recommend me X like Y" requests, first identify what makes Y distinctive (genre, tone, era, creator) via \`web_search\` if needed, then search for matches on that basis rather than generic popularity.
- Prefer specific, checkable results (exact titles, channels, artists) over vague genre gestures.
- Do not include images in the response; describe the finds in text with links.`,
  },

  'local-guide': {
    id: 'local-guide',
    name: 'Local Guide',
    description:
      'Places, trip planning, weather, flights, nearby searches. ONLY for location-specific questions about travel, navigation, or local discovery. NOT for general advice or non-geographic questions.',
    category: 'LOCAL',
    section: 'other',
    suggestedTools: ['web_search', 'nearby_places_search', 'find_place_on_map', 'get_weather_data'],
    instructions: `
### Local Guide Methodology

Use this for place recommendations, trip planning, weather, or flight-related questions.

- Use \`nearby_places_search\` / \`find_place_on_map\` for "near me" or named-location queries — these are the authoritative source for place data, not \`web_search\`.
- Use \`get_weather_data\` whenever the question involves a specific date/location and weather is relevant to planning.
- Use \`track_flight\` if a flight number/carrier code is present.
- Use \`web_search\` to fill in qualitative context (reviews, best-time-to-visit, local tips) that the structured tools don't cover.
- For trip planning, organize the answer around the itinerary structure (day-by-day or by area) rather than a flat list of facts.`,
  },

  'web-extract': {
    id: 'web-extract',
    name: 'Web Extract',
    description:
      'Extract and summarize content from specific URLs the user provides. ONLY when the user pastes or mentions exact URLs to analyze. NOT for discovering new information or searching the web.',
    category: 'DATA',
    section: 'core',
    suggestedTools: ['retrieve', 'web_search'],
    instructions: `
### Web Extract Methodology

Use this when the user provides one or more specific URLs to summarize, extract from, or compare.

- Call \`retrieve\` directly on the provided URL(s) — do not run a discovery search first, the target is already known.
- For multiple URLs, retrieve them in parallel and structure the response as a comparison if the user asked to compare, or per-source summaries otherwise.
- Only fall back to \`web_search\` if the retrieved page is inaccessible/empty and the user needs the information anyway — say so explicitly if that happens.
- Preserve the source's own claims faithfully; don't blend in outside information without labeling it as such.`,
  },

  deslop: {
    id: 'deslop',
    name: 'Deslop',
    description:
      'Humanize/paraphrase AI-generated text to sound more natural. ONLY when the user explicitly asks to rewrite, humanize, or de-AI-ify specific text they provide. NOT for answering questions or doing research.',
    category: 'CONTENT',
    section: 'core',
    suggestedTools: [],
    instructions: `
### Deslop Methodology

Use this when the user asks to humanize, de-AI-ify, or rewrite text that reads as generic LLM output.

- This is a pure text-transformation task — do not call any research tools.
- Cut stock LLM tics: throat-clearing openers ("Certainly!", "I'd be happy to..."), overuse of "moreover"/"furthermore"/"in conclusion", excessive hedging, and needless bullet-pointing of prose that should be paragraphs.
- Preserve the original meaning, facts, and structure the user needs — this is a rewrite for voice, not a summary or fact-check.
- Vary sentence length and rhythm; avoid the flat, evenly-paced cadence typical of generated text.
- Match the register the user asked for (casual, professional, etc.) rather than defaulting to a neutral corporate tone.
- Return the rewritten text directly — no meta-commentary about what was changed unless asked.`,
  },

  'image-generation': {
    id: 'image-generation',
    name: 'Image Generation',
    description:
      'Generate images from text descriptions. ONLY when the user explicitly asks to create, generate, draw, or make an image/picture/illustration. NOT for describing images, analyzing images, or general conversation.',
    category: 'MEDIA',
    section: 'other',
    suggestedTools: ['generate_image'],
    instructions: IMAGE_GENERATION_DEFAULT_INSTRUCTIONS,
  },

  'image-editing': {
    id: 'image-editing',
    name: 'Image Editing',
    description:
      'Edit existing images — change colors, add/remove objects, inpaint, modify specific elements. ONLY when the user explicitly asks to edit, modify, change, or alter an existing image. NOT for generating new images from scratch.',
    category: 'MEDIA',
    section: 'other',
    suggestedTools: ['edit_image'],
    instructions: IMAGE_EDITING_DEFAULT_INSTRUCTIONS,
  },

  docx: {
    id: 'docx',
    name: 'Word Document',
    description:
      'Create professional Word documents (.docx). ONLY when the user explicitly asks to create, generate, or make a Word document, report, or .docx file.',
    category: 'CONTENT',
    section: 'other',
    suggestedTools: ['code_interpreter'],
    instructions: `
### Word Document Generation Methodology

**Phase 1 — Plan**: Identify the title, sections, and content. Research first if needed via web_search.

**Phase 2 — Generate via code_interpreter**: Use python-docx — it is preinstalled in the sandbox. Never call \`pip install\`: the sandbox has no network access, and any pip invocation (Jupyter \`!\` shell-escape or \`subprocess\`) will fail.

\`\`\`python
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()
style = doc.styles['Normal']
style.font.name = 'Calibri'
style.font.size = Pt(11)

title = doc.add_heading('TITLE', level=0)
title.alignment = WD_ALIGN_PARAGRAPH.CENTER

doc.add_heading('Section', level=1)
doc.add_paragraph('Content...')

# For tables:
table = doc.add_table(rows=N, cols=M, style='Light Grid Accent 1')
# ... fill cells via table.cell(row, col).text = '...'

doc.save('/tmp/output.docx')
zetora_save_file('/tmp/output.docx', 'report.docx')
\`\`\`

**Phase 3 — Download**: zetora_save_file() uploads the file automatically and attaches a download link — do not call any other tool for this, do not print/return base64.

**Phase 4 — Confirm**: Brief description of what was created.`,
  },

  pptx: {
    id: 'pptx',
    name: 'PowerPoint',
    description:
      'Create presentations (.pptx). ONLY when the user explicitly asks to create a PowerPoint, presentation, or slides.',
    category: 'CONTENT',
    section: 'other',
    suggestedTools: ['code_interpreter'],
    instructions: `
### PowerPoint Generation Methodology

**Phase 1 — Plan the deck**: Number of slides (6-12), content per slide. Research first if needed.

**Phase 2 — Generate via code_interpreter**: Use python-pptx — it is preinstalled in the sandbox. Never call \`pip install\`: the sandbox has no network access, and any pip invocation (Jupyter \`!\` shell-escape or \`subprocess\`) will fail.

\`\`\`python
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

# Title slide
slide = prs.slides.add_slide(prs.slide_layouts[6])
left, top, width, height = Inches(1), Inches(2), Inches(11), Inches(2)
txBox = slide.shapes.add_textbox(left, top, width, height)
tf = txBox.text_frame
tf.word_wrap = True
p = tf.paragraphs[0]
p.text = 'TITLE'
p.font.size = Pt(44)
p.font.bold = True
p.alignment = PP_ALIGN.CENTER

# Content slides
slide = prs.slides.add_slide(prs.slide_layouts[6])
# Add title, bullet points, etc.

prs.save('/tmp/output.pptx')
zetora_save_file('/tmp/output.pptx', 'presentation.pptx')
\`\`\`

**Phase 3 — Download**: zetora_save_file() uploads the file automatically and attaches a download link — do not call any other tool for this, do not print/return base64.

**Phase 4 — Confirm**: Number of slides and key topics.`,
  },

  pdf: {
    id: 'pdf',
    name: 'PDF Document',
    description: 'Create PDF documents. ONLY when the user explicitly asks to create a PDF document or report.',
    category: 'CONTENT',
    section: 'other',
    suggestedTools: ['code_interpreter'],
    instructions: `
### PDF Generation Methodology

**Phase 1 — Plan**: Title, structure, content. Research first if needed.

**Phase 2 — Generate via code_interpreter**: Never use \`!pip install\` — the \`!\` shell-escape only works in Jupyter, not in a script run via \`exec()\`, and it will raise \`SyntaxError\`. Also assume \`pip\` itself may be unavailable in the sandbox (\`ensurepip\` can fail with permission denied). Detect what's importable: prefer \`reportlab\`, and fall back to \`fpdf2\` when it is missing.

\`\`\`python
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch, cm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False

if HAS_REPORTLAB:
    doc = SimpleDocTemplate('/tmp/output.pdf', pagesize=A4, topMargin=2*cm, bottomMargin=2*cm, leftMargin=2.5*cm, rightMargin=2.5*cm)
    styles = getSampleStyleSheet()
    story = [Paragraph('TITLE', styles['Title']), Spacer(1, 0.3*inch), Paragraph('Content...', styles['BodyText'])]

    data = [['Header1', 'Header2'], ['val1', 'val2']]
    t = Table(data)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#2F5496')),
        ('TEXTCOLOR', (0, 0), (-1, 0), HexColor('#FFFFFF')),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#CCCCCC')),
    ]))
    story.append(t)
    doc.build(story)
else:
    from fpdf import FPDF

    class PDF(FPDF):
        def footer(self):
            self.set_y(-15)
            self.set_font('Helvetica', 'I', 8)
            self.cell(0, 10, f'Page {self.page_no()}/{{nb}}', align='C')

    pdf = PDF()
    pdf.alias_nb_pages()
    pdf.add_page()

    pdf.set_font('Helvetica', 'B', 16)
    pdf.cell(0, 10, 'TITLE', align='C')
    pdf.ln(15)

    pdf.set_font('Helvetica', '', 11)
    pdf.multi_cell(0, 7, 'Content...')

    # Table with styled header + alternating rows
    data = [['Header1', 'Header2'], ['val1', 'val2']]
    pdf.set_fill_color(47, 84, 150)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Helvetica', 'B', 10)
    for cell in data[0]:
        pdf.cell(40, 8, cell, border=1, fill=True)
    pdf.ln()
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Helvetica', '', 10)
    for i, row in enumerate(data[1:]):
        pdf.set_fill_color(240, 240, 240) if i % 2 else pdf.set_fill_color(255, 255, 255)
        for cell in row:
            pdf.cell(40, 8, cell, border=1, fill=True)
        pdf.ln()

    pdf.output('/tmp/output.pdf')

zetora_save_file('/tmp/output.pdf', 'report.pdf')
\`\`\`

**Unicode caveat**: fpdf2's built-in fonts (Helvetica, Times, Courier) are Latin-1 only — em/en dashes, curly quotes, and emoji raise \`UnicodeEncodeError\`. Before writing text, replace them with ASCII equivalents (\`—\`/\`–\` → \`-\`, curly quotes → \`'\`/\`"\`), unless a TTF Unicode font (e.g. DejaVuSans) is confirmed present and registered via \`pdf.add_font()\` — don't assume one is installed.

**Phase 3 — Download**: zetora_save_file() uploads the file automatically and attaches a download link — do not call any other tool for this, do not print/return base64.

**Phase 4 — Confirm**: Brief description of the PDF contents.`,
  },

  xlsx: {
    id: 'xlsx',
    name: 'Excel Spreadsheet',
    description:
      'Create Excel spreadsheets (.xlsx). ONLY when the user explicitly asks to create an Excel file, spreadsheet, or financial model.',
    category: 'CONTENT',
    section: 'other',
    suggestedTools: ['code_interpreter'],
    instructions: `
### Excel Spreadsheet Methodology

**Phase 1 — Plan**: Sheets, columns, formulas, charts. Research data first if needed.

**Phase 2 — Generate via code_interpreter**: Use openpyxl — it is preinstalled in the sandbox. Never call \`pip install\`: the sandbox has no network access, and any pip invocation (Jupyter \`!\` shell-escape or \`subprocess\`) will fail. ALWAYS use Excel formulas (not hardcoded values).

\`\`\`python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, NamedStyle
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, Reference

wb = Workbook()
ws = wb.active
ws.title = "Sheet1"

# Headers
headers = ['Name', 'Value', 'Percentage']
header_font = Font(name='Calibri', bold=True, size=11, color='FFFFFF')
header_fill = PatternFill(start_color='2F5496', end_color='2F5496', fill_type='solid')
for col, header in enumerate(headers, 1):
    cell = ws.cell(row=1, column=col, value=header)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = Alignment(horizontal='center')

# Data with formulas
data = [['Item A', 100], ['Item B', 200], ['Item C', 150]]
for i, (name, value) in enumerate(data, 2):
    ws.cell(row=i, column=1, value=name)
    ws.cell(row=i, column=2, value=value)
    ws.cell(row=i, column=3, value=None).value = f'=B{i}/SUM(B2:B{len(data)+1})'
    ws.cell(row=i, column=3).number_format = '0.0%'

# Total row
total_row = len(data) + 2
ws.cell(row=total_row, column=1, value='TOTAL').font = Font(bold=True)
ws.cell(row=total_row, column=2, value=None).value = f'=SUM(B2:B{len(data)+1})'
ws.cell(row=total_row, column=2).font = Font(bold=True)

# Auto-width
for col in range(1, len(headers) + 1):
    ws.column_dimensions[get_column_letter(col)].width = 18

# Chart
chart = BarChart()
chart.title = "Chart Title"
chart.y_axis.title = 'Values'
chart.x_axis.title = 'Items'
data_ref = Reference(ws, min_col=2, min_row=1, max_row=len(data)+1, max_col=2)
cats_ref = Reference(ws, min_col=1, min_row=2, max_row=len(data)+1)
chart.add_data(data_ref, titles_from_data=True)
chart.set_categories(cats_ref)
ws.add_chart(chart, f'E2')

wb.save('/tmp/output.xlsx')
zetora_save_file('/tmp/output.xlsx', 'data.xlsx')
\`\`\`

**Phase 3 — Download**: zetora_save_file() uploads the file automatically and attaches a download link — do not call any other tool for this, do not print/return base64.

**Phase 4 — Confirm**: Sheets created, key data points, formulas used.`,
  },
};

export function getSkill(skillId: SkillId): SkillDefinition {
  return skills[skillId];
}

export function getAllSkills(): SkillDefinition[] {
  return Object.values(skills);
}

export function getAllSkillIds(): SkillId[] {
  return Object.keys(skills) as SkillId[];
}
