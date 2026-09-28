/* ==========================================================================
   AHSS Prototype — data layer, navigation, shared modal helpers
   ========================================================================== */
let DB = null;

const FIELD_USER = 'CDO - Jasim Uddin';
const APPROVER_USER = 'BM/ABM - Kamal Hossain';
const ERP_USER = 'BAO - Nusrat Jahan';

const ui = {
  mode: 'dcs',
  dcsRole: 'field',
  dcsView: { tab: 'enroll', screen: 'home', params: {} },
  dcsHistory: [],
  demoFlow: 'loan',
  erpMenu: 'savings',
  erpTab: 'b2',
  erpB1Tab: 'opening',
  erpReview: null,
  erpFilters: { project: '', branch: '', from: '', to: '', status: '' },
  erpAccountQuery: '',
  erpSelectedAccount: null,
  dcsSelectedAccount: null,
};

/* ---------------- date / id helpers ---------------- */
function todayISO(){ return new Date().toISOString().slice(0,10); }
function todayDisplay(){
  const d = new Date();
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}
function fmtDate(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}-${m}-${y}`;
}
function newReqId(){ return 'REQ-' + Date.now(); }
function newCrId(){ return 'CR-' + Date.now(); }
function newAcctNo(){ return 'AHSS-' + String(100000 + (Date.now() % 900000)).slice(0,6); }
function money(n){ return '৳' + Number(n||0).toLocaleString('en-US'); }

/* ---------------- persistence ---------------- */
function persist(){
  try{
    localStorage.setItem('ahss_proto_state', JSON.stringify({
      accounts: DB.accounts,
      ahssRequests: DB.ahssRequests,
      continuationRequests: DB.continuationRequests
    }));
  }catch(e){ /* private mode / storage unavailable — state just won't survive reload */ }
}
function loadOverlay(){
  try{ return JSON.parse(localStorage.getItem('ahss_proto_state') || 'null'); }
  catch(e){ return null; }
}
function saveDraft(key, data){
  try{ localStorage.setItem('ahss_draft_' + key, JSON.stringify({ data, savedAt: Date.now() })); }
  catch(e){}
}
function loadDraft(key){
  try{ return JSON.parse(localStorage.getItem('ahss_draft_' + key) || 'null'); }
  catch(e){ return null; }
}
function clearDraft(key){
  try{ localStorage.removeItem('ahss_draft_' + key); }catch(e){}
}
function resetDemoData(){
  showConfirm('Reset demo data', 'This clears every request, approval and draft you created in this browser and reloads the original seed data. Continue?', () => {
    try{
      Object.keys(localStorage).forEach(k=>{ if(k.startsWith('ahss_')) localStorage.removeItem(k); });
    }catch(e){}
    location.reload();
  });
}

/* ---------------- boot ---------------- */
async function boot(){
  try{
    DB = await loadSeedData();
    const overlay = loadOverlay();
    if(overlay){
      if(overlay.accounts) DB.accounts = overlay.accounts;
      if(overlay.ahssRequests) DB.ahssRequests = overlay.ahssRequests;
      if(overlay.continuationRequests) DB.continuationRequests = overlay.continuationRequests;
    }
    document.getElementById('loadingMsg').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    render();
  }catch(err){
    console.error('AHSS prototype failed to load data', err);
    document.getElementById('loadingMsg').classList.add('hidden');
    document.getElementById('fatalError').classList.remove('hidden');
  }
}
/* ahss-data.json is the real "database" and is used whenever this page is
   served over http/https. Opening ahss.html directly as a file:// path makes
   most browsers block fetch() of a same-folder JSON file, so we fall back to
   the identical copy embedded in ahss.html so the prototype still runs. */
async function loadSeedData(){
  try{
    const res = await fetch('ahss-data.json', { cache: 'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }catch(fetchErr){
    const fallbackEl = document.getElementById('ahss-seed-fallback');
    if(!fallbackEl) throw fetchErr;
    console.warn('ahss-data.json fetch failed (expected under file://); using embedded fallback copy.', fetchErr);
    return JSON.parse(fallbackEl.textContent);
  }
}
document.addEventListener('DOMContentLoaded', boot);

/* ---------------- toast ---------------- */
let toastTimer = null;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.classList.remove('show'), 2600);
}

/* ---------------- mode switch / top render ---------------- */
function setMode(mode){
  ui.mode = mode;
  render();
}
function render(){
  document.querySelectorAll('.proto-tab').forEach(b=> b.classList.toggle('active', b.dataset.mode === ui.mode));
  document.getElementById('dcsRoot').classList.toggle('active', ui.mode === 'dcs');
  document.getElementById('erpRoot').classList.toggle('active', ui.mode === 'erp');
  if(ui.mode === 'dcs') renderDCS(); else renderERP();
}

/* ---------------- generic confirm modal ---------------- */
function showConfirm(title, msg, onYes, opts){
  opts = opts || {};
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmExtra').innerHTML = opts.extraHtml || '';
  const yesBtn = document.getElementById('confirmYesBtn');
  const noBtn = document.getElementById('confirmNoBtn');
  yesBtn.textContent = opts.yesLabel || 'Yes';
  noBtn.textContent = opts.noLabel || 'No';
  yesBtn.className = 'btn ' + (opts.yesClass || 'btn-primary');
  const overlay = document.getElementById('confirmOverlay');
  overlay.classList.remove('hidden');
  yesBtn.onclick = () => { overlay.classList.add('hidden'); onYes(opts.getExtra ? opts.getExtra() : undefined); };
  noBtn.onclick = () => { overlay.classList.add('hidden'); if(opts.onNo) opts.onNo(); };
}

/* ---------------- form helpers ---------------- */
function collectForm(container){
  const obj = {};
  container.querySelectorAll('[data-field]').forEach(el=>{
    const key = el.dataset.field;
    if(el.type === 'checkbox') obj[key] = el.checked;
    else if(el.type === 'radio'){ if(el.checked) obj[key] = el.value; }
    else obj[key] = el.value;
  });
  return obj;
}
function fillForm(container, data){
  if(!data) return;
  container.querySelectorAll('[data-field]').forEach(el=>{
    const key = el.dataset.field;
    if(!(key in data)) return;
    if(el.type === 'checkbox') el.checked = !!data[key];
    else if(el.type === 'radio') el.checked = (el.value === data[key]);
    else el.value = data[key] == null ? '' : data[key];
  });
}
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------------- member / account lookups ---------------- */
function findMember(memberNo){ return DB.members.find(m => m.memberNo === memberNo); }
function findAccountByMember(memberNo){ return DB.accounts.find(a => a.memberNo === memberNo); }
function findDuplicateMobile(mobile, excludeMemberNo){
  return DB.members.find(m => m.mobile === mobile && m.memberNo !== excludeMemberNo);
}
function projectLabel(code){
  const p = DB.projects.find(p => p.code === code);
  return p ? p.label : code;
}
function statusChipClass(status){
  if(status === 'Pending DCS Approval') return 'chip-dcs-pending';
  if(status === 'Pending ERP Approval') return 'chip-erp-pending';
  if(status === 'Approved') return 'chip-approved';
  if(status === 'Rejected') return 'chip-rejected';
  if(status === 'Sent Back to DCS') return 'chip-sentback';
  return 'chip-dcs-pending';
}

/* ---------------- export helpers (B4 / A8 downloads) ---------------- */
function downloadCSV(filename, headers, rows){
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v==null?'':v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 2000);
  toast('Downloaded ' + filename);
}
function printTable(title, headers, rows){
  const w = window.open('', '_blank', 'width=900,height=700');
  if(!w){ toast('Pop-up blocked — allow pop-ups to generate the PDF.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${esc(title)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#22303A;}
    h2{color:#173357;margin-bottom:4px;} .meta{color:#5b6b76;font-size:12px;margin-bottom:18px;}
    table{width:100%;border-collapse:collapse;font-size:12px;}
    th,td{border:1px solid #ccd6dc;padding:6px 9px;text-align:left;}
    th{background:#2E6A94;color:#fff;}
    tr:nth-child(even) td{background:#f5f8fa;}
  </style></head><body>
  <h2>${esc(title)}</h2>
  <div class="meta">BRAC Microfinance — AHSS · Generated ${esc(todayDisplay())}</div>
  <table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <script>window.onload = function(){ window.print(); };<\/script>
  </body></html>`);
  w.document.close();
}
function downloadRow(title, headers, rows){
  return `
    <div class="erp-download-row">
      <button onclick='printTable(${JSON.stringify(title)}, ${JSON.stringify(headers)}, __rowsCache(${JSON.stringify(title)}))'>⬇ PDF</button>
      <button onclick='downloadCSV(${JSON.stringify(title.replace(/\s+/g,'_')+'.csv')}, ${JSON.stringify(headers)}, __rowsCache(${JSON.stringify(title)}))'>⬇ CSV</button>
      <button onclick='downloadCSV(${JSON.stringify(title.replace(/\s+/g,'_')+'.xls.csv')}, ${JSON.stringify(headers)}, __rowsCache(${JSON.stringify(title)}))'>⬇ Excel (CSV)</button>
    </div>`;
}
const __rowsCacheStore = {};
function __rowsCache(title){ return __rowsCacheStore[title] || []; }
function setRowsCache(title, rows){ __rowsCacheStore[title] = rows; }

/* ==========================================================================
   Shared small-dialog wiring (member search, duplicate mobile, no-account,
   insufficient balance, new-member admission)
   ========================================================================== */
