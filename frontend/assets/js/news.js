registerPage('news', async function(el) {
  el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  const items = await GET('/api/news/');
  const colorMap = { JEE_MAIN:'badge-blue', JEE_ADVANCED:'badge-purple', NEET:'badge-green' };
  el.innerHTML = `<div class="fade-in">
    <div class="page-header"><div class="page-title">Exam News & Updates</div>
    <div class="page-sub">Latest official notifications, new question set releases, and exam schedule updates.</div></div>
    ${items.length ? `<div style="display:flex;flex-direction:column;gap:10px">
      ${items.map(n=>`
      <div class="card"><div class="card-body">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          <span class="badge ${colorMap[n.exam_type]||'badge-gray'}">${(n.exam_type||'General').replace('_',' ')}</span>
          <span style="font-size:11px;color:var(--c-text4)">${new Date(n.published_at).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'long',year:'numeric'})}</span>
        </div>
        <div style="font-size:14px;font-weight:700;color:var(--c-text);margin-bottom:6px;line-height:1.4">${n.title}</div>
        ${n.body?`<div style="font-size:12px;color:var(--c-text3);line-height:1.7">${n.body}</div>`:''}
      </div></div>`).join('')}
    </div>` : `<div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="1.5"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2z"/></svg></div><div class="empty-title">No news yet</div><div class="empty-sub">Check back soon for exam updates.</div></div>`}
  </div>`;
});
