import { useEffect, useMemo, useState } from 'react'
import './CssRadar.css'

const CATEGORIES = [
  { id: 'todos', label: 'Todos', icon: 'fa-solid fa-layer-group' },
  { id: 'maritimo', label: 'Marítimo', icon: 'fa-solid fa-ship' },
  { id: 'aereo', label: 'Aéreo', icon: 'fa-solid fa-plane' },
  { id: 'rodoviario', label: 'Rodoviário', icon: 'fa-solid fa-truck' },
  { id: 'portos', label: 'Portos', icon: 'fa-solid fa-anchor' },
  { id: 'comex', label: 'Comex', icon: 'fa-solid fa-file-contract' },
]

// Fontes nacionais sem RSS público ainda — aparecem na lista como "em breve"
// até que scraping/newsletter parsing seja plugado no backend.
const PLANNED_SOURCES = [
  { id: 'guia', name: 'Guia Marítimo', color: '#ff9d53' },
  { id: 'logweb', name: 'Portal Logweb', color: '#ec2732' },
  { id: 'datamar', name: 'Datamar', color: '#c48bff' },
]

const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id

function formatRelativeTime(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (isNaN(date)) return ''
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes}min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.round(hours / 24)
  if (days === 1) return 'ontem'
  if (days < 7) return `há ${days} dias`
  return date.toLocaleDateString('pt-BR')
}

function useExternalAssets() {
  useEffect(() => {
    const links = [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap',
      },
      {
        rel: 'stylesheet',
        href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css',
      },
    ]

    const created = links.map((attrs) => {
      const el = document.createElement('link')
      Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'crossOrigin') el.crossOrigin = value
        else el.setAttribute(key, value)
      })
      document.head.appendChild(el)
      return el
    })

    return () => created.forEach((el) => el.remove())
  }, [])
}

export default function CssRadar() {
  useExternalAssets()

  const [feed, setFeed] = useState({ sources: [], news: [], updatedAt: null })
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [activeCategory, setActiveCategory] = useState('todos')
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/css-feed')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        setFeed(data)
        setStatus('ready')
      } catch {
        if (cancelled) return
        setStatus('error')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const sourceMap = useMemo(() => {
    const map = {}
    feed.sources.forEach((s) => {
      map[s.id] = s
    })
    PLANNED_SOURCES.forEach((s) => {
      if (!map[s.id]) map[s.id] = { ...s, status: 'sem-feed', count: 0 }
    })
    return map
  }, [feed.sources])

  const news = useMemo(() => feed.news ?? [], [feed.news])

  const filteredNews = useMemo(() => {
    if (activeCategory === 'todos') return news
    return news.filter((n) => n.category === activeCategory)
  }, [news, activeCategory])

  const topCategories = useMemo(() => {
    const counts = {}
    news.forEach((n) => {
      counts[n.category] = (counts[n.category] ?? 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([id]) => categoryLabel(id))
  }, [news])

  const activeSourcesCount = feed.sources.filter((s) => s.status === 'ok').length

  const tickerItems = news.length ? news.concat(news) : []

  return (
    <div className="css-radar-page">
      <main className="page">
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark">
              CSS <span>LOG</span>
            </div>
            <div className="brand-route">/css</div>
          </div>
          <div className="topbar-meta">
            <span className="live-dot"></span>
            <span>Atualizado {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        <section className="hero">
          <div className="eyebrow">Radar de comércio exterior</div>
          <h1>
            O que move o comércio internacional, <span>direto pra CSS</span>.
          </h1>
          <p className="hero-sub">
            Curadoria diária de notícias sobre transporte marítimo, aéreo e rodoviário, fretes e
            comércio exterior — fontes internacionais e nacionais, num só lugar.
          </p>

          <div className="ticker-wrap">
            <div className="ticker">
              {tickerItems.map((n, i) => (
                <div className="ticker-item" key={`${n.id}-${i}`}>
                  <i className="fa-solid fa-circle"></i>
                  <span>
                    {(sourceMap[n.source]?.name ?? n.source)} · {n.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <nav className="filters">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`chip ${c.id === activeCategory ? 'active' : ''}`}
              onClick={() => setActiveCategory(c.id)}
            >
              <i className={c.icon}></i> {c.label}
            </button>
          ))}
        </nav>

        <div className="layout">
          <section className="news-grid" aria-label="Notícias">
            {status === 'loading' && (
              <div className="empty-state">Carregando as últimas notícias do setor…</div>
            )}

            {status === 'error' && (
              <div className="empty-state">
                Não foi possível buscar as notícias agora. Tente novamente em instantes.
              </div>
            )}

            {status === 'ready' && filteredNews.length === 0 && (
              <div className="empty-state">Nenhuma notícia nessa categoria ainda. Volte em breve.</div>
            )}

            {status === 'ready' &&
              filteredNews.map((n, i) => {
                const src = sourceMap[n.source] ?? { name: n.source, color: '#4eb4ff' }
                const featured = activeCategory === 'todos' && i === 0
                return (
                  <article
                    key={n.id}
                    className={`news-card ${featured ? 'featured' : ''}`}
                    style={{ '--accent': src.color }}
                  >
                    {featured && <span className="badge-live">Destaque</span>}
                    <div className="news-head">
                      <div className="news-top">
                        <span className="source-tag">
                          <span className="source-dot"></span>
                          {src.name}
                        </span>
                        <span className="news-time">{formatRelativeTime(n.publishedAt)}</span>
                      </div>
                      <h3>{n.title}</h3>
                      <p>{n.summary}</p>
                    </div>
                    <div className="news-bottom">
                      <span className="cat-pill">{categoryLabel(n.category)}</span>
                      <a className="read-link" href={n.link} target="_blank" rel="noreferrer">
                        Ler notícia <i className="fa-solid fa-arrow-right"></i>
                      </a>
                    </div>
                  </article>
                )
              })}
          </section>

          <aside className="sidebar">
            <div className="panel">
              <div className="panel-title">Painel da semana</div>
              <div className="stat-row">
                <span>Notícias monitoradas</span>
                <strong>{news.length}</strong>
              </div>
              <div className="stat-row">
                <span>Fontes ativas</span>
                <strong>{activeSourcesCount}</strong>
              </div>
              <div className="stat-row">
                <span>Temas em alta</span>
                <strong>{topCategories.length ? topCategories.join(' · ') : '—'}</strong>
              </div>
            </div>

            <div className="panel">
              <div className="panel-title">Fontes conectadas</div>
              <div className="source-list">
                {Object.values(sourceMap).map((s) => (
                  <div className={`source-row ${s.status === 'sem-feed' ? 'is-off' : ''}`} key={s.id}>
                    <span className="dot" style={{ background: s.color }}></span>
                    <span>{s.name}</span>
                    <small>{s.status === 'sem-feed' ? 'Em breve' : s.status === 'erro' ? 'Instável' : 'RSS'}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="cta-card">
              <p>
                Toda sexta, as 3 notícias mais relevantes viram conteúdo pronto pra publicar —
                carrossel ou post único.
              </p>
              <a className="cta-btn" href="#">
                <i className="fa-solid fa-wand-magic-sparkles"></i> Gerar resumo da semana
              </a>
            </div>
          </aside>
        </div>

        <footer>
          Fontes: Journal of Commerce, SupplyChainBrain (RSS ao vivo); Guia Marítimo, Portal
          Logweb, Datamar (em breve, via scraping/newsletter). Os dados são atualizados
          periodicamente no servidor para evitar sobrecarregar as fontes originais.
        </footer>
      </main>
    </div>
  )
}