function openMemberSearch(onSelect){
  const overlay = document.getElementById('memberSearchOverlay');
  const input = document.getElementById('memberSearchInput');
  const results = document.getElementById('memberSearchResults');
  function draw(){
    const q = input.value.trim().toLowerCase();
    const list = DB.members.filter(m => !q || m.memberNo.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
    results.innerHTML = list.map(m => `
      <div class="dcs-card" style="cursor:pointer;margin-bottom:8px;" data-pick="${esc(m.memberNo)}">
        <div class="dcs-card-row">
          <div>
            <div class="dcs-card-name">${esc(m.name)}</div>
            <div class="dcs-card-meta">${esc(m.memberNo)} · ${esc(projectLabel(m.project))} · ${esc(m.branch)}</div>
          </div>
          <span class="chip chip-erp-pending">${esc(m.category)}</span>
        </div>
      </div>`).join('') || '<div class="dcs-empty">No members match.</div>';
    results.querySelectorAll('[data-pick]').forEach(row=>{
      row.onclick = () => { overlay.classList.add('hidden'); onSelect(findMember(row.dataset.pick)); };
    });
  }
  input.value = '';
  input.oninput = draw;
  draw();
  overlay.classList.remove('hidden');
  document.getElementById('memberSearchCloseBtn').onclick = () => overlay.classList.add('hidden');
}

function openDuplicateModal(existingMember, onContinue, onCancel){
  const overlay = document.getElementById('dupMobileOverlay');
  document.getElementById('dupMobileInfo').innerHTML = `
    <div class="row"><span>Existing client</span><span>${esc(existingMember.name)}</span></div>
    <div class="row"><span>Member No.</span><span>${esc(existingMember.memberNo)}</span></div>
    <div class="row"><span>Branch</span><span>${esc(existingMember.branch)}</span></div>
    <div class="row"><span>Project</span><span>${esc(projectLabel(existingMember.project))}</span></div>`;
  const input = document.getElementById('dupMobileNewInput');
  const chk = document.getElementById('dupMobileVerifyChk');
  input.value = ''; chk.checked = false;
  overlay.classList.remove('hidden');
  document.getElementById('dupMobileCancelBtn').onclick = () => { overlay.classList.add('hidden'); if(onCancel) onCancel(); };
  document.getElementById('dupMobileContinueBtn').onclick = () => {
    if(!chk.checked || !input.value.trim()){ toast('Enter a unique mobile number and confirm verification.'); return; }
    overlay.classList.add('hidden');
    onContinue(input.value.trim());
  };
}

function openNoAccountModal(onYes, onNo){
  const overlay = document.getElementById('noAccountOverlay');
  overlay.classList.remove('hidden');
  document.getElementById('noAccountYesBtn').onclick = () => { overlay.classList.add('hidden'); onYes(); };
  document.getElementById('noAccountNoBtn').onclick = () => { overlay.classList.add('hidden'); if(onNo) onNo(); };
}
function openInsufficientModal(){
  const overlay = document.getElementById('insufficientOverlay');
  overlay.classList.remove('hidden');
  document.getElementById('insufficientOkBtn').onclick = () => overlay.classList.add('hidden');
}
function openAdmissionModal(onYes, onNo){
  const overlay = document.getElementById('admissionOverlay');
  overlay.classList.remove('hidden');
  document.getElementById('admissionYesBtn').onclick = () => { overlay.classList.add('hidden'); onYes(); };
  document.getElementById('admissionNoBtn').onclick = () => { overlay.classList.add('hidden'); if(onNo) onNo(); };
}

/* ==========================================================================
   PART A — DCS MOBILE APP
   ========================================================================== */
function dcsNavigate(view){
  ui.dcsHistory.push(JSON.parse(JSON.stringify(ui.dcsView)));
  ui.dcsView = view;
  render();
}
function dcsBack(){
  if(ui.dcsHistory.length){ ui.dcsView = ui.dcsHistory.pop(); render(); }
}
function dcsSwitchTab(tab){
  ui.dcsView = { tab, screen: 'home', params: {} };
  ui.dcsHistory = [];
  render();
}
function dcsSetRole(role){
  ui.dcsRole = role;
  ui.dcsView = { tab: ui.dcsView.tab, screen: 'home', params: {} };
  ui.dcsHistory = [];
  render();
}

const DCS_TABS = [
  { id: 'enroll', label: 'Enrollment', ic: '📝' },
  { id: 'autodc', label: 'Auto Debit/Credit', ic: '🔁' },
  { id: 'demo', label: 'Demo Flows', ic: '🧭' },
  { id: 'account', label: 'Account View', ic: '📄' },
];

function dcsTitleFor(view, role){
  const map = {
    enroll: role === 'field' ? 'Amar Hishab Enrollment' : 'AHSS Opening Approvals',
    autodc: role === 'field' ? 'Auto Debit/Credit' : 'Auto D/C Approvals',
    demo: 'Demo: AHSS in other flows',
    account: 'AHSS Account (view only)',
  };
  return map[view.tab] || 'AHSS';
}

function renderDCS(){
  const root = document.getElementById('dcsRoot');
  const v = ui.dcsView;
  root.innerHTML = `
    <div class="dcs-shell">
      <div class="dcs-topbar">
        <div class="dcs-topbar-row">
          ${ui.dcsHistory.length ? `<button class="dcs-icon-btn" onclick="dcsBack()">←</button>` : ''}
          <div class="dcs-topbar-title">${esc(dcsTitleFor(v, ui.dcsRole))}</div>
          <button class="dcs-icon-btn" title="Help" onclick="toast('Help audio / tips would play here.')">?</button>
        </div>
        <div class="dcs-role-switch">
          <div class="dcs-role-opt ${ui.dcsRole==='field'?'active':''}" onclick="dcsSetRole('field')">CDO / CO (Field)</div>
          <div class="dcs-role-opt ${ui.dcsRole==='approver'?'active':''}" onclick="dcsSetRole('approver')">BM / ABM (Approver)</div>
        </div>
      </div>
      <div class="dcs-body" id="dcsBody">${dcsBodyContent()}</div>
      <div class="dcs-bottomnav">
        ${DCS_TABS.map(t => `
          <button class="dcs-nav-item ${v.tab===t.id?'active':''}" onclick="dcsSwitchTab('${t.id}')">
            <span class="ic">${t.ic}</span>${esc(t.label)}
          </button>`).join('')}
      </div>
    </div>`;
  dcsWireScreen();
}

function dcsBodyContent(){
  const v = ui.dcsView;
  if(v.tab === 'enroll') return dcsScreenEnroll(v);
  if(v.tab === 'autodc') return dcsScreenAutoDC(v);
  if(v.tab === 'demo') return dcsScreenDemo(v);
  if(v.tab === 'account') return dcsScreenAccount(v);
  return '';
}
/* wireScreen() runs after every render — anything that can't be a plain
   onclick="" string (blur handlers, debounced autosave) gets attached here */
function dcsWireScreen(){
  const v = ui.dcsView;
  if(v.tab === 'enroll' && v.screen === 'form') wireDcsEnrollForm(v);
  if(v.tab === 'autodc' && v.screen === 'form') wireDcsAutoDcForm(v);
}

/* -------------------- Tab: Enrollment (A1 / A2 / A3 / A5 / A7) -------------------- */
function dcsScreenEnroll(v){
  if(v.screen === 'form') return dcsEnrollForm(v.params);
  if(v.screen === 'detail') return dcsEnrollDetail(v.params);
  return ui.dcsRole === 'field' ? dcsEnrollHomeField() : dcsEnrollHomeApprover();
}

function dcsEnrollHomeField(){
  const requests = DB.ahssRequests.slice().sort((a,b)=> b.requestDate.localeCompare(a.requestDate));
  return `
    <button class="btn btn-primary dcs-btn-block" onclick="dcsStartNewEnrollment()">+ New AHSS Enrollment</button>
    <div class="dcs-card" style="background:#FBEDD2;border-color:#F1D48C;">
      <div class="dcs-card-name" style="font-size:12.5px;">Simulate: new member admission</div>
      <div class="dcs-card-meta" style="margin-bottom:8px;">During admission of a new member, CDO/CO is asked whether the client wants AHSS.</div>
      <button class="btn btn-outline btn-sm" onclick="openAdmissionModal(dcsStartNewEnrollment, ()=>toast('Continuing admission as per regular procedure.'))">Simulate prompt</button>
    </div>
    <div class="dcs-section-title" style="margin-top:16px;">Recently submitted</div>
    ${requests.map(r => `
      <div class="dcs-card" onclick="dcsNavigate({tab:'enroll',screen:'detail',params:{requestId:'${r.id}'}})">
        <div class="dcs-card-row">
          <div>
            <div class="dcs-card-name">${esc(r.memberName)}</div>
            <div class="dcs-card-meta">${esc(r.memberNo)} · ${esc(projectLabel(r.project))} · ${esc(fmtDate(r.requestDate))}</div>
          </div>
        </div>
        <span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span>
      </div>`).join('') || '<div class="dcs-empty">No AHSS enrollment requests yet.</div>'}
  `;
}

function dcsEnrollHomeApprover(){
  const requests = DB.ahssRequests.slice().sort((a,b)=> b.requestDate.localeCompare(a.requestDate));
  const pending = requests.filter(r=> r.status==='Pending DCS Approval');
  const rest = requests.filter(r=> r.status!=='Pending DCS Approval');
  const card = (r, actionable) => `
    <div class="dcs-card">
      <div class="dcs-card-row">
        <div>
          <div class="dcs-card-name">${esc(r.memberName)}</div>
          <div class="dcs-card-meta">${esc(r.memberNo)} · ${esc(projectLabel(r.project))} · ${esc(fmtDate(r.requestDate))}</div>
          <div class="dcs-card-meta">Proposed by ${esc(r.proposedBy)}</div>
        </div>
      </div>
      <div class="dcs-card-row" style="margin-top:8px;align-items:center;">
        <span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span>
        <button class="btn btn-sm ${actionable?'btn-primary':'btn-ghost'}" onclick="dcsNavigate({tab:'enroll',screen:'detail',params:{requestId:'${r.id}',approverMode:true}})">${actionable?'Review':'View'}</button>
      </div>
    </div>`;
  return `
    <div class="dcs-section-title">Pending your approval</div>
    ${pending.map(r=>card(r,true)).join('') || '<div class="dcs-empty">Nothing waiting on you right now.</div>'}
    <div class="dcs-section-title" style="margin-top:16px;">Other requests</div>
    ${rest.map(r=>card(r,false)).join('') || '<div class="dcs-empty">—</div>'}
  `;
}

function dcsStartNewEnrollment(){
  openMemberSearch((member)=>{
    dcsNavigate({ tab:'enroll', screen:'form', params:{ memberNo: member.memberNo } });
  });
}

function renderAccountSummary(fd){
  const nominee = fd.nominee || {};
  return `
    <div class="erp-readonly-summary">
      <div class="kv"><span>Project</span><span>${esc(fd.projectLabel)}</span></div>
      <div class="kv"><span>Member Number</span><span>${esc(fd.memberNo)}</span></div>
      <div class="kv"><span>ERP Member Number</span><span>${esc(fd.erpMemberNo)}</span></div>
      <div class="kv"><span>Member Name</span><span>${esc(fd.memberName)}</span></div>
      <div class="kv"><span>Member Category</span><span>${esc(fd.memberCategory)}</span></div>
      <div class="kv"><span>Mobile Number</span><span>${esc(fd.mobile)}</span></div>
      <div class="kv"><span>Account Type</span><span>${esc(fd.accountType)} · OTP to ${esc(fd.otpSendsTo)}</span></div>
      <div class="kv"><span>Nominee</span><span>${esc(nominee.name)} (${esc(nominee.relationship)}) — ${esc(nominee.percentage)}%</span></div>
      <div class="kv"><span>Nominee National ID</span><span>${esc(nominee.nid) || '—'}</span></div>
      <div class="kv"><span>Account Name</span><span>${esc(fd.accountName)}</span></div>
      <div class="kv"><span>Savings Product</span><span>${esc(fd.savingsProduct)}</span></div>
      <div class="kv"><span>Consent captured</span><span>${fd.consent ? 'Yes' : 'No'}</span></div>
    </div>`;
}

function dcsEnrollDetail(params){
  const r = DB.ahssRequests.find(x=>x.id===params.requestId);
  if(!r) return '<div class="dcs-empty">Request not found.</div>';
  const actionable = params.approverMode && r.status === 'Pending DCS Approval';
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Request ${esc(r.id)}</div>
      <div class="dcs-card-row" style="margin-bottom:10px;">
        <div class="dcs-card-name">${esc(r.memberName)}</div>
        <span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span>
      </div>
      ${renderAccountSummary(r.formData)}
    </div>
    ${actionable ? `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Approval decision</div>
      <label class="dcs-label">Comment (optional)</label>
      <textarea class="dcs-textarea" id="enrollApproveComment" placeholder="Notes for this decision…"></textarea>
      <div style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn btn-danger" style="flex:1;" onclick="dcsRejectEnroll('${r.id}')">Reject</button>
        <button class="btn btn-primary" style="flex:1;" onclick="dcsApproveEnroll('${r.id}')">Approve</button>
      </div>
    </div>` : `<div class="dcs-subtle">Approval authority for ${esc(projectLabel(r.project))}: ${esc(DB.approvalAuthority[r.project]||'—')}.</div>`}
  `;
}
function dcsApproveEnroll(id){
  const r = DB.ahssRequests.find(x=>x.id===id);
  const comment = (document.getElementById('enrollApproveComment')||{}).value || '';
  showConfirm('Approve enrollment', `Approve the AHSS account opening request for ${r.memberName}? It will move to ERP for final approval.`, ()=>{
    r.status = 'Pending ERP Approval';
    r.dcsApprovedBy = APPROVER_USER + (comment ? ` — ${comment}` : '');
    persist();
    toast('Approved. Sent to the ERP Consent Buffer Panel.');
    dcsSwitchTab('enroll');
  });
}
function dcsRejectEnroll(id){
  showConfirm('Reject enrollment', 'Reject this AHSS account opening request?', ()=>{
    const r = DB.ahssRequests.find(x=>x.id===id);
    r.status = 'Rejected';
    persist();
    toast('Request rejected.');
    dcsSwitchTab('enroll');
  }, { yesClass:'btn-danger', yesLabel:'Reject' });
}

/* -------------------- A2: Account opening form -------------------- */
function dcsEnrollForm(params){
  const draftKey = 'enroll_' + (params.memberNo || 'new');
  const draft = loadDraft(draftKey);
  const member = params.memberNo ? findMember(params.memberNo) : null;
  const existingAccount = member ? findAccountByMember(member.memberNo) : null;
  const fd = (draft && draft.data) || {};
  const nominee = existingAccount ? existingAccount.nominee : {};
  return `
    <div class="draft-banner">💾 Draft saved automatically ${draft ? '· resumed from ' + new Date(draft.savedAt).toLocaleTimeString() : ''}</div>
    ${params.note ? `<div class="draft-banner" style="background:#DCEAF6;border-color:#b9d7ec;color:#1F4C6C;">${esc(params.note)}</div>` : ''}
    <form id="dcsEnrollFormEl">
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Project</div>
      <div class="dcs-field">
        <label class="dcs-label">Project Name <span class="req">*</span></label>
        <select class="dcs-select" data-field="projectLabel">
          <option value="">-Select Project-</option>
          ${DB.projects.map(p=>`<option value="${esc(p.label)}" ${fd.projectLabel===p.label?'selected':''}>${esc(p.label)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Member Information</div>
      <div class="dcs-field">
        <label class="dcs-label">Member Number <span class="req">*</span></label>
        <div class="dcs-input-group">
          <input class="dcs-input" id="dcsMemberNoInput" data-field="memberNo" value="${esc(fd.memberNo || (member?member.memberNo:''))}" placeholder="MEM-XXXXXX">
          <button type="button" class="dcs-icon-square" onclick="dcsPickMemberForForm()">🔍</button>
        </div>
      </div>
      <div class="dcs-field"><label class="dcs-label">ERP Member Number</label><input class="dcs-input" readonly data-field="erpMemberNo" value="${esc(fd.erpMemberNo || (member?member.erpMemberNo:''))}"></div>
      <div class="dcs-field"><label class="dcs-label">Member Name</label><input class="dcs-input" readonly data-field="memberName" value="${esc(fd.memberName || (member?member.name:''))}"></div>
      <div class="dcs-field"><label class="dcs-label">Member Category</label><input class="dcs-input" readonly data-field="memberCategory" value="${esc(fd.memberCategory || (member?member.category:''))}"></div>
      <div class="dcs-field">
        <label class="dcs-label">Mobile Number <span class="req">*</span></label>
        <input class="dcs-input" id="dcsMobileInput" data-field="mobile" value="${esc(fd.mobile || (member?member.mobile:''))}" placeholder="01XXXXXXXXX">
        <div class="dcs-subtle" id="dcsMobileHint" style="margin:6px 0 0;"></div>
      </div>
    </div>
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Account Type</div>
      <div class="dcs-field">
        <label class="dcs-label">Account Type <span class="req">*</span></label>
        <div class="dcs-radio-row">
          <label class="dcs-radio"><input type="radio" name="acctType" value="Single" checked disabled> Single</label>
          <label class="dcs-radio disabled"><input type="radio" name="acctType" value="Joint" disabled> Joint <span class="dcs-badge-soon">Coming soon</span></label>
        </div>
        <input type="hidden" data-field="accountType" value="Single">
      </div>
      <div class="dcs-field">
        <label class="dcs-label">OTP Sends To</label>
        <div class="dcs-radio-row"><label class="dcs-radio"><input type="radio" checked disabled> Self</label></div>
        <input type="hidden" data-field="otpSendsTo" value="Self">
      </div>
    </div>
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Nominee Information</div>
      <div class="dcs-check-row">
        <input type="checkbox" id="dcsUseExistingNominee" ${!existingAccount?'disabled':''} ${fd.useExisting?'checked':''}>
        <span>Use existing nominee information ${!existingAccount?'<i>(no existing nominee on file for this member)</i>':''}</span>
      </div>
      <div class="dcs-field"><label class="dcs-label">Name <span class="req">*</span></label><input class="dcs-input" data-field="nomineeName" value="${esc(fd.nomineeName || nominee.name || '')}"></div>
      <div class="dcs-field"><label class="dcs-label">Date of Birth</label><input type="date" class="dcs-input" data-field="nomineeDob" value="${esc(fd.nomineeDob || nominee.dob || '')}"></div>
      <div class="dcs-field">
        <label class="dcs-label">Relationship <span class="req">*</span></label>
        <select class="dcs-select" data-field="nomineeRelationship">
          <option value="">-Select relationship-</option>
          ${DB.relationshipOptions.map(o=>`<option ${((fd.nomineeRelationship||nominee.relationship)===o)?'selected':''}>${esc(o)}</option>`).join('')}
        </select>
      </div>
      <div class="dcs-field">
        <label class="dcs-label">Photo</label>
        <div class="dcs-photo-box" id="dcsNomineePhotoBox">📷 Tap to capture / upload nominee photo</div>
        <input type="file" accept="image/*" id="dcsNomineePhotoInput" style="display:none;">
      </div>
      <div class="dcs-field"><label class="dcs-label">National ID</label><input class="dcs-input" data-field="nomineeNid" value="${esc(fd.nomineeNid || nominee.nid || '')}"></div>
      <div class="dcs-field"><label class="dcs-label">Birth Certificate Number</label><input class="dcs-input" data-field="nomineeBirthCert" value="${esc(fd.nomineeBirthCert || '')}"></div>
      <div class="dcs-field"><label class="dcs-label">Passport No.</label><input class="dcs-input" data-field="nomineePassport" value="${esc(fd.nomineePassport || '')}"></div>
      <div class="dcs-field"><label class="dcs-label">Smart Card ID</label><input class="dcs-input" data-field="nomineeSmartCard" value="${esc(fd.nomineeSmartCard || '')}"></div>
      <div class="dcs-field"><label class="dcs-label">Percentage</label><input class="dcs-input" data-field="nomineePercentage" value="${esc(fd.nomineePercentage || nominee.percentage || '100')}"></div>
    </div>
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Savings Account Information</div>
      <div class="dcs-field"><label class="dcs-label">Savings A/C No</label><input class="dcs-input" readonly value="AUTO"></div>
      <div class="dcs-field"><label class="dcs-label">Account Name <span class="req">*</span></label><input class="dcs-input" data-field="accountName" value="${esc(fd.accountName || (member?member.name:''))}"></div>
      <div class="dcs-field"><label class="dcs-label">Creation Date</label><input class="dcs-input" readonly value="${todayDisplay()}"></div>
      <div class="dcs-field">
        <label class="dcs-label">Savings Product <span class="req">*</span></label>
        <select class="dcs-select" data-field="savingsProduct">
          <option value="">-Select Product-</option>
          ${DB.savingsProducts.map(p=>`<option ${fd.savingsProduct===p?'selected':''}>${esc(p)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Consent</div>
      <div class="dcs-check-row"><input type="checkbox" data-field="consent" ${fd.consent?'checked':''}><span>Client has agreed to open the AHSS account.</span></div>
      <div class="dcs-check-row"><input type="checkbox" data-field="consentCaptured" ${fd.consentCaptured?'checked':''}><span>Client confirmation captured.</span></div>
      <button type="button" class="btn btn-outline btn-sm" onclick="toast('Signature / photo capture would open here.')">Upload signature / photo</button>
    </div>
    <div style="display:flex;gap:10px;margin-top:6px;">
      <button type="button" class="btn btn-ghost" style="flex:1;" onclick="dcsClearEnrollForm()">Clear</button>
      <button type="button" class="btn btn-primary" style="flex:2;" onclick="dcsSubmitEnrollForm('${draftKey}')">Save / Submit</button>
    </div>
    </form>
  `;
}
function dcsPickMemberForForm(){
  openMemberSearch((member)=>{
    document.getElementById('dcsMemberNoInput').value = member.memberNo;
    document.getElementById('dcsMemberNoInput').dispatchEvent(new Event('blur'));
  });
}
function wireDcsEnrollForm(v){
  const form = document.getElementById('dcsEnrollFormEl');
  if(!form) return;
  const draftKey = 'enroll_' + (v.params.memberNo || 'new');
  let saveTimer = null;
  function autosave(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(()=>{
      saveDraft(draftKey, collectForm(form));
      const banner = form.parentElement.querySelector('.draft-banner');
      if(banner) banner.innerHTML = '💾 Draft saved automatically · ' + new Date().toLocaleTimeString();
    }, 500);
  }
  form.addEventListener('input', autosave);
  form.addEventListener('change', autosave);

  const memberInput = document.getElementById('dcsMemberNoInput');
  memberInput.addEventListener('blur', ()=>{
    const m = findMember(memberInput.value.trim());
    if(m){
      form.querySelector('[data-field="erpMemberNo"]').value = m.erpMemberNo;
      form.querySelector('[data-field="memberName"]').value = m.name;
      form.querySelector('[data-field="memberCategory"]').value = m.category;
      const mobileEl = form.querySelector('[data-field="mobile"]');
      if(!mobileEl.value) mobileEl.value = m.mobile;
      const nameEl = form.querySelector('[data-field="accountName"]');
      if(!nameEl.value) nameEl.value = m.name;
    }
  });

  const mobileInput = document.getElementById('dcsMobileInput');
  mobileInput.addEventListener('blur', ()=>{
    const memberNo = memberInput.value.trim();
    const dup = findDuplicateMobile(mobileInput.value.trim(), memberNo);
    const hint = document.getElementById('dcsMobileHint');
    if(dup){
      hint.textContent = '⚠ This mobile number is already used.';
      hint.style.color = '#C1502E';
      openDuplicateModal(dup, (newMobile)=>{
        mobileInput.value = newMobile;
        hint.textContent = '✓ Verified as unique.';
        hint.style.color = '#2F7D4F';
      }, ()=>{ mobileInput.value = ''; hint.textContent=''; });
    } else {
      hint.textContent = '';
    }
  });

  const useExisting = document.getElementById('dcsUseExistingNominee');
  if(useExisting){
    useExisting.addEventListener('change', ()=>{
      const memberNo = memberInput.value.trim();
      const acct = findAccountByMember(memberNo);
      if(useExisting.checked && acct){
        const n = acct.nominee;
        form.querySelector('[data-field="nomineeName"]').value = n.name;
        form.querySelector('[data-field="nomineeDob"]').value = n.dob;
        form.querySelector('[data-field="nomineeRelationship"]').value = n.relationship;
        form.querySelector('[data-field="nomineeNid"]').value = n.nid;
        form.querySelector('[data-field="nomineePercentage"]').value = n.percentage;
      }
    });
  }
  const photoBox = document.getElementById('dcsNomineePhotoBox');
  const photoInput = document.getElementById('dcsNomineePhotoInput');
  if(photoBox){
    photoBox.addEventListener('click', ()=> photoInput.click());
    photoInput.addEventListener('change', ()=>{
      if(photoInput.files[0]){
        photoBox.textContent = '✓ ' + photoInput.files[0].name;
        photoBox.classList.add('has-photo');
      }
    });
  }
}
function dcsClearEnrollForm(){
  showConfirm('Clear form', 'Clear all entered data on this form?', ()=>{
    const v = ui.dcsView;
    clearDraft('enroll_' + (v.params.memberNo || 'new'));
    dcsNavigate({ tab:'enroll', screen:'form', params:{} });
  }, { yesClass:'btn-danger', yesLabel:'Clear' });
}
function dcsSubmitEnrollForm(draftKey){
  const form = document.getElementById('dcsEnrollFormEl');
  const fd = collectForm(form);
  if(!fd.projectLabel || !fd.memberNo || !fd.mobile || !fd.accountName || !fd.savingsProduct || !fd.nomineeName || !fd.nomineeRelationship){
    toast('Please fill all required fields (marked *).');
    return;
  }
  const member = findMember(fd.memberNo);
  showConfirm('Submit enrollment', `Submit the AHSS account opening request for ${fd.memberName || fd.memberNo}?`, ()=>{
    const projectCode = (DB.projects.find(p=>p.label===fd.projectLabel)||{}).code || '';
    const rec = {
      id: newReqId(),
      memberNo: fd.memberNo,
      memberName: fd.memberName,
      project: projectCode,
      branch: member ? member.branch : '',
      requestType: 'AHSS Account Opening',
      proposedBy: FIELD_USER,
      dcsApprovedBy: '',
      requestDate: todayISO(),
      status: 'Pending DCS Approval',
      formData: {
        projectLabel: fd.projectLabel, memberNo: fd.memberNo, erpMemberNo: fd.erpMemberNo,
        memberName: fd.memberName, memberCategory: fd.memberCategory, mobile: fd.mobile,
        accountType: 'Single', otpSendsTo: 'Self',
        nominee: { name: fd.nomineeName, relationship: fd.nomineeRelationship, dob: fd.nomineeDob, nid: fd.nomineeNid, percentage: fd.nomineePercentage || '100' },
        accountName: fd.accountName, savingsProduct: fd.savingsProduct, consent: !!fd.consent
      }
    };
    DB.ahssRequests.unshift(rec);
    persist();
    clearDraft(draftKey);
    toast('AHSS enrollment submitted for approval.');
    dcsSwitchTab('enroll');
  });
}

/* -------------------- Tab: Auto Debit/Credit (A6) -------------------- */
const AUTODC_PRODUCTS = {
  loanInstallment: 'Loan Installment Auto Debit',
  savingsInstallment: 'General Savings Installment Auto Debit',
  monthlyProfit: 'Special Savings – Monthly Profit Autocredit',
  maturityAmount: 'Special Savings – Maturity Amount Autocredit',
  dpsInstallment: 'Special Savings – DPS Installment Autodebit',
};
function accountApplicableProducts(a){
  const list = [];
  if(a.autoDebit && 'loanInstallment' in a.autoDebit) list.push('loanInstallment');
  if(a.autoDebit && 'savingsInstallment' in a.autoDebit) list.push('savingsInstallment');
  if(a.autoCredit && 'monthlyProfit' in a.autoCredit) list.push('monthlyProfit');
  if(a.autoCredit && 'maturityAmount' in a.autoCredit) list.push('maturityAmount');
  if(a.autoDebit && 'dpsInstallment' in a.autoDebit) list.push('dpsInstallment');
  return list;
}
function accountFlagValue(a, key){
  if(key in (a.autoDebit||{})) return a.autoDebit[key];
  if(key in (a.autoCredit||{})) return a.autoCredit[key];
  return false;
}

function dcsScreenAutoDC(v){
  if(v.screen === 'form') return dcsAutoDcForm(v.params);
  if(v.screen === 'detail') return dcsAutoDcDetail(v.params);
  return ui.dcsRole === 'field' ? dcsAutoDcHomeField() : dcsAutoDcHomeApprover();
}
function dcsAutoDcHomeField(){
  return DB.accounts.map(a => `
    <div class="dcs-card">
      <div class="dcs-card-row">
        <div>
          <div class="dcs-card-name">${esc(a.accountName)}</div>
          <div class="dcs-card-meta">${esc(a.accountNo)} · ${esc(projectLabel(a.project))} · ${esc(a.product)}</div>
        </div>
        <span class="chip chip-approved">${esc(a.status)}</span>
      </div>
      <div style="margin:10px 0 4px;">
        ${accountApplicableProducts(a).map(key => `
          <div class="dcs-toggle-row">
            <span class="dcs-toggle-label">${esc(AUTODC_PRODUCTS[key])}</span>
            <span class="chip ${accountFlagValue(a,key)?'chip-approved':'chip-rejected'}">${accountFlagValue(a,key)?'ON':'OFF'}</span>
          </div>`).join('')}
      </div>
      <button class="btn btn-outline btn-sm dcs-btn-block" style="margin-top:8px;" onclick="dcsNavigate({tab:'autodc',screen:'form',params:{accountNo:'${a.accountNo}'}})">Request Continue / Discontinue</button>
    </div>`).join('');
}
function dcsAutoDcHomeApprover(){
  const list = DB.continuationRequests.slice().sort((a,b)=> b.requestDate.localeCompare(a.requestDate));
  const pending = list.filter(r=> r.status==='Pending DCS Approval');
  const rest = list.filter(r=> r.status!=='Pending DCS Approval');
  const card = (r, actionable) => `
    <div class="dcs-card">
      <div class="dcs-card-name">${esc(r.memberName)} <span style="font-weight:600;color:var(--muted);font-size:11.5px;">(${esc(r.accountNo)})</span></div>
      <div class="dcs-card-meta">${esc(r.product)} — <b>${esc(r.action)}</b></div>
      <div class="dcs-card-meta">Proposed by ${esc(r.proposedBy)} · ${esc(fmtDate(r.requestDate))}</div>
      <div class="dcs-card-row" style="margin-top:8px;align-items:center;">
        <span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span>
        <button class="btn btn-sm ${actionable?'btn-primary':'btn-ghost'}" onclick="dcsNavigate({tab:'autodc',screen:'detail',params:{requestId:'${r.id}'}})">${actionable?'Review':'View'}</button>
      </div>
    </div>`;
  return `
    <div class="dcs-section-title">Pending your approval</div>
    ${pending.map(r=>card(r,true)).join('') || '<div class="dcs-empty">Nothing waiting on you right now.</div>'}
    <div class="dcs-section-title" style="margin-top:16px;">Other requests</div>
    ${rest.map(r=>card(r,false)).join('') || '<div class="dcs-empty">—</div>'}
  `;
}
function dcsAutoDcForm(params){
  const a = DB.accounts.find(x=>x.accountNo===params.accountNo);
  if(!a) return '<div class="dcs-empty">Account not found.</div>';
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">${esc(a.accountName)} — ${esc(a.accountNo)}</div>
      <form id="dcsAutoDcFormEl">
        <div class="dcs-field">
          <label class="dcs-label">Product <span class="req">*</span></label>
          <select class="dcs-select" data-field="product">
            ${accountApplicableProducts(a).map(key=>`<option value="${esc(AUTODC_PRODUCTS[key])}">${esc(AUTODC_PRODUCTS[key])}</option>`).join('')}
          </select>
        </div>
        <div class="dcs-field">
          <label class="dcs-label">Action <span class="req">*</span></label>
          <select class="dcs-select" data-field="action">
            <option>Continue</option>
            <option>Discontinue</option>
          </select>
        </div>
        <div class="dcs-field">
          <label class="dcs-label">Reason <span class="req">*</span></label>
          <textarea class="dcs-textarea" data-field="reason" placeholder="Reason for this request…"></textarea>
        </div>
      </form>
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-ghost" style="flex:1;" onclick="dcsBack()">Cancel</button>
      <button class="btn btn-primary" style="flex:2;" onclick="dcsSubmitAutoDc('${a.accountNo}')">Submit Request</button>
    </div>
  `;
}
function wireDcsAutoDcForm(){ /* no autosave needed for this short form */ }
function dcsSubmitAutoDc(accountNo){
  const form = document.getElementById('dcsAutoDcFormEl');
  const fd = collectForm(form);
  if(!fd.product || !fd.action || !fd.reason){ toast('Please complete all fields.'); return; }
  const a = DB.accounts.find(x=>x.accountNo===accountNo);
  showConfirm('Submit request', `Submit ${fd.action.toLowerCase()} request for "${fd.product}"?`, ()=>{
    DB.continuationRequests.unshift({
      id: newCrId(), memberNo: a.memberNo, memberName: a.accountName, project: a.project, branch: a.branch,
      accountNo: a.accountNo, product: fd.product, action: fd.action, reason: fd.reason,
      proposedBy: FIELD_USER, requestDate: todayISO(), status: 'Pending DCS Approval',
      dcsApprovedBy: '', verification: '', comment: ''
    });
    persist();
    toast('Continuation/discontinuation request submitted.');
    dcsSwitchTab('autodc');
  });
}
function dcsAutoDcDetail(params){
  const r = DB.continuationRequests.find(x=>x.id===params.requestId);
  if(!r) return '<div class="dcs-empty">Request not found.</div>';
  const actionable = r.status === 'Pending DCS Approval';
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Request ${esc(r.id)}</div>
      <div class="erp-readonly-summary">
        <div class="kv"><span>Member</span><span>${esc(r.memberName)} (${esc(r.memberNo)})</span></div>
        <div class="kv"><span>Account</span><span>${esc(r.accountNo)}</span></div>
        <div class="kv"><span>Product</span><span>${esc(r.product)}</span></div>
        <div class="kv"><span>Action</span><span>${esc(r.action)}</span></div>
        <div class="kv"><span>Reason</span><span>${esc(r.reason)}</span></div>
        <div class="kv"><span>Proposed by</span><span>${esc(r.proposedBy)}</span></div>
        <div class="kv"><span>Status</span><span>${esc(r.status)}</span></div>
        ${r.verification ? `<div class="kv"><span>Verification</span><span>${esc(r.verification)}</span></div>` : ''}
        ${r.comment ? `<div class="kv"><span>Comment</span><span>${esc(r.comment)}</span></div>` : ''}
      </div>
    </div>
    ${actionable ? `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Approval decision</div>
      <label class="dcs-label">Verification <span class="req">*</span></label>
      <div class="dcs-radio-row" style="margin-bottom:10px;">
        <label class="dcs-radio"><input type="radio" name="verif" value="Verified by Phone"> Phone</label>
        <label class="dcs-radio"><input type="radio" name="verif" value="Verified Physically"> Physically</label>
        <label class="dcs-radio"><input type="radio" name="verif" value="Both"> Both</label>
      </div>
      <label class="dcs-label">Reason (dropdown)</label>
      <select class="dcs-select" id="autodcCommentSelect" style="margin-bottom:8px;">
        <option value="">-Select reason-</option>
        ${DB.reasonOptions.map(o=>`<option>${esc(o)}</option>`).join('')}
      </select>
      <label class="dcs-label">Comment <span class="req">*</span></label>
      <textarea class="dcs-textarea" id="autodcCommentText" placeholder="Notes after contacting the client…"></textarea>
      <div style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn btn-danger" style="flex:1;" onclick="dcsDecideAutoDc('${r.id}','Rejected')">Reject</button>
        <button class="btn btn-primary" style="flex:1;" onclick="dcsDecideAutoDc('${r.id}','Pending ERP Approval')">Approve</button>
      </div>
    </div>` : ''}
  `;
}
function dcsDecideAutoDc(id, newStatus){
  const verif = (document.querySelector('input[name="verif"]:checked')||{}).value;
  const reasonSel = (document.getElementById('autodcCommentSelect')||{}).value || '';
  const text = (document.getElementById('autodcCommentText')||{}).value || '';
  if(!verif || !text.trim()){ toast('Verification and a comment are required.'); return; }
  showConfirm(newStatus==='Rejected'?'Reject request':'Approve request', 'Confirm this decision?', ()=>{
    const r = DB.continuationRequests.find(x=>x.id===id);
    r.status = newStatus;
    r.dcsApprovedBy = APPROVER_USER;
    r.verification = verif;
    r.comment = (reasonSel ? reasonSel + ' — ' : '') + text;
    persist();
    toast(newStatus==='Rejected' ? 'Request rejected.' : 'Approved. Sent to ERP Consent Buffer Panel.');
    dcsSwitchTab('autodc');
  }, { yesClass: newStatus==='Rejected' ? 'btn-danger' : 'btn-primary', yesLabel: newStatus==='Rejected'?'Reject':'Approve' });
}

/* -------------------- Tab: Demo Flows (A4) -------------------- */
function dcsSetDemoFlow(f){ ui.demoFlow = f; render(); }
function memberOptions(selected){
  return DB.members.map(m=>`<option value="${esc(m.memberNo)}" ${selected===m.memberNo?'selected':''}>${esc(m.name)} — ${esc(m.memberNo)}</option>`).join('');
}
function aHssInfoCard(a){
  return `
    <div class="dcs-card" style="border-color:var(--ok);">
      <div class="dcs-card-name">✓ AHSS account found</div>
      <div class="erp-readonly-summary" style="margin-top:6px;">
        <div class="kv"><span>Account No.</span><span>${esc(a.accountNo)}</span></div>
        <div class="kv"><span>Account Name</span><span>${esc(a.accountName)}</span></div>
        <div class="kv"><span>Project</span><span>${esc(projectLabel(a.project))}</span></div>
        <div class="kv"><span>Product</span><span>${esc(a.product)}</span></div>
        <div class="kv"><span>Opening Date</span><span>${esc(fmtDate(a.openingDate))}</span></div>
        <div class="kv"><span>Status</span><span>${esc(a.status)}</span></div>
        <div class="kv"><span>Balance</span><span>${money(a.balance)}</span></div>
        <div class="kv"><span>Nominee</span><span>${esc(a.nominee.name)} (${esc(a.nominee.relationship)})</span></div>
        <div class="kv"><span>Account Type</span><span>${esc(a.accountType)}</span></div>
      </div>
    </div>`;
}
function dcsHandleModeSelect(selectEl, memberSelId, resultDivId, formTab){
  const memberNo = document.getElementById(memberSelId).value;
  const resultDiv = document.getElementById(resultDivId);
  if(selectEl.value !== 'AHSS'){ resultDiv.innerHTML=''; return; }
  const acct = findAccountByMember(memberNo);
  if(acct){
    resultDiv.innerHTML = aHssInfoCard(acct);
  } else {
    openNoAccountModal(()=>{
      dcsSwitchTab('enroll');
      dcsNavigate({ tab:'enroll', screen:'form', params:{ memberNo, note:'You can select the AHSS account after ERP approval. Until then the proposal continues with the regular process.' } });
    }, ()=>{ selectEl.value = 'Cash'; resultDiv.innerHTML=''; });
  }
}
function dcsScreenDemo(){
  const chips = [
    {id:'loan', label:'Loan Application'},
    {id:'savings', label:'Savings Enrollment'},
    {id:'csi', label:'CSI Premium'},
    {id:'special', label:'Special Savings'},
  ];
  return `
    <div class="dcs-chip-tab">
      ${chips.map(c=>`<button class="${ui.demoFlow===c.id?'active':''}" onclick="dcsSetDemoFlow('${c.id}')">${esc(c.label)}</button>`).join('')}
    </div>
    <div class="dcs-subtle">These screens simulate where AHSS is offered as a disbursement / collection / autocredit-autodebit option inside existing DCS flows (spec section A4).</div>
    ${ui.demoFlow==='loan' ? dcsDemoLoan() : ''}
    ${ui.demoFlow==='savings' ? dcsDemoSavings() : ''}
    ${ui.demoFlow==='csi' ? dcsDemoCsi() : ''}
    ${ui.demoFlow==='special' ? dcsDemoSpecial() : ''}
  `;
}
function dcsDemoLoan(){
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Loan Application</div>
      <div class="dcs-field"><label class="dcs-label">Member</label><select class="dcs-select" id="loanMember">${memberOptions()}</select></div>
      <div class="dcs-field"><label class="dcs-label">Disbursement Mode</label>
        <select class="dcs-select" id="loanDisb" onchange="dcsHandleModeSelect(this,'loanMember','loanDisbResult')"><option>Cash</option><option>Bank Transfer</option><option>AHSS</option></select>
      </div>
      <div id="loanDisbResult"></div>
      <div class="dcs-field"><label class="dcs-label">Collection Mode</label>
        <select class="dcs-select" id="loanColl" onchange="dcsHandleModeSelect(this,'loanMember','loanCollResult')"><option>Cash</option><option>Bank Transfer</option><option>AHSS</option></select>
      </div>
      <div id="loanCollResult"></div>
      <div class="dcs-toggle-row" style="margin-top:8px;">
        <span class="dcs-toggle-label">Auto debit loan installment from AHSS</span>
        <button class="dcs-toggle" id="loanAutoDebitToggle" onclick="dcsToggleAutoDebit('loanMember','loanInstallment', this)"></button>
      </div>
    </div>`;
}
function dcsDemoSavings(){
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Savings Product Enrollment</div>
      <div class="dcs-field"><label class="dcs-label">Member</label><select class="dcs-select" id="savMember">${memberOptions()}</select></div>
      <div class="dcs-field"><label class="dcs-label">Savings Product</label><select class="dcs-select">${DB.savingsProducts.map(p=>`<option>${esc(p)}</option>`).join('')}</select></div>
      <div class="dcs-field"><label class="dcs-label">Installment Collection Mode</label>
        <select class="dcs-select" id="savColl" onchange="dcsHandleModeSelect(this,'savMember','savCollResult')"><option>Cash</option><option>AHSS</option></select>
      </div>
      <div id="savCollResult"></div>
    </div>`;
}
function dcsDemoCsi(){
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">CSI Premium Collection</div>
      <div class="dcs-field"><label class="dcs-label">Member</label><select class="dcs-select" id="csiMember" onchange="dcsCsiUpdate()">${memberOptions()}</select></div>
      <div id="csiAmountBox" class="dcs-summary-card">
        <div class="dcs-summary-label">System-calculated premium due</div>
        <div class="dcs-summary-amt" id="csiAmount">—</div>
      </div>
      <div class="dcs-field">
        <label class="dcs-label">Collection Method</label>
        <div class="dcs-radio-row">
          <label class="dcs-radio"><input type="radio" name="csiMethod" value="Cash" checked onchange="dcsCsiUpdate()"> Cash</label>
          <label class="dcs-radio"><input type="radio" name="csiMethod" value="AHSS" onchange="dcsCsiUpdate()"> AHSS</label>
        </div>
      </div>
      <div id="csiResult"></div>
      <button class="btn btn-primary dcs-btn-block" style="margin-top:8px;" onclick="dcsCsiCollect()">Collect Premium</button>
    </div>`;
}
function dcsCsiPremiumFor(memberNo){ return 150 + (memberNo.length * 37) % 350; }
function dcsCsiUpdate(){
  const memberNo = document.getElementById('csiMember').value;
  const amt = dcsCsiPremiumFor(memberNo);
  document.getElementById('csiAmount').textContent = money(amt);
  const method = (document.querySelector('input[name="csiMethod"]:checked')||{}).value;
  const result = document.getElementById('csiResult');
  if(method === 'AHSS'){
    const acct = findAccountByMember(memberNo);
    result.innerHTML = acct
      ? `<div class="dcs-subtle">AHSS balance: <b>${money(acct.balance)}</b></div>`
      : `<div class="dcs-subtle" style="color:var(--danger);">No AHSS account for this member.</div>`;
  } else { result.innerHTML = ''; }
}
function dcsCsiCollect(){
  const memberNo = document.getElementById('csiMember').value;
  const amt = dcsCsiPremiumFor(memberNo);
  const method = (document.querySelector('input[name="csiMethod"]:checked')||{}).value;
  if(method !== 'AHSS'){ toast(`Collected ${money(amt)} in cash.`); return; }
  const acct = findAccountByMember(memberNo);
  if(!acct){ openNoAccountModal(()=>{ dcsSwitchTab('enroll'); dcsNavigate({tab:'enroll',screen:'form',params:{memberNo}}); }); return; }
  if(acct.balance < amt){ openInsufficientModal(); return; }
  showConfirm('Collect premium', `Deduct ${money(amt)} from AHSS account ${acct.accountNo}?`, ()=>{
    acct.balance -= amt;
    acct.transactions.push({ date: todayISO(), description: 'CSI premium auto debit', debit: amt, credit: 0, balance: acct.balance });
    persist();
    toast(`Collected ${money(amt)} from AHSS. New balance ${money(acct.balance)}.`);
    render();
  });
}
function dcsToggleAutoDebit(memberSelId, key, btn){
  const memberNo = document.getElementById(memberSelId).value;
  const acct = findAccountByMember(memberNo);
  if(!acct){ toast('No AHSS account for this member.'); return; }
  const current = accountFlagValue(acct, key);
  showConfirm('Auto debit', `${current?'Turn off':'Turn on'} auto debit for this product?`, ()=>{
    acct.autoDebit[key] = !current;
    persist();
    render();
  });
}
function dcsDemoSpecial(){
  const specialMembers = DB.accounts.filter(a=>a.product==='Special Savings').map(a=>a.memberNo);
  const opts = DB.members.filter(m=>specialMembers.includes(m.memberNo));
  if(!opts.length) return `<div class="dcs-empty">No members currently hold a Special Savings AHSS account.</div>`;
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Special Savings Enrollment Fields</div>
      <div class="dcs-field"><label class="dcs-label">Member</label>
        <select class="dcs-select" id="spMember" onchange="dcsSpecialRender()">${opts.map(m=>`<option value="${esc(m.memberNo)}">${esc(m.name)} — ${esc(m.memberNo)}</option>`).join('')}</select>
      </div>
      <div id="spFields"></div>
    </div>`;
}
function dcsSpecialToggle(key, group){
  const memberNo = document.getElementById('spMember').value;
  const acct = findAccountByMember(memberNo);
  const cur = accountFlagValue(acct, key);
  acct[group][key] = !cur;
  persist();
  dcsSpecialRender();
  if(!cur){ toast('Consent capture is now required for this change.'); }
}
function dcsSpecialRender(){
  const memberNo = document.getElementById('spMember').value;
  const acct = findAccountByMember(memberNo);
  const anyYes = acct.autoCredit.monthlyProfit || acct.autoCredit.maturityAmount || acct.autoDebit.dpsInstallment;
  document.getElementById('spFields').innerHTML = `
    <div class="dcs-toggle-row"><span class="dcs-toggle-label">Monthly Profit to AHSS (autocredit)</span>
      <button class="dcs-toggle ${acct.autoCredit.monthlyProfit?'on':''}" onclick="dcsSpecialToggle('monthlyProfit','autoCredit')"></button></div>
    <div class="dcs-toggle-row"><span class="dcs-toggle-label">Maturity amount (Term Deposit) to AHSS (autocredit)</span>
      <button class="dcs-toggle ${acct.autoCredit.maturityAmount?'on':''}" onclick="dcsSpecialToggle('maturityAmount','autoCredit')"></button></div>
    <div class="dcs-toggle-row"><span class="dcs-toggle-label">DPS installment from AHSS (autodebit)</span>
      <button class="dcs-toggle ${acct.autoDebit.dpsInstallment?'on':''}" onclick="dcsSpecialToggle('dpsInstallment','autoDebit')"></button></div>
    ${anyYes ? `
      <div class="dcs-check-row" style="margin-top:10px;"><input type="checkbox"><span>Client has agreed to this auto debit / auto credit setup.</span></div>
      <button class="btn btn-outline btn-sm" onclick="toast('Client confirmation captured.')">Capture client confirmation</button>` : ''}
  `;
}

/* -------------------- Tab: Account View (A8) -------------------- */
function dcsScreenAccount(){
  if(!ui.dcsSelectedAccount && DB.accounts.length) ui.dcsSelectedAccount = DB.accounts[0].accountNo;
  const a = DB.accounts.find(x=>x.accountNo===ui.dcsSelectedAccount);
  setRowsCache('AHSS_Transactions_Mobile', a ? a.transactions.map(t=>[t.date,t.description,t.debit||'',t.credit||'',t.balance]) : []);
  return `
    <div class="dcs-field">
      <label class="dcs-label">Select AHSS account</label>
      <select class="dcs-select" onchange="ui.dcsSelectedAccount=this.value; render();">
        ${DB.accounts.map(x=>`<option value="${esc(x.accountNo)}" ${x.accountNo===ui.dcsSelectedAccount?'selected':''}>${esc(x.accountNo)} — ${esc(x.accountName)}</option>`).join('')}
      </select>
    </div>
    ${a ? `
    <div class="dcs-summary-card">
      <div class="dcs-summary-label">${esc(a.accountName)} · ${esc(a.accountNo)}</div>
      <div class="dcs-summary-amt">${money(a.balance)}</div>
      <div class="dcs-summary-sub"><span>${esc(projectLabel(a.project))} · ${esc(a.product)}</span><span class="chip chip-approved">${esc(a.status)}</span></div>
    </div>
    <div class="dcs-card-row" style="margin-bottom:10px;">
      <button class="btn btn-outline btn-sm" onclick="printTable('AHSS Transactions - '+${JSON.stringify(a.accountNo)}, ['Date','Description','Debit','Credit','Balance'], __rowsCache('AHSS_Transactions_Mobile'))">⬇ PDF</button>
      <button class="btn btn-outline btn-sm" onclick="downloadCSV('ahss_transactions.csv', ['Date','Description','Debit','Credit','Balance'], __rowsCache('AHSS_Transactions_Mobile'))">⬇ CSV</button>
      <button class="btn btn-outline btn-sm" onclick="downloadCSV('ahss_transactions.xls.csv', ['Date','Description','Debit','Credit','Balance'], __rowsCache('AHSS_Transactions_Mobile'))">⬇ Excel</button>
    </div>
    <div class="dcs-section-title">Transactions (last 12 months)</div>
    <div class="dcs-section-block">
      ${a.transactions.slice().reverse().map(t=>`
        <div class="dcs-txn">
          <div><div class="dcs-txn-desc">${esc(t.description)}</div><div class="dcs-txn-date">${esc(fmtDate(t.date))}</div></div>
          <div class="dcs-txn-amt ${t.credit?'credit':'debit'}">${t.credit?'+':'-'}${money(t.credit||t.debit)}</div>
        </div>`).join('')}
    </div>` : '<div class="dcs-empty">No account selected.</div>'}
  `;
}

/* ==========================================================================
   PART B — ERP WEB
   ========================================================================== */
function setErpMenu(m){
  ui.erpMenu = m;
  if(m !== 'savings') { toast('This menu item is not part of the AHSS prototype.'); ui.erpMenu = 'savings'; return; }
  render();
}
function setErpTab(t){ ui.erpTab = t; ui.erpReview = null; render(); }
function setErpB1Tab(t){ ui.erpB1Tab = t; render(); }

const ERP_MODULES = ['Settings','HRM','EDMS','ePMS','Procurement','eTender','Fixed Asset','Microfinance','Accounting','Budget'];
const ERP_MENU = ['Programme Admin','VO','Member','Loan','Savings','Insurance','Report'];

function renderERP(){
  const root = document.getElementById('erpRoot');
  root.innerHTML = `
    <div class="erp-shell">
      <div class="erp-topbar">
        ${ERP_MODULES.map(m=>`<div class="mod ${m==='Microfinance'?'active':''}">${esc(m)}</div>`).join('')}
        <div class="spacer"></div>
        <div class="welcome">Welcome Abdullah Al Noman (abdullah.noman-SA- Gulshan)</div>
      </div>
      <div class="erp-datebar">Accounting Date : ${todayDisplay()} [DAY OPEN]</div>
      <div class="erp-header">
        <div class="erp-logo">🌀<span> brac</span></div>
      </div>
      <div class="erp-menubar">
        ${ERP_MENU.map(m=>`<button class="${m==='Savings'&&ui.erpMenu==='savings'?'active':''}" onclick="setErpMenu('${m==='Savings'?'savings':'other'}')">${esc(m)}</button>`).join('')}
      </div>
      ${ui.erpMenu==='savings' ? `
      <div class="erp-menubar" style="background:#fff;border-bottom:1px solid var(--erp-border);">
        <button class="${ui.erpTab==='b2'?'active':''}" onclick="setErpTab('b2')">AHSS Account Opening</button>
        <button class="${ui.erpTab==='b1'||ui.erpTab==='b1detail'?'active':''}" onclick="setErpTab('b1')">Consent Buffer Panel</button>
        <button class="${ui.erpTab==='b3'?'active':''}" onclick="setErpTab('b3')">AHSS Account View</button>
      </div>` : ''}
      <div class="erp-layout">
        <div class="erp-sidebar">${erpSidebar()}</div>
        <div class="erp-main">${erpMainContent()}</div>
      </div>
      <div class="erp-footer">Copyright © 2026 BRAC, Bangladesh. All rights reserved. &nbsp; Developed By: BRAC IT</div>
    </div>`;
}
function erpSidebar(){
  return `
    <div class="erp-side-box">
      <div class="erp-side-title">Support Contact Information</div>
      <p>📞 096-77-444-555 (Field office)</p>
      <p>📞 096-77-444-888 (Head office)</p>
      <p>☎ 3480 (for BRAC Center, Kaderia Tower, Gulshan Tower)</p>
      <p>✉ <a href="#">brac.erpsupport@bracits.com</a></p>
    </div>
    <div class="erp-side-box">
      <div class="erp-side-title">Support Time &amp; Days</div>
      <p>08:30 AM – 06:30 PM (BST)</p>
      <p>SIX (6) DAYS A WEEK</p>
      <p>(SATURDAY TO THURSDAY)</p>
    </div>`;
}
function erpMainContent(){
  if(ui.erpTab === 'b1') return erpB1Panel();
  if(ui.erpTab === 'b1detail') return erpB1Detail();
  if(ui.erpTab === 'b3') return erpB3View();
  return erpB2Form();
}

/* -------------------- B2: AHSS Account Opening form (ERP) -------------------- */
let erpB2State = { accountType: 'Single' };
function erpB2Form(){
  const s = erpB2State;
  return `
    <h1 class="erp-page-title">Amar Hishab Sadharon Sonchoy Account</h1>
    <form id="erpB2FormEl">
    <div class="erp-section">
      <div class="erp-section-hd">Project</div>
      <div class="erp-section-body">
        <div class="erp-grid cols-3">
          <div class="erp-field span-3"><label>Project Name <span class="req">*</span></label>
            <select data-field="projectLabel"><option value="">-Select Project-</option>${DB.projects.map(p=>`<option>${esc(p.label)}</option>`).join('')}</select>
          </div>
        </div>
      </div>
    </div>
    <div class="erp-section">
      <div class="erp-section-hd">Member Information <span style="font-weight:600;font-size:11.5px;">Member Details</span></div>
      <div class="erp-section-body">
        <div class="erp-grid">
          <div class="erp-field"><label>Member Number <span class="req">*</span></label>
            <div style="display:flex;gap:6px;"><input id="erpMemberNoInput" data-field="memberNo"><button type="button" class="erp-btn" style="padding:6px 10px;" onclick="erpPickMember()">🔍</button></div>
          </div>
          <div class="erp-field"><label>ERP Member Number</label><input readonly data-field="erpMemberNo"></div>
          <div class="erp-field"><label>Member Name</label><input readonly data-field="memberName"></div>
          <div class="erp-field"><label>Member Category</label><input readonly data-field="memberCategory"></div>
        </div>
        <div class="erp-grid" style="margin-top:14px;">
          <div class="erp-field"><label>Mobile Number <span class="req">*</span></label><input id="erpMobileInput" data-field="mobile"></div>
        </div>
      </div>
    </div>
    <div class="erp-section">
      <div class="erp-section-hd">Account Type Information</div>
      <div class="erp-section-body">
        <div class="erp-grid cols-2">
          <div class="erp-field"><label>Account Type <span class="req">*</span></label>
            <div style="display:flex;gap:18px;padding-top:6px;">
              <label><input type="radio" name="erpAcctType" value="Single" ${s.accountType==='Single'?'checked':''} onchange="erpSetAccountType('Single')"> Single</label>
              <label><input type="radio" name="erpAcctType" value="Joint" ${s.accountType==='Joint'?'checked':''} onchange="erpSetAccountType('Joint')"> Joint</label>
            </div>
          </div>
          <div class="erp-field"><label>OTP Sends To <span class="req">*</span></label>
            <div style="display:flex;gap:18px;padding-top:6px;" id="erpOtpRow">
              ${s.accountType==='Joint' ? `
                <label><input type="radio" name="erpOtp" value="Self" checked> Self</label>
                <label><input type="radio" name="erpOtp" value="Both"> Both</label>
                <label><input type="radio" name="erpOtp" value="Any"> Any</label>
              ` : `<label><input type="radio" name="erpOtp" value="Self" checked> Self</label>`}
            </div>
          </div>
        </div>
      </div>
    </div>
    ${s.accountType==='Joint' ? `
    <div class="erp-section">
      <div class="erp-section-hd">Joint Account Holder's Information</div>
      <div class="erp-section-body">
        <div class="erp-grid">
          <div class="erp-field"><label>Gender <span class="req">*</span></label><select data-field="jointGender"><option value="">-Select gender-</option><option>Male</option><option>Female</option><option>Other</option></select></div>
          <div class="erp-field"><label>Relationship <span class="req">*</span></label><select data-field="jointRelationship"><option value="">-Select relationship-</option>${DB.relationshipOptions.map(o=>`<option>${esc(o)}</option>`).join('')}</select></div>
          <div class="erp-field"><label>Name <span class="req">*</span></label><input data-field="jointName"></div>
          <div class="erp-field"><label>Date Of Birth <span class="req">*</span></label><input type="date" id="erpJointDob" data-field="jointDob"></div>
        </div>
        <div class="erp-grid" style="margin-top:14px;">
          <div class="erp-field"><label>Age</label><input readonly id="erpJointAge"></div>
          <div class="erp-field"><label>National ID <span class="req">*</span></label><input data-field="jointNid"></div>
          <div class="erp-field"><label>Birth Certificate Number</label><input data-field="jointBirthCert"></div>
          <div class="erp-field"><label>Passport Number</label><input data-field="jointPassport"></div>
        </div>
        <div class="erp-grid" style="margin-top:14px;">
          <div class="erp-field"><label>Smart Card ID</label><input data-field="jointSmartCard"></div>
          <div class="erp-field span-2"><label>Joint Account Holder Mobile No. <span class="req">*</span></label><input data-field="jointMobile"></div>
        </div>
      </div>
    </div>` : ''}
    <div class="erp-section">
      <div class="erp-section-hd">Nominee Information</div>
      <div class="erp-section-body">
        <div class="erp-consent-box" style="margin-bottom:12px;">
          <label style="font-size:12.5px;"><input type="checkbox" id="erpUseExistingNominee"> Use Existing Nominee Information</label>
        </div>
        ${erpNomineeBlock(1)}
        ${erpNomineeBlock(2)}
      </div>
    </div>
    <div class="erp-section">
      <div class="erp-section-hd">Savings Account Information</div>
      <div class="erp-section-body">
        <div class="erp-grid">
          <div class="erp-field"><label>Savings A/C No</label><input readonly value="AUTO"></div>
          <div class="erp-field"><label>Account Name <span class="req">*</span></label><input data-field="accountName"></div>
          <div class="erp-field"><label>Creation Date</label><input readonly value="${todayDisplay()}"></div>
          <div class="erp-field"><label>Savings Product <span class="req">*</span></label>
            <select data-field="savingsProduct"><option value="">-Select Product-</option>${DB.savingsProducts.map(p=>`<option>${esc(p)}</option>`).join('')}</select>
          </div>
        </div>
      </div>
    </div>
    </form>
    <div class="erp-btn-row">
      <button class="erp-btn" onclick="erpSaveB2()">Save</button>
      <button class="erp-btn" onclick="erpClearB2()">Clear</button>
    </div>
  `;
}
function erpNomineeBlock(n){
  return `
    <div style="border:1px solid var(--erp-border);border-radius:4px;margin-bottom:12px;overflow:hidden;">
      <div style="background:var(--steel);color:#fff;font-weight:800;font-size:12.5px;padding:6px 12px;">Nominee ${n}</div>
      <div style="padding:12px;background:#fff;">
        <div class="erp-grid">
          <div class="erp-field"><label>Name</label><input data-field="nominee${n}Name"></div>
          <div class="erp-field"><label>Date of Birth</label><input type="date" data-field="nominee${n}Dob"></div>
          <div class="erp-field"><label>Relationship</label><select data-field="nominee${n}Relationship"><option value="">-Select relationship-</option>${DB.relationshipOptions.map(o=>`<option>${esc(o)}</option>`).join('')}</select></div>
          <div class="erp-field">
            <label>Photo</label>
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="erp-photo-box" id="erpNomineePhoto${n}">No Image</div>
              <button type="button" class="erp-btn" style="padding:6px 12px;" onclick="document.getElementById('erpNomineeFile${n}').click()">Browse</button>
              <button type="button" title="Clear" class="erp-link-btn" onclick="erpClearNominee(${n})">🗑</button>
              <input type="file" accept="image/*" id="erpNomineeFile${n}" style="display:none;" onchange="erpNomineePhotoPicked(${n},this)">
            </div>
          </div>
        </div>
        <div class="erp-grid" style="margin-top:12px;">
          <div class="erp-field"><label>National ID</label><input data-field="nominee${n}Nid"></div>
          <div class="erp-field"><label>Birth Certificate Number</label><input data-field="nominee${n}BirthCert"></div>
          <div class="erp-field"><label>Passport No.</label><input data-field="nominee${n}Passport"></div>
          <div class="erp-field"><label>Smart Card ID</label><input data-field="nominee${n}SmartCard"></div>
        </div>
        <div class="erp-grid" style="margin-top:12px;">
          <div class="erp-field"><label>Percentage</label><input data-field="nominee${n}Percentage" value="${n===1?'100':''}"></div>
        </div>
      </div>
    </div>`;
}
function erpSetAccountType(t){
  const form = document.getElementById('erpB2FormEl');
  if(form) erpB2State.formSnapshot = collectForm(form);
  erpB2State.accountType = t;
  render();
}
function erpClearNominee(n){
  const form = document.getElementById('erpB2FormEl');
  ['Name','Dob','Relationship','Nid','BirthCert','Passport','SmartCard','Percentage'].forEach(f=>{
    const el = form.querySelector(`[data-field="nominee${n}${f}"]`);
    if(el) el.value = '';
  });
  document.getElementById('erpNomineePhoto'+n).textContent = 'No Image';
}
function erpNomineePhotoPicked(n, input){
  if(input.files[0]) document.getElementById('erpNomineePhoto'+n).textContent = '✓ ' + input.files[0].name;
}
function erpPickMember(){
  openMemberSearch((m)=>{
    document.getElementById('erpMemberNoInput').value = m.memberNo;
    document.getElementById('erpMemberNoInput').dispatchEvent(new Event('blur'));
  });
}
function wireErpB2Form(){
  const form = document.getElementById('erpB2FormEl');
  if(!form) return;
  if(erpB2State.formSnapshot){ fillForm(form, erpB2State.formSnapshot); erpB2State.formSnapshot = null; }
  const memberInput = document.getElementById('erpMemberNoInput');
  memberInput.addEventListener('blur', ()=>{
    const m = findMember(memberInput.value.trim());
    if(m){
      form.querySelector('[data-field="erpMemberNo"]').value = m.erpMemberNo;
      form.querySelector('[data-field="memberName"]').value = m.name;
      form.querySelector('[data-field="memberCategory"]').value = m.category;
      const mobileEl = form.querySelector('[data-field="mobile"]');
      if(!mobileEl.value) mobileEl.value = m.mobile;
      const nameEl = form.querySelector('[data-field="accountName"]');
      if(!nameEl.value) nameEl.value = m.name;
      const projSel = form.querySelector('[data-field="projectLabel"]');
      if(!projSel.value) projSel.value = projectLabel(m.project);
    }
  });
  const mobileInput = document.getElementById('erpMobileInput');
  mobileInput.addEventListener('blur', ()=>{
    const dup = findDuplicateMobile(mobileInput.value.trim(), memberInput.value.trim());
    if(dup){
      openDuplicateModal(dup, (newMobile)=>{ mobileInput.value = newMobile; }, ()=>{ mobileInput.value=''; });
    }
  });
  const jointDob = document.getElementById('erpJointDob');
  if(jointDob){
    jointDob.addEventListener('change', ()=>{
      const age = Math.max(0, Math.floor((Date.now() - new Date(jointDob.value)) / 31557600000));
      document.getElementById('erpJointAge').value = jointDob.value ? age : '';
    });
  }
  const useExisting = document.getElementById('erpUseExistingNominee');
  useExisting.addEventListener('change', ()=>{
    const acct = findAccountByMember(memberInput.value.trim());
    if(useExisting.checked && acct){
      form.querySelector('[data-field="nominee1Name"]').value = acct.nominee.name;
      form.querySelector('[data-field="nominee1Dob"]').value = acct.nominee.dob;
      form.querySelector('[data-field="nominee1Relationship"]').value = acct.nominee.relationship;
      form.querySelector('[data-field="nominee1Nid"]').value = acct.nominee.nid;
      form.querySelector('[data-field="nominee1Percentage"]').value = acct.nominee.percentage;
    } else if(useExisting.checked){
      toast('No existing nominee on file for this member.');
      useExisting.checked = false;
    }
  });
}
function erpSaveB2(){
  const form = document.getElementById('erpB2FormEl');
  const fd = collectForm(form);
  if(!fd.projectLabel || !fd.memberNo || !fd.mobile || !fd.accountName || !fd.savingsProduct || !fd.nominee1Name || !fd.nominee1Relationship){
    toast('Please fill all required fields (marked *).');
    return;
  }
  const member = findMember(fd.memberNo);
  showConfirm('Save AHSS account', `Create and approve an AHSS savings account for ${fd.memberName || fd.memberNo}?`, ()=>{
    const projectCode = (DB.projects.find(p=>p.label===fd.projectLabel)||{}).code || '';
    const accountNo = newAcctNo();
    const account = {
      accountNo, memberNo: fd.memberNo, accountName: fd.accountName, project: projectCode,
      branch: member ? member.branch : '', product: fd.savingsProduct, accountType: erpB2State.accountType,
      status: 'Approved', balance: 0, openingDate: todayISO(),
      nominee: { name: fd.nominee1Name, relationship: fd.nominee1Relationship, dob: fd.nominee1Dob, nid: fd.nominee1Nid, percentage: fd.nominee1Percentage || '100' },
      autoDebit: { loanInstallment: false, savingsInstallment: false },
      transactions: [{ date: todayISO(), description: 'Account opening deposit', debit: 0, credit: 0, balance: 0 }]
    };
    if(fd.savingsProduct === 'Special Savings'){ account.autoCredit = { monthlyProfit:false, maturityAmount:false }; account.autoDebit.dpsInstallment = false; }
    DB.accounts.push(account);
    DB.ahssRequests.unshift({
      id: newReqId(), memberNo: fd.memberNo, memberName: fd.memberName, project: projectCode, branch: account.branch,
      requestType:'AHSS Account Opening', proposedBy: ERP_USER, dcsApprovedBy:'', requestDate: todayISO(),
      status:'Approved', linkedAccountNo: accountNo,
      formData: { projectLabel: fd.projectLabel, memberNo: fd.memberNo, erpMemberNo: fd.erpMemberNo, memberName: fd.memberName,
        memberCategory: fd.memberCategory, mobile: fd.mobile, accountType: erpB2State.accountType, otpSendsTo:'Self',
        nominee: account.nominee, accountName: fd.accountName, savingsProduct: fd.savingsProduct, consent: true }
    });
    persist();
    toast(`AHSS account ${accountNo} created and approved.`);
    erpClearB2();
  });
}
function erpClearB2(){
  showConfirm('Clear form', 'Clear all entered data on this form?', ()=>{
    erpB2State = { accountType: 'Single' };
    render();
  }, { yesClass:'btn-danger', yesLabel:'Clear' });
}

/* -------------------- B1: Consent Buffer Panel -------------------- */
function erpFilterMatches(row, isContinuation){
  const f = ui.erpFilters;
  if(f.project && row.project !== f.project) return false;
  if(f.branch && !(row.branch||'').toLowerCase().includes(f.branch.toLowerCase())) return false;
  if(f.status && row.status !== f.status) return false;
  if(f.from && row.requestDate < f.from) return false;
  if(f.to && row.requestDate > f.to) return false;
  return true;
}
function erpApplyFilters(){
  ui.erpFilters = {
    project: document.getElementById('fProject').value,
    branch: document.getElementById('fBranch').value,
    from: document.getElementById('fFrom').value,
    to: document.getElementById('fTo').value,
    status: document.getElementById('fStatus').value,
  };
  render();
}
function erpResetFilters(){ ui.erpFilters = { project:'', branch:'', from:'', to:'', status:'' }; render(); }

function erpB1Panel(){
  const ALL_STATUSES = ['Pending ERP Approval','Approved','Rejected','Sent Back to DCS'];
  const f = ui.erpFilters;
  return `
    <h1 class="erp-page-title">Consent Buffer Panel</h1>
    <div class="erp-tabbar">
      <button class="${ui.erpB1Tab==='opening'?'active':''}" onclick="setErpB1Tab('opening')">AHSS Account Opening</button>
      <button class="${ui.erpB1Tab==='continuation'?'active':''}" onclick="setErpB1Tab('continuation')">Auto Debit/Credit Continuation/Discontinuation</button>
    </div>
    <div class="erp-filterbar">
      <div class="fitem"><label>Project</label><select id="fProject"><option value="">All</option>${DB.projects.map(p=>`<option value="${esc(p.code)}" ${f.project===p.code?'selected':''}>${esc(p.code)}</option>`).filter((v,i,a)=>a.indexOf(v)===i).join('')}</select></div>
      <div class="fitem"><label>Branch</label><input id="fBranch" value="${esc(f.branch)}" placeholder="Branch name"></div>
      <div class="fitem"><label>From</label><input type="date" id="fFrom" value="${esc(f.from)}"></div>
      <div class="fitem"><label>To</label><input type="date" id="fTo" value="${esc(f.to)}"></div>
      <div class="fitem"><label>Status</label><select id="fStatus"><option value="">All</option>${ALL_STATUSES.map(s=>`<option ${f.status===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
      <div class="fitem" style="min-width:auto;"><button class="erp-btn" onclick="erpApplyFilters()">Apply</button></div>
      <div class="fitem" style="min-width:auto;"><button class="erp-btn" onclick="erpResetFilters()">Reset</button></div>
    </div>
    ${ui.erpB1Tab==='opening' ? erpB1OpeningTable() : erpB1ContinuationTable()}
  `;
}
function erpB1OpeningTable(){
  const rows = DB.ahssRequests.filter(r=> r.status!=='Pending DCS Approval' && erpFilterMatches(r,false))
    .sort((a,b)=> b.requestDate.localeCompare(a.requestDate));
  const headers = ['Member No.','Member Name','Project','Branch','Request Type','Proposed By','DCS Approved By','Request Date','Status'];
  setRowsCache('AHSS Account Opening', rows.map(r=>[r.memberNo,r.memberName,projectLabel(r.project),r.branch,r.requestType,r.proposedBy,r.dcsApprovedBy||'—',fmtDate(r.requestDate),r.status]));
  return `
    ${downloadRow('AHSS Account Opening', headers, [])}
    <div class="erp-table-wrap"><table class="erp-table">
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Action</th></tr></thead>
      <tbody>${rows.map(r=>`
        <tr>
          <td>${esc(r.memberNo)}</td><td>${esc(r.memberName)}</td><td>${esc(projectLabel(r.project))}</td><td>${esc(r.branch)}</td>
          <td>${esc(r.requestType)}</td><td>${esc(r.proposedBy)}</td><td>${esc(r.dcsApprovedBy)||'—'}</td><td>${esc(fmtDate(r.requestDate))}</td>
          <td><span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span></td>
          <td><button class="erp-btn" style="padding:5px 12px;" onclick="erpOpenReview('opening','${r.id}')">Review</button></td>
        </tr>`).join('') || `<tr><td colspan="10" style="text-align:center;color:#8a97a1;padding:20px;">No requests match the current filters.</td></tr>`}
      </tbody>
    </table></div>
  `;
}
function erpB1ContinuationTable(){
  const rows = DB.continuationRequests.filter(r=> r.status!=='Pending DCS Approval' && erpFilterMatches(r,true))
    .sort((a,b)=> b.requestDate.localeCompare(a.requestDate));
  const headers = ['Member No.','Member Name','Project','Branch','Product','Action','Proposed By','DCS Approved By','Request Date','Status'];
  setRowsCache('Auto Debit-Credit Continuation', rows.map(r=>[r.memberNo,r.memberName,projectLabel(r.project),r.branch,r.product,r.action,r.proposedBy,r.dcsApprovedBy||'—',fmtDate(r.requestDate),r.status]));
  return `
    ${downloadRow('Auto Debit-Credit Continuation', headers, [])}
    <div class="erp-table-wrap"><table class="erp-table">
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Action</th></tr></thead>
      <tbody>${rows.map(r=>`
        <tr>
          <td>${esc(r.memberNo)}</td><td>${esc(r.memberName)}</td><td>${esc(projectLabel(r.project))}</td><td>${esc(r.branch)}</td>
          <td>${esc(r.product)}</td><td>${esc(r.action)}</td><td>${esc(r.proposedBy)}</td><td>${esc(r.dcsApprovedBy)||'—'}</td><td>${esc(fmtDate(r.requestDate))}</td>
          <td><span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span></td>
          <td><button class="erp-btn" style="padding:5px 12px;" onclick="erpOpenReview('continuation','${r.id}')">Review</button></td>
        </tr>`).join('') || `<tr><td colspan="11" style="text-align:center;color:#8a97a1;padding:20px;">No requests match the current filters.</td></tr>`}
      </tbody>
    </table></div>
  `;
}
function erpOpenReview(type, id){ ui.erpReview = { type, id }; ui.erpTab = 'b1detail'; render(); }

function erpB1Detail(){
  const rv = ui.erpReview;
  if(!rv) return '<div class="dcs-empty">Nothing selected.</div>';
  const isOpening = rv.type === 'opening';
  const r = isOpening ? DB.ahssRequests.find(x=>x.id===rv.id) : DB.continuationRequests.find(x=>x.id===rv.id);
  if(!r) return '<div class="dcs-empty">Request not found.</div>';
  const actionable = r.status === 'Pending ERP Approval';
  return `
    <button class="erp-link-btn" style="margin-bottom:10px;" onclick="setErpTab('b1')">← Back to Consent Buffer Panel</button>
    <h1 class="erp-page-title">Review ${esc(r.id)} <span class="chip ${statusChipClass(r.status)}" style="margin-left:10px;">${esc(r.status)}</span></h1>
    <div class="erp-section">
      <div class="erp-section-hd">${isOpening ? 'AHSS Account Opening — Summary' : 'Auto Debit/Credit Continuation — Summary'}</div>
      <div class="erp-section-body">
        ${isOpening ? renderAccountSummary(r.formData) : `
          <div class="erp-readonly-summary">
            <div class="kv"><span>Member</span><span>${esc(r.memberName)} (${esc(r.memberNo)})</span></div>
            <div class="kv"><span>Project / Branch</span><span>${esc(projectLabel(r.project))} · ${esc(r.branch)}</span></div>
            <div class="kv"><span>Account</span><span>${esc(r.accountNo)}</span></div>
            <div class="kv"><span>Product</span><span>${esc(r.product)}</span></div>
            <div class="kv"><span>Requested action</span><span>${esc(r.action)}</span></div>
            <div class="kv"><span>Reason</span><span>${esc(r.reason)}</span></div>
            <div class="kv"><span>Proposed by</span><span>${esc(r.proposedBy)}</span></div>
            <div class="kv"><span>DCS approver</span><span>${esc(r.dcsApprovedBy)}</span></div>
            <div class="kv"><span>DCS verification method</span><span>${esc(r.verification)}</span></div>
            <div class="kv"><span>DCS comment</span><span>${esc(r.comment)}</span></div>
          </div>`}
      </div>
    </div>
    <div class="erp-section">
      <div class="erp-section-hd">Consent</div>
      <div class="erp-section-body">
        <div class="erp-consent-box">
          <div class="row"><button type="button" class="erp-btn" onclick="erpGenerateConsentPaper('${rv.type}','${rv.id}')">🖨 Generate Consent Paper</button></div>
          <div class="row"><input type="checkbox" id="erpConsentCaptured"><span>Consent captured for this ${isOpening?'account opening':'continuation/discontinuation'}.</span></div>
          <div class="row"><label style="font-weight:700;font-size:12.5px;">Upload signed consent paper:</label><input type="file" id="erpConsentUpload"></div>
        </div>
      </div>
    </div>
    ${actionable ? `
    <div class="erp-section">
      <div class="erp-section-hd">Decision</div>
      <div class="erp-section-body">
        <div class="erp-field"><label>Reviewer Comment</label><textarea id="erpDecisionComment" rows="3" placeholder="Required for Send Back or Reject"></textarea></div>
        <div class="erp-btn-row">
          <button class="erp-btn" style="background:#DCEEE2;border-color:#9ecdac;" onclick="erpDecide('${rv.type}','${rv.id}','Approved')">Approve</button>
          <button class="erp-btn" style="background:#EDE3F8;border-color:#c9adf0;" onclick="erpDecide('${rv.type}','${rv.id}','Sent Back to DCS')">Send Back</button>
          <button class="erp-btn" style="background:#F8DAD2;border-color:#e2a894;" onclick="erpDecide('${rv.type}','${rv.id}','Rejected')">Reject</button>
        </div>
      </div>
    </div>` : ''}
  `;
}
function erpGenerateConsentPaper(type, id){
  const isOpening = type === 'opening';
  const r = isOpening ? DB.ahssRequests.find(x=>x.id===id) : DB.continuationRequests.find(x=>x.id===id);
  const w = window.open('', '_blank', 'width=800,height=900');
  if(!w){ toast('Pop-up blocked — allow pop-ups to view the consent paper.'); return; }
  const body = isOpening ? `
    <p>This is to certify that <b>${esc(r.formData.memberName)}</b> (Member No. ${esc(r.memberNo)}) has given informed consent to open an
    <b>Amar Hishab Shadharon Sonchoy (AHSS)</b> savings account under project ${esc(r.formData.projectLabel)}, for use in loan disbursement,
    installment collection and savings auto debit/credit as applicable.</p>` : `
    <p>This is to certify that <b>${esc(r.memberName)}</b> (Member No. ${esc(r.memberNo)}), holder of AHSS account ${esc(r.accountNo)},
    has given informed consent to <b>${esc(r.action)}</b> auto debit/credit for <b>${esc(r.product)}</b>.</p>
    <p>Reason recorded: ${esc(r.reason)}</p>`;
  w.document.write(`<!DOCTYPE html><html><head><title>Consent Paper</title><style>
    body{font-family:'Times New Roman',serif;padding:50px;color:#111;} h2{text-align:center;color:#173357;}
    .meta{margin:24px 0;font-size:14px;line-height:1.9;} .sign{margin-top:70px;display:flex;justify-content:space-between;}
    .sign div{border-top:1px solid #333;width:220px;text-align:center;padding-top:6px;font-size:12.5px;}
  </style></head><body>
  <h2>BRAC Microfinance — AHSS Consent Paper</h2>
  <div class="meta">${body}<p>Date: ${esc(todayDisplay())}</p></div>
  <div class="sign"><div>Client Signature</div><div>Authorized Officer</div></div>
  <script>window.onload=function(){window.print();};<\/script>
  </body></html>`);
  w.document.close();
}
function erpDecide(type, id, status){
  const comment = (document.getElementById('erpDecisionComment')||{}).value || '';
  if(status !== 'Approved' && !comment.trim()){ toast('A reviewer comment is required for Send Back or Reject.'); return; }
  showConfirm(status + ' request', `Confirm: ${status} this request?`, ()=>{
    if(type === 'opening'){
      const r = DB.ahssRequests.find(x=>x.id===id);
      r.status = status;
      if(status === 'Approved'){
        const accountNo = newAcctNo();
        DB.accounts.push({
          accountNo, memberNo: r.memberNo, accountName: r.formData.accountName, project: r.project, branch: r.branch,
          product: r.formData.savingsProduct, accountType: r.formData.accountType, status:'Approved', balance:0, openingDate: todayISO(),
          nominee: r.formData.nominee, autoDebit:{ loanInstallment:false, savingsInstallment:false },
          transactions:[{ date: todayISO(), description:'Account opening deposit', debit:0, credit:0, balance:0 }]
        });
        r.linkedAccountNo = accountNo;
      }
    } else {
      const r = DB.continuationRequests.find(x=>x.id===id);
      r.status = status;
      if(status === 'Approved'){
        const acct = DB.accounts.find(a=>a.accountNo===r.accountNo);
        const key = Object.keys(AUTODC_PRODUCTS).find(k=>AUTODC_PRODUCTS[k]===r.product);
        if(acct && key){
          const val = r.action === 'Continue';
          if(key in (acct.autoDebit||{})) acct.autoDebit[key] = val;
          else if(key in (acct.autoCredit||{})) acct.autoCredit[key] = val;
        }
      }
    }
    persist();
    toast('Decision recorded: ' + status);
    ui.erpReview = null;
    setErpTab('b1');
  }, { yesClass: status==='Approved'?'btn-primary':(status==='Rejected'?'btn-danger':'btn-outline') });
}

/* -------------------- B3: AHSS Account view (ERP) -------------------- */
function erpB3View(){
  if(!ui.erpSelectedAccount && DB.accounts.length) ui.erpSelectedAccount = DB.accounts[0].accountNo;
  const a = DB.accounts.find(x=>x.accountNo===ui.erpSelectedAccount);
  const headers = ['Date','Description','Debit','Credit','Balance'];
  setRowsCache('AHSS Transactions', a ? a.transactions.map(t=>[fmtDate(t.date),t.description,t.debit||'',t.credit||'',t.balance]) : []);
  return `
    <h1 class="erp-page-title">AHSS Account View</h1>
    <div class="erp-filterbar">
      <div class="fitem"><label>Account</label>
        <select onchange="ui.erpSelectedAccount=this.value; render();">
          ${DB.accounts.map(x=>`<option value="${esc(x.accountNo)}" ${x.accountNo===ui.erpSelectedAccount?'selected':''}>${esc(x.accountNo)} — ${esc(x.accountName)}</option>`).join('')}
        </select>
      </div>
      <div class="fitem"><label>From</label><input type="date"></div>
      <div class="fitem"><label>To</label><input type="date"></div>
      <div class="fitem" style="min-width:auto;"><button class="erp-btn">Apply</button></div>
    </div>
    ${a ? `
    <div class="erp-section">
      <div class="erp-section-hd">Account Summary</div>
      <div class="erp-section-body">
        <div class="erp-readonly-summary">
          <div class="kv"><span>Account No.</span><span>${esc(a.accountNo)}</span></div>
          <div class="kv"><span>Account Name</span><span>${esc(a.accountName)}</span></div>
          <div class="kv"><span>Project</span><span>${esc(projectLabel(a.project))}</span></div>
          <div class="kv"><span>Product</span><span>${esc(a.product)}</span></div>
          <div class="kv"><span>Account Type</span><span>${esc(a.accountType)}</span></div>
          <div class="kv"><span>Status</span><span>${esc(a.status)}</span></div>
          <div class="kv"><span>Opening Date</span><span>${esc(fmtDate(a.openingDate))}</span></div>
          <div class="kv"><span>Current Balance</span><span>${money(a.balance)}</span></div>
        </div>
      </div>
    </div>
    ${downloadRow('AHSS Transactions', headers, [])}
    <div class="erp-table-wrap"><table class="erp-table">
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${a.transactions.slice().reverse().map(t=>`
        <tr><td>${esc(fmtDate(t.date))}</td><td>${esc(t.description)}</td><td>${t.debit?money(t.debit):''}</td><td>${t.credit?money(t.credit):''}</td><td>${money(t.balance)}</td></tr>`).join('')}
      </tbody>
    </table></div>` : '<div class="dcs-empty">No account selected.</div>'}
  `;
}

/* ---------------- final render hook: wire ERP forms after paint ---------------- */
const _origRenderERP = renderERP;
renderERP = function(){
  _origRenderERP();
  if(ui.erpTab === 'b2') wireErpB2Form();
};

