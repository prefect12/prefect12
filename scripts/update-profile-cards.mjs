import { mkdir, writeFile } from 'node:fs/promises'

const username = process.env.GITHUB_USERNAME || 'prefect12'
const token = process.env.GITHUB_TOKEN
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': `${username}-profile-card-generator`,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
}

const languageColors = {
  Go: '#00ADD8',
  Swift: '#F05138',
  TypeScript: '#3178C6',
  JavaScript: '#F1E05A',
  Python: '#3572A5',
  Shell: '#89E051',
  'Jupyter Notebook': '#DA5B0B',
  Vue: '#41B883',
  HTML: '#E34C26',
  CSS: '#563D7C',
  Java: '#B07219',
  Rust: '#DEA584',
  C: '#555555',
  'C++': '#F34B7D',
}

async function fetchJson(url) {
  const response = await fetch(url, { headers })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${body}`)
  }
  return response.json()
}

async function fetchAllPages(url) {
  const results = []
  let page = 1
  while (true) {
    const separator = url.includes('?') ? '&' : '?'
    const items = await fetchJson(`${url}${separator}per_page=100&page=${page}`)
    results.push(...items)
    if (items.length < 100) break
    page += 1
  }
  return results
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value)
}

function svgShell({ width, height, title, content }) {
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">Generated GitHub profile card for ${escapeXml(username)}.</desc>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="#111217" stroke="#30363D"/>
  <text x="24" y="34" fill="#FF6E96" font-family="Segoe UI, Ubuntu, sans-serif" font-size="18" font-weight="700">${escapeXml(title)}</text>
  ${content}
</svg>
`
}

function renderStatsCard({ user, repos }) {
  const ownRepos = repos.filter((repo) => !repo.fork)
  const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0)
  const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0)
  const latestRepo = [...ownRepos].sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))[0]
  const rows = [
    ['Public repos', user.public_repos],
    ['Stars earned', totalStars],
    ['Forks', totalForks],
    ['Followers', user.followers],
  ]

  const content = `
  <text x="24" y="62" fill="#C9D1D9" font-family="Segoe UI, Ubuntu, sans-serif" font-size="13">Backend and platform developer</text>
  ${rows
    .map(([label, value], index) => {
      const x = index % 2 === 0 ? 24 : 250
      const y = index < 2 ? 104 : 154
      return `<text x="${x}" y="${y - 18}" fill="#8B949E" font-family="Segoe UI, Ubuntu, sans-serif" font-size="12">${escapeXml(label)}</text>
  <text x="${x}" y="${y + 8}" fill="#79DCE8" font-family="Segoe UI, Ubuntu, sans-serif" font-size="28" font-weight="700">${formatNumber(value)}</text>`
    })
    .join('\n  ')}
  <text x="24" y="186" fill="#8B949E" font-family="Segoe UI, Ubuntu, sans-serif" font-size="12">Recently active: ${escapeXml(latestRepo?.name || username)}</text>`

  return svgShell({ width: 480, height: 200, title: "Kade's GitHub Stats", content })
}

function renderLanguageCard(languageTotals) {
  const totalBytes = [...languageTotals.values()].reduce((sum, value) => sum + value, 0)
  const languages = [...languageTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, bytes]) => ({
      name,
      bytes,
      pct: totalBytes === 0 ? 0 : (bytes / totalBytes) * 100,
      color: languageColors[name] || '#8B949E',
    }))

  let offset = 0
  const barSegments = languages
    .map((language) => {
      const width = Math.max(1, (language.pct / 100) * 312)
      const segment = `<rect x="${24 + offset}" y="54" width="${width.toFixed(2)}" height="10" fill="${language.color}"/>`
      offset += width
      return segment
    })
    .join('\n  ')

  const items = languages
    .map((language, index) => {
      const y = 92 + index * 18
      return `<circle cx="30" cy="${y - 4}" r="4" fill="${language.color}"/>
  <text x="42" y="${y}" fill="#C9D1D9" font-family="Segoe UI, Ubuntu, sans-serif" font-size="12">${escapeXml(language.name)}</text>
  <text x="292" y="${y}" fill="#8B949E" font-family="Segoe UI, Ubuntu, sans-serif" font-size="12" text-anchor="end">${language.pct.toFixed(1)}%</text>`
    })
    .join('\n  ')

  const content = `
  <clipPath id="barClip"><rect x="24" y="54" width="312" height="10" rx="5"/></clipPath>
  <rect x="24" y="54" width="312" height="10" rx="5" fill="#21262D"/>
  <g clip-path="url(#barClip)">
  ${barSegments}
  </g>
  ${items}`

  return svgShell({ width: 360, height: 200, title: 'Top Languages', content })
}

async function main() {
  const [user, repos] = await Promise.all([
    fetchJson(`https://api.github.com/users/${username}`),
    fetchAllPages(`https://api.github.com/users/${username}/repos?type=owner`),
  ])

  const languageTotals = new Map()
  const ownRepos = repos.filter((repo) => !repo.fork && repo.name !== username)
  await Promise.all(
    ownRepos.map(async (repo) => {
      const languages = await fetchJson(repo.languages_url)
      for (const [language, bytes] of Object.entries(languages)) {
        languageTotals.set(language, (languageTotals.get(language) || 0) + bytes)
      }
    }),
  )

  await mkdir('assets', { recursive: true })
  await writeFile('assets/github-stats.svg', renderStatsCard({ user, repos }))
  await writeFile('assets/top-languages.svg', renderLanguageCard(languageTotals))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
