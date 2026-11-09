const state = { data: null, organic: null, mode: 'paid', organicTab: 'explorer', organicPlatform: 'all', networkId: 'linkedin', ads: [], filtered: [], visibleCount: 24, organicWeights: { rate: 45, velocity: 35, reach: 20 } };
const $ = (selector) => document.querySelector(selector);
const formatCurrency = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
const formatCompact = (value) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

function currentNetwork() { return state.data.networks[state.networkId]; }
function metricCard(value, label) { return `<article class="metric"><span class="metric-value">${value}</span><span class="metric-label">${label}</span></article>`; }
function totalsFor(ads) {
  const spend = ads.reduce((sum, ad) => sum + ad.spend_value, 0);
  const impressions = ads.reduce((sum, ad) => sum + ad.impressions_value, 0);
  return { spend, impressions, cpm: impressions ? (spend / impressions) * 1000 : 0 };
}
function renderMetrics() {
  const totals = totalsFor(state.ads);
  const fullLibraryCount = state.data.order.reduce((sum, id) => sum + state.data.networks[id].ads.length, 0);
  $('#metric-grid').innerHTML = [metricCard(formatCompact(fullLibraryCount), 'Ads in full library'), metricCard(formatCurrency(totals.spend), 'Selected-view spend'), metricCard(formatCompact(totals.impressions), 'Selected-view impressions'), metricCard(`$${totals.cpm.toFixed(2)}`, 'Selected-view CPM')].join('');
}
function groupCount(key) {
  return Object.entries(state.ads.reduce((acc, ad) => { const value = ad[key] || 'Unknown'; acc[value] = (acc[value] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
}
function classifyTheme(ad) {
  const text = `${ad.title} ${ad.advertiser} ${ad.landing_url}`.toLowerCase();
  if (/\b(ai|artificial|automation|gemini|chatgpt|claude|data|cloud|software|platform)\b/.test(text)) return 'AI, data & software';
  if (/\b(school|student|university|education|learn|course)\b/.test(text)) return 'Education';
  if (/\b(card|credit|bank|investment|finance|insurance)\b/.test(text)) return 'Finance & insurance';
  if (/\b(job|career|hiring|resume|talent|work)\b/.test(text)) return 'Work & hiring';
  if (/\b(travel|hotel|restaurant|auto|car|food|retail|shop)\b/.test(text)) return 'Consumer & lifestyle';
  return 'Other';
}
function renderFormatChart() {
  const rows = groupCount('ad_type');
  $('#format-chart').innerHTML = rows.map(([label, value]) => `<div class="format-row"><strong>${escapeHtml(label)}</strong><div class="format-track"><div class="format-fill" style="width:${value}%"></div></div><em>${value}%</em></div>`).join('');
  $('#format-chart').setAttribute('aria-label', rows.map(([key, value]) => `${key}: ${value}%`).join(', '));
}
function rankRows(items, max) {
  return items.map(([label, value]) => `<div class="rank-row" title="${escapeHtml(label)}: ${value}"><strong>${escapeHtml(label)}</strong><div class="rank-track"><div class="rank-fill" style="width:${(value / max) * 100}%"></div></div><em>${value}</em></div>`).join('');
}
function renderRankCharts() {
  const advertisers = groupCount('advertiser').slice(0, 6);
  $('#advertiser-chart').innerHTML = rankRows(advertisers, advertisers[0]?.[1] || 1);
  const themes = Object.entries(state.ads.reduce((acc, ad) => { const theme = classifyTheme(ad); acc[theme] = (acc[theme] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  $('#theme-chart').innerHTML = rankRows(themes, themes[0]?.[1] || 1);
}
function renderLearnings() {
  const dominant = groupCount('ad_type')[0] || ['Unknown', 0];
  const topTenSpend = state.ads.slice(0, 10).reduce((sum, ad) => sum + ad.spend_value, 0);
  const totalSpend = state.ads.reduce((sum, ad) => sum + ad.spend_value, 0);
  const topTenShare = totalSpend ? Math.round((topTenSpend / totalSpend) * 100) : 0;
  const preWindow = state.ads.filter((ad) => ad.first_seen && new Date(ad.first_seen) < new Date('2026-04-01')).length;
  const lowCpm = [...state.ads].filter((ad) => ad.cpm_value).sort((a, b) => a.cpm_value - b.cpm_value)[0];
  const items = [
    [`Start with the dominant format`, `${dominant[0]} accounts for ${dominant[1]}% of this view. Treat the pattern as a starting hypothesis, then test the same promise in a contrasting format.`],
    [`Separate reach from efficiency`, `The first 10 ads account for ${topTenShare}% of estimated spend. Compare CPM and longevity before assuming the largest spender has the strongest creative.`],
    [`Study evergreen winners`, `${preWindow} ads were first seen before the reporting window. Repeated use is a useful signal for messages worth adapting, not copying.`],
    [`Inspect promise-to-page continuity`, lowCpm ? `${lowCpm.advertiser} has the lowest estimated CPM in this set at $${lowCpm.cpm_value.toFixed(2)}. Open its creative and landing page together.` : 'Compare each creative with its destination before drawing a lesson from the ad alone.'],
  ];
  $('#learning-list').innerHTML = items.map(([title, text]) => `<li><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></li>`).join('');
}
function renderBenchmarks() {
  $('#benchmark-body').innerHTML = state.data.order.map((id) => {
    const network = state.data.networks[id]; const totals = totalsFor(network.ads);
    return `<tr class="${id === state.networkId ? 'selected' : ''}" data-network="${id}"><th><button type="button" data-network="${id}">${escapeHtml(network.label)}</button></th><td>${escapeHtml(network.device)}</td><td>${formatCurrency(totals.spend)}</td><td>${formatCompact(totals.impressions)}</td><td>$${totals.cpm.toFixed(2)}</td></tr>`;
  }).join('');
}
function renderNetworkSwitch() {
  const markup = state.data.order.map((id) => { const network = state.data.networks[id]; return `<button class="network ${id === state.networkId ? 'active' : ''}" data-network="${id}" type="button" aria-pressed="${id === state.networkId}">${escapeHtml(network.label)}</button>`; }).join('');
  ['#network-switch-top', '#network-switch'].forEach((selector) => { const container = $(selector); if (container) container.innerHTML = markup; });
}
function renderContext() {
  const network = currentNetwork();
  $('#header-context').textContent = `${network.label} / United States`;
  $('#platform-selection-label').textContent = `${network.label} · 100 ads`;
  $('#source-publisher').textContent = network.publisher;
  $('#source-device').textContent = `${network.channel} / ${network.device}`;
  $('#library-title').textContent = `${network.label}: all 100 ads, with destinations`;
  if (network.channel === 'Social') {
    $('#device-note-title').textContent = 'Social device split is unavailable in AdClarity.';
    $('#device-note-copy').textContent = 'These publisher reports expose All devices only. The dashboard preserves the limitation instead of estimating Mobile/Desktop shares.';
  } else {
    $('#device-note-title').textContent = `YouTube ${network.device} is shown as a separate source view.`;
    $('#device-note-copy').textContent = 'Switch between YouTube Desktop and YouTube Mobile above to compare the two ranked top-100 lists without mixing their metrics.';
  }
}
function resetFilterOptions() {
  const formats = [...new Set(state.ads.map((ad) => ad.ad_type))].sort();
  const advertisers = [...new Set(state.ads.map((ad) => ad.advertiser))].sort((a, b) => a.localeCompare(b));
  $('#format-filter').innerHTML = '<option value="all">All formats</option>' + formats.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  $('#advertiser-filter').innerHTML = '<option value="all">All advertisers</option>' + advertisers.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
}
function setLink(anchor, href, unavailableLabel) {
  if (href) { anchor.href = href; anchor.removeAttribute('aria-disabled'); anchor.classList.remove('disabled-link'); }
  else { anchor.removeAttribute('href'); anchor.setAttribute('aria-disabled', 'true'); anchor.classList.add('disabled-link'); anchor.title = unavailableLabel; }
}
function adCard(ad) {
  const node = $('#ad-card-template').content.cloneNode(true); const card = node.querySelector('.ad-card'); const image = card.querySelector('.ad-media');
  image.src = ad.thumbnail_url || ad.ad_asset_url; image.alt = `Creative preview for ${ad.title}`;
  image.addEventListener('error', () => { image.removeAttribute('src'); image.alt = 'Creative preview unavailable'; image.closest('.ad-media-wrap').classList.add('media-missing'); }, { once: true });
  card.querySelector('.rank-badge').textContent = `#${ad.rank}`; card.querySelector('.format-badge').textContent = ad.ad_type; card.querySelector('.advertiser').textContent = ad.advertiser;
  card.querySelector('.seen-range').textContent = [ad.first_seen, ad.last_seen].filter(Boolean).join(' · '); card.querySelector('.ad-title').textContent = ad.title;
  card.querySelector('.spend').textContent = ad.spend; card.querySelector('.impressions').textContent = ad.impressions; card.querySelector('.cpm').textContent = ad.cpm;
  setLink(card.querySelector('.landing-link'), ad.landing_url, 'Landing page unavailable'); setLink(card.querySelector('.creative-link'), ad.ad_asset_url || ad.thumbnail_url, 'Creative asset unavailable'); setLink(card.querySelector('.source-link'), ad.semrush_report_url, 'Source report unavailable');
  return node;
}
function applyFilters() {
  const query = $('#search').value.trim().toLowerCase(); const format = $('#format-filter').value; const advertiser = $('#advertiser-filter').value; const sort = $('#sort-control').value;
  state.filtered = state.ads.filter((ad) => { const haystack = `${ad.advertiser} ${ad.title} ${ad.landing_url}`.toLowerCase(); return (!query || haystack.includes(query)) && (format === 'all' || ad.ad_type === format) && (advertiser === 'all' || ad.advertiser === advertiser); });
  const sorters = { rank: (a, b) => a.rank - b.rank, spend: (a, b) => b.spend_value - a.spend_value, impressions: (a, b) => b.impressions_value - a.impressions_value, 'cpm-low': (a, b) => a.cpm_value - b.cpm_value, duration: (a, b) => new Date(b.first_seen) - new Date(a.first_seen) };
  state.filtered.sort(sorters[sort]); state.visibleCount = 24; renderAds();
}
function renderAds() {
  const grid = $('#ad-grid'); grid.innerHTML = ''; const visible = state.filtered.slice(0, state.visibleCount);
  if (!visible.length) grid.innerHTML = '<div class="empty-state"><h3>No ads match these filters</h3><p>Reset the controls or try a broader search.</p></div>'; else visible.forEach((ad) => grid.appendChild(adCard(ad)));
  $('#results-count').textContent = `Showing ${Math.min(state.visibleCount, state.filtered.length)} of ${state.filtered.length} ads`; $('#load-more').hidden = state.visibleCount >= state.filtered.length;
}
function selectNetwork(id) {
  if (!state.data.networks[id]) return;
  state.networkId = id; state.ads = state.data.networks[id].ads; state.filtered = [...state.ads]; state.visibleCount = 24; $('#search').value = ''; $('#sort-control').value = 'rank';
  resetFilterOptions(); renderNetworkSwitch(); renderContext(); renderMetrics(); renderFormatChart(); renderRankCharts(); renderLearnings(); renderBenchmarks(); renderAds();
}
function selectIntelligenceMode(mode) {
  if (!['paid', 'organic'].includes(mode)) return;
  state.mode = mode;
  $('#paid-view').hidden = mode !== 'paid'; $('#organic-view').hidden = mode !== 'organic';
  document.querySelectorAll('.intelligence-tab').forEach((button) => { const active = button.dataset.mode === mode; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
  if (mode === 'paid') renderContext(); else $('#header-context').textContent = 'Organic / Public trends live';
}
function selectOrganicTab(tab) {
  if (!['explorer', 'lab'].includes(tab)) return;
  state.organicTab = tab; $('#organic-explorer').hidden = tab !== 'explorer'; $('#organic-lab').hidden = tab !== 'lab';
  document.querySelectorAll('.organic-subtab').forEach((button) => { const active = button.dataset.organicTab === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
}
function organicMetric(post, metric) {
  if (metric === 'rate') {
    if (Number.isFinite(post.engagement_rate)) return post.engagement_rate;
    if (Number.isFinite(post.completion_rate_6s)) return post.completion_rate_6s;
    if (post.views && post.followers) return (post.views / post.followers) * 100;
    return null;
  }
  if (metric === 'velocity') return Number.isFinite(post.views_24h) ? post.views_24h : null;
  if (metric === 'reach') return Number.isFinite(post.views) ? post.views : null;
  return null;
}
function percentile(value, values) {
  if (!Number.isFinite(value) || !values.length) return null;
  if (values.length === 1) return 100;
  const lower = values.filter((item) => item < value).length;
  const equal = values.filter((item) => item === value).length;
  return Math.round(((lower + Math.max(0, equal - 1) / 2) / (values.length - 1)) * 100);
}
function scoreOrganicPosts(posts) {
  const groups = posts.reduce((acc, post) => { const key = `${post.platform}|${post.ranking_basis}`; (acc[key] ||= []).push(post); return acc; }, {});
  return posts.map((post) => {
    const peers = groups[`${post.platform}|${post.ranking_basis}`];
    const components = ['rate', 'velocity', 'reach'].map((metric) => {
      const value = organicMetric(post, metric);
      const values = peers.map((peer) => organicMetric(peer, metric)).filter(Number.isFinite);
      return { metric, value, percentile: percentile(value, values), weight: state.organicWeights[metric] };
    }).filter((item) => Number.isFinite(item.percentile) && item.weight > 0);
    const usedWeight = components.reduce((sum, item) => sum + item.weight, 0);
    const score = usedWeight ? Math.round(components.reduce((sum, item) => sum + item.percentile * item.weight, 0) / usedWeight) : null;
    return { ...post, organic_score: score, score_components: components.map((item) => item.metric) };
  });
}
function organicMetricMarkup(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value ?? '—')}</dd></div>`;
}
function organicCard(post, displayRank) {
  const image = post.thumbnail_url ? `<img src="${escapeHtml(post.thumbnail_url)}" alt="Thumbnail for ${escapeHtml(post.title)}" loading="lazy">` : `<div class="organic-media-placeholder"><span>${escapeHtml(post.platform)}</span><strong>${escapeHtml(post.ranking_basis)}</strong></div>`;
  const rateValue = Number.isFinite(post.engagement_rate) ? `${post.engagement_rate.toFixed(2)}%` : (Number.isFinite(post.completion_rate_6s) ? `${post.completion_rate_6s.toFixed(2)}%` : (post.views && post.followers ? `${(post.views / post.followers).toFixed(1)}×` : '—'));
  const rateLabel = Number.isFinite(post.engagement_rate) ? 'Engagement rate' : (Number.isFinite(post.completion_rate_6s) ? '6s completion' : 'Views / followers');
  const primaryLink = post.post_url || post.profile_url;
  const primaryLabel = post.format === 'Trend collection' ? 'Open collection' : (post.format === 'Trend topic' ? 'Open topic' : (post.post_url ? 'Open post' : (post.profile_url ? 'Creator profile' : 'Post URL unavailable')));
  const metricMarkup = Number.isFinite(post.collection_size)
    ? `${organicMetricMarkup('Pins', formatNumber(post.collection_size))}${organicMetricMarkup('Published', post.age_label)}${organicMetricMarkup('Source rank', `#${post.rank}`)}`
    : post.format === 'Trend topic'
      ? `${organicMetricMarkup('Type', 'Trend topic')}${organicMetricMarkup('Metrics', 'Limited')}${organicMetricMarkup('Source rank', `#${post.rank}`)}`
      : post.platform === 'TikTok'
        ? `${organicMetricMarkup('Views', Number.isFinite(post.views) ? formatCompact(post.views) : '—')}${organicMetricMarkup('Engagement', Number.isFinite(post.engagement_rate) ? `${post.engagement_rate.toFixed(2)}%` : '—')}${organicMetricMarkup('6s VTR', Number.isFinite(post.completion_rate_6s) ? `${post.completion_rate_6s.toFixed(2)}%` : '—')}`
        : `${organicMetricMarkup('Views', Number.isFinite(post.views) ? formatCompact(post.views) : '—')}${organicMetricMarkup('24h views', Number.isFinite(post.views_24h) ? formatCompact(post.views_24h) : '—')}${organicMetricMarkup(rateLabel, rateValue)}`;
  return `<article class="organic-card">
    <div class="organic-media">${image}<span class="organic-rank">Rank #${displayRank}</span><span class="organic-score">Score ${post.organic_score ?? '—'}</span></div>
    <div class="organic-card-body">
      <div class="organic-card-topline"><strong>${escapeHtml(post.platform)}</strong><span>${escapeHtml(post.ranking_basis)} · Source rank #${post.rank}</span></div>
      <h3>${escapeHtml(post.title)}</h3>
      <p class="organic-author">${escapeHtml(post.author)}${post.commercial_disclosure ? ' · disclosed partnership' : ''}</p>
      <dl class="organic-card-metrics">
        ${metricMarkup}
      </dl>
      <p class="coverage-line">Coverage ${escapeHtml(post.coverage_grade)} · ${escapeHtml(post.content_note || `score uses ${post.score_components.join(' + ') || 'source rank only'}`)}</p>
      <div class="organic-card-actions">
        <a class="primary-link${primaryLink ? '' : ' disabled-link'}" ${primaryLink ? `href="${escapeHtml(primaryLink)}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>${escapeHtml(primaryLabel)}</a>
        <a class="secondary-link" href="${escapeHtml(post.source_url)}" target="_blank" rel="noopener">Source</a>
      </div>
    </div>
  </article>`;
}
function renderOrganicPlatformSwitch() {
  const platforms = ['all', ...new Set(state.organic.posts.map((post) => post.platform))];
  $('#organic-platform-switch').innerHTML = platforms.map((platform) => {
    const count = platform === 'all' ? state.organic.posts.length : state.organic.posts.filter((post) => post.platform === platform).length;
    const label = platform === 'all' ? 'All live platforms' : platform;
    return `<button type="button" class="network ${state.organicPlatform === platform ? 'active' : ''}" data-organic-platform="${escapeHtml(platform)}">${escapeHtml(label)} <span>${count}</span></button>`;
  }).join('');
}
function renderOrganic() {
  if (!state.organic?.posts) return;
  const scored = scoreOrganicPosts(state.organic.posts);
  const selected = scored.filter((post) => state.organicPlatform === 'all' || post.platform === state.organicPlatform);
  const sort = $('#organic-sort')?.value || 'score';
  const valueForSort = (post) => ({ score: post.organic_score, rank: -post.rank, reach: post.views, velocity: post.views_24h, rate: organicMetric(post, 'rate') }[sort]);
  selected.sort((a, b) => (Number.isFinite(valueForSort(b)) ? valueForSort(b) : -Infinity) - (Number.isFinite(valueForSort(a)) ? valueForSort(a) : -Infinity));
  $('#organic-set-count').textContent = state.organic.competitor_sets.length;
  $('#organic-post-count').textContent = state.organic.posts.length;
  $('#organic-platform-count').textContent = new Set(state.organic.posts.map((post) => post.platform)).size;
  $('#organic-refresh-date').textContent = new Date(state.organic.as_of).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  renderOrganicPlatformSwitch();
  $('#organic-results-count').textContent = `Showing ${selected.length} sourced public records · missing metrics are never estimated`;
  $('#organic-grid').innerHTML = selected.length ? selected.map((post, index) => organicCard(post, index + 1)).join('') : '<div class="empty-state"><h3>No public records in this view</h3><p>Choose another live platform.</p></div>';
}
function updateOrganicWeights() {
  const weights = { rate: Number($('#rate-weight').value), velocity: Number($('#velocity-weight').value), reach: Number($('#reach-weight').value) };
  state.organicWeights = weights;
  $('#rate-weight-output').textContent = `${weights.rate}%`; $('#velocity-weight-output').textContent = `${weights.velocity}%`; $('#reach-weight-output').textContent = `${weights.reach}%`;
  const total = weights.rate + weights.velocity + weights.reach; $('#weight-total').textContent = `${total}%`; $('#weight-total').classList.toggle('invalid', total !== 100); $('#apply-organic-weights').disabled = total !== 100;
  $('#organic-formula').textContent = `${(weights.rate / 100).toFixed(2)} × Rate Percentile + ${(weights.velocity / 100).toFixed(2)} × Velocity Percentile + ${(weights.reach / 100).toFixed(2)} × Reach Percentile`;
  renderOrganic();
}
function setOrganicPreset(preset) {
  const presets = { balanced: [45, 35, 20], velocity: [30, 55, 15], scale: [30, 20, 50] }; const values = presets[preset]; if (!values) return;
  $('#rate-weight').value = values[0]; $('#velocity-weight').value = values[1]; $('#reach-weight').value = values[2]; updateOrganicWeights();
  document.querySelectorAll('.preset-card').forEach((button) => button.classList.toggle('active', button.dataset.preset === preset));
}
function bindOrganicControls() {
  document.querySelectorAll('.intelligence-tab').forEach((button) => button.addEventListener('click', () => selectIntelligenceMode(button.dataset.mode)));
  document.querySelectorAll('.organic-subtab').forEach((button) => button.addEventListener('click', () => selectOrganicTab(button.dataset.organicTab)));
  document.querySelectorAll('.preset-card').forEach((button) => button.addEventListener('click', () => { setOrganicPreset(button.dataset.preset); selectOrganicTab('lab'); }));
  ['#rate-weight', '#velocity-weight', '#reach-weight'].forEach((selector) => $(selector).addEventListener('input', updateOrganicWeights));
  $('#apply-organic-weights').addEventListener('click', () => { $('#apply-organic-weights').textContent = 'Custom weights applied'; renderOrganic(); });
  $('#organic-sort').addEventListener('change', renderOrganic);
  $('#organic-platform-switch').addEventListener('click', (event) => { const trigger = event.target.closest('[data-organic-platform]'); if (!trigger) return; state.organicPlatform = trigger.dataset.organicPlatform; renderOrganic(); });
  updateOrganicWeights();
}
function bindControls() {
  ['#search', '#format-filter', '#advertiser-filter', '#sort-control'].forEach((selector) => { $(selector).addEventListener(selector === '#search' ? 'input' : 'change', applyFilters); });
  $('#reset-filters').addEventListener('click', () => { $('#search').value = ''; $('#format-filter').value = 'all'; $('#advertiser-filter').value = 'all'; $('#sort-control').value = 'rank'; applyFilters(); });
  $('#load-more').addEventListener('click', () => { state.visibleCount += 24; renderAds(); });
  document.addEventListener('click', (event) => { const trigger = event.target.closest('[data-network]'); if (trigger) selectNetwork(trigger.dataset.network); });
  bindOrganicControls();
}
async function init() {
  try { const [response, organicResponse] = await Promise.all([fetch('data.json?v=10'), fetch('organic-data.json?v=10')]); if (!response.ok) throw new Error('Dataset could not be loaded.'); state.data = await response.json(); state.organic = organicResponse.ok ? await organicResponse.json() : { status: 'unavailable', posts: [] }; bindControls(); selectNetwork(state.data.order[0]); renderOrganic(); }
  catch (error) { $('#ad-grid').innerHTML = `<div class="empty-state"><h3>Dashboard data is unavailable</h3><p>${escapeHtml(error.message)}</p></div>`; }
}
init();
