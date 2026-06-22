registerPage('library', function(el) {
  if (!requireLogin()) return;
  const items = JSON.parse(localStorage.getItem('ep_library')||'[]');
  const isPremium = Auth.isPremium();
  el.innerHTML = `<div class="fade-in">
    <div class="page-header"><div class="page-title">My Library</div>
    <div class="page-sub">Downloaded content.${!isPremium?' Premium subscription expired — renew to re-access downloads.':''}</div></div>
    ${!items.length ? `<div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg></div><div class="empty-title">Library is empty</div><div class="empty-sub">Download PDFs from PYQs or Premium content to store them here.</div><button class="btn btn-primary" style="margin-top:16px" onclick="go('pyq')">Browse PYQs</button></div>`
    : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
      ${items.map(item=>`
      <div class="card" style="${!isPremium&&item.premium?'opacity:.5':''}" >
        <div class="card-body">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--c-text4);margin-bottom:6px">${item.type||'PDF'}</div>
          <div style="font-size:13px;font-weight:700;color:var(--c-text);margin-bottom:4px;line-height:1.4">${item.title}</div>
          <div style="font-size:11px;color:var(--c-text4);margin-bottom:12px">${new Date(item.saved_at).toLocaleDateString('en-IN')}</div>
          ${(!isPremium&&item.premium) ? `<div style="font-size:11px;color:var(--c-red);font-weight:600;margin-bottom:8px">Renew premium to access</div><button class="btn btn-primary btn-sm" onclick="go('subscription')">Renew</button>`
          : `<div style="display:flex;gap:6px"><a class="btn btn-primary btn-sm" href="${item.url}" target="_blank">Open</a><button class="btn btn-secondary btn-sm" onclick="_libRemove('${item.id}')">Remove</button></div>`}
        </div>
      </div>`).join('')}
    </div>`}
  </div>`;
});

function _libRemove(id) {
  const items = JSON.parse(localStorage.getItem('ep_library')||'[]').filter(i=>i.id!==id);
  localStorage.setItem('ep_library', JSON.stringify(items));
  go('library');
}

function libAdd(item) {
  const items = JSON.parse(localStorage.getItem('ep_library')||'[]');
  if (!items.find(i=>i.id===item.id)) {
    items.unshift({...item, saved_at: new Date().toISOString()});
    localStorage.setItem('ep_library', JSON.stringify(items));
    toast('Saved to Library', 'ok');
  }
}
