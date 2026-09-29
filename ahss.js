/* ==========================================================================
   AHSS + Special Savings/Chaya Insurance Prototype
   Data layer, navigation, shared modal helpers
   ========================================================================== */
let DB = null;

const FIELD_USER = 'CDO - Jasim Uddin';
const APPROVER_USER = 'BM/ABM - Kamal Hossain';
const ERP_USER = 'BAO - Nusrat Jahan';

/* Exact status vocabulary from the production DCS app (Special Savings
   Application screen's status filter) — reused for AHSS too so both
   modules speak the same language on both DCS and ERP screens. */
const STATUS_OPTIONS = ['BM Rejected','BM Sendback','BM Pending','ERP Sendback','ERP Rejected','ERP Approved','ERP Pending'];
const ID_TYPE_OPTIONS = ['National ID','Birth Certificate','Smart Card','Passport'];

const ui = {
  mode: 'dcs',
  dcsRole: 'field',
  // Generic module/screen stack for the DCS mobile shell — replaces the old
  // bottom-nav-tab model. dcs.mod is the active module ('home','ahss','ss',
  // or a stub tile id); dcs.screen/params describe where inside that module.
  dcs: { mod: 'home', screen: 'home', params: {} },
  dcsHistory: [],
  erpMenu: 'savings',
  erpSavingsBranch: 'ahss', // 'ahss' | 'special'
  erpTab: 'b2',
  erpB1Tab: 'opening',
  erpReview: null,
  erpFilters: { project: '', branch: '', from: '', to: '', status: '' },
  ssErpFilters: { project: '', vo: '', from: '', to: '', status: '' },
  erpAccountQuery: '',
  erpSelectedAccount: null,
  dcsSelectedAccount: null,
  dcsListFilters: { ahss: { q:'', from:'', to:'', status:'' }, ss: { q:'', from:'', to:'', status:'' } },
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
function newSsId(){ return 'SS-' + Date.now(); }
function newAcctNo(){ return 'AHSS-' + String(100000 + (Date.now() % 900000)).slice(0,6); }
function newEnrollmentGuid(){
  const h = () => Math.floor((1+Math.random())*0x10000).toString(16).slice(1);
  return `${h()}${h()}-${h()}-${h()}-${h()}-${h()}${h()}${h()}`;
}
function money(n){ return '৳' + Number(n||0).toLocaleString('en-US'); }
function ageFromDob(dob){
  if(!dob) return null;
  const age = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000);
  return age >= 0 ? age : null;
}
const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function numberToWords(n){
  n = Math.round(Number(n)||0);
  if(n === 0) return 'Zero';
  function chunk(num){
    let s = '';
    if(num >= 100){ s += ONES[Math.floor(num/100)] + ' Hundred '; num %= 100; }
    if(num >= 20){ s += TENS[Math.floor(num/10)] + ' '; num %= 10; }
    if(num > 0) s += ONES[num] + ' ';
    return s.trim();
  }
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  let out = [];
  if(crore) out.push(chunk(crore) + ' Crore');
  if(lakh) out.push(chunk(lakh) + ' Lakh');
  if(thousand) out.push(chunk(thousand) + ' Thousand');
  if(n) out.push(chunk(n));
  return out.join(' ').trim();
}
/* Simplified, clearly-artificial demo formulas — NOT BRAC's real DPS/Chaya
   rate tables (those are proprietary actuarial charts). Good enough to make
   the wizard's computed fields react sensibly to product/tenure/amount. */
const SS_MATURITY_MULTIPLIER = { 3: 1.08, 5: 1.15, 8: 1.25, 10: 1.35 };
function computeMaturity(monthly, tenureYears){
  const mult = SS_MATURITY_MULTIPLIER[tenureYears] || 1.1;
  return Math.round(Number(monthly||0) * tenureYears * 12 * mult);
}
function computeMonthlyProfit(lumpSum, tenureYears){
  const rate = { 3: 0.08, 5: 0.10, 8: 0.115, 10: 0.12 }[tenureYears] || 0.09;
  return Math.round(Number(lumpSum||0) * rate / 12);
}
function computePremium(monthly, tenureYears, policyType){
  const base = Math.round(Number(monthly||0) * tenureYears * 0.284);
  return policyType === 'Double' ? Math.round(base * 1.6) : base;
}

