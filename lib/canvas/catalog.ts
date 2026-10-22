import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { z } from 'zod';

/**
 * Display-only components for Canvas research dashboards, rendered by
 * registry.tsx. Their props and descriptions are what the model reads, through
 * canvasCatalog.prompt() in the Canvas instructions: a prop the registry ignores
 * does not belong here.
 */
export const canvasCatalog = defineCatalog(schema, {
  components: {
    // Layout
    Stack: {
      props: z.object({
        direction: z.enum(['horizontal', 'vertical']).nullable(),
        gap: z.enum(['sm', 'md', 'lg']).nullable(),
        wrap: z.boolean().nullable(),
      }),
      slots: ['default'],
      description: 'Flex layout container',
      example: { direction: 'vertical', gap: 'md', wrap: null },
    },

    Card: {
      props: z.object({
        title: z.string().nullable(),
        description: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Titled container for charts, text and timelines. Never put a Card inside a Card, nor a Metric, KPIRow or Table inside one.',
      example: { title: 'Key Findings', description: 'Summary of research' },
    },

    Grid: {
      props: z.object({
        columns: z.enum(['1', '2', '3']).nullable(),
        gap: z.enum(['sm', 'md', 'lg']).nullable(),
      }),
      slots: ['default'],
      description: 'Responsive grid layout. Max 3 columns. Use 2 columns when children have long text.',
      example: { columns: '3', gap: 'md' },
    },

    // Typography
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(['h1', 'h2', 'h3', 'h4']).nullable(),
      }),
      description: 'Section heading',
      example: { text: 'Research Dashboard', level: 'h1' },
    },

    Text: {
      props: z.object({
        content: z.string(),
        muted: z.boolean().nullable(),
      }),
      description: 'Plain prose. Supports <strong>, <em> and <code>, no links: use Link or SourceCard for those.',
      example: { content: 'Here is your data overview.' },
    },

    // Data Display
    Badge: {
      props: z.object({
        text: z.string(),
        variant: z.enum(['default', 'secondary', 'destructive', 'outline']).nullable(),
      }),
      description: 'Status badge',
      example: { text: 'Live', variant: 'default' },
    },

    Alert: {
      props: z.object({
        variant: z.enum(['default', 'destructive']).nullable(),
        title: z.string(),
        description: z.string().nullable(),
      }),
      description: 'Alert or info message',
    },

    Separator: {
      props: z.object({}),
      description: 'Visual divider',
    },

    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        detail: z.string().nullable(),
        trend: z.enum(['up', 'down', 'neutral']).nullable(),
      }),
      description:
        'Single stat with a trend icon. Keep value SHORT (numbers, short names). Place it directly in a Stack or Grid, never in a Card.',
      example: {
        label: 'Growth Rate',
        value: '12.5%',
        detail: 'Up from 8.2%',
        trend: 'up',
      },
    },

    Table: {
      props: z.object({
        data: z.array(z.record(z.string(), z.unknown())),
        columns: z.array(
          z.object({
            key: z.string(),
            label: z.string(),
          }),
        ),
        emptyMessage: z.string().nullable(),
      }),
      description:
        'Sortable data table with at least 3 rows, each column with a non-empty label. Place it directly in a Stack or Grid, never in a Card: it draws its own border.',
      example: {
        data: { $state: '/results' },
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'value', label: 'Value' },
        ],
      },
    },

    Link: {
      props: z.object({
        text: z.string(),
        href: z.string(),
      }),
      description:
        'A pill-shaped link showing a favicon + domain. Use for referencing external sources inline. href must be a full URL.',
      example: { text: 'openai.com', href: 'https://openai.com/blog/gpt-5' },
    },

    Image: {
      props: z.object({
        src: z.string(),
        alt: z.string(),
        caption: z.string().nullable(),
      }),
      description:
        'Click-to-zoom chart image. Use ONLY for chart PNG URLs returned by extreme_search, never for other web images.',
      example: {
        src: 'https://storage.example.com/charts/abc123.png',
        alt: 'Revenue trend chart',
        caption: 'Generated from Q4 2025 data',
      },
    },

    // Charts
    BarChart: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(z.record(z.string(), z.unknown())),
        xKey: z.string(),
        yKey: z.string(),
        yKeys: z.array(z.string()).max(3).nullable(),
        aggregate: z.enum(['sum', 'count', 'avg']).nullable(),
        height: z.number().nullable(),
      }),
      description:
        'Bar chart. xKey is the category field, yKey the value field. For up to 3 series side by side, also set yKeys (e.g. ["desktop","mobile"]). Wrap it in a Card.',
    },

    LineChart: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(z.record(z.string(), z.unknown())),
        xKey: z.string(),
        yKey: z.string(),
        aggregate: z.enum(['sum', 'count', 'avg']).nullable(),
        height: z.number().nullable(),
      }),
      description:
        'Line chart with a filled area, for a trend. xKey is the x-axis field, yKey the numeric value field. Wrap it in a Card.',
    },

    PieChart: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(z.record(z.string(), z.unknown())),
        nameKey: z.string(),
        valueKey: z.string(),
        height: z.number().nullable(),
      }),
      description:
        'Donut chart for proportions. nameKey is the label field, valueKey the numeric value field. Wrap it in a Card.',
    },

    Callout: {
      props: z.object({
        type: z.enum(['info', 'tip', 'warning', 'important']).nullable(),
        title: z.string().nullable(),
        content: z.string(),
      }),
      description:
        'Highlighted box for a key insight, tip, warning or important note. Full width: place it in a Stack, not in a Grid.',
      example: {
        type: 'tip',
        title: 'Key Insight',
        content: 'This data suggests a strong upward trend.',
      },
    },

    Accordion: {
      props: z.object({
        items: z.array(
          z.object({
            title: z.string(),
            content: z.string(),
          }),
        ),
      }),
      description: 'Titled sections of detailed text, all shown open. Use when a topic has 3+ paragraphs of detail.',
      example: {
        items: [{ title: 'Overview', content: 'A brief introduction.' }],
      },
    },

    Timeline: {
      props: z.object({
        items: z.array(
          z.object({
            title: z.string(),
            description: z.string().nullable(),
            date: z.string().nullable(),
            status: z.enum(['completed', 'current', 'upcoming']).nullable(),
          }),
        ),
      }),
      description: 'Vertical timeline showing ordered events, steps, or historical milestones',
      example: {
        items: [
          {
            title: 'Discovery',
            description: 'Initial breakthrough',
            date: '1905',
            status: 'completed',
          },
        ],
      },
    },

    // Comparison & Attribution
    StatComparison: {
      props: z.object({
        labelA: z.string(),
        valueA: z.string(),
        labelB: z.string(),
        valueB: z.string(),
        delta: z.string().nullable(),
        trend: z.enum(['up', 'down', 'neutral']).nullable(),
      }),
      description:
        'Side-by-side comparison of two values with a delta indicator. Use for A vs B, before/after, or model comparisons.',
      example: {
        labelA: 'GPT-5.2',
        valueA: '57%',
        labelB: 'GPT-5.3',
        valueB: '60%',
        delta: '+3%',
        trend: 'up',
      },
    },

    Quote: {
      props: z.object({
        text: z.string(),
        author: z.string(),
        source: z.string().nullable(),
        href: z.string().nullable(),
      }),
      description:
        'Styled blockquote with attribution. Use for notable quotes, statements, or key findings from research sources.',
      example: {
        text: "This is the most significant advance in reasoning we've seen.",
        author: 'Sam Altman',
        source: 'X post',
        href: 'https://x.com/sama/status/123',
      },
    },

    KPIRow: {
      props: z.object({
        items: z
          .array(
            z.object({
              label: z.string(),
              value: z.string(),
              detail: z.string().nullable(),
            }),
          )
          .min(2)
          .max(4),
      }),
      description:
        'A single horizontal banner showing 2-4 top-level stats. MAXIMUM 4 items — never more. Each item has a label (short uppercase), value (number/percentage), and optional detail. Use INSTEAD of Grid+Metric for a compact hero section. Items is an array of objects, NOT nested components. Never inside a Card.',
      example: {
        items: [
          { label: 'Revenue', value: '$4.2B', detail: '+18% YoY' },
          { label: 'Users', value: '120M', detail: 'Monthly active' },
          { label: 'Growth', value: '32%', detail: null },
        ],
      },
    },

    LayerCard: {
      props: z.object({
        label: z.string(),
        title: z.string(),
        href: z.string().nullable(),
      }),
      description:
        'A layered visual card with a small label on top and a bold title below. Use for feature highlights, key findings, or navigation-style callouts. Place in Grid(2) or Grid(3).',
      example: {
        label: 'Key Finding',
        title: 'GPT-5.3 achieves SOTA on 6 of 7 benchmarks',
        href: null,
      },
    },

    SourceCard: {
      props: z.object({
        url: z.string(),
        title: z.string(),
        description: z.string().nullable(),
      }),
      description:
        'Compact research source card with favicon, domain, and snippet. Use to cite important sources in the dashboard.',
      example: {
        url: 'https://openai.com/blog/gpt-5',
        title: 'Introducing GPT-5',
        description: 'Our most capable model yet with breakthrough reasoning.',
      },
    },
  },

  actions: {},
});
