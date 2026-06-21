let _premState = { tracks: [], activeTrack: 0, activeSubj: 0, selected: null };

registerPage('premium', async function(el) {
  el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  const [tracks, subStatus] = await Promise.all([
    GET('/api/premium/tracks'),
    Auth.loggedIn() ? GET('/api/subscriptions/status') : Promise.resolve({ is_premium: false })
  ]);
  _premState = { tracks, activeTrack: 0, activeSubj: 0, selected: null, isPremium: subStatus.is_premium };
  _premRender(el);
});

function _premRender(el) {
  const { tracks, activeTrack, activeSubj, selected, isPremium } = _premState;
  if (!tracks.length) { el.innerHTML = '<div class="empty-state"><div class="empty-title">No premium content yet</div></div>'; return; }
  const track = tracks[activeTrack];
  const subj  = track?.subjects[activeSubj];

  el.innerHTML = `<div class="fade-in">
    <div class="page-header">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div><div class="page-title">Premium Content</div><div class="page-sub">DPPs, Chapterwise Tests and Full Syllabus Mocks for JEE and NEET.</div></div>
        ${!isPremium ? `<button class="btn btn-primary" onclick="go('subscription')">Unlock Premium</button>` : '<span class="premium-chip" style="font-size:12px;padding:5px 14px">PRO — Active</span>'}
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      ${tracks.map((t, i) => `<button class="pill-tab ${i === activeTrack ? 'active' : ''}" onclick="_premTrack(${i})">${t.display_name}</button>`).join('')}
    </div>

    ${track ? `<div style="display:flex;gap:0;border-bottom:1px solid var(--c-border);margin-bottom:0">
      ${track.subjects.map((s, i) => `<button onclick="_premSubj(${i})" style="padding:9px 18px;font-size:12px;font-weight:700;border:none;background:none;cursor:pointer;color:${i===activeSubj?'var(--c-blue)':'var(--c-text3)'};border-bottom:${i===activeSubj?'2.5px solid var(--c-blue)':'2.5px solid transparent'};transition:all .15s">${s.name.charAt(0)+s.name.slice(1).toLowerCase()}</button>`).join('')}
    </div>` : ''}

    ${subj ? _premSubjectContent(subj, isPremium) : ''}
  </div>`;
}

function _premTrack(i) { _premState.activeTrack = i; _premState.activeSubj = 0; _premState.selected = null; _premRender(document.getElementById('page-content')); }
function _premSubj(i)  { _premState.activeSubj = i; _premState.selected = null; _premRender(document.getElementById('page-content')); }

function _premSubjectContent(subj, isPremium) {
  const sections = [
    { key: 'dpps',   label: 'DPP — All Chapters',       items: subj.dpp_sets,   type: 'dpp_set' },
    { key: 'tests',  label: 'Chapterwise Tests',          items: subj.test_sets,  type: 'test_set' },
    { key: 'mocks',  label: 'Full Syllabus Mock Tests',   items: subj.mock_tests, type: 'mock' },
  ];

  return `<div class="content-tree" style="margin-top:0;border-top:none;border-radius:0 0 var(--radius-lg) var(--radius-lg)">
    <div class="tree-sidebar">
      <div class="tree-header"><div class="tree-header-title">Content Sections</div></div>
      <div class="tree-body">
        ${sections.map(sec => _premTreeSection(sec, isPremium)).join('')}
      </div>
    </div>
    <div class="tree-content" id="prem-content-area">
      <div class="paywall-overlay" style="padding:60px 32px;text-align:center">
        <div style="width:56px;height:56px;background:var(--c-surface2);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:var(--c-text4)">${IC.arr}</div>
        <div style="font-size:14px;font-weight:700;color:var(--c-text2)">Select a section from the left</div>
        <div style="font-size:12px;color:var(--c-text4);margin-top:6px">Browse DPPs, Tests, or Mock Tests</div>
      </div>
    </div>
  </div>`;
}