/* ---------------- persistence ---------------- */
function persist(){
  try{
    localStorage.setItem('ahss_proto_state', JSON.stringify({
      members: DB.members,
      accounts: DB.accounts,
      ahssRequests: DB.ahssRequests,
      continuationRequests: DB.continuationRequests,
      specialSavingsApplications: DB.specialSavingsApplications,
      specialSavingsAccounts: DB.specialSavingsAccounts,
      loanApplications: DB.loanApplications
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
      if(overlay.members) DB.members = overlay.members;
      if(overlay.accounts) DB.accounts = overlay.accounts;
      if(overlay.ahssRequests) DB.ahssRequests = overlay.ahssRequests;
      if(overlay.continuationRequests) DB.continuationRequests = overlay.continuationRequests;
      if(overlay.specialSavingsApplications) DB.specialSavingsApplications = overlay.specialSavingsApplications;
      if(overlay.specialSavingsAccounts) DB.specialSavingsAccounts = overlay.specialSavingsAccounts;
      if(overlay.loanApplications) DB.loanApplications = overlay.loanApplications;
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
function notImplemented(label){
  toast((label ? label + ': ' : '') + 'not part of this prototype.');
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

/* ---------------- generic confirm / info modal ---------------- */
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
  noBtn.style.display = opts.hideNo ? 'none' : '';
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
  if(status === 'BM Pending') return 'chip-dcs-pending';
  if(status === 'ERP Pending') return 'chip-erp-pending';
  if(status === 'ERP Approved') return 'chip-approved';
  if(status === 'BM Rejected' || status === 'ERP Rejected') return 'chip-rejected';
  if(status === 'BM Sendback' || status === 'ERP Sendback') return 'chip-sentback';
  return 'chip-dcs-pending';
}

/* ---------------- export helpers (downloads) ---------------- */
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
  <div class="meta">BRAC Microfinance · Generated ${esc(todayDisplay())}</div>
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
   PART A — DCS MOBILE APP SHELL
   A single generic module/screen stack replaces the old bottom-nav-tab
   model, so it can host the real DCS Home dashboard grid plus however many
   modules (AHSS, Special Savings, stub tiles) sit behind it.
   ========================================================================== */
function dcsNavigate(view){
  ui.dcsHistory.push(JSON.parse(JSON.stringify(ui.dcs)));
  ui.dcs = view;
  render();
}
function dcsBack(){
  if(ui.dcsHistory.length){ ui.dcs = ui.dcsHistory.pop(); render(); }
  else dcsGoHome();
}
function dcsGoHome(){
  ui.dcs = { mod: 'home', screen: 'home', params: {} };
  ui.dcsHistory = [];
  render();
}
function dcsOpenModule(mod){
  ui.dcs = { mod, screen: 'home', params: {} };
  ui.dcsHistory = [];
  render();
}
function dcsSetRole(role){
  ui.dcsRole = role;
  dcsGoHome();
}

const DCS_TILES_FIELD = [
  { id: 'dashboard', label: 'Dashboard', ic: '▦', stub: true },
  { id: 'volist', label: 'VO List', ic: '👥', stub: true },
  { id: 'survey', label: 'Survey', ic: '📋', stub: true },
  { id: 'admission', label: 'Admission', ic: '🪪', stub: false },
  { id: 'profile', label: 'Profile Update', ic: '👤', stub: true },
  { id: 'loan', label: 'Loan', ic: '📝', stub: false },
  { id: 'insurance', label: 'Insurance Application', ic: '🛡', stub: true },
  { id: 'ss', label: 'Special Savings Application', ic: '💰', stub: false },
  { id: 'ahss', label: 'AHSS', ic: '🏦', stub: false },
];
const DCS_TILES_APPROVER = DCS_TILES_FIELD.map(t => t.id === 'survey' ? { id:'polist', label:'PO List', ic:'📋', stub:true } : t);

function dcsTilesForRole(){ return ui.dcsRole === 'field' ? DCS_TILES_FIELD : DCS_TILES_APPROVER; }

function dcsAppBarTitle(){
  if(ui.dcs.mod === 'home') return 'DCS Home';
  if(ui.dcs.mod === 'ahss') return 'AHSS';
  if(ui.dcs.mod === 'ss') return 'Special Savings Application';
  const tile = dcsTilesForRole().find(t => t.id === ui.dcs.mod);
  return tile ? tile.label : 'DCS';
}

function renderDCS(){
  const root = document.getElementById('dcsRoot');
  root.innerHTML = `
    <div class="dcs-shell">
      <div class="dcs-appbar">
        <button class="dcs-appbar-icon" onclick="${ui.dcs.mod==='home' ? "toast('Menu is not part of this prototype.')" : 'dcsBack()'}">${ui.dcs.mod==='home' ? '☰' : '←'}</button>
        <div class="dcs-appbar-title">${esc(dcsAppBarTitle())}</div>
        <button class="dcs-appbar-icon" onclick="toast('Notifications are not part of this prototype.')">🔔</button>
        <div class="dcs-appbar-lang">En</div>
        <button class="dcs-appbar-icon" onclick="dcsToggleRoleMenu()">⋮</button>
      </div>
      <div class="dcs-role-strip">
        <span>Signed in as</span>
        <div class="dcs-role-switch">
          <div class="dcs-role-opt ${ui.dcsRole==='field'?'active':''}" onclick="dcsSetRole('field')">CDO / CO</div>
          <div class="dcs-role-opt ${ui.dcsRole==='approver'?'active':''}" onclick="dcsSetRole('approver')">BM / ABM</div>
        </div>
      </div>
      <div class="dcs-body" id="dcsBody">${dcsBodyContent()}</div>
    </div>`;
  dcsWireScreen();
}
function dcsToggleRoleMenu(){ toast('Settings / language / Video Tutorial / Exit are not part of this prototype.'); }

function dcsBodyContent(){
  const v = ui.dcs;
  if(v.mod === 'home') return dcsHomeDashboard();
  if(v.mod === 'ahss') return dcsAhssModule(v);
  if(v.mod === 'ss') return dcsSsModule(v);
  if(v.mod === 'admission') return dcsAdmissionModule(v);
  if(v.mod === 'loan') return dcsLoanModule(v);
  const tile = dcsTilesForRole().find(t => t.id === v.mod);
  return `<div class="dcs-empty">${esc(tile ? tile.label : 'This screen')} is not part of this prototype.<br><br>Special Savings Application, AHSS, Admission and Loan are fully built out here.</div>`;
}

function dcsHomeDashboard(){
  const memberHeader = ui.dcsRole === 'field'
    ? '00269059 - JASIM UDDIN · 0605 - Gulshan'
    : '00251412 - KAMAL HOSSAIN · 0605 - Gulshan';
  return `
    <div class="dcs-home-header">${esc(memberHeader)}</div>
    <div class="dcs-dashboard-grid">
      ${dcsTilesForRole().map(t => `
        <button class="dcs-tile ${t.id==='ahss'?'dcs-tile-new':''}" onclick='${t.stub ? `notImplemented(${JSON.stringify(t.label)})` : `dcsOpenModule("${t.id}")`}'>
          ${t.id==='ahss' ? '<span class="dcs-tile-badge">NEW</span>' : ''}
          <span class="dcs-tile-icon">${t.ic}</span>
          <span class="dcs-tile-label">${esc(t.label)}</span>
        </button>`).join('')}
    </div>
    <div class="dcs-subtle" style="text-align:center;margin-top:18px;">Last Download Since 0 Days, 5 Hours, 38 Minutes</div>
  `;
}

/* wireScreen() runs after every render — anything that can't be a plain
   onclick="" string (blur handlers, debounced autosave) gets attached here */
function dcsWireScreen(){
  const v = ui.dcs;
  if(v.mod === 'ahss' && v.screen === 'form') wireDcsEnrollForm(v);
  if(v.mod === 'ahss' && v.screen === 'autodcForm') wireDcsAutoDcForm(v);
  if(v.mod === 'ss' && v.screen === 'wizard') wireSsWizard(v);
  if(v.mod === 'admission' && v.screen === 'form') wireAdmissionForm(v);
  if(v.mod === 'loan' && v.screen === 'form') wireLoanForm(v);
}

/* ==========================================================================
   MODULE: AHSS (re-platformed onto the DCS Home shell — list + detail,
   no bottom nav; auto debit/credit and account view nest inside this
   module instead of being separate tabs)
   ========================================================================== */
function dcsAhssModule(v){
  if(v.screen === 'form') return dcsEnrollForm(v.params);
  if(v.screen === 'detail') return dcsEnrollDetail(v.params);
  if(v.screen === 'autodcHome') return ui.dcsRole === 'field' ? dcsAutoDcHomeField() : dcsAutoDcHomeApprover();
  if(v.screen === 'autodcForm') return dcsAutoDcForm(v.params);
  if(v.screen === 'autodcDetail') return dcsAutoDcDetail(v.params);
  if(v.screen === 'account') return dcsScreenAccount(v.params);
  return dcsAhssHome();
}

function dcsAhssMenu(){
  const items = ui.dcsRole === 'field'
    ? [['Auto Debit/Credit requests', "dcsNavigate({mod:'ahss',screen:'autodcHome',params:{}})"],
       ['View an AHSS account', "dcsNavigate({mod:'ahss',screen:'account',params:{}})"]]
    : [['Auto Debit/Credit approvals', "dcsNavigate({mod:'ahss',screen:'autodcHome',params:{}})"],
       ['View an AHSS account', "dcsNavigate({mod:'ahss',screen:'account',params:{}})"]];
  return `
    <div class="dcs-menu-row">
      ${items.map(([label, action]) => `<button class="btn btn-outline btn-sm" onclick="${action}">${esc(label)}</button>`).join('')}
    </div>`;
}

function dcsAhssHome(){
  const f = ui.dcsListFilters.ahss;
  let rows = DB.ahssRequests.slice();
  if(ui.dcsRole === 'field') { /* field sees everything they can act on + submitted */ }
  rows = rows.filter(r => {
    if(f.q){ const q=f.q.toLowerCase(); if(!(r.memberName.toLowerCase().includes(q) || r.memberNo.toLowerCase().includes(q))) return false; }
    if(f.from && r.requestDate < f.from) return false;
    if(f.to && r.requestDate > f.to) return false;
    if(f.status && r.status !== f.status) return false;
    return true;
  }).sort((a,b)=> b.requestDate.localeCompare(a.requestDate));

  const card = (r) => {
    const actionable = ui.dcsRole === 'approver' && r.status === 'BM Pending';
    const acct = r.linkedAccountNo ? DB.accounts.find(a=>a.accountNo===r.linkedAccountNo) : null;
    return `
    <div class="dcs-card">
      <div class="dcs-card-row">
        <div>
          <div class="dcs-card-name">${esc(r.memberName)}</div>
          <div class="dcs-card-meta">${esc(r.memberNo)} · ${esc(projectLabel(r.project))} · ${esc(fmtDate(r.requestDate))}</div>
          <div class="dcs-card-meta">Proposed by ${esc(r.proposedBy)}${acct ? ' · Account ' + esc(acct.accountNo) : ''}</div>
        </div>
      </div>
      <div class="dcs-card-row" style="margin-top:8px;align-items:center;">
        <span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span>
        <button class="btn btn-sm ${actionable?'btn-primary':'btn-ghost'}" onclick="dcsNavigate({mod:'ahss',screen:'detail',params:{requestId:'${r.id}'}})">${actionable?'Review':'Details'}</button>
      </div>
    </div>`;
  };

  return `
    ${ui.dcsRole==='field' ? `<button class="btn btn-primary dcs-btn-block" onclick="dcsStartNewEnrollment()">+ New AHSS Enrollment</button>` : ''}
    <input class="dcs-input" placeholder="Search by member number or name.." style="margin-bottom:10px;" value="${esc(f.q)}" oninput="ui.dcsListFilters.ahss.q=this.value; dcsRefreshAhssList();">
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <input type="date" class="dcs-input" value="${esc(f.from)}" onchange="ui.dcsListFilters.ahss.from=this.value; render();">
      <input type="date" class="dcs-input" value="${esc(f.to)}" onchange="ui.dcsListFilters.ahss.to=this.value; render();">
    </div>
    <select class="dcs-select" style="margin-bottom:12px;" onchange="ui.dcsListFilters.ahss.status=this.value; render();">
      <option value="">All</option>
      ${STATUS_OPTIONS.map(s=>`<option ${f.status===s?'selected':''}>${esc(s)}</option>`).join('')}
    </select>
    ${dcsAhssMenu()}
    ${rows.map(card).join('') || '<div class="dcs-empty">No AHSS applications match.</div>'}
  `;
}
function dcsRefreshAhssList(){
  const body = document.getElementById('dcsBody');
  if(body) body.innerHTML = dcsBodyContent();
}

function dcsStartNewEnrollment(){
  openMemberSearch((member)=>{
    dcsNavigate({ mod:'ahss', screen:'form', params:{ memberNo: member.memberNo } });
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
  const actionable = ui.dcsRole === 'approver' && r.status === 'BM Pending';
  const acct = r.linkedAccountNo ? DB.accounts.find(a=>a.accountNo===r.linkedAccountNo) : null;
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Request ${esc(r.id)}</div>
      <div class="dcs-card-row" style="margin-bottom:10px;">
        <div class="dcs-card-name">${esc(r.memberName)}</div>
        <span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span>
      </div>
      ${renderAccountSummary(r.formData)}
    </div>
    ${acct ? `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Linked account</div>
      <div class="erp-readonly-summary">
        <div class="kv"><span>Account No.</span><span>${esc(acct.accountNo)}</span></div>
        <div class="kv"><span>Balance</span><span>${money(acct.balance)}</span></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px;">
        <button class="btn btn-outline btn-sm" style="flex:1;" onclick="dcsNavigate({mod:'ahss',screen:'account',params:{accountNo:'${acct.accountNo}'}})">View account</button>
        <button class="btn btn-outline btn-sm" style="flex:1;" onclick="dcsNavigate({mod:'ahss',screen:'autodcForm',params:{accountNo:'${acct.accountNo}'}})">Auto debit/credit</button>
      </div>
    </div>` : ''}
    ${actionable ? `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Approval decision</div>
      <label class="dcs-label">Comment (required for Send Back / Reject)</label>
      <textarea class="dcs-textarea" id="enrollApproveComment" placeholder="Notes for this decision…"></textarea>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn btn-danger" style="flex:1;" onclick="dcsDecideEnroll('${r.id}','BM Rejected')">Reject</button>
        <button class="btn btn-ghost" style="flex:1;" onclick="dcsDecideEnroll('${r.id}','BM Sendback')">Send Back</button>
        <button class="btn btn-primary" style="flex:1;" onclick="dcsDecideEnroll('${r.id}','ERP Pending')">Approve</button>
      </div>
    </div>` : `<div class="dcs-subtle">Approval authority for ${esc(projectLabel(r.project))}: ${esc(DB.approvalAuthority[r.project]||'—')}.</div>`}
  `;
}
function dcsDecideEnroll(id, newStatus){
  const r = DB.ahssRequests.find(x=>x.id===id);
  const comment = (document.getElementById('enrollApproveComment')||{}).value || '';
  if(newStatus !== 'ERP Pending' && !comment.trim()){ toast('A comment is required for Send Back or Reject.'); return; }
  const verbs = { 'ERP Pending':'Approve', 'BM Sendback':'Send back', 'BM Rejected':'Reject' };
  showConfirm(verbs[newStatus] + ' enrollment', `${verbs[newStatus]} the AHSS account opening request for ${r.memberName}?`, ()=>{
    r.status = newStatus;
    r.dcsApprovedBy = APPROVER_USER + (comment ? ` — ${comment}` : '');
    persist();
    toast(newStatus==='ERP Pending' ? 'Approved. Sent to the ERP Consent Buffer Panel.' : 'Decision recorded: ' + newStatus);
    dcsOpenModule('ahss');
  }, { yesClass: newStatus==='BM Rejected'?'btn-danger':'btn-primary', yesLabel: verbs[newStatus] });
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
    const v = ui.dcs;
    clearDraft('enroll_' + (v.params.memberNo || 'new'));
    dcsNavigate({ mod:'ahss', screen:'form', params:{} });
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
      status: 'BM Pending',
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
    toast('AHSS enrollment submitted. Awaiting BM approval.');
    dcsOpenModule('ahss');
  });
}

/* -------------------- Auto Debit/Credit (A6), nested inside AHSS module -------------------- */
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
/* Auto debit/credit applies to two kinds of accounts: an AHSS account
   itself (loan/savings installment) and a Special Savings account that is
   LINKED to an AHSS account (monthly profit / maturity / DPS installment
   flow through that AHSS account per FR-11/FR-12) — these flags live on
   the Special Savings account, not on the AHSS account, since they
   describe a different product's behavior. */
function findAutoDcAccount(kind, accountNo){
  return kind === 'specialSavings' ? DB.specialSavingsAccounts.find(x=>x.accountNo===accountNo) : DB.accounts.find(x=>x.accountNo===accountNo);
}
function dcsAutoDcHomeField(){
  const ahssCards = DB.accounts.map(a => dcsAutoDcCard(a, 'ahss', a.accountName, a.product));
  const ssCards = DB.specialSavingsAccounts.filter(sa=>sa.linkedAhssAccountNo).map(sa => dcsAutoDcCard(sa, 'specialSavings', sa.accountName, sa.productName + ' (linked to ' + sa.linkedAhssAccountNo + ')'));
  return ahssCards.join('') + ssCards.join('');
}
function dcsAutoDcCard(a, kind, name, subtitle){
  const products = accountApplicableProducts(a);
  if(!products.length) return '';
  return `
    <div class="dcs-card">
      <div class="dcs-card-row">
        <div>
          <div class="dcs-card-name">${esc(name)}</div>
          <div class="dcs-card-meta">${esc(a.accountNo)} · ${esc(projectLabel(a.project))} · ${esc(subtitle)}</div>
        </div>
        <span class="chip chip-approved">${esc(a.status)}</span>
      </div>
      <div style="margin:10px 0 4px;">
        ${products.map(key => `
          <div class="dcs-toggle-row">
            <span class="dcs-toggle-label">${esc(AUTODC_PRODUCTS[key])}</span>
            <span class="chip ${accountFlagValue(a,key)?'chip-approved':'chip-rejected'}">${accountFlagValue(a,key)?'ON':'OFF'}</span>
          </div>`).join('')}
      </div>
      <button class="btn btn-outline btn-sm dcs-btn-block" style="margin-top:8px;" onclick="dcsNavigate({mod:'ahss',screen:'autodcForm',params:{accountNo:'${a.accountNo}',kind:'${kind}'}})">Request Continue / Discontinue</button>
    </div>`;
}
function dcsAutoDcHomeApprover(){
  const list = DB.continuationRequests.slice().sort((a,b)=> b.requestDate.localeCompare(a.requestDate));
  const pending = list.filter(r=> r.status==='BM Pending');
  const rest = list.filter(r=> r.status!=='BM Pending');
  const card = (r, actionable) => `
    <div class="dcs-card">
      <div class="dcs-card-name">${esc(r.memberName)} <span style="font-weight:600;color:var(--muted);font-size:11.5px;">(${esc(r.accountNo)})</span></div>
      <div class="dcs-card-meta">${esc(r.product)} — <b>${esc(r.action)}</b></div>
      <div class="dcs-card-meta">Proposed by ${esc(r.proposedBy)} · ${esc(fmtDate(r.requestDate))}</div>
      <div class="dcs-card-row" style="margin-top:8px;align-items:center;">
        <span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span>
        <button class="btn btn-sm ${actionable?'btn-primary':'btn-ghost'}" onclick="dcsNavigate({mod:'ahss',screen:'autodcDetail',params:{requestId:'${r.id}'}})">${actionable?'Review':'View'}</button>
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
  const kind = params.kind || 'ahss';
  const a = findAutoDcAccount(kind, params.accountNo);
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
      <button class="btn btn-primary" style="flex:2;" onclick="dcsSubmitAutoDc('${a.accountNo}','${kind}')">Submit Request</button>
    </div>
  `;
}
function wireDcsAutoDcForm(){ /* no autosave needed for this short form */ }
function dcsSubmitAutoDc(accountNo, kind){
  const form = document.getElementById('dcsAutoDcFormEl');
  const fd = collectForm(form);
  if(!fd.product || !fd.action || !fd.reason){ toast('Please complete all fields.'); return; }
  const a = findAutoDcAccount(kind, accountNo);
  showConfirm('Submit request', `Submit ${fd.action.toLowerCase()} request for "${fd.product}"?`, ()=>{
    DB.continuationRequests.unshift({
      id: newCrId(), kind, memberNo: a.memberNo, memberName: a.accountName, project: a.project, branch: a.branch,
      accountNo: a.accountNo, product: fd.product, action: fd.action, reason: fd.reason,
      proposedBy: FIELD_USER, requestDate: todayISO(), status: 'BM Pending',
      dcsApprovedBy: '', verification: '', comment: ''
    });
    persist();
    toast('Continuation/discontinuation request submitted.');
    dcsNavigate({ mod:'ahss', screen:'autodcHome', params:{} });
  });
}
function dcsAutoDcDetail(params){
  const r = DB.continuationRequests.find(x=>x.id===params.requestId);
  if(!r) return '<div class="dcs-empty">Request not found.</div>';
  const actionable = r.status === 'BM Pending';
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
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn btn-danger" style="flex:1;" onclick="dcsDecideAutoDc('${r.id}','BM Rejected')">Reject</button>
        <button class="btn btn-ghost" style="flex:1;" onclick="dcsDecideAutoDc('${r.id}','BM Sendback')">Send Back</button>
        <button class="btn btn-primary" style="flex:1;" onclick="dcsDecideAutoDc('${r.id}','ERP Pending')">Approve</button>
      </div>
    </div>` : ''}
  `;
}
function dcsDecideAutoDc(id, newStatus){
  const verif = (document.querySelector('input[name="verif"]:checked')||{}).value;
  const reasonSel = (document.getElementById('autodcCommentSelect')||{}).value || '';
  const text = (document.getElementById('autodcCommentText')||{}).value || '';
  if(!verif || !text.trim()){ toast('Verification and a comment are required.'); return; }
  showConfirm(newStatus==='ERP Pending'?'Approve request':'Confirm decision', 'Confirm this decision?', ()=>{
    const r = DB.continuationRequests.find(x=>x.id===id);
    r.status = newStatus;
    r.dcsApprovedBy = APPROVER_USER;
    r.verification = verif;
    r.comment = (reasonSel ? reasonSel + ' — ' : '') + text;
    persist();
    toast(newStatus==='ERP Pending' ? 'Approved. Sent to ERP Consent Buffer Panel.' : 'Decision recorded: ' + newStatus);
    dcsNavigate({ mod:'ahss', screen:'autodcHome', params:{} });
  }, { yesClass: newStatus==='BM Rejected' ? 'btn-danger' : 'btn-primary', yesLabel: newStatus==='ERP Pending'?'Approve':'Confirm' });
}

/* -------------------- AHSS selection helper (used by the real Loan form) -------------------- */
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
function dcsHandleModeSelect(selectEl, memberNo, resultDivId){
  const resultDiv = document.getElementById(resultDivId);
  if(selectEl.value !== 'AHSS'){ resultDiv.innerHTML=''; return; }
  const acct = findAccountByMember(memberNo);
  if(acct){
    resultDiv.innerHTML = aHssInfoCard(acct);
  } else {
    openNoAccountModal(()=>{
      dcsNavigate({ mod:'ahss', screen:'form', params:{ memberNo, note:'You can select the AHSS account after ERP approval. Until then the proposal continues with the regular process.' } });
    }, ()=>{ selectEl.value = 'Cash'; resultDiv.innerHTML=''; });
  }
}
/* -------------------- A8: Account View -------------------- */
function dcsScreenAccount(params){
  if(params && params.accountNo) ui.dcsSelectedAccount = params.accountNo;
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
   MODULE: Special Savings Application + Chaya Insurance (new, per the
   "Guideline: Special Savings & Chaya Insurance Enrollment through DCS")
   ========================================================================== */
const SS_STRUCTURAL_FIELDS = new Set([
  'productName','tenureYears','depositAmount','n1Percentage','n1Dob','n2Percentage','n2Dob',
  'insuranceInterested','health1','health2','policyType','secondInsuredHealth1','secondInsuredHealth2'
]);
ui.ssForm = null;

function dcsSsModule(v){
  if(v.screen === 'chayaInfo') return dcsSsChayaInfo();
  if(v.screen === 'wizard') return dcsSsWizard(v.params.step || 1);
  if(v.screen === 'preview') return dcsSsPreview();
  if(v.screen === 'detail') return dcsSsDetail(v.params);
  if(v.screen === 'accountView') return dcsSsAccountView(v.params);
  return dcsSsHome();
}

function ssDraftKeysForMember(memberNo){ return 'ss_' + memberNo; }
function ssListDrafts(){
  const out = [];
  try{
    Object.keys(localStorage).forEach(k=>{
      if(k.startsWith('ahss_draft_ss_')){
        const d = JSON.parse(localStorage.getItem(k) || 'null');
        if(d && d.data) out.push(d.data);
      }
    });
  }catch(e){}
  return out;
}

function dcsSsHome(){
  const f = ui.dcsListFilters.ss;
  let rows = DB.specialSavingsApplications.slice().filter(r => {
    if(f.q){ const q=f.q.toLowerCase(); if(!(r.memberName.toLowerCase().includes(q) || r.memberNo.toLowerCase().includes(q))) return false; }
    if(f.from && r.requestDate < f.from) return false;
    if(f.to && r.requestDate > f.to) return false;
    if(f.status && r.status !== f.status) return false;
    return true;
  }).sort((a,b)=> b.requestDate.localeCompare(a.requestDate));

  const card = (r) => {
    const actionable = ui.dcsRole === 'approver' && r.status === 'BM Pending';
    return `
    <div class="dcs-card">
      <div class="dcs-card-meta" style="display:flex;justify-content:space-between;">
        <span>Application Date: ${esc(fmtDate(r.requestDate))}</span><span>VO Code: ${esc(r.voCode||'—')}</span>
      </div>
      <div class="dcs-card-meta" style="word-break:break-all;">Enrollment Id: ${esc(r.enrollmentId)}</div>
      <div class="dcs-card-meta">Member No: ${esc(r.memberNo)}</div>
      <div class="dcs-card-name">${esc(r.memberName)}</div>
      <div class="dcs-card-meta" style="color:${r.biometric==='No Biometric'?'var(--danger)':'var(--warn)'};font-weight:700;">Biometric: ${esc(r.biometric)}</div>
      <div class="dcs-card-meta">Product Name: ${esc(r.formData.productName)}</div>
      <div class="dcs-card-meta">Product Sub Type: ${esc(r.formData.productSubType)}</div>
      <div class="dcs-card-meta">Savings Product Type: ${esc(r.formData.savingsProductType)}</div>
      <div class="dcs-card-meta">Deposit Amount: ${money(r.formData.depositAmount)}</div>
      ${r.formData.premium ? `<div class="dcs-card-meta">Premium Amount: ${money(r.formData.premium)}</div>` : ''}
      <div class="dcs-card-row" style="margin-top:8px;align-items:center;">
        <span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span>
        <button class="btn btn-sm ${actionable?'btn-primary':'btn-ghost'}" onclick="dcsNavigate({mod:'ss',screen:'detail',params:{id:'${r.id}'}})">${actionable?'Review':'Details'}</button>
      </div>
    </div>`;
  };

  const drafts = ssListDrafts();
  return `
    ${ui.dcsRole==='field' ? `<button class="btn btn-primary dcs-btn-block" onclick="dcsSsStartNew()">+ New Special Savings Application</button>` : ''}
    <button class="btn btn-outline btn-sm dcs-btn-block" onclick="dcsNavigate({mod:'ss',screen:'chayaInfo',params:{}})">🛡 ছায়া-সঞ্চয় নিরাপত্তা বিমাসুবিধা তথ্য — Chaya Insurance Benefit Info</button>
    <input class="dcs-input" placeholder="Search by member number or name.." style="margin-bottom:10px;" value="${esc(f.q)}" oninput="ui.dcsListFilters.ss.q=this.value; dcsRefreshSsList();">
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <input type="date" class="dcs-input" value="${esc(f.from)}" onchange="ui.dcsListFilters.ss.from=this.value; render();">
      <input type="date" class="dcs-input" value="${esc(f.to)}" onchange="ui.dcsListFilters.ss.to=this.value; render();">
    </div>
    <select class="dcs-select" style="margin-bottom:12px;" onchange="ui.dcsListFilters.ss.status=this.value; render();">
      <option value="">All</option>
      ${STATUS_OPTIONS.map(s=>`<option ${f.status===s?'selected':''}>${esc(s)}</option>`).join('')}
    </select>
    ${drafts.length ? `
      <div class="dcs-section-title">Drafts</div>
      ${drafts.map(d=>`
        <div class="dcs-card">
          <div class="dcs-card-name">${esc(d.memberName||'(unnamed)')}</div>
          <div class="dcs-card-meta">${esc(d.memberNo||'')} · saved locally</div>
          <button class="btn btn-outline btn-sm dcs-btn-block" style="margin-top:8px;" onclick="dcsSsResumeDraft('${esc(d.memberNo)}')">Resume application</button>
        </div>`).join('')}
      <div class="dcs-section-title" style="margin-top:16px;">Applications</div>` : ''}
    ${rows.map(card).join('') || '<div class="dcs-empty">No Special Savings applications match.</div>'}
  `;
}
function dcsRefreshSsList(){
  const body = document.getElementById('dcsBody');
  if(body) body.innerHTML = dcsBodyContent();
}

function dcsSsChayaInfo(){
  return `
    <div class="dcs-section-block" style="background:linear-gradient(160deg,#fff,#fde9f2);">
      <div class="dcs-section-hd" style="background:linear-gradient(90deg,var(--brac-pink),var(--brac-pink-dark));">🛡 ছায়া-সঞ্চয় নিরাপত্তা বিমার সুবিধাসমূহ — Chaya Savings Shield Insurance Benefits</div>
      <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:var(--ink);">
        <li>Full DPS maturity value paid to the nominee before maturity, with dividend (conditions apply).</li>
        <li>One more family member of the client can be brought under this insurance (Double policy).</li>
        <li>Affordable one-time premium, paid together with the DPS deposit.</li>
        <li>Simple conditions and fast insurance claim settlement.</li>
      </ul>
      <div class="dcs-subtle" style="margin-top:10px;">Premium chart, DPS chart, leaflet and full terms &amp; conditions are shown here in the production app; kept out of this prototype for brevity — the wizard still computes and shows a premium for demo purposes.</div>
    </div>
    <button class="btn btn-ghost dcs-btn-block" onclick="dcsBack()">Back</button>
  `;
}

/* -------------------- Starting / resuming an application -------------------- */
function dcsSsStartNew(){
  openMemberSearch((member)=>{
    ui.ssForm = {
      memberNo: member.memberNo, erpMemberNo: member.erpMemberNo, memberName: member.name,
      memberCategory: member.category, mobile: member.mobile, project: member.project, branch: member.branch,
      voCode: 2090 + (member.memberNo.length % 5) * 10,
      productName: '', tenureYears: '', depositAmount: '',
      depositType: 'Cash', memberWantsToPay: 'Yes',
      n1Type: 'New', n1Percentage: '100', n2Type: 'New',
      insuranceInterested: '', health1: '', health2: '', policyType: 'Single',
      secondInsuredHealth1: '', secondInsuredHealth2: ''
    };
    dcsNavigate({ mod:'ss', screen:'wizard', params:{ step:1 } });
  });
}
function dcsSsResumeDraft(memberNo){
  const d = loadDraft(ssDraftKeysForMember(memberNo));
  if(!d){ toast('Draft not found.'); return; }
  ui.ssForm = d.data;
  dcsNavigate({ mod:'ss', screen:'wizard', params:{ step: d.data.__step || 1 } });
}
function ssAutosave(){
  if(!ui.ssForm || !ui.ssForm.memberNo) return;
  saveDraft(ssDraftKeysForMember(ui.ssForm.memberNo), ui.ssForm);
}

/* -------------------- Wizard shell -------------------- */
const SS_STEPS = [
  { n:1, label:'Savings Info', ic:'ⓘ' },
  { n:2, label:'Transaction Info', ic:'📄' },
  { n:3, label:'Nominee Info', ic:'👤' },
  { n:4, label:'Insurance Info', ic:'🛡' },
];
function ssStepHeader(active){
  return `
    <div class="dcs-stepper">
      ${SS_STEPS.map(s=>`<div class="dcs-step ${s.n===active?'active':''} ${s.n<active?'done':''}"><span class="dcs-step-ic">${s.ic}</span><span class="dcs-step-label">${esc(s.label)}</span></div>`).join('')}
    </div>`;
}
function dcsSsWizard(step){
  if(!ui.ssForm){ return '<div class="dcs-empty">No application in progress. Go back and start a new one.</div>'; }
  const f = ui.ssForm;
  f.__step = step;
  const member = { memberNo:f.memberNo, name:f.memberName };
  return `
    <div class="dcs-card" style="margin-bottom:10px;">
      <div class="dcs-card-row"><span class="dcs-card-meta">VO Code: ${esc(f.voCode)}</span><span class="dcs-card-meta">Member No: ${esc(f.memberNo)}</span></div>
      <div class="dcs-card-name">${esc(f.memberName)}</div>
    </div>
    ${ssStepHeader(step)}
    <form id="ssWizardFormEl">
      ${step===1 ? ssStep1() : ''}
      ${step===2 ? ssStep2() : ''}
      ${step===3 ? ssStep3() : ''}
      ${step===4 ? ssStep4() : ''}
    </form>
    <div style="display:flex;gap:10px;margin-top:14px;">
      ${step>1 ? `<button class="btn btn-ghost" style="flex:1;" onclick="ssGoStep(${step-1})">Back</button>` : `<button class="btn btn-ghost" style="flex:1;" onclick="dcsBack()">Cancel</button>`}
      ${step<4 ? `<button class="btn btn-primary" style="flex:2;" onclick="ssGoStep(${step+1})">Next</button>` : `<button class="btn btn-primary" style="flex:2;" onclick="ssGoPreview()">Preview</button>`}
    </div>
  `;
}
function wireSsWizard(){
  const form = document.getElementById('ssWizardFormEl');
  if(!form) return;
  fillForm(form, ui.ssForm);
  form.addEventListener('change', (e)=>{
    const key = e.target.dataset.field;
    if(!key) return;
    // Merge into ui.ssForm FIRST, then dispatch — health1/health2/
    // secondInsuredHealth* have their own follow-up logic (toast / warning
    // modal) that reads ui.ssForm, so it must see the just-changed value
    // rather than firing from an inline onchange before this merge happens.
    Object.assign(ui.ssForm, collectForm(form));
    ssAutosave();
    if(key === 'health1' || key === 'health2'){ ssHealthChanged(); return; }
    if(key === 'secondInsuredHealth1' || key === 'secondInsuredHealth2'){ ssSecondInsuredHealthChanged(); return; }
    if(SS_STRUCTURAL_FIELDS.has(key)) render();
  });
}
function ssGoStep(n){
  const form = document.getElementById('ssWizardFormEl');
  if(form) Object.assign(ui.ssForm, collectForm(form));
  if(n > (ui.dcs.params.step||1) && !ssValidateStep(ui.dcs.params.step||1)) return;
  ssAutosave();
  dcsNavigate({ mod:'ss', screen:'wizard', params:{ step:n } });
}
function ssValidateStep(step){
  const f = ui.ssForm;
  if(step===1){
    if(!f.productName || !f.depositAmount || !f.tenureYears){ toast('Please complete product, deposit amount and tenure.'); return false; }
  }
  if(step===2){
    if(!f.memberWantsToPay){ toast('Please answer whether the member wants to pay.'); return false; }
  }
  if(step===3){
    if(!f.n1Name || !f.n1Relationship || !f.n1IdType || !f.n1IdNumber || !f.n1Phone){ toast('Please complete the first nominee required fields.'); return false; }
    if(Number(f.n1Percentage) < 100 && (!f.n2Name || !f.n2Relationship)){ toast('Distribution is under 100% — please add second nominee details.'); return false; }
    if(ageFromDob(f.n1Dob) !== null && ageFromDob(f.n1Dob) < 18 && (!f.guardianName || !f.guardianIdNumber)){ toast('The nominee is under 18 — guardian details are required.'); return false; }
  }
  return true;
}

/* -------------------- Step 1: Savings Info -------------------- */
function ssProduct(name){ return DB.specialSavingsProducts.find(p=>p.name===name); }
function ssStep1(){
  const f = ui.ssForm;
  const product = ssProduct(f.productName);
  const isDps = !product || product.subType === 'DPS';
  let computedLabel = 'Maturity Amount', computedValue = '';
  if(product && f.depositAmount && f.tenureYears){
    if(isDps){ computedValue = money(computeMaturity(f.depositAmount, Number(f.tenureYears))); }
    else { computedLabel = 'Monthly Profit Amount'; computedValue = money(computeMonthlyProfit(f.depositAmount, Number(f.tenureYears))); }
  }
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">বিশেষ সঞ্চয় এর তথ্য — Special Savings Info</div>
      <div class="dcs-field">
        <label class="dcs-label">Product Name <span class="req">*</span></label>
        <select class="dcs-select" data-field="productName">
          <option value="">Select Product</option>
          ${DB.specialSavingsProducts.map(p=>`<option value="${esc(p.name)}" ${f.productName===p.name?'selected':''}>${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="dcs-field">
        <label class="dcs-label">Deposit Amount <span class="req">*</span></label>
        <select class="dcs-select" data-field="depositAmount">
          <option value="">Select</option>
          ${(product?product.depositAmounts:[]).map(a=>`<option value="${a}" ${String(f.depositAmount)===String(a)?'selected':''}>${money(a)}</option>`).join('')}
        </select>
      </div>
      <div class="dcs-field"><label class="dcs-label">Deposit Amount (in words)</label><input class="dcs-input" readonly value="${esc(f.depositAmount ? numberToWords(f.depositAmount) : '')}"></div>
      <div class="dcs-field">
        <label class="dcs-label">Tenure (years) <span class="req">*</span></label>
        <select class="dcs-select" data-field="tenureYears">
          <option value="">Select</option>
          ${(product?product.tenureYears:[]).map(y=>`<option value="${y}" ${String(f.tenureYears)===String(y)?'selected':''}>${y}.0</option>`).join('')}
        </select>
      </div>
      <div class="dcs-field"><label class="dcs-label">${esc(computedLabel)}</label><input class="dcs-input" readonly value="${esc(computedValue)}"></div>
    </div>`;
}

/* -------------------- Step 2: Transaction Info -------------------- */
function ssStep2(){
  const f = ui.ssForm;
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">জমার তথ্য — Transaction Info</div>
      <div class="dcs-field">
        <label class="dcs-label">Deposit Type <span class="req">*</span></label>
        <div class="dcs-radio-row">
          <label class="dcs-radio"><input type="checkbox" checked disabled> Cash</label>
          <label class="dcs-radio disabled"><input type="checkbox" disabled> Bank <span class="dcs-badge-soon">Coming soon</span></label>
        </div>
        <input type="hidden" data-field="depositType" value="Cash">
      </div>
      <div class="dcs-field">
        <label class="dcs-label">Member wants to pay? <span class="req">*</span></label>
        <select class="dcs-select" data-field="memberWantsToPay">
          <option ${f.memberWantsToPay==='Yes'?'selected':''}>Yes</option>
          <option ${f.memberWantsToPay==='No'?'selected':''}>No</option>
        </select>
      </div>
    </div>`;
}

/* -------------------- Step 3: Nominee Info -------------------- */
function ssNomineeBlock(n, title){
  const f = ui.ssForm;
  const p = 'n'+n;
  const age = ageFromDob(f[p+'Dob']);
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">${esc(title)}</div>
      <div class="dcs-field">
        <label class="dcs-label">Nominee Type</label>
        <div class="dcs-radio-row">
          <label class="dcs-radio"><input type="radio" name="${p}Type" value="Existing" data-field="${p}Type" ${f[p+'Type']==='Existing'?'checked':''}> Existing</label>
          <label class="dcs-radio"><input type="radio" name="${p}Type" value="New" data-field="${p}Type" ${f[p+'Type']!=='Existing'?'checked':''}> New</label>
        </div>
      </div>
      <div class="dcs-field"><label class="dcs-label">Name <span class="req">*</span></label><input class="dcs-input" data-field="${p}Name" value="${esc(f[p+'Name']||'')}"></div>
      <div class="dcs-field"><label class="dcs-label">Date of Birth ${age!==null?`<span class="dcs-subtle">(Age: ${age})</span>`:''}</label><input type="date" class="dcs-input" data-field="${p}Dob" value="${esc(f[p+'Dob']||'')}"></div>
      <div class="dcs-field">
        <label class="dcs-label">Relationship <span class="req">*</span></label>
        <select class="dcs-select" data-field="${p}Relationship">
          <option value="">Select</option>
          ${DB.relationshipOptions.map(o=>`<option ${f[p+'Relationship']===o?'selected':''}>${esc(o)}</option>`).join('')}
        </select>
      </div>
      <div class="dcs-field">
        <label class="dcs-label">ID Type <span class="req">*</span></label>
        <select class="dcs-select" data-field="${p}IdType">
          <option value="">Select</option>
          ${ID_TYPE_OPTIONS.map(o=>`<option ${f[p+'IdType']===o?'selected':''}>${esc(o)}</option>`).join('')}
        </select>
      </div>
      <div class="dcs-field"><label class="dcs-label">ID Number <span class="req">*</span></label><input class="dcs-input" data-field="${p}IdNumber" value="${esc(f[p+'IdNumber']||'')}"></div>
      <div class="dcs-field"><label class="dcs-label">Distribution rate (%) <span class="req">*</span></label><input class="dcs-input" data-field="${p}Percentage" value="${esc(f[p+'Percentage']|| (n===1?'100':''))}"></div>
      <div class="dcs-field"><label class="dcs-label">Phone Number <span class="req">*</span></label><input class="dcs-input" data-field="${p}Phone" value="${esc(f[p+'Phone']||'')}"></div>
      <div class="dcs-field">
        <label class="dcs-label">Photo <span class="req">*</span></label>
        <div class="dcs-photo-box" id="ss${p}PhotoBox" onclick="document.getElementById('ss${p}PhotoInput').click()">📷 Tap to capture / upload nominee photo</div>
        <input type="file" accept="image/*" id="ss${p}PhotoInput" style="display:none;" onchange="ssPhotoPicked('${p}',this)">
      </div>
    </div>`;
}
function ssPhotoPicked(prefix, input){
  if(input.files[0]){
    const box = document.getElementById('ss'+prefix+'PhotoBox');
    box.textContent = '✓ ' + input.files[0].name;
    box.classList.add('has-photo');
    ui.ssForm[prefix+'HasPhoto'] = true;
  }
}
function ssGuardianBlock(){
  const f = ui.ssForm;
  return `
    <div class="dcs-section-block" style="border-color:#F1D48C;background:#FFFBF0;">
      <div class="dcs-section-hd" style="background:var(--warn);">১৮ বছরের কম বয়সী নমিনির ক্ষেত্রে বৈধ অভিভাবকের তথ্য — Guardian info (nominee under 18)</div>
      <div class="dcs-field"><label class="dcs-label">Guardian Name <span class="req">*</span></label><input class="dcs-input" data-field="guardianName" value="${esc(f.guardianName||'')}"></div>
      <div class="dcs-field">
        <label class="dcs-label">Guardian ID Type <span class="req">*</span></label>
        <select class="dcs-select" data-field="guardianIdType">
          <option value="">Select</option>
          ${ID_TYPE_OPTIONS.map(o=>`<option ${f.guardianIdType===o?'selected':''}>${esc(o)}</option>`).join('')}
        </select>
      </div>
      <div class="dcs-field"><label class="dcs-label">Guardian ID Number <span class="req">*</span></label><input class="dcs-input" data-field="guardianIdNumber" value="${esc(f.guardianIdNumber||'')}"></div>
      <div class="dcs-field">
        <label class="dcs-label">Relationship with Nominee <span class="req">*</span></label>
        <select class="dcs-select" data-field="guardianRelationship">
          <option value="">Select</option>
          ${DB.relationshipOptions.map(o=>`<option ${f.guardianRelationship===o?'selected':''}>${esc(o)}</option>`).join('')}
        </select>
      </div>
      <div class="dcs-field"><label class="dcs-label">Guardian Phone Number <span class="req">*</span></label><input class="dcs-input" data-field="guardianPhone" value="${esc(f.guardianPhone||'')}"></div>
      <div class="dcs-field">
        <label class="dcs-label">Guardian NID Photo (front) <span class="req">*</span></label>
        <div class="dcs-photo-box" id="ssGuardianPhotoBox" onclick="document.getElementById('ssGuardianPhotoInput').click()">📷 Tap to capture / upload</div>
        <input type="file" accept="image/*" id="ssGuardianPhotoInput" style="display:none;" onchange="ssPhotoPicked('guardian',this)">
      </div>
    </div>`;
}
function ssStep3(){
  const f = ui.ssForm;
  const needsSecond = Number(f.n1Percentage||100) < 100;
  const n1Age = ageFromDob(f.n1Dob);
  const needsGuardian = n1Age !== null && n1Age < 18;
  return `
    ${ssNomineeBlock(1, '১ম নমিনি তথ্য — 1st Nominee Info')}
    ${needsSecond ? ssNomineeBlock(2, 'দ্বিতীয় নমিনির তথ্য — 2nd Nominee Info') : ''}
    ${needsGuardian ? ssGuardianBlock() : ''}
  `;
}

/* -------------------- Step 4: Insurance Info -------------------- */
function ssSetInsuranceInterest(val){
  if(val === 'No'){
    showConfirm('সতর্কতা! Warning', 'আপনি কি ছায়া বিমাসুবিধা ছাড়া ডিপিএস খুলতে নিশ্চিত? Are you sure you want to open DPS without the Chaya insurance benefit?', ()=>{
      ui.ssForm.insuranceInterested = 'No';
      ssAutosave(); render();
    }, { yesLabel:'DPS without insurance', yesClass:'btn-danger', noLabel:'DPS with insurance', onNo:()=>{
      ui.ssForm.insuranceInterested = 'Yes'; ssAutosave(); render();
    }});
  } else {
    ui.ssForm.insuranceInterested = 'Yes';
    ssAutosave(); render();
  }
}
function ssHealthChanged(){
  const f = ui.ssForm;
  if(f.health1 === 'Yes' || f.health2 === 'Yes'){
    toast('Insurance benefit does not apply due to the health declaration — DPS will open without Chaya insurance.');
  }
  render();
}
function ssSecondInsuredHealthChanged(){
  const f = ui.ssForm;
  if(f.secondInsuredHealth1 === 'Yes' || f.secondInsuredHealth2 === 'Yes'){
    showConfirm('সতর্কতা! Warning', 'নির্বাচিত ২য় বিমাগ্রহীতার স্বাস্থ্যগত কারণে দ্বৈত বিমা প্রযোজ্য হবে না। The selected 2nd insured is not eligible for double insurance due to a health condition.', ()=>{
      ui.ssForm.policyType = 'Single';
      ui.ssForm.secondInsuredHealth1 = ''; ui.ssForm.secondInsuredHealth2 = '';
      ssAutosave(); render();
    }, { yesLabel:'Proceed with single insurance', noLabel:'Change 2nd insured', onNo:()=>{
      ui.ssForm.secondInsuredName=''; ui.ssForm.secondInsuredHealth1=''; ui.ssForm.secondInsuredHealth2='';
      ssAutosave(); render();
    }});
  } else render();
}
function ssStep4(){
  const f = ui.ssForm;
  const healthy = f.health1==='No' && f.health2==='No';
  const eligible = f.insuranceInterested==='Yes' && healthy;
  if(eligible) f.premium = computePremium(f.depositAmount, Number(f.tenureYears)||0, f.policyType);
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">বিমা সংক্রান্ত তথ্য — Insurance Info</div>
      <div class="dcs-field">
        <label class="dcs-label">গ্রাহক কি ছায়া-সঞ্চয় নিরাপত্তা বিমা সুবিধা গ্রহণে আগ্রহী? — Interested in Chaya insurance? <span class="req">*</span></label>
        <div class="dcs-radio-row">
          <label class="dcs-radio"><input type="radio" name="insInterest" ${f.insuranceInterested==='Yes'?'checked':''} onclick="ssSetInsuranceInterest('Yes')"> Yes</label>
          <label class="dcs-radio"><input type="radio" name="insInterest" ${f.insuranceInterested==='No'?'checked':''} onclick="ssSetInsuranceInterest('No')"> No</label>
        </div>
      </div>
    </div>
    ${f.insuranceInterested==='Yes' ? `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">গ্রাহকের স্বাস্থ্য সম্পর্কিত তথ্য — Client health info</div>
      <div class="dcs-subtle">If either answer is "Yes", the insurance benefit will not apply — but the DPS can still open without it.</div>
      <div class="dcs-field">
        <label class="dcs-label">Cancer / kidney disease or treatment in the past 1 year? <span class="req">*</span></label>
        <div class="dcs-radio-row">
          <label class="dcs-radio"><input type="radio" name="health1" value="No" data-field="health1" ${f.health1==='No'?'checked':''}> No</label>
          <label class="dcs-radio"><input type="radio" name="health1" value="Yes" data-field="health1" ${f.health1==='Yes'?'checked':''}> Yes</label>
        </div>
      </div>
      <div class="dcs-field">
        <label class="dcs-label">Jaundice / liver disease or treatment for over 3 months? <span class="req">*</span></label>
        <div class="dcs-radio-row">
          <label class="dcs-radio"><input type="radio" name="health2" value="No" data-field="health2" ${f.health2==='No'?'checked':''}> No</label>
          <label class="dcs-radio"><input type="radio" name="health2" value="Yes" data-field="health2" ${f.health2==='Yes'?'checked':''}> Yes</label>
        </div>
      </div>
    </div>
    ${healthy ? `
    <div class="dcs-section-block">
      <div class="dcs-field">
        <label class="dcs-label">বিমা পলিসির ধরণ — Insurance Policy Type <span class="req">*</span></label>
        <select class="dcs-select" data-field="policyType">
          <option value="Single" ${f.policyType==='Single'?'selected':''}>Single</option>
          <option value="Double" ${f.policyType==='Double'?'selected':''}>Double</option>
        </select>
      </div>
      <div class="dcs-field"><label class="dcs-label">বিমার প্রিমিয়াম — Insurance Premium</label><input class="dcs-input" readonly value="${money(f.premium)}"></div>
    </div>
    ${f.policyType==='Double' ? `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">২য় বিমাগ্রহীতার স্বাস্থ্য সম্পর্কিত তথ্য — 2nd insured's health info</div>
      <div class="dcs-field">
        <label class="dcs-label">Cancer / kidney disease or treatment in the past 1 year?</label>
        <div class="dcs-radio-row">
          <label class="dcs-radio"><input type="radio" name="si1" value="No" data-field="secondInsuredHealth1" ${f.secondInsuredHealth1==='No'?'checked':''}> No</label>
          <label class="dcs-radio"><input type="radio" name="si1" value="Yes" data-field="secondInsuredHealth1" ${f.secondInsuredHealth1==='Yes'?'checked':''}> Yes</label>
        </div>
      </div>
      <div class="dcs-field">
        <label class="dcs-label">Jaundice / liver disease or treatment for over 3 months?</label>
        <div class="dcs-radio-row">
          <label class="dcs-radio"><input type="radio" name="si2" value="No" data-field="secondInsuredHealth2" ${f.secondInsuredHealth2==='No'?'checked':''}> No</label>
          <label class="dcs-radio"><input type="radio" name="si2" value="Yes" data-field="secondInsuredHealth2" ${f.secondInsuredHealth2==='Yes'?'checked':''}> Yes</label>
        </div>
      </div>
      <div class="dcs-field"><label class="dcs-label">Insured Person's Name <span class="req">*</span></label><input class="dcs-input" data-field="secondInsuredName" value="${esc(f.secondInsuredName||'')}"></div>
      <div class="dcs-field">
        <label class="dcs-label">Gender <span class="req">*</span></label>
        <select class="dcs-select" data-field="secondInsuredGender"><option value="">Select</option><option ${f.secondInsuredGender==='Male'?'selected':''}>Male</option><option ${f.secondInsuredGender==='Female'?'selected':''}>Female</option></select>
      </div>
      <div class="dcs-field">
        <label class="dcs-label">Relationship <span class="req">*</span></label>
        <select class="dcs-select" data-field="secondInsuredRelationship"><option value="">Select</option>${DB.relationshipOptions.map(o=>`<option ${f.secondInsuredRelationship===o?'selected':''}>${esc(o)}</option>`).join('')}</select>
      </div>
      <div class="dcs-field"><label class="dcs-label">Date of Birth <span class="req">*</span></label><input type="date" class="dcs-input" data-field="secondInsuredDob" value="${esc(f.secondInsuredDob||'')}"></div>
      <div class="dcs-field">
        <label class="dcs-label">ID Type <span class="req">*</span></label>
        <select class="dcs-select" data-field="secondInsuredIdType"><option value="">Select</option>${ID_TYPE_OPTIONS.map(o=>`<option ${f.secondInsuredIdType===o?'selected':''}>${esc(o)}</option>`).join('')}</select>
      </div>
      <div class="dcs-field"><label class="dcs-label">ID Number <span class="req">*</span></label><input class="dcs-input" data-field="secondInsuredIdNumber" value="${esc(f.secondInsuredIdNumber||'')}"></div>
    </div>` : ''}` : ''}` : ''}
  `;
}

/* -------------------- Preview / submit -------------------- */
function ssGoPreview(){
  const form = document.getElementById('ssWizardFormEl');
  if(form) Object.assign(ui.ssForm, collectForm(form));
  if(!ssValidateStep(3)) { dcsNavigate({mod:'ss',screen:'wizard',params:{step:3}}); return; }
  ssAutosave();
  dcsNavigate({ mod:'ss', screen:'preview', params:{} });
}
function ssRow(label, value){ return `<div class="kv"><span>${esc(label)}</span><span>${esc(value==null?'—':value)}</span></div>`; }
function dcsSsPreview(){
  const f = ui.ssForm;
  const product = ssProduct(f.productName);
  const isDps = !product || product.subType === 'DPS';
  const computedLabel = isDps ? 'Maturity Amount' : 'Monthly Profit Amount';
  const computedValue = isDps ? computeMaturity(f.depositAmount, Number(f.tenureYears)) : computeMonthlyProfit(f.depositAmount, Number(f.tenureYears));
  return `
    <div class="dcs-section-block">
      <div class="dcs-card-row"><div class="dcs-section-hd" style="margin:-13px -14px 12px;flex:1;">পূরনকৃত তথ্য যাচাই করুন — Verify entered information</div></div>
      <div class="erp-readonly-summary">
        ${ssRow('Member Name', f.memberName)}
        ${ssRow('Member No', f.memberNo)}
        ${ssRow('Project', projectLabel(f.project))}
        ${ssRow('Product Name', f.productName)}
        ${ssRow('Product Sub Type', product?product.subType:'')}
        ${ssRow('Savings Product Type', product?product.savingsProductType:'')}
        ${ssRow('Deposit Amount', money(f.depositAmount))}
        ${ssRow('Deposit Amount (words)', numberToWords(f.depositAmount))}
        ${ssRow('Tenure (years)', f.tenureYears + '.0')}
        ${ssRow(computedLabel, money(computedValue))}
        ${ssRow('Deposit Type', f.depositType)}
        ${ssRow('Member wants to pay?', f.memberWantsToPay)}
      </div>
    </div>
    <div class="dcs-section-block">
      <div class="dcs-section-hd">১ম নমিনি তথ্য — 1st Nominee Info</div>
      <div class="erp-readonly-summary">
        ${ssRow('Nominee Type', f.n1Type)}
        ${ssRow('Name', f.n1Name)}
        ${ssRow('Relationship', f.n1Relationship)}
        ${ssRow('ID', (f.n1IdType||'') + ' — ' + (f.n1IdNumber||''))}
        ${ssRow('Distribution', (f.n1Percentage||'100') + '%')}
        ${ssRow('Phone', f.n1Phone)}
      </div>
    </div>
    ${Number(f.n1Percentage||100) < 100 ? `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">২য় নমিনি তথ্য — 2nd Nominee Info</div>
      <div class="erp-readonly-summary">
        ${ssRow('Name', f.n2Name)} ${ssRow('Relationship', f.n2Relationship)} ${ssRow('Distribution', (f.n2Percentage||'')+'%')}
      </div>
    </div>` : ''}
    ${f.guardianName ? `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">অভিভাবকের তথ্য — Guardian Info</div>
      <div class="erp-readonly-summary">${ssRow('Name', f.guardianName)} ${ssRow('Relationship', f.guardianRelationship)} ${ssRow('Phone', f.guardianPhone)}</div>
    </div>` : ''}
    <div class="dcs-section-block">
      <div class="dcs-section-hd">বিমা সংক্রান্ত তথ্য — Insurance Info</div>
      <div class="erp-readonly-summary">
        ${ssRow('Interested in Chaya insurance?', f.insuranceInterested)}
        ${f.insuranceInterested==='Yes' ? ssRow('Policy Type', f.policyType) : ''}
        ${f.insuranceInterested==='Yes' && f.health1==='No' && f.health2==='No' ? ssRow('Premium', money(f.premium)) : ''}
      </div>
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-ghost" style="flex:1;" onclick="dcsNavigate({mod:'ss',screen:'wizard',params:{step:1}})">Update</button>
      <button class="btn btn-primary" style="flex:2;background:var(--ok);border-color:var(--ok);" onclick="ssSubmit()">আবেদন করুন — Submit Application</button>
    </div>
  `;
}
function ssSubmit(){
  const f = ui.ssForm;
  const product = ssProduct(f.productName);
  const isDps = !product || product.subType === 'DPS';
  const maturityAmount = isDps ? computeMaturity(f.depositAmount, Number(f.tenureYears)) : null;
  const monthlyProfitAmount = !isDps ? computeMonthlyProfit(f.depositAmount, Number(f.tenureYears)) : null;
  const eligible = f.insuranceInterested==='Yes' && f.health1==='No' && f.health2==='No';
  const rec = {
    id: newSsId(), enrollmentId: newEnrollmentGuid(), memberNo: f.memberNo, memberName: f.memberName,
    project: f.project, branch: f.branch, voCode: f.voCode, biometric: 'No Biometric',
    proposedBy: FIELD_USER, requestDate: todayISO(), status: 'BM Pending',
    bmApprover: '', bmComment: '', erpApprover: '', erpComment: '',
    formData: {
      productName: f.productName, productSubType: product?product.subType:'', savingsProductType: product?product.savingsProductType:'',
      depositAmount: Number(f.depositAmount), depositAmountWords: numberToWords(f.depositAmount), tenureYears: Number(f.tenureYears),
      maturityAmount, monthlyProfitAmount, maturityDate: null,
      depositType: f.depositType, memberWantsToPay: f.memberWantsToPay,
      nominee1: { type:f.n1Type, name:f.n1Name, dob:f.n1Dob, relationship:f.n1Relationship, idType:f.n1IdType, idNumber:f.n1IdNumber, percentage:f.n1Percentage, phone:f.n1Phone },
      nominee2: Number(f.n1Percentage||100) < 100 ? { type:f.n2Type, name:f.n2Name, dob:f.n2Dob, relationship:f.n2Relationship, idType:f.n2IdType, idNumber:f.n2IdNumber, percentage:f.n2Percentage, phone:f.n2Phone } : null,
      guardian: f.guardianName ? { name:f.guardianName, idType:f.guardianIdType, idNumber:f.guardianIdNumber, relationship:f.guardianRelationship, phone:f.guardianPhone } : null,
      insuranceInterested: f.insuranceInterested === 'Yes', health1: f.health1, health2: f.health2,
      policyType: eligible ? f.policyType : null, premium: eligible ? f.premium : 0,
      secondInsured: (eligible && f.policyType==='Double') ? { name:f.secondInsuredName, gender:f.secondInsuredGender, relationship:f.secondInsuredRelationship, dob:f.secondInsuredDob, idType:f.secondInsuredIdType, idNumber:f.secondInsuredIdNumber } : null
    }
  };
  if(maturityAmount){
    const d = new Date(); d.setFullYear(d.getFullYear() + Number(f.tenureYears));
    rec.formData.maturityDate = d.toISOString().slice(0,10);
  }
  DB.specialSavingsApplications.unshift(rec);
  persist();
  clearDraft(ssDraftKeysForMember(f.memberNo));
  ui.ssForm = null;
  showConfirm('Server Message', 'Special Savings application submitted successfully. Awaiting for BM approval.', ()=>{
    dcsOpenModule('ss');
  }, { hideNo:true, yesLabel:'OKAY' });
}

/* -------------------- Detail / BM decision -------------------- */
function ssDetailRows(r){
  const fd = r.formData;
  const computedLabel = fd.productSubType==='DPS' ? 'Amount due on maturity' : 'Monthly Profit Amount';
  const computedValue = fd.productSubType==='DPS' ? fd.maturityAmount : fd.monthlyProfitAmount;
  return `
    <div class="erp-readonly-summary">
      ${ssRow('Member Name', r.memberName)} ${ssRow('Member ID', r.memberNo)} ${ssRow('VO Code', r.voCode)}
      ${ssRow('Product Name', fd.productName)} ${ssRow('Product Sub Type', fd.productSubType)} ${ssRow('Savings Product Type', fd.savingsProductType)}
      ${ssRow('Deposit Amount', money(fd.depositAmount))} ${ssRow('Deposit Amount (words)', fd.depositAmountWords)}
      ${ssRow('Duration (Year)', fd.tenureYears)} ${ssRow(computedLabel, money(computedValue))}
      ${fd.maturityDate ? ssRow('Maturity Date', fmtDate(fd.maturityDate)) : ''}
    </div>
    <div class="dcs-section-hd" style="margin:14px -14px 10px;">Transaction information</div>
    <div class="erp-readonly-summary">${ssRow('Deposit type', fd.depositType)} ${ssRow('Want to pay as a member?', fd.memberWantsToPay)}</div>
    <div class="dcs-section-hd" style="margin:14px -14px 10px;">First Nominee Info</div>
    <div class="erp-readonly-summary">
      ${ssRow('Nominee Type', fd.nominee1.type)} ${ssRow('Nominee Name', fd.nominee1.name)} ${ssRow('Relationship', fd.nominee1.relationship)}
      ${ssRow('ID', fd.nominee1.idType + ' — ' + fd.nominee1.idNumber)} ${ssRow('Distribution', fd.nominee1.percentage+'%')}
    </div>
    ${fd.nominee2 ? `<div class="dcs-section-hd" style="margin:14px -14px 10px;">Second Nominee Info</div>
    <div class="erp-readonly-summary">${ssRow('Name', fd.nominee2.name)} ${ssRow('Relationship', fd.nominee2.relationship)} ${ssRow('Distribution', fd.nominee2.percentage+'%')}</div>` : ''}
    ${fd.guardian ? `<div class="dcs-section-hd" style="margin:14px -14px 10px;">Guardian Info (nominee under 18)</div>
    <div class="erp-readonly-summary">${ssRow('Name', fd.guardian.name)} ${ssRow('Relationship', fd.guardian.relationship)} ${ssRow('Phone', fd.guardian.phone)}</div>` : ''}
    <div class="dcs-section-hd" style="margin:14px -14px 10px;">Insurance Premium Information</div>
    <div class="erp-readonly-summary">
      ${ssRow('Interested in Chaya insurance?', fd.insuranceInterested ? 'Yes' : 'No')}
      ${fd.policyType ? ssRow('Insurance Product', 'Chaya - Savings Shield Insurance') : ''}
      ${fd.policyType ? ssRow('Policy Type', fd.policyType) : ''}
      ${fd.premium ? ssRow('Premium amount', money(fd.premium)) : ''}
    </div>
    ${fd.secondInsured ? `<div class="dcs-section-hd" style="margin:14px -14px 10px;">Second Insurer Information</div>
    <div class="erp-readonly-summary">${ssRow('Name', fd.secondInsured.name)} ${ssRow('Relationship', fd.secondInsured.relationship)}</div>` : ''}
  `;
}
function dcsSsDetail(params){
  const r = DB.specialSavingsApplications.find(x=>x.id===params.id);
  if(!r) return '<div class="dcs-empty">Application not found.</div>';
  const actionable = ui.dcsRole === 'approver' && r.status === 'BM Pending';
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Application Details</div>
      <div class="dcs-card-row" style="margin-bottom:8px;"><div class="dcs-card-name">${esc(r.memberName)}</div><span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span></div>
      ${ssDetailRows(r)}
    </div>
    ${r.linkedSsAccountNo ? `
    <button class="btn btn-outline btn-sm dcs-btn-block" onclick="dcsNavigate({mod:'ss',screen:'accountView',params:{accountNo:'${r.linkedSsAccountNo}'}})">View account &amp; transactions</button>` : ''}
    ${actionable ? `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Decision</div>
      <textarea class="dcs-textarea" id="ssDecisionComment" placeholder="কিছু লিখুন.. (required for Send Back / Reject)"></textarea>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn btn-danger" style="flex:1;" onclick="ssDecide('${r.id}','BM Rejected')">Reject</button>
        <button class="btn btn-ghost" style="flex:1;" onclick="ssDecide('${r.id}','BM Sendback')">Send Back</button>
        <button class="btn btn-primary" style="flex:1;" onclick="ssDecide('${r.id}','ERP Pending')">Approve</button>
      </div>
    </div>` : ''}
  `;
}
function ssDecide(id, newStatus){
  const comment = (document.getElementById('ssDecisionComment')||{}).value || '';
  if(newStatus !== 'ERP Pending' && !comment.trim()){ toast('A comment is required for Send Back or Reject.'); return; }
  const verbs = { 'ERP Pending':'Approve', 'BM Sendback':'Send back', 'BM Rejected':'Reject' };
  showConfirm(verbs[newStatus] + ' application', `${verbs[newStatus]} this Special Savings application?`, ()=>{
    const r = DB.specialSavingsApplications.find(x=>x.id===id);
    r.status = newStatus;
    r.bmApprover = APPROVER_USER;
    r.bmComment = comment;
    persist();
    toast(newStatus==='ERP Pending' ? 'Approved. Sent to the ERP Special Savings Buffer.' : 'Decision recorded: ' + newStatus);
    dcsOpenModule('ss');
  }, { yesClass: newStatus==='BM Rejected'?'btn-danger':'btn-primary', yesLabel: verbs[newStatus] });
}

/* -------------------- Special Savings: linked account view -------------------- */
function dcsSsAccountView(params){
  const sa = DB.specialSavingsAccounts.find(x=>x.accountNo===params.accountNo);
  if(!sa) return '<div class="dcs-empty">Account not found.</div>';
  return `
    <div class="dcs-summary-card">
      <div class="dcs-summary-label">${esc(sa.accountName)} · ${esc(sa.accountNo)}</div>
      <div class="dcs-summary-amt">${money(sa.balance)}</div>
      <div class="dcs-summary-sub"><span>${esc(sa.productName)} · ${esc(sa.tenureYears)} yrs</span><span class="chip chip-approved">${esc(sa.status)}</span></div>
    </div>
    <div class="dcs-section-block">
      <div class="erp-readonly-summary">
        ${ssRow('Maturity Amount', money(sa.maturityAmount))}
        ${ssRow('Maturity Date', fmtDate(sa.maturityDate))}
        ${ssRow('Linked AHSS Account', sa.linkedAhssAccountNo || '—')}
        ${ssRow('Insurance Policy', sa.insurance ? sa.insurance.policyType + ' — ' + money(sa.insurance.premium) : '—')}
      </div>
    </div>
    ${sa.linkedAhssAccountNo ? `
    <button class="btn btn-outline btn-sm dcs-btn-block" onclick="dcsNavigate({mod:'ahss',screen:'autodcHome',params:{}})">Manage auto debit/credit to AHSS</button>` : ''}
    <div class="dcs-section-title">Transactions</div>
    <div class="dcs-section-block">
      ${sa.transactions.slice().reverse().map(t=>`
        <div class="dcs-txn">
          <div><div class="dcs-txn-desc">${esc(t.description)}</div><div class="dcs-txn-date">${esc(fmtDate(t.date))}</div></div>
          <div class="dcs-txn-amt ${t.credit?'credit':'debit'}">${t.credit?'+':'-'}${money(t.credit||t.debit)}</div>
        </div>`).join('') || '<div class="dcs-empty">No transactions yet.</div>'}
    </div>
  `;
}

/* ==========================================================================
   MODULE: Member Admission (DCS)
   ========================================================================== */
function newMemberNo(){ return 'MEM-' + String(100000 + (Date.now() % 900000)).slice(0,6); }
function newErpMemberNo(){ return 'ERP-' + String(40000 + (Date.now() % 9000)); }
const GENDER_OPTIONS = ['Male', 'Female', 'Other'];

function dcsAdmissionModule(v){
  if(v.screen === 'form') return dcsAdmissionForm();
  return dcsAdmissionHome();
}
function dcsAdmissionHome(){
  const recent = DB.members.slice().reverse().slice(0, 8);
  return `
    <button class="btn btn-primary dcs-btn-block" onclick="dcsNavigate({mod:'admission',screen:'form',params:{}})">+ New Member Admission</button>
    <div class="dcs-section-title">Recently admitted</div>
    ${recent.map(m => `
      <div class="dcs-card">
        <div class="dcs-card-row">
          <div>
            <div class="dcs-card-name">${esc(m.name)}</div>
            <div class="dcs-card-meta">${esc(m.memberNo)} · ${esc(projectLabel(m.project))} · ${esc(m.branch)}</div>
            <div class="dcs-card-meta">${esc(m.mobile)} · ${esc(m.category)}</div>
          </div>
        </div>
      </div>`).join('') || '<div class="dcs-empty">No members yet.</div>'}
  `;
}
function dcsAdmissionForm(){
  return `
    <form id="dcsAdmissionFormEl">
      <div class="dcs-section-block">
        <div class="dcs-section-hd">Member Admission</div>
        <div class="dcs-field"><label class="dcs-label">Full Name <span class="req">*</span></label><input class="dcs-input" data-field="name"></div>
        <div class="dcs-field"><label class="dcs-label">Gender <span class="req">*</span></label>
          <select class="dcs-select" data-field="gender"><option value="">Select</option>${GENDER_OPTIONS.map(g=>`<option>${g}</option>`).join('')}</select>
        </div>
        <div class="dcs-field"><label class="dcs-label">Date of Birth <span class="req">*</span></label><input type="date" class="dcs-input" data-field="dob"></div>
        <div class="dcs-field"><label class="dcs-label">ID Type <span class="req">*</span></label>
          <select class="dcs-select" data-field="idType"><option value="">Select</option>${ID_TYPE_OPTIONS.map(o=>`<option>${esc(o)}</option>`).join('')}</select>
        </div>
        <div class="dcs-field"><label class="dcs-label">ID Number <span class="req">*</span></label><input class="dcs-input" data-field="idNumber"></div>
        <div class="dcs-field">
          <label class="dcs-label">Mobile Number <span class="req">*</span></label>
          <input class="dcs-input" id="admissionMobileInput" data-field="mobile" placeholder="01XXXXXXXXX">
          <div class="dcs-subtle" id="admissionMobileHint" style="margin:6px 0 0;"></div>
        </div>
        <div class="dcs-field"><label class="dcs-label">Member Category <span class="req">*</span></label>
          <select class="dcs-select" data-field="category"><option value="">Select</option>${DB.memberCategories.map(c=>`<option>${esc(c)}</option>`).join('')}</select>
        </div>
        <div class="dcs-field"><label class="dcs-label">Present Address</label><textarea class="dcs-textarea" data-field="address"></textarea></div>
      </div>
      <div class="dcs-section-block">
        <div class="dcs-section-hd">Project &amp; VO</div>
        <div class="dcs-field"><label class="dcs-label">Project <span class="req">*</span></label>
          <select class="dcs-select" data-field="projectLabel"><option value="">-Select Project-</option>${DB.projects.map(p=>`<option>${esc(p.label)}</option>`).join('')}</select>
        </div>
        <div class="dcs-field"><label class="dcs-label">Branch <span class="req">*</span></label><input class="dcs-input" data-field="branch"></div>
        <div class="dcs-field"><label class="dcs-label">VO Code</label><input class="dcs-input" data-field="voCode"></div>
      </div>
    </form>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-ghost" style="flex:1;" onclick="dcsBack()">Cancel</button>
      <button class="btn btn-primary" style="flex:2;" onclick="dcsSubmitAdmission()">Save / Submit</button>
    </div>
  `;
}
function wireAdmissionForm(){
  const mobileInput = document.getElementById('admissionMobileInput');
  if(!mobileInput) return;
  mobileInput.addEventListener('blur', ()=>{
    const hint = document.getElementById('admissionMobileHint');
    const dup = findDuplicateMobile(mobileInput.value.trim(), null);
    if(dup){
      hint.textContent = '⚠ This mobile number is already used.';
      hint.style.color = '#C1502E';
      openDuplicateModal(dup, (newMobile)=>{ mobileInput.value = newMobile; hint.textContent = '✓ Verified as unique.'; hint.style.color = '#2F7D4F'; }, ()=>{ mobileInput.value=''; hint.textContent=''; });
    } else hint.textContent = '';
  });
}
function dcsSubmitAdmission(){
  const form = document.getElementById('dcsAdmissionFormEl');
  const fd = collectForm(form);
  if(!fd.name || !fd.gender || !fd.dob || !fd.idType || !fd.idNumber || !fd.mobile || !fd.category || !fd.projectLabel || !fd.branch){
    toast('Please fill all required fields (marked *).');
    return;
  }
  showConfirm('Submit admission', `Admit ${fd.name} as a new member?`, ()=>{
    const projectCode = (DB.projects.find(p=>p.label===fd.projectLabel)||{}).code || '';
    const member = {
      memberNo: newMemberNo(), erpMemberNo: newErpMemberNo(), name: fd.name, category: fd.category,
      gender: fd.gender, dob: fd.dob, mobile: fd.mobile, project: projectCode, branch: fd.branch,
      voCode: fd.voCode || '', idType: fd.idType, idNumber: fd.idNumber, address: fd.address || ''
    };
    DB.members.push(member);
    persist();
    toast(`${member.name} admitted as ${member.memberNo}.`);
    openAdmissionModal(()=>{
      dcsNavigate({ mod:'ahss', screen:'form', params:{ memberNo: member.memberNo } });
    }, ()=>{
      dcsOpenModule('admission');
    });
  });
}

/* ==========================================================================
   MODULE: Loan Application (DCS) — FR-03: AHSS as disbursement / collection
   mode, real BM → ERP approval like every other product here.
   ========================================================================== */
function newLoanId(){ return 'LOAN-' + Date.now(); }
function dcsLoanModule(v){
  if(v.screen === 'form') return dcsLoanForm(v.params);
  if(v.screen === 'detail') return dcsLoanDetail(v.params);
  return dcsLoanHome();
}
function dcsLoanHome(){
  const f = ui.dcsListFilters.loan || (ui.dcsListFilters.loan = { q:'', from:'', to:'', status:'' });
  let rows = DB.loanApplications.filter(r=>{
    if(f.q){ const q=f.q.toLowerCase(); if(!(r.memberName.toLowerCase().includes(q) || r.memberNo.toLowerCase().includes(q))) return false; }
    if(f.from && r.requestDate < f.from) return false;
    if(f.to && r.requestDate > f.to) return false;
    if(f.status && r.status !== f.status) return false;
    return true;
  }).sort((a,b)=> b.requestDate.localeCompare(a.requestDate));
  const card = (r) => {
    const actionable = ui.dcsRole === 'approver' && r.status === 'BM Pending';
    return `
    <div class="dcs-card">
      <div class="dcs-card-row">
        <div>
          <div class="dcs-card-name">${esc(r.memberName)}</div>
          <div class="dcs-card-meta">${esc(r.memberNo)} · ${esc(projectLabel(r.project))} · ${esc(fmtDate(r.requestDate))}</div>
          <div class="dcs-card-meta">${esc(r.formData.loanProduct)} · ${money(r.formData.amount)} · ${esc(r.formData.tenureMonths)} months</div>
        </div>
      </div>
      <div class="dcs-card-row" style="margin-top:8px;align-items:center;">
        <span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span>
        <button class="btn btn-sm ${actionable?'btn-primary':'btn-ghost'}" onclick="dcsNavigate({mod:'loan',screen:'detail',params:{id:'${r.id}'}})">${actionable?'Review':'Details'}</button>
      </div>
    </div>`;
  };
  return `
    ${ui.dcsRole==='field' ? `<button class="btn btn-primary dcs-btn-block" onclick="dcsLoanStartNew()">+ New Loan Application</button>` : ''}
    <input class="dcs-input" placeholder="Search by member number or name.." style="margin-bottom:10px;" value="${esc(f.q)}" oninput="ui.dcsListFilters.loan.q=this.value; dcsRefreshLoanList();">
    <select class="dcs-select" style="margin-bottom:12px;" onchange="ui.dcsListFilters.loan.status=this.value; render();">
      <option value="">All</option>
      ${STATUS_OPTIONS.map(s=>`<option ${f.status===s?'selected':''}>${esc(s)}</option>`).join('')}
    </select>
    ${rows.map(card).join('') || '<div class="dcs-empty">No loan applications match.</div>'}
  `;
}
function dcsRefreshLoanList(){ const body = document.getElementById('dcsBody'); if(body) body.innerHTML = dcsBodyContent(); }
function dcsLoanStartNew(){
  openMemberSearch((member)=>{
    dcsNavigate({ mod:'loan', screen:'form', params:{ memberNo: member.memberNo } });
  });
}
function dcsLoanForm(params){
  const member = findMember(params.memberNo);
  return `
    <div class="dcs-card" style="margin-bottom:10px;">
      <div class="dcs-card-name">${esc(member?member.name:'')}</div>
      <div class="dcs-card-meta">${esc(params.memberNo)} · ${esc(member?projectLabel(member.project):'')}</div>
    </div>
    <form id="dcsLoanFormEl">
      <div class="dcs-section-block">
        <div class="dcs-section-hd">Loan Application</div>
        <div class="dcs-field"><label class="dcs-label">Loan Product <span class="req">*</span></label>
          <select class="dcs-select" data-field="loanProduct"><option value="">Select</option>${DB.loanProducts.map(p=>`<option>${esc(p)}</option>`).join('')}</select>
        </div>
        <div class="dcs-field"><label class="dcs-label">Loan Amount <span class="req">*</span></label><input class="dcs-input" data-field="amount" placeholder="e.g. 30000"></div>
        <div class="dcs-field"><label class="dcs-label">Tenure (months) <span class="req">*</span></label><input class="dcs-input" data-field="tenureMonths" placeholder="e.g. 12"></div>
        <div class="dcs-field"><label class="dcs-label">Purpose <span class="req">*</span></label><textarea class="dcs-textarea" data-field="purpose"></textarea></div>
      </div>
      <div class="dcs-section-block">
        <div class="dcs-section-hd">Disbursement &amp; Collection</div>
        <div class="dcs-field"><label class="dcs-label">Disbursement Mode <span class="req">*</span></label>
          <select class="dcs-select" id="loanDisbMode" data-field="disbursementMode" onchange="dcsHandleModeSelect(this,'${params.memberNo}','loanDisbResult')">
            <option value="">Select</option><option>Cash</option><option>Bank Transfer</option><option>AHSS</option>
          </select>
        </div>
        <div id="loanDisbResult"></div>
        <div class="dcs-field"><label class="dcs-label">Collection Mode <span class="req">*</span></label>
          <select class="dcs-select" id="loanCollMode" data-field="collectionMode" onchange="dcsHandleModeSelect(this,'${params.memberNo}','loanCollResult')">
            <option value="">Select</option><option>Cash</option><option>Bank Transfer</option><option>AHSS</option>
          </select>
        </div>
        <div id="loanCollResult"></div>
      </div>
    </form>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-ghost" style="flex:1;" onclick="dcsBack()">Cancel</button>
      <button class="btn btn-primary" style="flex:2;" onclick="dcsSubmitLoan('${params.memberNo}')">Submit Application</button>
    </div>
  `;
}
function wireLoanForm(){ /* mode-select handlers are wired inline in dcsLoanForm — nothing extra needed */ }
function dcsSubmitLoan(memberNo){
  const form = document.getElementById('dcsLoanFormEl');
  const fd = collectForm(form);
  if(!fd.loanProduct || !fd.amount || !fd.tenureMonths || !fd.purpose || !fd.disbursementMode || !fd.collectionMode){
    toast('Please fill all required fields (marked *).');
    return;
  }
  const member = findMember(memberNo);
  if((fd.disbursementMode === 'AHSS' || fd.collectionMode === 'AHSS') && !findAccountByMember(memberNo)){
    toast('This member needs an approved AHSS account before AHSS can be used — open one from the AHSS tile first.');
    return;
  }
  showConfirm('Submit loan application', `Submit this loan application for ${member.name}?`, ()=>{
    const installment = Math.round(Number(fd.amount) / Number(fd.tenureMonths));
    DB.loanApplications.unshift({
      id: newLoanId(), memberNo, memberName: member.name, project: member.project, branch: member.branch,
      proposedBy: FIELD_USER, requestDate: todayISO(), status: 'BM Pending',
      bmApprover: '', bmComment: '', erpApprover: '', erpComment: '',
      formData: { loanProduct: fd.loanProduct, amount: Number(fd.amount), tenureMonths: Number(fd.tenureMonths), purpose: fd.purpose,
        disbursementMode: fd.disbursementMode, collectionMode: fd.collectionMode, installmentAmount: installment }
    });
    persist();
    toast('Loan application submitted. Awaiting BM approval.');
    dcsOpenModule('loan');
  });
}
function dcsLoanDetail(params){
  const r = DB.loanApplications.find(x=>x.id===params.id);
  if(!r) return '<div class="dcs-empty">Application not found.</div>';
  const actionable = ui.dcsRole === 'approver' && r.status === 'BM Pending';
  const fd = r.formData;
  return `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Loan Application ${esc(r.id)}</div>
      <div class="dcs-card-row" style="margin-bottom:8px;"><div class="dcs-card-name">${esc(r.memberName)}</div><span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span></div>
      <div class="erp-readonly-summary">
        ${ssRow('Member No', r.memberNo)} ${ssRow('Project', projectLabel(r.project))}
        ${ssRow('Loan Product', fd.loanProduct)} ${ssRow('Amount', money(fd.amount))}
        ${ssRow('Tenure (months)', fd.tenureMonths)} ${ssRow('Installment', money(fd.installmentAmount))}
        ${ssRow('Purpose', fd.purpose)} ${ssRow('Disbursement Mode', fd.disbursementMode)} ${ssRow('Collection Mode', fd.collectionMode)}
        ${r.disbursementDate ? ssRow('Disbursement Date', fmtDate(r.disbursementDate)) : ''}
        ${r.outstandingPrincipal!=null ? ssRow('Outstanding Principal', money(r.outstandingPrincipal)) : ''}
      </div>
    </div>
    ${actionable ? `
    <div class="dcs-section-block">
      <div class="dcs-section-hd">Approval decision</div>
      <textarea class="dcs-textarea" id="loanDecisionComment" placeholder="Comment (required for Send Back / Reject)"></textarea>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn btn-danger" style="flex:1;" onclick="dcsDecideLoan('${r.id}','BM Rejected')">Reject</button>
        <button class="btn btn-ghost" style="flex:1;" onclick="dcsDecideLoan('${r.id}','BM Sendback')">Send Back</button>
        <button class="btn btn-primary" style="flex:1;" onclick="dcsDecideLoan('${r.id}','ERP Pending')">Approve</button>
      </div>
    </div>` : ''}
  `;
}
function dcsDecideLoan(id, newStatus){
  const comment = (document.getElementById('loanDecisionComment')||{}).value || '';
  if(newStatus !== 'ERP Pending' && !comment.trim()){ toast('A comment is required for Send Back or Reject.'); return; }
  const verbs = { 'ERP Pending':'Approve', 'BM Sendback':'Send back', 'BM Rejected':'Reject' };
  showConfirm(verbs[newStatus] + ' loan', `${verbs[newStatus]} this loan application?`, ()=>{
    const r = DB.loanApplications.find(x=>x.id===id);
    r.status = newStatus;
    r.bmApprover = APPROVER_USER;
    r.bmComment = comment;
    persist();
    toast(newStatus==='ERP Pending' ? 'Approved. Sent to ERP for disbursement approval.' : 'Decision recorded: ' + newStatus);
    dcsOpenModule('loan');
  }, { yesClass: newStatus==='BM Rejected'?'btn-danger':'btn-primary', yesLabel: verbs[newStatus] });
}

/* ==========================================================================
   PART B — ERP WEB
   ========================================================================== */
const ERP_MENU_ROUTES = { 'Programme Admin':'stub', 'VO':'stub', 'Member':'member', 'Loan':'loan', 'Savings':'savings', 'Insurance':'stub', 'Report':'stub' };
function setErpMenu(m){
  const route = ERP_MENU_ROUTES[m] || 'stub';
  if(route === 'stub'){ notImplemented(m); return; }
  ui.erpMenu = route;
  if(route === 'member' && !['memberList','memberForm'].includes(ui.erpTab)) ui.erpTab = 'memberList';
  if(route === 'loan' && !['loanBuffer','loanDetail'].includes(ui.erpTab)) ui.erpTab = 'loanBuffer';
  if(route === 'savings' && !['b1','b1detail','b2','b3','ssBuffer','ssDetail'].includes(ui.erpTab)) ui.erpTab = 'b2';
  render();
}
function setErpTab(t){ ui.erpTab = t; ui.erpReview = null; render(); }
function setErpB1Tab(t){ ui.erpB1Tab = t; render(); }
function setErpSavingsBranch(b){ ui.erpSavingsBranch = b; ui.erpTab = (b==='special') ? 'ssBuffer' : 'b2'; render(); }

const ERP_MODULES = ['Settings','HRM','EDMS','ePMS','Procurement','eTender','Fixed Asset','Microfinance','Accounting','Budget'];
const ERP_MENU = ['Programme Admin','VO','Member','Loan','Savings','Insurance','Report'];
const SS_ERP_STUB_ITEMS = ['Special Savings Account Setup','Special Savings Account List','Special Savings Refund','Monthly Profit Withdrawal','Special Savings Collection','Special Savings Collection Modification','Special Savings Correction'];

function renderERP(){
  const root = document.getElementById('erpRoot');
  root.innerHTML = `
    <div class="erp-shell">
      <div class="erp-topbar">
        ${ERP_MODULES.map(m=>`<div class="mod ${m==='Microfinance'?'active':''}">${esc(m)}</div>`).join('')}
        <div class="spacer"></div>
        <div class="welcome">Welcome ${esc(ERP_USER)} (00255389-BA)</div>
      </div>
      <div class="erp-datebar">Accounting Date : ${todayDisplay()} [DAY OPEN]</div>
      <div class="erp-header">
        <div class="erp-logo">🌀<span> brac</span></div>
      </div>
      <div class="erp-menubar">
        ${ERP_MENU.map(m=>`<button class="${ui.erpMenu===ERP_MENU_ROUTES[m]?'active':''}" onclick='setErpMenu(${JSON.stringify(m)})'>${esc(m)}</button>`).join('')}
      </div>
      ${ui.erpMenu==='savings' ? `
      <div class="erp-menubar" style="background:#fff;border-bottom:1px solid var(--erp-border);flex-wrap:wrap;">
        <button onclick="notImplemented('Compulsory Savings')">Compulsory Savings</button>
        <button class="${ui.erpSavingsBranch==='special'?'active':''}" onclick="setErpSavingsBranch('special')">Special Savings ▸</button>
        <button class="${ui.erpSavingsBranch==='ahss'?'active':''}" onclick="setErpSavingsBranch('ahss')">Amar Hishab Savings ▸</button>
      </div>
      ${ui.erpSavingsBranch==='special' ? `
      <div class="erp-menubar" style="background:#f4f8fb;border-bottom:1px solid var(--erp-border);flex-wrap:wrap;">
        ${SS_ERP_STUB_ITEMS.map(i=>`<button onclick='notImplemented(${JSON.stringify(i)})'>${esc(i)}</button>`).join('')}
        <button class="${ui.erpTab==='ssBuffer'||ui.erpTab==='ssDetail'?'active':''}" onclick="setErpTab('ssBuffer')">Special Savings Buffer</button>
      </div>` : `
      <div class="erp-menubar" style="background:#f4f8fb;border-bottom:1px solid var(--erp-border);">
        <button class="${ui.erpTab==='b2'?'active':''}" onclick="setErpTab('b2')">AHSS Account Opening</button>
        <button class="${ui.erpTab==='b1'||ui.erpTab==='b1detail'?'active':''}" onclick="setErpTab('b1')">Consent Buffer Panel</button>
        <button class="${ui.erpTab==='b3'?'active':''}" onclick="setErpTab('b3')">AHSS Account View</button>
      </div>`}` : ''}
      ${ui.erpMenu==='member' ? `
      <div class="erp-menubar" style="background:#f4f8fb;border-bottom:1px solid var(--erp-border);">
        <button class="${ui.erpTab==='memberList'?'active':''}" onclick="setErpTab('memberList')">Member List</button>
        <button class="${ui.erpTab==='memberForm'?'active':''}" onclick="setErpTab('memberForm')">New Member</button>
      </div>` : ''}
      ${ui.erpMenu==='loan' ? `
      <div class="erp-menubar" style="background:#f4f8fb;border-bottom:1px solid var(--erp-border);">
        <button class="${ui.erpTab==='loanBuffer'||ui.erpTab==='loanDetail'?'active':''}" onclick="setErpTab('loanBuffer')">Loan Approval Buffer</button>
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
  if(ui.erpTab === 'ssBuffer') return erpSsBuffer();
  if(ui.erpTab === 'ssDetail') return erpSsDetail();
  if(ui.erpTab === 'memberList') return erpMemberList();
  if(ui.erpTab === 'memberForm') return erpMemberForm();
  if(ui.erpTab === 'loanBuffer') return erpLoanBuffer();
  if(ui.erpTab === 'loanDetail') return erpLoanDetail();
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
      const age = ageFromDob(jointDob.value);
      document.getElementById('erpJointAge').value = age===null ? '' : age;
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
      status:'ERP Approved', linkedAccountNo: accountNo,
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

/* -------------------- B1: Consent Buffer Panel (AHSS) -------------------- */
function erpFilterMatches(row){
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
const ERP_REACHED_STATUSES = ['ERP Pending','ERP Sendback','ERP Rejected','ERP Approved'];

function erpB1Panel(){
  const f = ui.erpFilters;
  return `
    <h1 class="erp-page-title">Consent Buffer Panel</h1>
    <div class="erp-tabbar">
      <button class="${ui.erpB1Tab==='opening'?'active':''}" onclick="setErpB1Tab('opening')">AHSS Account Opening</button>
      <button class="${ui.erpB1Tab==='continuation'?'active':''}" onclick="setErpB1Tab('continuation')">Auto Debit/Credit Continuation/Discontinuation</button>
    </div>
    <div class="erp-filterbar">
      <div class="fitem"><label>Project</label><select id="fProject"><option value="">All</option>${[...new Set(DB.projects.map(p=>p.code))].map(c=>`<option value="${esc(c)}" ${f.project===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="fitem"><label>Branch</label><input id="fBranch" value="${esc(f.branch)}" placeholder="Branch name"></div>
      <div class="fitem"><label>From</label><input type="date" id="fFrom" value="${esc(f.from)}"></div>
      <div class="fitem"><label>To</label><input type="date" id="fTo" value="${esc(f.to)}"></div>
      <div class="fitem"><label>Status</label><select id="fStatus"><option value="">All</option>${ERP_REACHED_STATUSES.map(s=>`<option ${f.status===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
      <div class="fitem" style="min-width:auto;"><button class="erp-btn" onclick="erpApplyFilters()">Apply</button></div>
      <div class="fitem" style="min-width:auto;"><button class="erp-btn" onclick="erpResetFilters()">Reset</button></div>
    </div>
    ${ui.erpB1Tab==='opening' ? erpB1OpeningTable() : erpB1ContinuationTable()}
  `;
}
function erpB1OpeningTable(){
  const rows = DB.ahssRequests.filter(r=> ERP_REACHED_STATUSES.includes(r.status) && erpFilterMatches(r))
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
  const rows = DB.continuationRequests.filter(r=> ERP_REACHED_STATUSES.includes(r.status) && erpFilterMatches(r))
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
  const actionable = r.status === 'ERP Pending';
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
          <button class="erp-btn" style="background:#DCEEE2;border-color:#9ecdac;" onclick="erpDecide('${rv.type}','${rv.id}','ERP Approved')">Approve</button>
          <button class="erp-btn" style="background:#EDE3F8;border-color:#c9adf0;" onclick="erpDecide('${rv.type}','${rv.id}','ERP Sendback')">Send Back</button>
          <button class="erp-btn" style="background:#F8DAD2;border-color:#e2a894;" onclick="erpDecide('${rv.type}','${rv.id}','ERP Rejected')">Reject</button>
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
  if(status !== 'ERP Approved' && !comment.trim()){ toast('A reviewer comment is required for Send Back or Reject.'); return; }
  showConfirm(status + ' request', `Confirm: ${status} this request?`, ()=>{
    if(type === 'opening'){
      const r = DB.ahssRequests.find(x=>x.id===id);
      r.status = status;
      if(status === 'ERP Approved'){
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
      if(status === 'ERP Approved'){
        const acct = findAutoDcAccount(r.kind, r.accountNo);
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
  }, { yesClass: status==='ERP Approved'?'btn-primary':(status==='ERP Rejected'?'btn-danger':'btn-outline') });
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

/* -------------------- Special Savings Buffer (ERP, BAO) -------------------- */
function ssErpApplyFilters(){
  ui.ssErpFilters = {
    project: document.getElementById('ssfProject').value,
    vo: document.getElementById('ssfVo').value,
    from: document.getElementById('ssfFrom').value,
    to: document.getElementById('ssfTo').value,
    status: document.getElementById('ssfStatus').value,
  };
  render();
}
function ssErpResetFilters(){ ui.ssErpFilters = { project:'', vo:'', from:'', to:'', status:'' }; render(); }
function erpSsBuffer(){
  const f = ui.ssErpFilters;
  const rows = DB.specialSavingsApplications.filter(r=>{
    if(!ERP_REACHED_STATUSES.includes(r.status)) return false;
    if(f.project && r.project !== f.project) return false;
    if(f.vo && String(r.voCode) !== f.vo) return false;
    if(f.from && r.requestDate < f.from) return false;
    if(f.to && r.requestDate > f.to) return false;
    if(f.status && r.status !== f.status) return false;
    return true;
  }).sort((a,b)=> b.requestDate.localeCompare(a.requestDate));
  const headers = ['Buffer Id','Member Name','Member ID','Savings Product','Vo Code','Member Number','Installment Amount','Approver','Creation Date','Status'];
  setRowsCache('Special Savings Buffer', rows.map(r=>[r.id,r.memberName,r.memberNo,r.formData.productName,r.voCode,r.memberNo,money(r.formData.depositAmount),'BM',fmtDate(r.requestDate),r.status]));
  return `
    <h1 class="erp-page-title">Special Savings Buffer</h1>
    <div class="erp-filterbar">
      <div class="fitem"><label>Project</label><select id="ssfProject"><option value="">All</option>${[...new Set(DB.projects.map(p=>p.code))].map(c=>`<option value="${esc(c)}" ${f.project===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="fitem"><label>VO</label><input id="ssfVo" value="${esc(f.vo)}" placeholder="VO code"></div>
      <div class="fitem"><label>From</label><input type="date" id="ssfFrom" value="${esc(f.from)}"></div>
      <div class="fitem"><label>To</label><input type="date" id="ssfTo" value="${esc(f.to)}"></div>
      <div class="fitem"><label>Status</label><select id="ssfStatus"><option value="">All</option>${ERP_REACHED_STATUSES.map(s=>`<option ${f.status===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
      <div class="fitem" style="min-width:auto;"><button class="erp-btn" onclick="ssErpApplyFilters()">Search</button></div>
      <div class="fitem" style="min-width:auto;"><button class="erp-btn" onclick="ssErpResetFilters()">Reset</button></div>
    </div>
    ${downloadRow('Special Savings Buffer', headers, [])}
    <div class="erp-table-wrap"><table class="erp-table">
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Action</th>${rows.some(r=>r.status==='ERP Approved')?'<th>Download</th>':''}</tr></thead>
      <tbody>${rows.map(r=>`
        <tr>
          <td>${esc(r.id)}</td><td>${esc(r.memberName)}</td><td>${esc(r.memberNo)}</td><td>${esc(r.formData.productName)}</td>
          <td>${esc(r.voCode)}</td><td>${esc(r.memberNo)}</td><td>${money(r.formData.depositAmount)}</td><td>BM</td>
          <td>${esc(fmtDate(r.requestDate))}</td>
          <td><span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span></td>
          <td><button class="erp-btn" style="padding:5px 12px;" onclick="erpOpenSsReview('${r.id}')">View</button></td>
          ${r.status==='ERP Approved' ? `<td><button class="erp-btn" style="padding:5px 12px;" onclick="erpGenerateSsConsentPaper('${r.id}')">Download</button></td>` : (rows.some(x=>x.status==='ERP Approved')?'<td></td>':'')}
        </tr>`).join('') || `<tr><td colspan="11" style="text-align:center;color:#8a97a1;padding:20px;">No applications match the current filters.</td></tr>`}
      </tbody>
    </table></div>
  `;
}
function erpOpenSsReview(id){ ui.erpReview = { type:'special', id }; ui.erpTab = 'ssDetail'; render(); }
function erpSsDetail(){
  const rv = ui.erpReview;
  const r = rv && DB.specialSavingsApplications.find(x=>x.id===rv.id);
  if(!r) return '<div class="dcs-empty">Application not found.</div>';
  const actionable = r.status === 'ERP Pending';
  const fd = r.formData;
  return `
    <button class="erp-link-btn" style="margin-bottom:10px;" onclick="setErpTab('ssBuffer')">← Back to Special Savings Buffer</button>
    <h1 class="erp-page-title">Application ${esc(r.id)} <span class="chip ${statusChipClass(r.status)}" style="margin-left:10px;">${esc(r.status)}</span></h1>
    <div class="erp-section">
      <div class="erp-section-hd">Application Details</div>
      <div class="erp-section-body">${ssDetailRows(r)}</div>
    </div>
    ${actionable ? `
    <div class="erp-section">
      <div class="erp-section-hd">Decision</div>
      <div class="erp-section-body">
        <div class="erp-grid cols-2">
          <div class="erp-field"><label>Member Wants to Pay?</label>
            <div style="padding-top:6px;"><label><input type="radio" name="ssWantsPay" checked> ${esc(fd.memberWantsToPay)}</label></div>
          </div>
          <div class="erp-field"><label>Deposit Amount</label><input readonly value="${money(fd.depositAmount)}"></div>
        </div>
        <div class="erp-field"><label>Rejection/Sendback Reason</label><textarea id="ssErpComment" rows="3" placeholder="Required for Send Back or Reject"></textarea></div>
        <div class="erp-btn-row">
          <button class="erp-btn" style="background:#F8DAD2;border-color:#e2a894;" onclick="erpSsDecide('${r.id}','ERP Rejected')">Reject</button>
          <button class="erp-btn" style="background:#EDE3F8;border-color:#c9adf0;" onclick="erpSsDecide('${r.id}','ERP Sendback')">Sendback</button>
          <button class="erp-btn" style="background:#DCEEE2;border-color:#9ecdac;" onclick="erpSsDecide('${r.id}','ERP Approved')">Approve</button>
        </div>
      </div>
    </div>` : ''}
  `;
}
function erpSsDecide(id, status){
  const comment = (document.getElementById('ssErpComment')||{}).value || '';
  if(status !== 'ERP Approved' && !comment.trim()){ toast('A reason is required for Sendback or Reject.'); return; }
  showConfirm(status + ' application', `Confirm: ${status} this Special Savings application?`, ()=>{
    const r = DB.specialSavingsApplications.find(x=>x.id===id);
    r.status = status;
    r.erpApprover = ERP_USER;
    r.erpComment = comment;
    persist();
    toast('Decision recorded: ' + status);
    ui.erpReview = null;
    setErpTab('ssBuffer');
  }, { yesClass: status==='ERP Approved'?'btn-primary':(status==='ERP Rejected'?'btn-danger':'btn-outline') });
}
function erpGenerateSsConsentPaper(id){
  const r = DB.specialSavingsApplications.find(x=>x.id===id);
  const w = window.open('', '_blank', 'width=800,height=900');
  if(!w){ toast('Pop-up blocked — allow pop-ups to view the consent paper.'); return; }
  const fd = r.formData;
  w.document.write(`<!DOCTYPE html><html><head><title>Consent Paper</title><style>
    body{font-family:'Times New Roman',serif;padding:50px;color:#111;} h2{text-align:center;color:#173357;}
    .meta{margin:24px 0;font-size:14px;line-height:1.9;} .sign{margin-top:70px;display:flex;justify-content:space-between;}
    .sign div{border-top:1px solid #333;width:220px;text-align:center;padding-top:6px;font-size:12.5px;}
  </style></head><body>
  <h2>BRAC Microfinance — Special Savings Consent Paper</h2>
  <div class="meta">
    <p>This is to certify that <b>${esc(r.memberName)}</b> (Member No. ${esc(r.memberNo)}) has given informed consent to open a
    <b>${esc(fd.productName)}</b> Special Savings account with a deposit of ${money(fd.depositAmount)} over ${esc(fd.tenureYears)} years${fd.insuranceInterested ? `, together with the Chaya - Savings Shield Insurance (${esc(fd.policyType)}, premium ${money(fd.premium)})` : ', without Chaya insurance'}.</p>
    <p>Date: ${esc(todayDisplay())}</p>
  </div>
  <div class="sign"><div>Client Signature</div><div>Authorized Officer</div></div>
  <script>window.onload=function(){window.print();};<\/script>
  </body></html>`);
  w.document.close();
}

/* -------------------- ERP: Member List / New Member -------------------- */
function erpMemberList(){
  const headers = ['Member No.','ERP Member No.','Name','Mobile','Project','Branch','Category'];
  const rows = DB.members.slice().sort((a,b)=> a.name.localeCompare(b.name));
  setRowsCache('Members', rows.map(m=>[m.memberNo,m.erpMemberNo,m.name,m.mobile,projectLabel(m.project),m.branch,m.category]));
  return `
    <h1 class="erp-page-title">Member List</h1>
    ${downloadRow('Members', headers, [])}
    <div class="erp-table-wrap"><table class="erp-table">
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(m=>`
        <tr><td>${esc(m.memberNo)}</td><td>${esc(m.erpMemberNo)}</td><td>${esc(m.name)}</td><td>${esc(m.mobile)}</td><td>${esc(projectLabel(m.project))}</td><td>${esc(m.branch)}</td><td>${esc(m.category)}</td></tr>`).join('')}
      </tbody>
    </table></div>
  `;
}
function erpMemberForm(){
  return `
    <h1 class="erp-page-title">New Member</h1>
    <form id="erpMemberFormEl">
    <div class="erp-section">
      <div class="erp-section-hd">Member Information</div>
      <div class="erp-section-body">
        <div class="erp-grid">
          <div class="erp-field"><label>Full Name <span class="req">*</span></label><input data-field="name"></div>
          <div class="erp-field"><label>Gender <span class="req">*</span></label><select data-field="gender"><option value="">Select</option>${GENDER_OPTIONS.map(g=>`<option>${g}</option>`).join('')}</select></div>
          <div class="erp-field"><label>Date of Birth <span class="req">*</span></label><input type="date" data-field="dob"></div>
          <div class="erp-field"><label>Member Category <span class="req">*</span></label><select data-field="category"><option value="">Select</option>${DB.memberCategories.map(c=>`<option>${esc(c)}</option>`).join('')}</select></div>
        </div>
        <div class="erp-grid" style="margin-top:14px;">
          <div class="erp-field"><label>ID Type <span class="req">*</span></label><select data-field="idType"><option value="">Select</option>${ID_TYPE_OPTIONS.map(o=>`<option>${esc(o)}</option>`).join('')}</select></div>
          <div class="erp-field"><label>ID Number <span class="req">*</span></label><input data-field="idNumber"></div>
          <div class="erp-field"><label>Mobile Number <span class="req">*</span></label><input id="erpMemberMobileInput" data-field="mobile"></div>
        </div>
      </div>
    </div>
    <div class="erp-section">
      <div class="erp-section-hd">Project &amp; VO</div>
      <div class="erp-section-body">
        <div class="erp-grid">
          <div class="erp-field"><label>Project <span class="req">*</span></label><select data-field="projectLabel"><option value="">-Select Project-</option>${DB.projects.map(p=>`<option>${esc(p.label)}</option>`).join('')}</select></div>
          <div class="erp-field"><label>Branch <span class="req">*</span></label><input data-field="branch"></div>
          <div class="erp-field"><label>VO Code</label><input data-field="voCode"></div>
        </div>
        <div class="erp-grid" style="margin-top:14px;">
          <div class="erp-field span-4"><label>Present Address</label><textarea data-field="address" rows="2"></textarea></div>
        </div>
      </div>
    </div>
    </form>
    <div class="erp-btn-row">
      <button class="erp-btn" onclick="erpSubmitMember()">Save</button>
      <button class="erp-btn" onclick="setErpTab('memberForm')">Clear</button>
    </div>
  `;
}
function wireErpMemberForm(){
  const mobileInput = document.getElementById('erpMemberMobileInput');
  if(!mobileInput) return;
  mobileInput.addEventListener('blur', ()=>{
    const dup = findDuplicateMobile(mobileInput.value.trim(), null);
    if(dup) openDuplicateModal(dup, (newMobile)=>{ mobileInput.value = newMobile; }, ()=>{ mobileInput.value=''; });
  });
}
function erpSubmitMember(){
  const form = document.getElementById('erpMemberFormEl');
  const fd = collectForm(form);
  if(!fd.name || !fd.gender || !fd.dob || !fd.category || !fd.idType || !fd.idNumber || !fd.mobile || !fd.projectLabel || !fd.branch){
    toast('Please fill all required fields (marked *).');
    return;
  }
  showConfirm('Save member', `Create a new member record for ${fd.name}?`, ()=>{
    const projectCode = (DB.projects.find(p=>p.label===fd.projectLabel)||{}).code || '';
    const member = {
      memberNo: newMemberNo(), erpMemberNo: newErpMemberNo(), name: fd.name, category: fd.category,
      gender: fd.gender, dob: fd.dob, mobile: fd.mobile, project: projectCode, branch: fd.branch,
      voCode: fd.voCode || '', idType: fd.idType, idNumber: fd.idNumber, address: fd.address || ''
    };
    DB.members.push(member);
    persist();
    toast(`Member ${member.name} created as ${member.memberNo}.`);
    setErpTab('memberList');
  });
}

/* -------------------- ERP: Loan Approval Buffer -------------------- */
function erpLoanBuffer(){
  const rows = DB.loanApplications.filter(r=> ERP_REACHED_STATUSES.includes(r.status)).sort((a,b)=> b.requestDate.localeCompare(a.requestDate));
  const headers = ['Loan ID','Member Name','Member No','Project','Loan Product','Amount','Tenure (mo)','Approver','Request Date','Status'];
  setRowsCache('Loan Buffer', rows.map(r=>[r.id,r.memberName,r.memberNo,projectLabel(r.project),r.formData.loanProduct,money(r.formData.amount),r.formData.tenureMonths,'BM',fmtDate(r.requestDate),r.status]));
  return `
    <h1 class="erp-page-title">Loan Approval Buffer</h1>
    ${downloadRow('Loan Buffer', headers, [])}
    <div class="erp-table-wrap"><table class="erp-table">
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Action</th></tr></thead>
      <tbody>${rows.map(r=>`
        <tr>
          <td>${esc(r.id)}</td><td>${esc(r.memberName)}</td><td>${esc(r.memberNo)}</td><td>${esc(projectLabel(r.project))}</td>
          <td>${esc(r.formData.loanProduct)}</td><td>${money(r.formData.amount)}</td><td>${esc(r.formData.tenureMonths)}</td><td>BM</td>
          <td>${esc(fmtDate(r.requestDate))}</td>
          <td><span class="chip ${statusChipClass(r.status)}">${esc(r.status)}</span></td>
          <td><button class="erp-btn" style="padding:5px 12px;" onclick="erpOpenLoanReview('${r.id}')">Review</button></td>
        </tr>`).join('') || `<tr><td colspan="11" style="text-align:center;color:#8a97a1;padding:20px;">No loan applications match.</td></tr>`}
      </tbody>
    </table></div>
  `;
}
function erpOpenLoanReview(id){ ui.erpReview = { type:'loan', id }; ui.erpTab = 'loanDetail'; render(); }
function erpLoanDetail(){
  const rv = ui.erpReview;
  const r = rv && DB.loanApplications.find(x=>x.id===rv.id);
  if(!r) return '<div class="dcs-empty">Loan application not found.</div>';
  const actionable = r.status === 'ERP Pending';
  const fd = r.formData;
  return `
    <button class="erp-link-btn" style="margin-bottom:10px;" onclick="setErpTab('loanBuffer')">← Back to Loan Approval Buffer</button>
    <h1 class="erp-page-title">Loan ${esc(r.id)} <span class="chip ${statusChipClass(r.status)}" style="margin-left:10px;">${esc(r.status)}</span></h1>
    <div class="erp-section">
      <div class="erp-section-hd">Loan Details</div>
      <div class="erp-section-body">
        <div class="erp-readonly-summary">
          <div class="kv"><span>Member</span><span>${esc(r.memberName)} (${esc(r.memberNo)})</span></div>
          <div class="kv"><span>Project / Branch</span><span>${esc(projectLabel(r.project))} · ${esc(r.branch)}</span></div>
          <div class="kv"><span>Loan Product</span><span>${esc(fd.loanProduct)}</span></div>
          <div class="kv"><span>Amount</span><span>${money(fd.amount)}</span></div>
          <div class="kv"><span>Tenure</span><span>${esc(fd.tenureMonths)} months (installment ${money(fd.installmentAmount)})</span></div>
          <div class="kv"><span>Purpose</span><span>${esc(fd.purpose)}</span></div>
          <div class="kv"><span>Disbursement Mode</span><span>${esc(fd.disbursementMode)}</span></div>
          <div class="kv"><span>Collection Mode</span><span>${esc(fd.collectionMode)}</span></div>
          <div class="kv"><span>BM Approver</span><span>${esc(r.bmApprover)}</span></div>
          <div class="kv"><span>BM Comment</span><span>${esc(r.bmComment)}</span></div>
        </div>
      </div>
    </div>
    ${actionable ? `
    <div class="erp-section">
      <div class="erp-section-hd">Decision</div>
      <div class="erp-section-body">
        <div class="erp-field"><label>Reviewer Comment</label><textarea id="loanErpComment" rows="3" placeholder="Required for Send Back or Reject"></textarea></div>
        <div class="erp-btn-row">
          <button class="erp-btn" style="background:#DCEEE2;border-color:#9ecdac;" onclick="erpDecideLoan('${r.id}','ERP Approved')">Approve &amp; Disburse</button>
          <button class="erp-btn" style="background:#EDE3F8;border-color:#c9adf0;" onclick="erpDecideLoan('${r.id}','ERP Sendback')">Send Back</button>
          <button class="erp-btn" style="background:#F8DAD2;border-color:#e2a894;" onclick="erpDecideLoan('${r.id}','ERP Rejected')">Reject</button>
        </div>
      </div>
    </div>` : ''}
  `;
}
function erpDecideLoan(id, status){
  const comment = (document.getElementById('loanErpComment')||{}).value || '';
  if(status !== 'ERP Approved' && !comment.trim()){ toast('A reviewer comment is required for Send Back or Reject.'); return; }
  showConfirm(status + ' loan', `Confirm: ${status} this loan application?`, ()=>{
    const r = DB.loanApplications.find(x=>x.id===id);
    r.status = status;
    r.erpApprover = ERP_USER;
    r.erpComment = comment;
    if(status === 'ERP Approved'){
      const fd = r.formData;
      r.disbursementDate = todayISO();
      r.outstandingPrincipal = fd.amount;
      if(fd.disbursementMode === 'AHSS' || fd.collectionMode === 'AHSS'){
        const acct = findAccountByMember(r.memberNo);
        if(acct){
          r.linkedAhssAccountNo = acct.accountNo;
          if(fd.disbursementMode === 'AHSS'){
            acct.balance += fd.amount;
            acct.transactions.push({ date: todayISO(), description: `Loan disbursement credit (${r.id})`, debit: 0, credit: fd.amount, balance: acct.balance });
          }
          if(fd.collectionMode === 'AHSS'){
            acct.autoDebit.loanInstallment = true;
          }
        }
      }
    }
    persist();
    toast('Decision recorded: ' + status);
    ui.erpReview = null;
    setErpTab('loanBuffer');
  }, { yesClass: status==='ERP Approved'?'btn-primary':(status==='ERP Rejected'?'btn-danger':'btn-outline') });
}

/* ---------------- final render hook: wire ERP forms after paint ---------------- */
const _origRenderERP = renderERP;
renderERP = function(){
  _origRenderERP();
  if(ui.erpTab === 'b2') wireErpB2Form();
  if(ui.erpTab === 'memberForm') wireErpMemberForm();
};
