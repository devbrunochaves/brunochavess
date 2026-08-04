import { XMLParser } from 'fast-xml-parser'

// Fontes com RSS confirmado. Cada fonte pode ter mais de um feed (ex: sub-feeds
// por categoria) — todos são buscados em paralelo e mesclados. Se uma URL
// específica mudar ou passar a responder 404, as demais fontes continuam
// funcionando normalmente (falha isolada por feed).
const SOURCES = [
  {
    id: 'joc',
    name: 'Journal of Commerce',
    color: '#4eb4ff',
    feeds: ['https://www.joc.com/api/rssfeed'],
  },
  {
    id: 'scb',
    name: 'SupplyChainBrain',
    color: '#35df7b',
    feeds: ['https://www.supplychainbrain.com/rss/articles'],
  },
  // Sem RSS público — estrutura pronta para plugar scraping/newsletter parsing.
  // Basta adicionar feeds: [] -> [] com um fetcher dedicado (ver fetchFeed
  // abaixo) sem alterar o restante do fluxo.
  { id: 'guia', name: 'Guia Marítimo', color: '#ff9d53', feeds: [] },
  { id: 'logweb', name: 'Portal Logweb', color: '#ec2732', feeds: [] },
  { id: 'datamar', name: 'Datamar', color: '#c48bff', feeds: [] },
]

const CATEGORY_RULES = [
  {
    id: 'portos',
    keywords: [/\bport(o|os|s)?\b/i, /\bterminal(is)?\b/i, /\bberth\b/i, /\bdoca(s)?\b/i],
  },
  {
    id: 'maritimo',
    keywords: [
      /mar[ií]tim/i,
      /\bocean\b/i,
      /\bvessel(s)?\b/i,
      /\bship(ping|ment|s)?\b/i,
      /\bconta[ií]ner(es)?\b/i,
      /\bcontainer(s)?\b/i,
      /\bcarrier(s)?\b/i,
    ],
  },
  {
    id: 'aereo',
    keywords: [/a[ée]re[oa]/i, /\bair\s?(cargo|freight|line|craft|port)?\b/i, /\baviation\b/i],
  },
  {
    id: 'rodoviario',
    keywords: [/rodovi[áa]ri/i, /\btruck(ing|s)?\b/i, /\bhighway\b/i, /\brodovia(s)?\b/i],
  },
  {
    id: 'comex',
    keywords: [
      /comex/i,
      /com[ée]rcio exterior/i,
      /\btariff(s)?\b/i,
      /\btarifa(s|ç[aã]o)?\b/i,
      /\bcustoms\b/i,
      /\btrade\b/i,
      /\bexport(a[çc][ãa]o|s)?\b/i,
      /\bimport(a[çc][ãa]o|s)?\b/i,
      /\bmdic\b/i,
    ],
  },
]

const CACHE_TTL_MS = 45 * 60 * 1000 // 45 min
const FEED_TIMEOUT_MS = 8000

let cache = { data: null, fetchedAt: 0 }

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
})

function stripHtml(input = '') {
  return String(input)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function inferCategory(text) {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((re) => re.test(text))) return rule.id
  }
  return 'comex'
}

function toArray(value) {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

async function fetchText(url, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; CSSLogRadar/1.0; +https://cssdolog.com/css)',
        accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function parseRssItems(xml, source) {
  const doc = xmlParser.parse(xml)
  const channelItems = toArray(doc?.rss?.channel?.item)
  const feedEntries = toArray(doc?.feed?.entry) // fallback Atom

  const rawItems = channelItems.length ? channelItems : feedEntries

  return rawItems
    .map((item) => {
      const title = stripHtml(item.title?.['#text'] ?? item.title ?? '')
      const description = stripHtml(
        item.description ?? item.summary ?? item['content:encoded'] ?? ''
      )
      const link =
        (typeof item.link === 'string' && item.link) ||
        item.link?.['@_href'] ||
        item.link?.[0]?.['@_href'] ||
        item.guid?.['#text'] ||
        item.guid ||
        ''
      const pubDateRaw = item.pubDate || item.published || item.updated || null
      const pubDate = pubDateRaw ? new Date(pubDateRaw) : null

      if (!title || !link) return null

      const category = inferCategory(`${title} ${description}`)

      return {
        id: `${source.id}-${hashString(link)}`,
        title,
        summary: description.slice(0, 220),
        link,
        source: source.id,
        category,
        publishedAt: pubDate && !isNaN(pubDate) ? pubDate.toISOString() : null,
      }
    })
    .filter(Boolean)
}

async function fetchSourceNews(source) {
  if (!source.feeds.length) {
    return { source, items: [], status: 'sem-feed' }
  }

  const results = await Promise.allSettled(
    source.feeds.map(async (url) => {
      const xml = await fetchText(url, FEED_TIMEOUT_MS)
      return parseRssItems(xml, source)
    })
  )

  const items = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)

  const allFailed = results.length > 0 && results.every((r) => r.status === 'rejected')

  return { source, items, status: allFailed ? 'erro' : 'ok' }
}

async function buildFeedPayload() {
  const results = await Promise.all(SOURCES.map(fetchSourceNews))

  const news = results
    .flatMap((r) => r.items)
    .sort((a, b) => {
      const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
      const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
      return db - da
    })

  // dedupe por link, mantendo a ordem já cronológica
  const seen = new Set()
  const deduped = news.filter((n) => {
    if (seen.has(n.link)) return false
    seen.add(n.link)
    return true
  })

  const sources = results.map(({ source, status, items }) => ({
    id: source.id,
    name: source.name,
    color: source.color,
    status,
    count: items.length,
  }))

  return {
    updatedAt: new Date().toISOString(),
    sources,
    news: deduped,
  }
}

export default async function handler(req, res) {
  try {
    const now = Date.now()
    const isStale = !cache.data || now - cache.fetchedAt > CACHE_TTL_MS

    if (isStale) {
      try {
        const fresh = await buildFeedPayload()
        cache = { data: fresh, fetchedAt: now }
      } catch (err) {
        // mantém o cache antigo (se existir) em vez de derrubar a página
        if (!cache.data) throw err
      }
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600')
    res.status(200).json(cache.data)
  } catch {
    res.status(200).json({
      updatedAt: new Date().toISOString(),
      sources: [],
      news: [],
      error: 'Não foi possível buscar as notícias agora. Tente novamente em instantes.',
    })
  }
}
