export type CatalogAuth = 'oauth' | 'apikey' | 'open';
export type CategoryId =
  | 'all'
  | 'dev'
  | 'productivity'
  | 'design'
  | 'crm'
  | 'payments'
  | 'database'
  | 'search'
  | 'data'
  | 'travel'
  | 'email'
  | 'shopping'
  | 'other';

interface CatalogField {
  label: string;
  placeholder: string;
  headerName: string;
  hintText?: string;
  hintUrl?: string;
  steps?: Array<{ text: string; url?: string; urlLabel?: string }>;
}

interface OAuthSetupField {
  label: string;
  placeholder: string;
  hintText?: string;
  hintUrl?: string;
  key: 'oauthClientId' | 'oauthClientSecret';
}

export interface CatalogItem {
  name: string;
  category: CategoryId;
  url: string;
  auth: CatalogAuth;
  maintainer: string;
  maintainerUrl: string;
  customIcon?: string;
  fields?: CatalogField[];
  oauthSetup?: OAuthSetupField[];
}

// ─── Catalog data ─────────────────────────────────────────────────────────────

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'dev', label: 'Dev Tools' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'design', label: 'Design' },
  { id: 'crm', label: 'CRM' },
  { id: 'payments', label: 'Payments' },
  { id: 'database', label: 'Database' },
  { id: 'search', label: 'Search' },
  { id: 'data', label: 'Data' },
  { id: 'travel', label: 'Travel' },
  { id: 'email', label: 'Email' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'other', label: 'Other' },
];

