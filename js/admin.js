// =============================================================================
// js/admin.js — Admin Panel (JS-driven overlay, কোনো admin.html নেই)
// =============================================================================
// - Main app এর ভেতরে full-screen overlay হিসেবে render হয়
// - Firestore admins/{uid} (isAdmin:true) দিয়ে access control
// - Non-admin / signed-out → overlay বন্ধ হয়
// =============================================================================

const AdminPanel = (() => {

  /* ── state ── */
  let _db = null, _auth = null, _user = null;
  let _unsub = null, _overlay = null, _ready = false;

  /* ══════════════════════════════════════════════════════
     CSS — scoped under #apOverlay to avoid conflicts
  ══════════════════════════════════════════════════════ */
  const STYLES = `
  #apOverlay {
    position:fixed;inset:0;z-index:9500;
    background:var(--panel,#f6f4ee);
    display:flex;flex-direction:column;
    font-family:'Hind Siliguri',sans-serif;
    color:var(--ink,#1c2b23);
    overflow:hidden;
    opacity:0;transform:translateY(14px);
    transition:opacity .25s ease,transform .25s ease;
  }
  #apOverlay.ap-in { opacity:1; transform:translateY(0); }

  /* topbar */
  #apOverlay .ap-bar {
    display:flex;align-items:center;justify-content:space-between;
    padding:0 16px;height:54px;min-height:54px;flex-shrink:0;
    background:var(--parchment,#fbf9f4);
    border-bottom:1px solid var(--line,#e2ddd0);
  }
  #apOverlay .ap-bar-left {
    display:flex;align-items:center;gap:9px;
    font-size:15px;font-weight:700;color:var(--ink,#1c2b23);
  }
  #apOverlay .ap-bar-left i { color:var(--gold,#b8863b);font-size:16px; }
  #apOverlay .ap-bar-right { display:flex;align-items:center;gap:8px; }

  /* buttons */
  #apOverlay .ap-btn {
    display:inline-flex;align-items:center;gap:6px;
    padding:8px 15px;border-radius:10px;border:none;
    font-family:'Hind Siliguri',sans-serif;font-size:13px;font-weight:600;
    cursor:pointer;transition:filter .15s,background .15s,opacity .15s;
  }
  #apOverlay .ap-btn:disabled { opacity:.45;cursor:not-allowed; }
  #apOverlay .ap-btn-gold {
    background:var(--gold,#b8863b);color:#fff;
    box-shadow:0 4px 14px -6px rgba(184,134,59,.5);
  }
  #apOverlay .ap-btn-gold:hover:not(:disabled) { filter:brightness(1.06); }
  #apOverlay .ap-btn-outline {
    background:none;border:1px solid var(--line,#e2ddd0);
    color:var(--ink-soft,#5c6d64);
  }
  #apOverlay .ap-btn-outline:hover { background:var(--sage,#e7ecdf); }
  #apOverlay .ap-btn-danger {
    background:none;color:#c0392b;border:1px solid #e6c6c1;font-size:13px;
  }
  #apOverlay .ap-btn-danger:hover { background:#fbeceb; }
  #apOverlay .ap-icon-btn {
    width:32px;height:32px;border-radius:9px;
    border:1px solid var(--line,#e2ddd0);background:var(--parchment,#fbf9f4);
    display:flex;align-items:center;justify-content:center;
    cursor:pointer;color:var(--ink-soft,#5c6d64);font-size:13px;
    transition:background .15s,color .15s;
  }
  #apOverlay .ap-icon-btn:hover { background:var(--sage,#e7ecdf);color:var(--ink,#1c2b23); }
  #apOverlay .ap-icon-btn.d { color:#c0392b;border-color:#e6c6c1; }
  #apOverlay .ap-icon-btn.d:hover { background:#fbeceb; }
  #apOverlay .ap-close-btn {
    width:34px;height:34px;border-radius:9px;border:none;background:none;
    display:flex;align-items:center;justify-content:center;
    cursor:pointer;color:var(--ink-soft,#5c6d64);font-size:17px;
    transition:background .15s;
  }
  #apOverlay .ap-close-btn:hover { background:var(--sage,#e7ecdf); }

  /* who */
  #apOverlay .ap-who {
    font-size:12px;color:var(--ink-soft,#5c6d64);
    max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  }

  /* gate */
  #apOverlay .ap-gate {
    flex:1;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:12px;
    color:var(--ink-soft,#5c6d64);font-size:13.5px;
  }
  #apOverlay .ap-spinner {
    width:26px;height:26px;border-radius:50%;
    border:3px solid var(--line,#e2ddd0);
    border-top-color:var(--gold,#b8863b);
    animation:apSpin .8s linear infinite;
  }
  @keyframes apSpin { to { transform:rotate(360deg); } }

  /* body */
  #apOverlay .ap-body {
    flex:1;overflow-y:auto;
    padding:18px 16px 80px;
    display:flex;flex-direction:column;gap:16px;
    max-width:640px;width:100%;margin:0 auto;box-sizing:border-box;
  }

  /* stats */
  #apOverlay .ap-stats {
    display:grid;grid-template-columns:repeat(3,1fr);
    background:var(--parchment,#fbf9f4);
    border:1px solid var(--line,#e2ddd0);border-radius:13px;overflow:hidden;
  }
  #apOverlay .ap-stat {
    padding:12px 8px;text-align:center;
    border-right:1px solid var(--line,#e2ddd0);
  }
  #apOverlay .ap-stat:last-child { border-right:none; }
  #apOverlay .ap-stat-val {
    font-size:22px;font-weight:800;
    color:var(--gold,#b8863b);line-height:1;
  }
  #apOverlay .ap-stat-lbl {
    font-size:10.5px;color:var(--ink-soft,#5c6d64);
    margin-top:4px;font-weight:600;
  }

  /* card */
  #apOverlay .ap-card {
    background:var(--parchment,#fbf9f4);
    border:1px solid var(--line,#e2ddd0);
    border-radius:14px;padding:18px;
  }
  #apOverlay .ap-card-head {
    display:flex;align-items:center;gap:8px;
    font-size:14px;font-weight:700;color:var(--ink,#1c2b23);
    margin:0 0 16px;
  }
  #apOverlay .ap-card-head i { color:var(--gold,#b8863b);font-size:14px; }

  /* form */
  #apOverlay .ap-field { margin-bottom:13px; }
  #apOverlay .ap-field:last-child { margin-bottom:0; }
  #apOverlay .ap-lbl {
    display:block;font-size:12px;font-weight:600;
    color:var(--ink-soft,#5c6d64);margin-bottom:6px;
  }
  #apOverlay .ap-lbl .req { color:#c0392b; }
  #apOverlay .ap-input,
  #apOverlay .ap-ta {
    width:100%;box-sizing:border-box;
    padding:10px 13px;
    background:#fff;border:1px solid var(--line,#e2ddd0);
    border-radius:10px;outline:none;
    font-family:'Hind Siliguri',sans-serif;font-size:14px;
    color:var(--ink,#1c2b23);
    transition:border-color .18s,box-shadow .18s;
  }
  #apOverlay .ap-input::placeholder,
  #apOverlay .ap-ta::placeholder { color:#b5afa2; }
  #apOverlay .ap-input:focus,
  #apOverlay .ap-ta:focus {
    border-color:var(--gold,#b8863b);
    box-shadow:0 0 0 3px rgba(184,134,59,.12);
  }
  #apOverlay .ap-ta { resize:vertical;min-height:66px; }
  #apOverlay .ap-row { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
  #apOverlay .ap-hint {
    font-size:11.5px;color:var(--ink-soft,#5c6d64);
    margin-top:6px;line-height:1.55;
  }
  #apOverlay .ap-hint i { color:var(--gold,#b8863b);margin-right:3px; }
  #apOverlay .ap-actions { display:flex;gap:8px;margin-top:4px;flex-wrap:wrap; }

  /* exam list */
  #apOverlay .ap-list { display:flex;flex-direction:column; }
  #apOverlay .ap-row-item {
    padding:13px 0;border-bottom:1px solid var(--line,#e2ddd0);
  }
  #apOverlay .ap-row-item:last-child { border-bottom:none;padding-bottom:0; }
  #apOverlay .ap-row-item:first-child { padding-top:0; }
  #apOverlay .ap-row-main { display:flex;align-items:flex-start;gap:10px; }
  #apOverlay .ap-row-body { flex:1;min-width:0; }
  #apOverlay .ap-row-num {
    width:24px;height:24px;flex-shrink:0;
    border-radius:7px;background:var(--sage,#e7ecdf);
    color:var(--ink-soft,#5c6d64);font-size:11px;font-weight:700;
    display:flex;align-items:center;justify-content:center;margin-top:1px;
  }
  #apOverlay .ap-ei-title {
    font-size:14.5px;font-weight:700;color:var(--ink,#1c2b23);
    word-break:break-word;line-height:1.4;
  }
  #apOverlay .ap-ei-desc {
    font-size:12.5px;color:var(--ink-soft,#5c6d64);
    margin-top:2px;word-break:break-word;line-height:1.5;
  }
  #apOverlay .ap-ei-link {
    font-size:12px;color:var(--gold,#b8863b);
    margin-top:4px;word-break:break-all;display:block;text-decoration:none;
  }
  #apOverlay .ap-ei-link:hover { text-decoration:underline; }
  #apOverlay .ap-chips { display:flex;flex-wrap:wrap;gap:6px;margin-top:8px; }
  #apOverlay .ap-chip {
    display:inline-flex;align-items:center;gap:5px;
    font-size:11.5px;font-weight:600;color:var(--ink-soft,#5c6d64);
    background:var(--sage,#e7ecdf);border-radius:999px;padding:3px 10px;
  }
  #apOverlay .ap-chip i { color:var(--gold,#b8863b);font-size:10px; }
  #apOverlay .ap-chip.live {
    color:#1a7a40;background:#e3f5ec;
  }
  #apOverlay .ap-chip.live i { color:#1a7a40; }
  #apOverlay .ap-chip.sched {
    color:#7a5200;background:#fff2d0;
  }
  #apOverlay .ap-chip.sched i { color:#7a5200; }
  #apOverlay .ap-row-btns { display:flex;gap:6px;flex-shrink:0; }

  /* inline edit */
  #apOverlay .ap-ie {
    margin-top:12px;padding:14px;
    background:#fff;border:1px solid var(--line,#e2ddd0);
    border-radius:12px;
  }
  #apOverlay .ap-ie-head {
    font-size:12px;font-weight:700;
    color:var(--gold,#b8863b);margin-bottom:13px;
    display:flex;align-items:center;gap:6px;
  }

  /* empty */
  #apOverlay .ap-empty {
    text-align:center;padding:22px 0;
    font-size:13px;color:var(--ink-soft,#5c6d64);
  }
  #apOverlay .ap-empty i {
    display:block;font-size:22px;
    color:var(--line,#e2ddd0);margin-bottom:8px;
  }

  /* toast */
  #apOverlay .ap-toast {
    position:fixed;bottom:22px;left:50%;
    transform:translateX(-50%) translateY(6px);
    background:var(--ink,#1c2b23);color:#fff;
    padding:10px 18px;border-radius:999px;font-size:13px;
    opacity:0;pointer-events:none;
    transition:opacity .22s,transform .22s;
    z-index:9999;white-space:nowrap;max-width:calc(100vw - 32px);
    display:flex;align-items:center;gap:8px;
    box-shadow:0 6px 20px -6px rgba(0,0,0,.4);
  }
  #apOverlay .ap-toast.on { opacity:1;transform:translateX(-50%) translateY(0); }
  #apOverlay .ap-toast .ok { color:#3eb95f; }
  #apOverlay .ap-toast .er { color:#e74c3c; }

  /* status badge */
  #apOverlay .ap-status {
    display:inline-flex;align-items:center;gap:5px;
    font-size:11.5px;font-weight:600;border-radius:999px;
    padding:3px 10px;margin-top:6px;
  }
  #apOverlay .ap-status.live { background:#e3f5ec;color:#1a7a40; }
  #apOverlay .ap-status.sched { background:#fff2d0;color:#7a5200; }

  @media (max-width:420px) {
    #apOverlay .ap-row { grid-template-columns:1fr; }
    #apOverlay .ap-who { display:none; }
  }
  `;

  /* ── helpers ── */
  function x(s) {
    return String(s == null ? '' : s)
      .replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function toast(msg, ok = true) {
    const t = _overlay && _overlay.querySelector('.ap-toast');
    if (!t) return;
    t.innerHTML = `<i class="fa-solid ${ok ? 'fa-circle-check ok' : 'fa-circle-xmark er'}"></i>${x(msg)}`;
    t.classList.add('on');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('on'), 2500);
  }

  function tsToInput(ts) {
    if (!ts || typeof ts.toDate !== 'function') return '';
    const d = ts.toDate(), p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function inputToTs(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d) ? false : firebase.firestore.Timestamp.fromDate(d);
  }

  function fmtTs(ts) {
    if (!ts || typeof ts.toDate !== 'function') return '';
    return ts.toDate().toLocaleString('bn-BD',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  function parseNum(v, label) {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 999) {
      toast(`${label}: ১–৯৯৯ এর মধ্যে সঠিক সংখ্যা দিন`, false);
      return false;
    }
    return n;
  }

  function DEL() { return firebase.firestore.FieldValue.delete(); }

  /* ── inject CSS once ── */
  function injectCSS() {
    if (document.getElementById('apStyles')) return;
    const s = document.createElement('style');
    s.id = 'apStyles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  /* ── chips HTML ── */
  function chipsHtml(d) {
    let h = '';
    if (Number.isFinite(d.durationMinutes))
      h += `<span class="ap-chip"><i class="fa-regular fa-clock"></i>${d.durationMinutes} মিনিট</span>`;
    if (Number.isFinite(d.questionCount))
      h += `<span class="ap-chip"><i class="fa-solid fa-list-ol"></i>${d.questionCount} টি প্রশ্ন</span>`;
    if (d.publishAt && typeof d.publishAt.toDate === 'function') {
      const future = d.publishAt.toDate() > new Date();
      if (future)
        h += `<span class="ap-chip sched"><i class="fa-solid fa-hourglass-half"></i>শিডিউল: ${x(fmtTs(d.publishAt))}</span>`;
      else
        h += `<span class="ap-chip live"><i class="fa-solid fa-circle-check"></i>লাইভ</span>`;
    }
    return h ? `<div class="ap-chips">${h}</div>` : '';
  }

  /* ── render stats ── */
  function updateStats(docs) {
    let live = 0, sched = 0;
    docs.forEach(({data: d}) => {
      if (d.publishAt && typeof d.publishAt.toDate === 'function' && d.publishAt.toDate() > new Date()) sched++;
      else live++;
    });
    const sv = id => { const e = _overlay.querySelector(`#${id}`); if(e) e.textContent = docs.length === 0 ? '০' : String(docs.length); };
    const sv2 = (id,v) => { const e = _overlay.querySelector(`#${id}`); if(e) e.textContent = String(v); };
    sv2('apStatTotal', docs.length);
    sv2('apStatLive', live);
    sv2('apStatSched', sched);
  }

  /* ── form HTML (new exam) ── */
  function addFormHtml() {
    return `
    <div class="ap-card" id="apAddCard">
      <div class="ap-card-head"><i class="fa-solid fa-circle-plus"></i> নতুন পরীক্ষা যোগ করুন</div>

      <div class="ap-field">
        <label class="ap-lbl">পরীক্ষার নাম <span class="req">*</span></label>
        <input class="ap-input" id="apT" type="text" placeholder="যেমন: সূরা আল-বাকারা কুইজ" autocomplete="off">
      </div>
      <div class="ap-field">
        <label class="ap-lbl">সংক্ষিপ্ত বিবরণ</label>
        <textarea class="ap-ta" id="apD" placeholder="এই পরীক্ষা সম্পর্কে সংক্ষেপে লিখুন..."></textarea>
      </div>
      <div class="ap-field">
        <label class="ap-lbl">পরীক্ষার লিংক <span class="req">*</span></label>
        <input class="ap-input" id="apL" type="url" placeholder="https://...">
      </div>
      <div class="ap-row">
        <div class="ap-field">
          <label class="ap-lbl">সময়সীমা (মিনিট)</label>
          <input class="ap-input" id="apDur" type="number" min="1" max="999" placeholder="যেমন: ৩০">
        </div>
        <div class="ap-field">
          <label class="ap-lbl">প্রশ্ন সংখ্যা</label>
          <input class="ap-input" id="apQ" type="number" min="1" max="999" placeholder="যেমন: ২৫">
        </div>
      </div>
      <div class="ap-field">
        <label class="ap-lbl"><i class="fa-regular fa-clock" style="color:var(--gold,#b8863b)"></i> প্রকাশের সময় (ঐচ্ছিক)</label>
        <input class="ap-input" id="apPA" type="datetime-local">
        <p class="ap-hint"><i class="fa-solid fa-circle-info"></i>খালি রাখলে এখনই দেখা যাবে। সময় দিলে countdown দেখাবে ও সময়মতো স্বয়ংক্রিয়ভাবে আনলক হবে।</p>
      </div>
      <div class="ap-actions">
        <button class="ap-btn ap-btn-gold" id="apAddBtn">
          <i class="fa-solid fa-plus"></i> পরীক্ষা যোগ করুন
        </button>
        <button class="ap-btn ap-btn-outline" id="apClearBtn">
          <i class="fa-solid fa-rotate-left"></i> ফর্ম মুছুন
        </button>
      </div>
    </div>`;
  }

  /* ── build full overlay HTML ── */
  function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'apOverlay';
    el.innerHTML = `
      <div class="ap-bar">
        <div class="ap-bar-left">
          <i class="fa-solid fa-user-shield"></i>
          এক্সাম অ্যাডমিন প্যানেল
        </div>
        <div class="ap-bar-right">
          <span class="ap-who" id="apWho"></span>
          <button class="ap-btn ap-btn-outline" id="apLogout" style="display:none;">
            <i class="fa-solid fa-right-from-bracket"></i> লগআউট
          </button>
          <button class="ap-close-btn" id="apClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>

      <!-- gate -->
      <div class="ap-gate" id="apGate">
        <div class="ap-spinner"></div>
        <span>যাচাই হচ্ছে...</span>
      </div>

      <!-- main body -->
      <div class="ap-body" id="apBody" style="display:none;">

        <!-- stats -->
        <div class="ap-stats">
          <div class="ap-stat">
            <div class="ap-stat-val" id="apStatTotal">—</div>
            <div class="ap-stat-lbl">মোট পরীক্ষা</div>
          </div>
          <div class="ap-stat">
            <div class="ap-stat-val" id="apStatLive">—</div>
            <div class="ap-stat-lbl">এখন লাইভ</div>
          </div>
          <div class="ap-stat">
            <div class="ap-stat-val" id="apStatSched">—</div>
            <div class="ap-stat-lbl">শিডিউল</div>
          </div>
        </div>

        ${addFormHtml()}

        <!-- list -->
        <div class="ap-card">
          <div class="ap-card-head"><i class="fa-solid fa-list"></i> সব পরীক্ষার তালিকা</div>
          <div id="apList"><div class="ap-empty"><i class="fa-solid fa-spinner fa-spin"></i>লোড হচ্ছে...</div></div>
        </div>
      </div>

      <div class="ap-toast" id="apToast"></div>
    `;
    return el;
  }

  /* ── wire events (called once after overlay is appended) ── */
  function wireEvents() {
    _overlay.querySelector('#apClose').onclick = close;

    _overlay.querySelector('#apLogout').onclick = async () => {
      await _auth.signOut();
      close();
    };

    _overlay.querySelector('#apAddBtn').onclick = addExam;

    _overlay.querySelector('#apClearBtn').onclick = () => {
      ['#apT','#apD','#apL','#apDur','#apQ','#apPA'].forEach(sel => {
        const el = _overlay.querySelector(sel);
        if (el) el.value = '';
      });
      _overlay.querySelector('#apT').focus();
    };
  }

  /* ── add exam ── */
  async function addExam() {
    const g = id => _overlay.querySelector(`#${id}`);
    const title = g('apT').value.trim();
    const desc  = g('apD').value.trim();
    const link  = g('apL').value.trim();

    if (!title) { toast('পরীক্ষার নাম লিখুন', false); g('apT').focus(); return; }
    if (!link)  { toast('পরীক্ষার লিংক দিন', false); g('apL').focus(); return; }
    try { new URL(link); } catch(e) { toast('সঠিক URL দিন (https://...)', false); g('apL').focus(); return; }

    const durVal = parseNum(g('apDur').value.trim(), 'সময়সীমা');
    if (durVal === false) return;
    const qVal  = parseNum(g('apQ').value.trim(), 'প্রশ্ন সংখ্যা');
    if (qVal === false) return;
    const paVal = inputToTs(g('apPA').value);
    if (paVal === false) { toast('সঠিক তারিখ ও সময় দিন', false); return; }

    const btn = g('apAddBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> সংরক্ষণ হচ্ছে...';

    try {
      const payload = {
        title, description: desc, link,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: _user ? _user.uid : null
      };
      if (durVal !== null) payload.durationMinutes = durVal;
      if (qVal   !== null) payload.questionCount   = qVal;
      if (paVal  !== null) payload.publishAt        = paVal;

      await _db.collection('exams').add(payload);

      // reset
      ['#apT','#apD','#apL','#apDur','#apQ','#apPA'].forEach(sel => {
        const el = _overlay.querySelector(sel);
        if (el) el.value = '';
      });
      toast('নতুন পরীক্ষা সফলভাবে যোগ হয়েছে ✓');
    } catch(e) {
      toast('যোগ করা ব্যর্থ হয়েছে: ' + (e.message || ''), false);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-plus"></i> পরীক্ষা যোগ করুন';
    }
  }

  /* ── render list ── */
  function renderList(docs) {
    updateStats(docs);
    const box = _overlay.querySelector('#apList');
    if (!docs.length) {
      box.innerHTML = '<div class="ap-empty"><i class="fa-solid fa-inbox"></i>এখনো কোনো পরীক্ষা যোগ করা হয়নি।</div>';
      return;
    }
    box.innerHTML = '';
    const ul = document.createElement('div');
    ul.className = 'ap-list';
    docs.forEach(({id, data}, i) => ul.appendChild(buildRow(id, data, i + 1)));
    box.appendChild(ul);
  }

  /* ── build one row ── */
  function buildRow(id, data, num) {
    const row = document.createElement('div');
    row.className = 'ap-row-item';
    row.dataset.id = id;
    row.innerHTML = `
      <div class="ap-row-main">
        <div class="ap-row-num">${num}</div>
        <div class="ap-row-body">
          <div class="ap-ei-title">${x(data.title || '(নাম নেই)')}</div>
          ${data.description ? `<div class="ap-ei-desc">${x(data.description)}</div>` : ''}
          <a class="ap-ei-link" href="${x(data.link||'#')}" target="_blank" rel="noopener">
            <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:9px;margin-right:3px"></i>${x(data.link||'')}
          </a>
          ${chipsHtml(data)}
          <div class="ap-ie-wrap"></div>
        </div>
        <div class="ap-row-btns">
          <button class="ap-icon-btn ap-edit-btn" title="সম্পাদনা"><i class="fa-solid fa-pen"></i></button>
          <button class="ap-icon-btn d ap-del-btn" title="মুছুন"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    row.querySelector('.ap-edit-btn').onclick = () => toggleEdit(id, data, row);
    row.querySelector('.ap-del-btn').onclick  = () => delExam(id, data.title);
    return row;
  }

  /* ── inline edit toggle ── */
  function toggleEdit(id, data, row) {
    const wrap = row.querySelector('.ap-ie-wrap');
    const editBtn = row.querySelector('.ap-edit-btn');

    if (wrap.children.length) {
      wrap.innerHTML = '';
      editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
      return;
    }

    // close any other open edit
    _overlay.querySelectorAll('.ap-ie-wrap').forEach(w => {
      if (w !== wrap && w.children.length) {
        w.innerHTML = '';
        const eb = w.closest('.ap-row-item').querySelector('.ap-edit-btn');
        if (eb) eb.innerHTML = '<i class="fa-solid fa-pen"></i>';
      }
    });

    editBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';

    wrap.innerHTML = `
      <div class="ap-ie">
        <div class="ap-ie-head"><i class="fa-solid fa-pen-to-square"></i> সম্পাদনা করুন</div>
        <div class="ap-field">
          <label class="ap-lbl">পরীক্ষার নাম <span class="req">*</span></label>
          <input class="ap-input ie-t" type="text" value="${x(data.title||'')}">
        </div>
        <div class="ap-field">
          <label class="ap-lbl">বিবরণ</label>
          <textarea class="ap-ta ie-d">${x(data.description||'')}</textarea>
        </div>
        <div class="ap-field">
          <label class="ap-lbl">লিংক <span class="req">*</span></label>
          <input class="ap-input ie-l" type="url" value="${x(data.link||'')}">
        </div>
        <div class="ap-row">
          <div class="ap-field">
            <label class="ap-lbl">সময়সীমা (মিনিট)</label>
            <input class="ap-input ie-dur" type="number" min="1" max="999"
              value="${Number.isFinite(data.durationMinutes) ? data.durationMinutes : ''}">
          </div>
          <div class="ap-field">
            <label class="ap-lbl">প্রশ্ন সংখ্যা</label>
            <input class="ap-input ie-q" type="number" min="1" max="999"
              value="${Number.isFinite(data.questionCount) ? data.questionCount : ''}">
          </div>
        </div>
        <div class="ap-field">
          <label class="ap-lbl">প্রকাশের সময়</label>
          <input class="ap-input ie-pa" type="datetime-local" value="${tsToInput(data.publishAt)}">
          <p class="ap-hint">খালি রাখলে এখনই সবাই দেখবে।</p>
        </div>
        <div class="ap-actions">
          <button class="ap-btn ap-btn-gold ie-save"><i class="fa-solid fa-check"></i> সংরক্ষণ করুন</button>
          <button class="ap-btn ap-btn-outline ie-cancel">বাতিল</button>
        </div>
      </div>`;

    const g = sel => wrap.querySelector(sel);

    g('.ie-cancel').onclick = () => {
      wrap.innerHTML = '';
      editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
    };

    g('.ie-save').onclick = async () => {
      const title = g('.ie-t').value.trim();
      const link  = g('.ie-l').value.trim();
      if (!title) { toast('পরীক্ষার নাম লিখুন', false); return; }
      if (!link)  { toast('লিংক দিন', false); return; }
      try { new URL(link); } catch(e) { toast('সঠিক URL দিন', false); return; }

      const durVal = parseNum(g('.ie-dur').value.trim(), 'সময়সীমা');
      if (durVal === false) return;
      const qVal  = parseNum(g('.ie-q').value.trim(), 'প্রশ্ন সংখ্যা');
      if (qVal === false) return;
      const paVal = inputToTs(g('.ie-pa').value);
      if (paVal === false) { toast('সঠিক তারিখ দিন', false); return; }

      const upd = {
        title, description: g('.ie-d').value.trim(), link,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        durationMinutes: durVal !== null ? durVal : DEL(),
        questionCount:   qVal   !== null ? qVal   : DEL(),
        publishAt:       paVal  !== null ? paVal  : DEL()
      };

      const saveBtn = g('.ie-save');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> সংরক্ষণ হচ্ছে...';

      try {
        await _db.collection('exams').doc(id).update(upd);
        toast('পরিবর্তন সংরক্ষণ হয়েছে ✓');
        // Firestore realtime re-renders the row; wrap is cleared in the snapshot
      } catch(e) {
        toast('সংরক্ষণ ব্যর্থ: ' + (e.message||''), false);
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> সংরক্ষণ করুন';
      }
    };
  }

  /* ── delete ── */
  async function delExam(id, title) {
    if (!confirm(`"${title || 'এই পরীক্ষাটি'}" মুছে ফেলতে চান?`)) return;
    try {
      await _db.collection('exams').doc(id).delete();
      toast('পরীক্ষাটি মুছে ফেলা হয়েছে');
    } catch(e) {
      toast('মোছা ব্যর্থ হয়েছে', false);
    }
  }

  /* ── Firestore listener ── */
  function startListener() {
    if (_unsub) { _unsub(); _unsub = null; }
    _unsub = _db.collection('exams').orderBy('createdAt','asc').onSnapshot(
      snap => renderList(snap.docs.map(d => ({id: d.id, data: d.data()}))),
      err  => {
        const b = _overlay && _overlay.querySelector('#apList');
        if (b) b.innerHTML = `<div class="ap-empty"><i class="fa-solid fa-triangle-exclamation"></i>তালিকা লোড হয়নি: ${x(err.message||'')}</div>`;
      }
    );
  }

  /* ── verify admin then show panel ── */
  async function verify() {
    const user = _auth.currentUser;
    if (!user) { close(); return; }
    _user = user;

    let admin = false;
    try {
      const doc = await _db.collection('admins').doc(user.uid).get();
      admin = doc.exists && doc.data().isAdmin === true;
    } catch(e) { admin = false; }

    if (!admin) { close(); return; }

    _overlay.querySelector('#apGate').style.display = 'none';
    _overlay.querySelector('#apBody').style.display  = 'flex';
    _overlay.querySelector('#apWho').textContent     = user.email || '';
    _overlay.querySelector('#apLogout').style.display = 'inline-flex';

    startListener();
  }

  /* ══ PUBLIC ══ */
  function open() {
    if (typeof firebase === 'undefined') return;

    // resolve db / auth (reuse main app's instances when available)
    _auth = (typeof fbAuth !== 'undefined') ? fbAuth : firebase.auth();
    _db   = (typeof fbDb  !== 'undefined') ? fbDb   : firebase.firestore();

    injectCSS();

    if (!_overlay) {
      _overlay = buildOverlay();
      document.body.appendChild(_overlay);
      wireEvents();
    }

    // reset gate visibility every open
    _overlay.querySelector('#apGate').style.display = 'flex';
    _overlay.querySelector('#apBody').style.display = 'none';
    _overlay.querySelector('#apLogout').style.display = 'none';

    _overlay.style.display = 'flex';
    requestAnimationFrame(() => _overlay.classList.add('ap-in'));

    verify();
  }

  function close() {
    if (!_overlay) return;
    _overlay.classList.remove('ap-in');
    setTimeout(() => { if (_overlay) _overlay.style.display = 'none'; }, 280);
    if (_unsub) { _unsub(); _unsub = null; }
    _user = null;
  }

  return { open, close };
})();
