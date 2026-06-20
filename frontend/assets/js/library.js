async function renderLibrary(container) {
  if (!requireAuth()) return;
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  // Library items are tracked in localStorage for offline access
  const items = JSON.parse(localStorage.getItem('ep_library') || '[]');
  const isPremium = Auth.isPremium();

  container.innerHTML = `
    <div class="section-title">My Library</div>
    <div class="section-sub">Downloaded premium content. ${isPremium ? 'Active.' : '⚠️ Subscription expired — downloads locked.'}</div>
    ${!items.length
      ? `<div class="empty-state"><div class="empty-icon">📚</div><h3>Your library is empty</h3>
           <p class="text-muted">Download PDFs from PYQs or Premium content to access them offline.</p>
           <button class="btn btn-primary mt-2" onclick="navigate('#pyq')">Browse PYQs</button>
         </div>`
      : `<div class="library-grid">
          ${items.map(item => `
            <div class="library-card ${!isPremium && item.premium ? 'revoked' : ''} fade-in">
              <div class="library-card-icon">${item.type==='SOLUTIONS'?'📖':item.type==='OMR'?'📋':'📄'}</div>
              <div class="library-card-title">${item.title}</div>
              <div class="library-card-meta">${item.type} · ${new Date(item.saved_at).toLocaleDateString('en-IN')}</div>
              ${(!isPremium && item.premium)
                ? '<div style="color:var(--danger);font-size:.78rem;font-weight:600;">🔒 Renew premium to access</div>'
                : `<a class="btn btn-sm btn-primary" href="${item.url}" target="_blank" style="margin-top:6px;">Open</a>`}
              <button class="btn btn-sm btn-secondary" onclick="_removeLibraryItem('${item.id}')" style="margin-top:4px;">Remove</button>
            </div>`).join('')}
        </div>`}`;
}

function addToLibrary(item) {
  const items = JSON.parse(localStorage.getItem('ep_library') || '[]');
  if (!items.find(i => i.id === item.id)) {
    items.unshift({ ...item, saved_at: new Date().toISOString() });
    localStorage.setItem('ep_library', JSON.stringify(items));
    showToast('Added to Library 📚', 'success');
  }
}

function _removeLibraryItem(id) {
  const items = JSON.parse(localStorage.getItem('ep_library') || '[]').filter(i => i.id !== id);
  localStorage.setItem('ep_library', JSON.stringify(items));
  renderLibrary(document.getElementById('page-content'));
}