export const CATALOG: CatalogItem[] = [
  {
    name: 'Asana',
    category: 'productivity',
    url: 'https://mcp.asana.com/sse',
    auth: 'oauth',
    maintainer: 'Asana',
    maintainerUrl: 'https://asana.com',
  },
  {
    name: 'Autosend',
    category: 'email',
    url: 'https://mcp.autosend.com/',
    auth: 'oauth',
    maintainer: 'Autosend',
    maintainerUrl: 'https://autosend.com',
  },
  {
    name: 'Google Workspace',
    category: 'productivity',
    url: 'https://google-mcp.zetora.app/mcp',
    auth: 'apikey',
    maintainer: 'Google',
    maintainerUrl: 'https://google.com',
    fields: [
      {
        label: 'API Key',
        placeholder: 'gmc_…',
        headerName: 'Authorization',
        hintText: 'Get API key',
        hintUrl: 'https://google-mcp.zetora.app',
        steps: [
          {
            text: 'Go to the Google MCP dashboard and sign in with Google',
            url: 'https://google-mcp.zetora.app',
            urlLabel: 'Open dashboard',
          },
          {
            text: 'Google will show an "unverified app" warning — click Advanced → Go to Zetora (unsafe) to continue. This is expected for developer tools.',
          },
          { text: 'Select all services you want: Google Calendar, Google Sheets, Gmail, Google Docs, Google Drive' },
          { text: 'Set API key expiration to Never (recommended)' },
          { text: 'Copy the generated API key (starts with gmc_) and paste it above' },
          {
            text: 'To Revoke or Manage the API Key, go to https://google-mcp.zetora.app/revoke and paste the API key and click "Revoke".',
          },
        ],
      },
    ],
  },
  {
    name: 'Atlassian',
    category: 'dev',
    url: 'https://mcp.atlassian.com/v1/sse',
    auth: 'oauth',
    maintainer: 'Atlassian',
    maintainerUrl: 'https://atlassian.com',
  },
  {
    name: 'Attio',
    category: 'crm',
    url: 'https://mcp.attio.com/mcp',
    auth: 'oauth',
    maintainer: 'Attio',
    maintainerUrl: 'https://attio.com',
  },
  {
    name: 'Box',
    category: 'productivity',
    url: 'https://mcp.box.com',
    auth: 'oauth',
    maintainer: 'Box',
    maintainerUrl: 'https://box.com',
  },
  // {
  //   name: 'Canva',
  //   category: 'design',
  //   url: 'https://mcp.canva.com/mcp',
  //   auth: 'oauth',
  //   maintainer: 'Canva',
  //   maintainerUrl: 'https://canva.com',
  //   oauthSetup: [
  //     {
  //       key: 'oauthClientId',
  //       label: 'Canva Client ID',
  //       placeholder: 'xxxxxxxxxxxxxxxx',
  //       hintText: 'Create a Canva app and copy Client ID',
  //       hintUrl: 'https://www.canva.com/developers',
  //     },
  //     {
  //       key: 'oauthClientSecret',
  //       label: 'Canva Client Secret',
  //       placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  //       hintText: 'Allow your app host and add redirect URL in Canva app settings',
  //       hintUrl: 'https://www.canva.com/developers',
  //     },
  //   ],
  // },
  {
    name: 'Close CRM',
    category: 'crm',
    url: 'https://mcp.close.com/mcp',
    auth: 'oauth',
    maintainer: 'Close',
    maintainerUrl: 'https://close.com',
  },
  {
    name: 'Cloudflare',
    category: 'dev',
    url: 'https://mcp.cloudflare.com/mcp',
    auth: 'oauth',
    maintainer: 'Cloudflare',
    maintainerUrl: 'https://cloudflare.com',
  },
  {
    name: 'Cloudflare Workers',
    category: 'dev',
    url: 'https://bindings.mcp.cloudflare.com/sse',
    auth: 'oauth',
    maintainer: 'Cloudflare',
    maintainerUrl: 'https://cloudflare.com',
  },
  {
    name: 'Cloudflare Observability',
    category: 'dev',
    url: 'https://observability.mcp.cloudflare.com/sse',
    auth: 'oauth',
    maintainer: 'Cloudflare',
    maintainerUrl: 'https://cloudflare.com',
  },
  {
    name: 'Cloudinary',
    category: 'design',
    url: 'https://asset-management.mcp.cloudinary.com/sse',
    auth: 'oauth',
    maintainer: 'Cloudinary',
    maintainerUrl: 'https://cloudinary.com',
  },
  // { name: 'Figma', category: 'design', url: 'https://mcp.figma.com/mcp', auth: 'oauth', maintainer: 'Figma', maintainerUrl: 'https://figma.com' },
  {
    name: 'GitHub',
    category: 'dev',
    url: 'https://api.githubcopilot.com/mcp',
    auth: 'oauth',
    maintainer: 'GitHub',
    maintainerUrl: 'https://github.com',
  },
  {
    name: 'Hugging Face',
    category: 'dev',
    url: 'https://huggingface.co/mcp?login',
    auth: 'oauth',
    maintainer: 'Hugging Face',
    maintainerUrl: 'https://huggingface.co',
  },
  {
    name: 'Intercom',
    category: 'crm',
    url: 'https://mcp.intercom.com/sse',
    auth: 'oauth',
    maintainer: 'Intercom',
    maintainerUrl: 'https://intercom.com',
  },
  {
    name: 'Indeed',
    category: 'other',
    url: 'https://mcp.indeed.com/claude/mcp',
    auth: 'oauth',
    maintainer: 'Indeed',
    maintainerUrl: 'https://indeed.com',
  },
  {
    name: 'InVideo',
    category: 'other',
    url: 'https://mcp.invideo.io/sse',
    auth: 'oauth',
    maintainer: 'InVideo',
    maintainerUrl: 'https://invideo.io',
  },
  {
    name: 'Instant',
    category: 'dev',
    url: 'https://mcp.instantdb.com/mcp',
    auth: 'oauth',
    maintainer: 'Instant',
    maintainerUrl: 'https://instantdb.com',
  },
  {
    name: 'Jam',
    category: 'dev',
    url: 'https://mcp.jam.dev/mcp',
    auth: 'oauth',
    maintainer: 'Jam.dev',
    maintainerUrl: 'https://jam.dev',
  },
  {
    name: 'Knock',
    category: 'crm',
    url: 'https://mcp.knock.app/mcp',
    auth: 'oauth',
    maintainer: 'Knock',
    maintainerUrl: 'https://knock.app',
  },
  {
    name: 'Linear',
    category: 'productivity',
    url: 'https://mcp.linear.app/mcp',
    auth: 'oauth',
    maintainer: 'Linear',
    maintainerUrl: 'https://linear.app',
  },
  {
    name: 'Meta Ads',
    category: 'other',
    url: 'https://mcp.pipeboard.co/meta-ads-mcp',
    auth: 'oauth',
    maintainer: 'Pipeboard',
    maintainerUrl: 'https://pipeboard.co',
  },
  {
    name: 'Morningstar',
    category: 'data',
    url: 'https://mcp.morningstar.com/mcp',
    auth: 'oauth',
    maintainer: 'Morningstar',
    maintainerUrl: 'https://morningstar.com',
  },
  {
    name: 'monday.com',
    category: 'productivity',
    url: 'https://mcp.monday.com/sse',
    auth: 'oauth',
    maintainer: 'monday.com',
    maintainerUrl: 'https://monday.com',
  },
  {
    name: 'Neon',
    category: 'database',
    url: 'https://mcp.neon.tech/mcp',
    auth: 'oauth',
    maintainer: 'Neon',
    maintainerUrl: 'https://neon.tech',
  },
  {
    name: 'Netlify',
    category: 'dev',
    url: 'https://netlify-mcp.netlify.app/mcp',
    auth: 'oauth',
    maintainer: 'Netlify',
    maintainerUrl: 'https://netlify.com',
  },
  {
    name: 'Notion',
    category: 'productivity',
    url: 'https://mcp.notion.com/mcp',
    auth: 'oauth',
    maintainer: 'Notion',
    maintainerUrl: 'https://notion.so',
  },
  {
    name: 'Orshot',
    category: 'design',
    url: 'https://mcp.orshot.com/mcp',
    auth: 'oauth',
    maintainer: 'Orshot',
    maintainerUrl: 'https://orshot.com',
  },
  {
    name: 'Parallel Task',
    category: 'search',
    url: 'https://task-mcp.parallel.ai/mcp',
    auth: 'oauth',
    maintainer: 'Parallel AI',
    maintainerUrl: 'https://parallel.ai',
  },
  {
    name: 'Parallel Search',
    category: 'search',
    url: 'https://search-mcp.parallel.ai/mcp',
    auth: 'oauth',
    maintainer: 'Parallel AI',
    maintainerUrl: 'https://parallel.ai',
  },
  {
    name: 'PayPal',
    category: 'payments',
    url: 'https://mcp.paypal.com/sse',
    auth: 'oauth',
    maintainer: 'PayPal',
    maintainerUrl: 'https://paypal.com',
  },
  {
    name: 'Plaid',
    category: 'payments',
    url: 'https://api.dashboard.plaid.com/mcp/sse',
    auth: 'oauth',
    maintainer: 'Plaid',
    maintainerUrl: 'https://plaid.com',
  },
  {
    name: 'Port IO',
    category: 'dev',
    url: 'https://mcp.port.io/v1',
    auth: 'oauth',
    maintainer: 'Port IO',
    maintainerUrl: 'https://port.io',
  },
  {
    name: 'Prisma Postgres',
    category: 'database',
    url: 'https://mcp.prisma.io/mcp',
    auth: 'oauth',
    maintainer: 'Prisma',
    maintainerUrl: 'https://prisma.io',
  },
  {
    name: 'Ramp',
    category: 'payments',
    url: 'https://ramp-mcp-remote.ramp.com/mcp',
    auth: 'oauth',
    maintainer: 'Ramp',
    maintainerUrl: 'https://ramp.com',
  },
  {
    name: 'Rube',
    category: 'other',
    url: 'https://rube.app/mcp',
    auth: 'oauth',
    maintainer: 'Composio',
    maintainerUrl: 'https://rube.app',
  },
  {
    name: 'Scorecard',
    category: 'other',
    url: 'https://scorecard-mcp.dare-d5b.workers.dev/sse',
    auth: 'oauth',
    maintainer: 'Scorecard',
    maintainerUrl: 'https://scorecard.io',
  },
  {
    name: 'Sentry',
    category: 'dev',
    url: 'https://mcp.sentry.dev/sse',
    auth: 'oauth',
    maintainer: 'Sentry',
    maintainerUrl: 'https://sentry.io',
  },
  {
    name: 'Simplescraper',
    category: 'search',
    url: 'https://mcp.simplescraper.io/mcp',
    auth: 'oauth',
    maintainer: 'Simplescraper',
    maintainerUrl: 'https://simplescraper.io',
  },
  {
    name: 'Square',
    category: 'payments',
    url: 'https://mcp.squareup.com/sse',
    auth: 'oauth',
    maintainer: 'Square',
    maintainerUrl: 'https://squareup.com',
  },
  {
    name: 'Stack Overflow',
    category: 'dev',
    url: 'https://mcp.stackoverflow.com',
    auth: 'oauth',
    maintainer: 'Stack Overflow',
    maintainerUrl: 'https://stackoverflow.com',
  },
  {
    name: 'Stripe',
    category: 'payments',
    url: 'https://mcp.stripe.com/',
    auth: 'oauth',
    maintainer: 'Stripe',
    maintainerUrl: 'https://stripe.com',
  },
  {
    name: 'Supabase',
    category: 'database',
    url: 'https://mcp.supabase.com/mcp',
    auth: 'oauth',
    maintainer: 'Supabase',
    maintainerUrl: 'https://supabase.com',
  },
  {
    name: 'Vercel',
    category: 'dev',
    url: 'https://mcp.vercel.com',
    auth: 'oauth',
    maintainer: 'Vercel',
    maintainerUrl: 'https://vercel.com',
  },
  {
    name: 'Webflow',
    category: 'design',
    url: 'https://mcp.webflow.com/sse',
    auth: 'oauth',
    maintainer: 'Webflow',
    maintainerUrl: 'https://webflow.com',
  },
  {
    name: 'Wix',
    category: 'design',
    url: 'https://mcp.wix.com/sse',
    auth: 'oauth',
    maintainer: 'Wix',
    maintainerUrl: 'https://wix.com',
  },
  {
    name: 'Dropbox',
    category: 'productivity',
    url: 'https://mcp.dropbox.com/mcp',
    auth: 'oauth',
    maintainer: 'Dropbox',
    maintainerUrl: 'https://dropbox.com',
  },
  {
    name: 'Slack',
    category: 'productivity',
    url: 'https://mcp.slack.com/mcp',
    auth: 'oauth',
    maintainer: 'Slack',
    maintainerUrl: 'https://slack.com',
  },
  {
    name: 'Context7',
    category: 'dev',
    url: 'https://mcp.context7.com/mcp',
    auth: 'open',
    maintainer: 'Context7',
    maintainerUrl: 'https://context7.com',
  },
  {
    name: 'DeepWiki',
    category: 'search',
    url: 'https://mcp.deepwiki.com/mcp',
    auth: 'open',
    maintainer: 'Devin',
    maintainerUrl: 'https://devin.ai',
  },
  {
    name: 'Exa Search',
    category: 'search',
    url: 'https://mcp.exa.ai/mcp',
    auth: 'open',
    maintainer: 'Exa',
    maintainerUrl: 'https://exa.ai',
  },
  {
    name: 'Excalidraw',
    category: 'design',
    url: 'https://mcp.excalidraw.com/mcp',
    auth: 'open',
    maintainer: 'Excalidraw',
    maintainerUrl: 'https://excalidraw.com',
  },
  {
    name: 'GitMCP',
    category: 'dev',
    url: 'https://gitmcp.io/docs',
    auth: 'open',
    maintainer: 'GitMCP',
    maintainerUrl: 'https://gitmcp.io',
  },
  {
    name: 'Kiwi',
    category: 'travel',
    url: 'https://mcp.kiwi.com',
    auth: 'open',
    maintainer: 'Kiwi',
    maintainerUrl: 'https://kiwi.com',
  },
  {
    name: 'Lastminute',
    category: 'travel',
    url: 'https://mcp.lastminute.com/mcp',
    auth: 'open',
    maintainer: 'lastminute.com',
    maintainerUrl: 'https://lastminute.com',
  },
  {
    name: 'Trivago',
    category: 'travel',
    url: 'https://mcp.trivago.com/mcp',
    auth: 'open',
    maintainer: 'Trivago',
    maintainerUrl: 'https://trivago.com',
  },
  {
    name: 'Kensho Finance',
    category: 'data',
    url: 'https://kfinance.kensho.com/integrations/mcp',
    auth: 'open',
    maintainer: 'Kensho',
    maintainerUrl: 'https://kensho.com',
  },
  {
    name: 'PubMed',
    category: 'search',
    url: 'https://pubmed.mcp.claude.com/mcp',
    auth: 'open',
    maintainer: 'Anthropic',
    maintainerUrl: 'https://pubmed.ncbi.nlm.nih.gov',
  },
  {
    name: 'Render',
    category: 'dev',
    url: 'https://mcp.render.com/mcp',
    auth: 'apikey',
    maintainer: 'Render',
    maintainerUrl: 'https://render.com',
    fields: [
      {
        label: 'API Key',
        placeholder: 'rnd_…',
        headerName: 'Authorization',
        hintText: 'Get from Render dashboard',
        hintUrl: 'https://dashboard.render.com/u/settings#api-keys',
      },
    ],
  },
  {
    name: 'Dodo Payments',
    category: 'payments',
    url: 'https://mcp.dodopayments.com/sse',
    auth: 'oauth',
    maintainer: 'Dodo Payments',
    maintainerUrl: 'https://dodopayments.com',
  },
  {
    name: 'Google BigQuery',
    category: 'data',
    url: 'https://bigquery.googleapis.com/mcp',
    auth: 'apikey',
    maintainer: 'Google',
    maintainerUrl: 'https://cloud.google.com/bigquery',
    fields: [
      {
        label: 'Access Token',
        placeholder: 'ya29.…',
        headerName: 'Authorization',
        hintText: 'Get from Google Cloud credentials',
        hintUrl: 'https://console.cloud.google.com/apis/credentials',
      },
    ],
  },
  {
    name: 'Google Compute',
    category: 'dev',
    url: 'https://compute.googleapis.com/mcp',
    auth: 'apikey',
    maintainer: 'Google',
    maintainerUrl: 'https://cloud.google.com/compute',
    fields: [
      {
        label: 'Access Token',
        placeholder: 'ya29.…',
        headerName: 'Authorization',
        hintText: 'Get from Google Cloud credentials',
        hintUrl: 'https://console.cloud.google.com/apis/credentials',
      },
    ],
  },
  {
    name: 'Google GKE',
    category: 'dev',
    url: 'https://container.googleapis.com/mcp',
    auth: 'apikey',
    maintainer: 'Google',
    maintainerUrl: 'https://cloud.google.com/kubernetes-engine',
    fields: [
      {
        label: 'Access Token',
        placeholder: 'ya29.…',
        headerName: 'Authorization',
        hintText: 'Get from Google Cloud credentials',
        hintUrl: 'https://console.cloud.google.com/apis/credentials',
      },
    ],
  },
  {
    name: 'Google Maps',
    category: 'other',
    url: 'https://mapstools.googleapis.com/mcp',
    auth: 'apikey',
    maintainer: 'Google',
    maintainerUrl: 'https://developers.google.com/maps',
    fields: [
      {
        label: 'API Key',
        placeholder: 'AIza…',
        headerName: 'Authorization',
        hintText: 'Get from Google Cloud credentials',
        hintUrl: 'https://console.cloud.google.com/apis/credentials',
      },
    ],
  },
  {
    name: 'HubSpot',
    category: 'crm',
    url: 'https://mcp.hubspot.com/',
    auth: 'oauth',
    maintainer: 'HubSpot',
    maintainerUrl: 'https://hubspot.com',
  },
  {
    name: 'Zapier',
    category: 'productivity',
    url: 'https://mcp.zapier.com/api/mcp/mcp',
    auth: 'apikey',
    maintainer: 'Zapier',
    maintainerUrl: 'https://zapier.com',
    fields: [
      {
        label: 'API Key',
        placeholder: 'sk_…',
        headerName: 'Authorization',
        hintText: 'Get from Zapier developer settings',
        hintUrl: 'https://zapier.com/app/developer',
      },
    ],
  },
  {
    name: 'Penny',
    category: 'other',
    url: 'https://penny.apps.trychannel3.com/mcp',
    auth: 'oauth',
    maintainer: 'Penny',
    maintainerUrl: 'https://penny.shop',
    customIcon: '/penny.png',
  },
];

