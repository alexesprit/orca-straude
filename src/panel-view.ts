import { integer, money, rank, type State, tokens } from './data'
import { type Model, modelBreakdown } from './models'

const escapeHtml = (value: unknown): string =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character,
  )
const kv = (items: [string, string][]) =>
  `<dl class="key-values">${items
    .map(
      ([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join('')}</dl>`

function modelsView(models: Model[], colors: Record<string, string>): string {
  const known = models.filter((model) => model.cost !== null)
  const total = known.reduce((sum, model) => sum + (model.cost ?? 0), 0)
  const complete = known.length === models.length
  const share = (model: Model) =>
    model.share === null
      ? '—'
      : model.share > 0 && model.share < 0.1
        ? '<0.1%'
        : `${model.share.toFixed(1)}%`
  // Only palette values enter styles, never API-provided strings.
  const color = (model: Model) =>
    /^#[0-9a-f]{6}$/i.test(colors[model.name] ?? '')
      ? colors[model.name]
      : '#60A5FA'
  return `<div class="models"><div class="model-heading"><h3>Models <span class="count">${models.length}</span></h3>${complete ? `<span class="muted">${money(total)}</span>` : ''}</div>
    ${
      total > 0
        ? `<div class="gauge" role="img" aria-label="${escapeHtml(
            models
              .filter((m) => m.share !== null)
              .map(
                (m) =>
                  `${m.name}: ${share(m)} of ${complete ? '' : 'reported '}model spend`,
              )
              .join(', '),
          )}">${models
            .filter((m) => m.share !== null && m.share > 0)
            .map(
              (model) =>
                `<span style="flex-grow:${model.share};background:${color(model)}"></span>`,
            )
            .join('')}</div>`
        : ''
    }
    ${models.length ? `<ul class="model-list">${models.map((model) => `<li><span class="model-name"><i aria-hidden="true" style="background:${color(model)}"></i><span>${escapeHtml(model.name)}</span></span><span class="share">${escapeHtml(share(model))}</span><span class="model-cost">${model.cost === null ? '—' : money(model.cost)}</span></li>`).join('')}</ul>` : '<p class="muted">No model usage today.</p>'}
    ${!complete ? '<p class="hint">Cost breakdown unavailable for some models. Percentages cover reported costs.</p>' : ''}
  </div>`
}

export function renderPanel(
  state: State | null,
  busy: boolean,
  error: string,
  colors: Record<string, string>,
  locale?: string,
): string {
  const snapshot = state?.snapshot
  const u = snapshot?.usage
  const p = snapshot?.profile
  const message = error || state?.error
  // A usage date is a calendar day, not an instant in the viewer's timezone.
  const date = u
    ? new Date(`${u.date}T00:00:00Z`).toLocaleDateString(locale, {
        dateStyle: 'medium',
        timeZone: 'UTC',
      })
    : ''
  return `<header><h1>Straude</h1><button id="refresh" type="button" aria-live="polite" ${busy || !state?.username ? 'disabled' : ''}>${busy ? 'Refreshing…' : 'Refresh'}</button></header>
    ${message ? `<aside class="warning" role="status"><strong>${state?.stale ? 'Showing cached data' : 'Refresh failed'}</strong><p>${escapeHtml(message)}</p></aside>` : ''}
    ${!state?.username && !busy ? '<section class="card"><h2>Connect your Straude profile</h2><p class="muted">Set your Straude username in Settings → Plugins → Straude for Orca to see usage, your profile and rankings.</p></section>' : ''}
    ${
      u && p
        ? `<section class="card"><div class="spend-heading"><h2>Today’s spend</h2><p class="muted date">${escapeHtml(date)}</p></div><div class="spend"><strong>${money(u.cost)}</strong><span class="badge ${u.verified ? 'verified' : ''}">${u.verified ? 'Verified' : 'No verified usage'}</span></div></section>
    <section class="card"><h2>Tokens</h2>${kv([
      ['Input', tokens(u.input)],
      ['Output', tokens(u.output)],
      ['Cache read', tokens(u.cacheRead)],
      ['Total', tokens(u.total)],
      ['Sessions', integer(u.sessions)],
    ])}${modelsView(modelBreakdown(u), colors)}</section>
    <section class="card"><h2>${escapeHtml(p.name || `@${p.username}`)}</h2>${p.name ? `<p class="muted">@${escapeHtml(p.username)}</p>` : ''}${kv(
      [
        [
          'Country / region',
          [
            p.country,
            p.region
              .toLowerCase()
              .replace(/\b[a-z]/g, (letter) => letter.toUpperCase()),
          ]
            .filter(Boolean)
            .join(' / ') || '—',
        ],
        ['Streak', `${integer(p.streak)} days`],
        ['Level', integer(p.level)],
        ['Followers', integer(p.followers)],
        ['Following', integer(p.following)],
        ['Posts', integer(p.posts)],
      ],
    )}</section>
    <section class="card"><h2>Rankings</h2>${kv([
      ['Global', rank(p.globalRank)],
      ['Regional', rank(p.regionalRank)],
    ])}</section>
    <p class="fetched muted">Fetched at <time datetime="${new Date(snapshot.fetchedAt).toISOString()}" title="${escapeHtml(new Date(snapshot.fetchedAt).toLocaleString(locale))}">${escapeHtml(new Date(snapshot.fetchedAt).toLocaleTimeString(locale))}</time>${state?.stale ? ' · cached' : ''}</p>`
        : ''
    }
    <a class="external-link" id="open-straude" href="https://straude.com" target="_blank" rel="noopener noreferrer">Open Straude <span aria-hidden="true">↗</span></a>`
}