function _premTreeSection(sec, isPremium) {
  if (!sec.items.length) return '';
  const id = 'sec-' + sec.key;
  return `<div class="tree-section">
    <div class="tree-section-header" onclick="_premToggle('${id}')">
      <div class="tree-section-arrow"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      <div class="tree-section-name">${sec.label}</div>
      <div class="tree-section-count">${sec.items.length}</div>
    </div>
    <div class="tree-items" id="${id}">
      ${sec.items.map((item, i) => {
        const locked = !isPremium;
        const label = item.name || item.title;
        const count = sec.type === 'mock' ? `${item.question_count}Q` : `${item.dpps?.length || item.chapters?.length || 0} items`;
        return `<div class="tree-item ${locked ? 'locked' : ''}" onclick="_premSelectItem('${sec.type}',${i},${JSON.stringify(item).replace(/'/g,"&#39;").replace(/"/g,'&quot;')},${locked})">
          <div class="tree-item-name">${label} <span style="font-size:10px;color:var(--c-text4)">(${count})</span></div>
          ${locked ? `<div class="lock-badge">${IC.lock}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function _premToggle(id) {
  const items = document.getElementById(id);
  const header = items.previousElementSibling;
  if (!items || !header) return;
  const open = items.classList.toggle('open');
  header.classList.toggle('open', open);
}

function _premSelectItem(type, idx, itemJson, locked) {
  const area = document.getElementById('prem-content-area');
  if (!area) return;
  let item;
  try { item = typeof itemJson === 'string' ? JSON.parse(itemJson.replace(/&quot;/g,'"').replace(/&#39;/g,"'")) : itemJson; } catch { return; }

  if (locked) {
    area.innerHTML = `<div class="paywall-overlay">
      <div class="paywall-icon"><svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" fill="none" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
      <div class="paywall-title">Premium Content</div>
      <div class="paywall-sub">This content requires an active premium subscription. Unlock access to all DPPs, Chapterwise Tests, and Mock Tests.</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary btn-lg" onclick="go('subscription')">View Plans</button>
        <button class="btn btn-secondary btn-lg" onclick="go('login')" ${Auth.loggedIn()?"style='display:none'":""}>Login First</button>
      </div>
      <div style="margin-top:20px;padding:12px 16px;background:var(--c-surface2);border-radius:var(--radius);border:1px solid var(--c-border);max-width:340px;margin-left:auto;margin-right:auto">
        <div style="font-size:11px;font-weight:700;color:var(--c-text3);margin-bottom:6px">Plans from</div>
        <div style="font-size:22px;font-weight:900;color:var(--c-text)">&#8377;80<span style="font-size:13px;font-weight:500;color:var(--c-text4)">/month</span></div>
        <div style="font-size:11px;color:var(--c-text4);margin-top:2px">Annual plan: &#8377;750/year (save &#8377;210)</div>
      </div>
    </div>`;
    return;
  }

  if (type === 'dpp_set') {
    area.innerHTML = `<div style="padding:0">
      <div class="tree-content-header">
        <div class="tree-content-title">${item.name}</div>
        <div class="tree-content-meta">
          <span>${item.dpps?.length || 0} DPPs</span>
          <span>${item.questions_per_dpp} questions per DPP</span>
        </div>
      </div>
      <div class="tree-content-body">
        <div style="display:flex;flex-direction:column;gap:6px">
          ${(item.dpps || []).map((d, di) => `
          <div style="display:flex;align-items:center;padding:10px 14px;border:1px solid var(--c-border);border-radius:var(--radius);background:var(--c-surface2);gap:10px">
            <div style="width:28px;height:28px;background:var(--c-blue-l);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--c-blue);flex-shrink:0">${di+1}</div>
            <div style="flex:1"><div style="font-size:12px;font-weight:700;color:var(--c-text)">${d.title}</div><div style="font-size:10px;color:var(--c-text4);margin-top:2px">${d.chapter_name||''} &middot; ${d.duration_minutes}min &middot; ${d.question_count}Q</div></div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-primary btn-xs" onclick="examLaunch({dpp_id:${d.id},title:'${d.title}'})">Attempt</button>
              <a class="btn btn-secondary btn-xs" href="/api/pdf/dpp/${d.id}/paper" target="_blank">PDF</a>
              <a class="btn btn-secondary btn-xs" href="/api/pdf/dpp/${d.id}/solutions" target="_blank">Solutions</a>
              <button class="btn btn-secondary btn-xs" onclick="lbPerTest('DPP',${d.id},'${d.title}')">Rank</button>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>`;
  } else if (type === 'test_set') {
    area.innerHTML = `<div style="padding:0">
      <div class="tree-content-header">
        <div class="tree-content-title">${item.name}</div>
        <div class="tree-content-meta"><span>${item.chapters?.length||0} Chapters</span></div>
      </div>
      <div class="tree-content-body">
        ${(item.chapters || []).map(ch => `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--c-text3);margin-bottom:6px;padding:0 4px">${ch.name}</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${(ch.modules || []).map(m => `
            <div style="display:flex;align-items:center;padding:9px 14px;border:1px solid var(--c-border);border-radius:var(--radius);background:var(--c-surface2);gap:10px">
              <div style="flex:1"><div style="font-size:12px;font-weight:600;color:var(--c-text)">${m.name}</div><div style="font-size:10px;color:var(--c-text4)">${m.duration_minutes}min &middot; ${m.question_count}Q</div></div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-primary btn-xs" onclick="examLaunch({module_id:${m.id},title:'${ch.name} \u2013 ${m.name}'})">Start</button>
                <a class="btn btn-secondary btn-xs" href="/api/pdf/module/${m.id}/paper?include_omr=true" target="_blank">PDF+OMR</a>
                <button class="btn btn-secondary btn-xs" onclick="lbPerTest('MODULE',${m.id},'${m.name}')">Rank</button>
              </div>
            </div>`).join('')}
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  } else if (type === 'mock') {
    area.innerHTML = `<div style="padding:0">
      <div class="tree-content-header">
        <div class="tree-content-title">${item.title}</div>
        <div class="tree-content-meta"><span>${item.duration_minutes} minutes</span><span>${item.question_count} questions</span><span>Full Syllabus</span></div>
      </div>
      <div class="tree-content-body">
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="padding:16px;background:var(--c-blue-l);border:1px solid var(--c-blue-m);border-radius:var(--radius-lg)">
            <div style="font-size:13px;font-weight:700;color:var(--c-blue);margin-bottom:4px">Full Syllabus Mock Test</div>
            <div style="font-size:12px;color:var(--c-text2)">${item.question_count} questions &middot; ${item.duration_minutes} minutes &middot; Real exam interface</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-lg" onclick="examLaunch({mock_test_id:${item.id},title:'${item.title}'})">Start Mock Test</button>
            <a class="btn btn-secondary" href="/api/pdf/mock/${item.id}/paper?include_omr=true" target="_blank">${IC.dl}&nbsp;Download Paper + OMR</a>
            <button class="btn btn-secondary" onclick="lbPerTest('MOCK',${item.id},'${item.title}')">View Leaderboard</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
  event.currentTarget?.classList?.add('active');
}