export const FEATURED_NAMES = [
  'Notion',
  'Rube',
  'GitHub',
  'Exa Search',
  'Vercel',
  'Slack',
  'Google Workspace',
  'Hugging Face',
  'Kiwi',
  'Excalidraw',
  'Context7',
  'Penny',
];
export const CATALOG_URLS = new Set(CATALOG.map((i) => i.url.replace(/\/$/, '')));

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getTransportType(url: string): 'sse' | 'http' {
  const lower = url.toLowerCase();
  return lower.endsWith('/sse') || lower.includes('/sse?') ? 'sse' : 'http';
}

// Second-level TLDs that need 3 parts kept (e.g. mospi.gov.in → gov.in is the TLD)
const SLD_TLDS = new Set([
  'gov.in',
  'co.in',
  'org.in',
  'net.in',
  'ac.in',
  'co.uk',
  'org.uk',
  'me.uk',
  'net.uk',
  'ac.uk',
  'co.jp',
  'co.nz',
  'co.za',
  'co.kr',
  'co.il',
  'com.au',
  'net.au',
  'org.au',
  'com.br',
  'net.br',
  'org.br',
  'nih.gov',
]);

function rootDomain(serverUrl: string): string {
  try {
    const parts = new URL(serverUrl).hostname.split('.');
    if (parts.length <= 2) return parts.join('.');
    const last2 = parts.slice(-2).join('.');
    if (SLD_TLDS.has(last2)) return parts.slice(-3).join('.');
    return last2;
  } catch {
    return '';
  }
}

export function faviconUrl(serverUrl: string): string {
  const domain = rootDomain(serverUrl);
  if (!domain) return '';
  const google = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  return `/api/proxy-image?url=${encodeURIComponent(google)}`;
}
