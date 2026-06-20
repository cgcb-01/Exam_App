async function renderNews(container) {
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    const items = await NewsAPI.list();
    const badges = { JEE_MAIN:'badge-jee-main', JEE_ADVANCED:'badge-jee-advanced', NEET:'badge-neet' };
    const labels = { JEE_MAIN:'JEE Main', JEE_ADVANCED:'JEE Advanced', NEET:'NEET' };
    container.innerHTML = `
      <div class="section-title">Exam News & Updates</div>
      <div class="section-sub">Latest notifications, question set releases, and official updates.</div>
      <div class="news-list">
        ${items.length ? items.map(n => `
          <div class="news-card fade-in">
            <div class="news-meta">
              ${n.exam_type ? `<span class="news-badge ${badges[n.exam_type]||'badge-general'}">${labels[n.exam_type]||n.exam_type}</span>` : '<span class="news-badge badge-general">General</span>'}
              <span>${new Date(n.published_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span>
            </div>
            <div class="news-title">${n.title}</div>
            ${n.body ? `<div class="news-body">${n.body}</div>` : ''}
          </div>`).join('')
        : '<div class="empty-state"><div class="empty-icon">📰</div><h3>No news yet</h3><p>Check back soon for exam updates.</p></div>'}
      </div>`;
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${e.message}</h3></div>`;
  }
}
