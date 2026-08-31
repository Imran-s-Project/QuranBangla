// =============================================================================
// js/admin.js — সম্পূর্ণ Admin Panel (JS-driven, কোনো admin.html নেই)
// =============================================================================
// Access model:
//   - কোনো আলাদা HTML ফাইল নেই। Panel টি main app এর ভেতরে একটি full-screen
//     overlay হিসেবে dynamically inject হয়।
//   - Firestore admins/{uid} doc (isAdmin:true) verify করেই panel খোলে।
//   - Non-admin বা signed-out user এর কাছে কোনো panel visible হয় না।
// =============================================================================

const AdminPanel = (() => {
  // ---- State ----
  let _db = null;
  let _auth = null;
  let _currentUser = null;
  let _examsUnsub = null;
  let _overlayEl = null;
  let _mounted = false;
  let _editingId = null; // currently-open inline edit row id

  // ---- CSS (injected once) ----
  const CSS = `
    /* ===================== ADMIN PANEL OVERLAY ===================== */
    #adminOverlay {
      position: fixed; inset: 0; z-index: 9000;
      background: #0d1117;
      display: flex; flex-direction: column;
      font-family: 'Hind Siliguri', sans-serif;
      color: #e6edf3;
      overflow: hidden;
      opacity: 0; transform: translateY(18px);
      transition: opacity .28s ease, transform .28s ease;
    }
    #adminOverlay.ap-visible { opacity: 1; transform: translateY(0); }

    /* ---- Topbar ---- */
    .ap-topbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 18px;
      height: 56px; min-height: 56px;
      background: #161b22;
      border-bottom: 1px solid #30363d;
      flex-shrink: 0;
    }
    .ap-topbar-brand {
      display: flex; align-items: center; gap: 10px;
      font-size: 14px; font-weight: 700; color: #e6edf3; letter-spacing: .01em;
    }
    .ap-topbar-brand .ap-brand-icon {
      width: 32px; height: 32px; border-radius: 9px;
      background: linear-gradient(135deg, #d4a843 0%, #f0c95c 100%);
      display: flex; align-items: center; justify-content: center;
      color: #161b22; font-size: 14px;
      box-shadow: 0 4px 12px -4px rgba(212,168,67,.5);
    }
    .ap-topbar-brand span { color: #d4a843; }
    .ap-topbar-right {
      display: flex; align-items: center; gap: 10px;
    }
    .ap-who {
      font-size: 12px; color: #8b949e;
      display: none; /* shown after auth verified */
    }
    .ap-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 14px; border-radius: 8px; border: none;
      font-family: inherit; font-size: 13px; font-weight: 600;
      cursor: pointer; transition: filter .15s, opacity .15s, background .15s;
    }
    .ap-btn:disabled { opacity: .45; cursor: not-allowed; }
    .ap-btn-ghost {
      background: transparent; color: #8b949e;
      border: 1px solid #30363d;
    }
    .ap-btn-ghost:hover { background: #21262d; color: #e6edf3; }
    .ap-btn-close {
      background: transparent; color: #8b949e; border: none;
      width: 36px; height: 36px; border-radius: 8px; padding: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; cursor: pointer; transition: background .15s, color .15s;
    }
    .ap-btn-close:hover { background: #21262d; color: #e6edf3; }

    /* ---- Main body ---- */
    .ap-body {
      flex: 1; overflow-y: auto; padding: 22px 18px 60px;
      display: flex; flex-direction: column; gap: 20px;
    }

    /* ---- Gate screen ---- */
    .ap-gate {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 12px;
      color: #8b949e; font-size: 13.5px;
    }
    .ap-gate-spinner {
      width: 28px; height: 28px; border-radius: 50%;
      border: 3px solid #30363d; border-top-color: #d4a843;
      animation: apSpin .75s linear infinite;
    }
    @keyframes apSpin { to { transform: rotate(360deg); } }

    /* ---- Section card ---- */
    .ap-card {
      background: #161b22; border: 1px solid #30363d;
      border-radius: 14px; padding: 20px; overflow: hidden;
    }
    .ap-card-title {
      display: flex; align-items: center; gap: 9px;
      font-size: 13px; font-weight: 700; color: #e6edf3;
      margin: 0 0 18px; letter-spacing: .01em;
    }
    .ap-card-title-icon {
      width: 28px; height: 28px; border-radius: 8px;
      background: rgba(212,168,67,.15);
      color: #d4a843;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; flex-shrink: 0;
    }

    /* ---- Form fields ---- */
    .ap-field { margin-bottom: 14px; }
    .ap-field:last-child { margin-bottom: 0; }
    .ap-label {
      display: flex; align-items: center; gap: 6px;
      font-size: 11.5px; font-weight: 700; color: #8b949e;
      letter-spacing: .04em; text-transform: uppercase; margin-bottom: 7px;
    }
    .ap-label i { color: #d4a843; font-size: 10px; }
    .ap-input, .ap-textarea {
      width: 100%; box-sizing: border-box;
      padding: 11px 14px;
      background: #0d1117; border: 1px solid #30363d;
      border-radius: 10px; outline: none;
      font-family: 'Hind Siliguri', sans-serif; font-size: 14px;
      color: #e6edf3; caret-color: #d4a843;
      transition: border-color .18s, box-shadow .18s;
    }
    .ap-input::placeholder, .ap-textarea::placeholder { color: #484f58; }
    .ap-input:focus, .ap-textarea:focus {
      border-color: #d4a843;
      box-shadow: 0 0 0 3px rgba(212,168,67,.12);
    }
    .ap-textarea { resize: vertical; min-height: 68px; }
    .ap-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .ap-field-hint {
      margin-top: 7px; font-size: 11.5px; color: #484f58; line-height: 1.6;
    }
    .ap-field-hint i { color: #d4a843; }

    /* ---- Input group (icon prefix) ---- */
    .ap-input-group { position: relative; }
    .ap-input-group .ap-input { padding-left: 38px; }
    .ap-input-group-icon {
      position: absolute; left: 13px; top: 50%; transform: translateY(-50%);
      color: #484f58; font-size: 13px; pointer-events: none;
    }

    /* ---- Submit / action area ---- */
    .ap-form-actions { display: flex; gap: 10px; margin-top: 4px; }
    .ap-btn-primary {
      background: linear-gradient(135deg, #d4a843 0%, #f0c95c 100%);
      color: #0d1117; font-weight: 700; font-size: 13.5px;
      box-shadow: 0 6px 20px -8px rgba(212,168,67,.6);
    }
    .ap-btn-primary:hover:not(:disabled) { filter: brightness(1.07); }
    .ap-btn-primary:active:not(:disabled) { filter: brightness(.95); }
    .ap-btn-danger-outline {
      background: transparent; color: #f85149;
      border: 1px solid rgba(248,81,73,.35);
    }
    .ap-btn-danger-outline:hover { background: rgba(248,81,73,.08); }

    /* ---- Step indicator (new exam form) ---- */
    .ap-step-bar {
      display: flex; gap: 0; margin-bottom: 22px;
      border-radius: 10px; overflow: hidden; border: 1px solid #30363d;
    }
    .ap-step {
      flex: 1; padding: 9px 6px; text-align: center;
      font-size: 11.5px; font-weight: 700; color: #484f58;
      background: #0d1117; cursor: pointer; transition: background .15s, color .15s;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      border-right: 1px solid #30363d; letter-spacing: .01em;
    }
    .ap-step:last-child { border-right: none; }
    .ap-step.active { background: rgba(212,168,67,.12); color: #d4a843; }
    .ap-step.done { color: #3fb950; }
    .ap-step.done::before {
      content: '✓'; font-size: 10px; font-weight: 900;
    }

    /* ---- Exam list ---- */
    .ap-exam-list { display: flex; flex-direction: column; gap: 0; }
    .ap-exam-row {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 14px 0; border-bottom: 1px solid #21262d;
      transition: background .12s;
    }
    .ap-exam-row:first-child { padding-top: 0; }
    .ap-exam-row:last-child { border-bottom: none; padding-bottom: 0; }

    .ap-exam-num {
      width: 26px; height: 26px; flex-shrink: 0;
      border-radius: 7px; background: #21262d;
      color: #8b949e; font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      margin-top: 1px;
    }
    .ap-exam-body { flex: 1; min-width: 0; }
    .ap-exam-title {
      font-size: 14px; font-weight: 700; color: #e6edf3;
      word-break: break-word; line-height: 1.4;
    }
    .ap-exam-desc {
      font-size: 12px; color: #8b949e; margin-top: 2px;
      word-break: break-word; line-height: 1.5;
    }
    .ap-exam-link {
      font-size: 11.5px; color: #d4a843; margin-top: 5px;
      word-break: break-all; display: block;
      text-decoration: none;
    }
    .ap-exam-link:hover { text-decoration: underline; }
    .ap-exam-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .ap-chip {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 11px; font-weight: 600; color: #8b949e;
      background: #21262d; border-radius: 999px; padding: 3px 10px;
      border: 1px solid #30363d;
    }
    .ap-chip i { color: #d4a843; font-size: 9.5px; }
    .ap-chip.status-live { color: #3fb950; border-color: rgba(63,185,80,.3); background: rgba(63,185,80,.08); }
    .ap-chip.status-live i { color: #3fb950; }
    .ap-chip.status-scheduled { color: #d4a843; border-color: rgba(212,168,67,.3); background: rgba(212,168,67,.08); }
    .ap-chip.status-scheduled i { color: #d4a843; }

    .ap-exam-actions { display: flex; gap: 6px; flex-shrink: 0; padding-top: 1px; }
    .ap-icon-btn {
      width: 32px; height: 32px; border-radius: 8px;
      border: 1px solid #30363d; background: transparent;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: #8b949e; font-size: 12.5px;
      transition: background .12s, color .12s, border-color .12s;
    }
    .ap-icon-btn:hover { background: #21262d; color: #e6edf3; }
    .ap-icon-btn.danger { color: #f85149; border-color: rgba(248,81,73,.3); }
    .ap-icon-btn.danger:hover { background: rgba(248,81,73,.1); }

    /* ---- Inline edit panel ---- */
    .ap-inline-edit {
      background: #21262d; border: 1px solid #30363d;
      border-radius: 12px; padding: 16px; margin-top: 4px;
    }
    .ap-inline-edit-title {
      font-size: 11.5px; font-weight: 700; color: #d4a843;
      letter-spacing: .04em; text-transform: uppercase;
      margin-bottom: 14px;
    }

    /* ---- Toast ---- */
    .ap-toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(8px);
      background: #21262d; color: #e6edf3; border: 1px solid #30363d;
      padding: 10px 18px; border-radius: 99px; font-size: 13px;
      opacity: 0; pointer-events: none;
      transition: opacity .22s ease, transform .22s ease;
      z-index: 9999; white-space: nowrap; max-width: calc(100vw - 32px);
      box-shadow: 0 8px 24px -8px rgba(0,0,0,.6);
      display: flex; align-items: center; gap: 8px;
    }
    .ap-toast.ap-toast-show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .ap-toast.ap-toast-ok i { color: #3fb950; }
    .ap-toast.ap-toast-err i { color: #f85149; }

    /* ---- Empty / error ---- */
    .ap-empty {
      text-align: center; padding: 24px 0;
      font-size: 13px; color: #484f58;
    }
    .ap-empty i { font-size: 24px; color: #30363d; display: block; margin-bottom: 8px; }

    /* ---- Divider ---- */
    .ap-divider {
      border: none; border-top: 1px solid #21262d; margin: 4px 0;
    }

    /* ---- Stats bar ---- */
    .ap-stats-bar {
      display: flex; gap: 0;
      background: #0d1117; border: 1px solid #30363d;
      border-radius: 12px; overflow: hidden; margin-bottom: 18px;
    }
    .ap-stat {
      flex: 1; padding: 12px 8px; text-align: center;
      border-right: 1px solid #30363d;
    }
    .ap-stat:last-child { border-right: none; }
    .ap-stat-val {
      font-size: 20px; font-weight: 800; color: #d4a843; line-height: 1;
    }
    .ap-stat-label {
      font-size: 10.5px; color: #8b949e; margin-top: 4px; font-weight: 600;
      letter-spacing: .03em;
    }

    /* ---- Responsive ---- */
    @media (max-width: 420px) {
      .ap-field-row { grid-template-columns: 1fr; }
      .ap-topbar-brand .ap-brand-text { display: none; }
    }
  `;

  // ---- Helpers ----
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escAttr(s) { return esc(s); }

  function toast(msg, type = 'ok') {
    const t = _overlayEl && _overlayEl.querySelector('.ap-toast');
    if (!t) return;
    t.innerHTML = `<i class="fa-solid ${type === 'ok' ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>${esc(msg)}`;
    t.className = `ap-toast ap-toast-${type} ap-toast-show`;
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove('ap-toast-show'), 2400);
  }

  function tsToLocalInput(ts) {
    if (!ts || typeof ts.toDate !== 'function') return '';
    const d = ts.toDate();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function localInputToTs(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return false;
    return firebase.firestore.Timestamp.fromDate(d);
  }

  function formatTs(ts) {
    if (!ts || typeof ts.toDate !== 'function') return '';
    return ts.toDate().toLocaleString('bn-BD', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function parseInt1to999(raw, label) {
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 999) {
      toast(`${label}: ১-৯৯৯ এর মধ্যে সঠিক সংখ্যা দিন`, 'err');
      return false;
    }
    return n;
  }

  // ---- Inject CSS ----
  function injectStyles() {
    if (document.getElementById('apStyles')) return;
    const s = document.createElement('style');
    s.id = 'apStyles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---- Build overlay DOM ----
  function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'adminOverlay';
    el.innerHTML = `
      <!-- Topbar -->
      <div class="ap-topbar">
        <div class="ap-topbar-brand">
          <div class="ap-brand-icon"><i class="fa-solid fa-user-shield"></i></div>
          <span class="ap-brand-text">এক্সাম <span>অ্যাডমিন</span></span>
        </div>
        <div class="ap-topbar-right">
          <span class="ap-who" id="apWho"></span>
          <button class="ap-btn ap-btn-ghost" id="apLogoutBtn" style="display:none;">
            <i class="fa-solid fa-right-from-bracket"></i> লগ-আউট
          </button>
          <button class="ap-btn-close" id="apCloseBtn" title="বন্ধ করুন">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <!-- Gate screen -->
      <div class="ap-gate" id="apGate">
        <div class="ap-gate-spinner"></div>
        <span>যাচাই হচ্ছে...</span>
      </div>

      <!-- Main panel (hidden until verified) -->
      <div class="ap-body" id="apBody" style="display:none;">

        <!-- Stats bar (populated after list loads) -->
        <div class="ap-stats-bar" id="apStatsBar">
          <div class="ap-stat">
            <div class="ap-stat-val" id="apStatTotal">—</div>
            <div class="ap-stat-label">মোট পরীক্ষা</div>
          </div>
          <div class="ap-stat">
            <div class="ap-stat-val" id="apStatLive">—</div>
            <div class="ap-stat-label">এখন লাইভ</div>
          </div>
          <div class="ap-stat">
            <div class="ap-stat-val" id="apStatScheduled">—</div>
            <div class="ap-stat-label">শিডিউল</div>
          </div>
        </div>

        <!-- Add new exam card -->
        <div class="ap-card" id="apAddCard">
          <div class="ap-card-title">
            <div class="ap-card-title-icon"><i class="fa-solid fa-plus"></i></div>
            নতুন পরীক্ষা যোগ করুন
          </div>

          <!-- Step bar -->
          <div class="ap-step-bar">
            <div class="ap-step active" data-step="1" id="apStep1">
              <i class="fa-solid fa-pen-nib"></i> মূল তথ্য
            </div>
            <div class="ap-step" data-step="2" id="apStep2">
              <i class="fa-solid fa-sliders"></i> বিস্তারিত
            </div>
            <div class="ap-step" data-step="3" id="apStep3">
              <i class="fa-solid fa-clock"></i> সময় নির্ধারণ
            </div>
          </div>

          <!-- Step 1: core info -->
          <div id="apFormStep1">
            <div class="ap-field">
              <label class="ap-label"><i class="fa-solid fa-heading"></i> পরীক্ষার নাম <span style="color:#f85149">*</span></label>
              <input class="ap-input" type="text" id="apNewTitle" placeholder="যেমন: সূরা আল-বাকারা কুইজ" autocomplete="off">
            </div>
            <div class="ap-field">
              <label class="ap-label"><i class="fa-solid fa-align-left"></i> সংক্ষিপ্ত বিবরণ</label>
              <textarea class="ap-textarea" id="apNewDesc" placeholder="এই পরীক্ষা সম্পর্কে ছোট বিবরণ..."></textarea>
            </div>
            <div class="ap-field">
              <label class="ap-label"><i class="fa-solid fa-link"></i> পরীক্ষার লিংক <span style="color:#f85149">*</span></label>
              <div class="ap-input-group">
                <i class="fa-solid fa-arrow-up-right-from-square ap-input-group-icon"></i>
                <input class="ap-input" type="url" id="apNewLink" placeholder="https://...">
              </div>
            </div>
            <div class="ap-form-actions">
              <button class="ap-btn ap-btn-primary" id="apNextStep1Btn">
                পরবর্তী <i class="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </div>

          <!-- Step 2: details -->
          <div id="apFormStep2" style="display:none;">
            <div class="ap-field-row">
              <div class="ap-field">
                <label class="ap-label"><i class="fa-solid fa-clock"></i> সময়সীমা (মিনিট)</label>
                <input class="ap-input" type="number" id="apNewDuration" min="1" max="999" placeholder="যেমন: ৩০">
              </div>
              <div class="ap-field">
                <label class="ap-label"><i class="fa-solid fa-list-ol"></i> প্রশ্ন সংখ্যা</label>
                <input class="ap-input" type="number" id="apNewQCount" min="1" max="999" placeholder="যেমন: ২৫">
              </div>
            </div>
            <div class="ap-form-actions">
              <button class="ap-btn ap-btn-ghost" id="apBackStep2Btn">
                <i class="fa-solid fa-arrow-left"></i> আগে
              </button>
              <button class="ap-btn ap-btn-primary" id="apNextStep2Btn">
                পরবর্তী <i class="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </div>

          <!-- Step 3: publish time -->
          <div id="apFormStep3" style="display:none;">
            <div class="ap-field">
              <label class="ap-label"><i class="fa-regular fa-calendar-clock"></i> প্রকাশের সময়</label>
              <input class="ap-input" type="datetime-local" id="apNewPublishAt">
              <div class="ap-field-hint">
                <i class="fa-solid fa-circle-info"></i>
                খালি রাখলে এখনই সবাই দেখবে। সময় দিলে লাইভ কাউন্টডাউন দেখাবে, সময় হলে স্বয়ংক্রিয়ভাবে আনলক হবে।
              </div>
            </div>
            <div class="ap-form-actions">
              <button class="ap-btn ap-btn-ghost" id="apBackStep3Btn">
                <i class="fa-solid fa-arrow-left"></i> আগে
              </button>
              <button class="ap-btn ap-btn-primary" id="apSubmitBtn">
                <i class="fa-solid fa-check"></i> যোগ করুন
              </button>
            </div>
          </div>
        </div>

        <!-- Exam list card -->
        <div class="ap-card">
          <div class="ap-card-title">
            <div class="ap-card-title-icon"><i class="fa-solid fa-list"></i></div>
            সব পরীক্ষার লিংক
          </div>
          <div id="apExamList">
            <div class="ap-empty">
              <i class="fa-solid fa-spinner fa-spin"></i>
              লোড হচ্ছে...
            </div>
          </div>
        </div>
      </div>

      <!-- Toast -->
      <div class="ap-toast" id="apToast"></div>
    `;
    return el;
  }

  // ---- Wire step navigation ----
  function wireStepNav() {
    let currentStep = 1;

    function goStep(n) {
      [1, 2, 3].forEach(i => {
        const s = _overlayEl.querySelector(`#apFormStep${i}`);
        const bar = _overlayEl.querySelector(`#apStep${i}`);
        if (s) s.style.display = i === n ? 'block' : 'none';
        if (bar) {
          bar.classList.remove('active', 'done');
          if (i === n) bar.classList.add('active');
          else if (i < n) bar.classList.add('done');
        }
      });
      currentStep = n;
    }

    _overlayEl.querySelector('#apNextStep1Btn').onclick = () => {
      const title = _overlayEl.querySelector('#apNewTitle').value.trim();
      const link = _overlayEl.querySelector('#apNewLink').value.trim();
      if (!title) { toast('পরীক্ষার নাম দিন', 'err'); return; }
      if (!link) { toast('পরীক্ষার লিংক দিন', 'err'); return; }
      try { new URL(link); } catch (e) { toast('সঠিক URL দিন (https://...)', 'err'); return; }
      goStep(2);
    };

    _overlayEl.querySelector('#apBackStep2Btn').onclick = () => goStep(1);
    _overlayEl.querySelector('#apNextStep2Btn').onclick = () => {
      const dur = parseIntField('apNewDuration', 'সময়সীমা');
      if (dur === false) return;
      const qc = parseIntField('apNewQCount', 'প্রশ্ন সংখ্যা');
      if (qc === false) return;
      goStep(3);
    };
    _overlayEl.querySelector('#apBackStep3Btn').onclick = () => goStep(2);
    _overlayEl.querySelector('#apSubmitBtn').onclick = submitNewExam;

    // Step bar tabs
    [1, 2, 3].forEach(i => {
      _overlayEl.querySelector(`#apStep${i}`).onclick = () => {
        if (i < currentStep) goStep(i); // allow going back
      };
    });
  }

  function parseIntField(inputId, label) {
    const el = _overlayEl.querySelector(`#${inputId}`);
    return el ? parseInt1to999(el.value.trim(), label) : null;
  }

  // ---- Submit new exam ----
  async function submitNewExam() {
    const btn = _overlayEl.querySelector('#apSubmitBtn');
    const titleEl = _overlayEl.querySelector('#apNewTitle');
    const descEl = _overlayEl.querySelector('#apNewDesc');
    const linkEl = _overlayEl.querySelector('#apNewLink');
    const durEl = _overlayEl.querySelector('#apNewDuration');
    const qcEl = _overlayEl.querySelector('#apNewQCount');
    const paEl = _overlayEl.querySelector('#apNewPublishAt');

    const title = titleEl.value.trim();
    const link = linkEl.value.trim();
    const description = descEl.value.trim();

    if (!title || !link) { toast('নাম ও লিংক আবশ্যক', 'err'); return; }
    try { new URL(link); } catch (e) { toast('সঠিক URL দিন', 'err'); return; }

    const durVal = parseInt1to999(durEl.value.trim(), 'সময়সীমা');
    if (durVal === false) return;
    const qcVal = parseInt1to999(qcEl.value.trim(), 'প্রশ্ন সংখ্যা');
    if (qcVal === false) return;
    const paVal = localInputToTs(paEl.value);
    if (paVal === false) { toast('সঠিক প্রকাশের সময় দিন', 'err'); return; }

    btn.disabled = true;
    try {
      const payload = {
        title, description, link,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: _currentUser ? _currentUser.uid : null
      };
      if (durVal !== null) payload.durationMinutes = durVal;
      if (qcVal !== null) payload.questionCount = qcVal;
      if (paVal !== null) payload.publishAt = paVal;

      await _db.collection('exams').add(payload);

      // Reset form
      titleEl.value = ''; descEl.value = ''; linkEl.value = '';
      durEl.value = ''; qcEl.value = ''; paEl.value = '';

      // Go back to step 1
      [1, 2, 3].forEach(i => {
        const s = _overlayEl.querySelector(`#apFormStep${i}`);
        const b = _overlayEl.querySelector(`#apStep${i}`);
        if (s) s.style.display = i === 1 ? 'block' : 'none';
        if (b) { b.classList.remove('active', 'done'); if (i === 1) b.classList.add('active'); }
      });

      toast('নতুন পরীক্ষা সফলভাবে যোগ হয়েছে ✓');
    } catch (e) {
      toast('যোগ করা ব্যর্থ হয়েছে: ' + (e.message || ''), 'err');
    } finally {
      btn.disabled = false;
    }
  }

  // ---- Build chips html ----
  function chipsHtml(data, withStatus = true) {
    const chips = [];
    if (Number.isFinite(data.durationMinutes))
      chips.push(`<span class="ap-chip"><i class="fa-regular fa-clock"></i> ${data.durationMinutes} মিনিট</span>`);
    if (Number.isFinite(data.questionCount))
      chips.push(`<span class="ap-chip"><i class="fa-solid fa-list-ol"></i> ${data.questionCount} টি প্রশ্ন</span>`);
    if (withStatus && data.publishAt && typeof data.publishAt.toDate === 'function') {
      const future = data.publishAt.toDate().getTime() > Date.now();
      if (future)
        chips.push(`<span class="ap-chip status-scheduled"><i class="fa-solid fa-hourglass-half"></i> শিডিউল: ${esc(formatTs(data.publishAt))}</span>`);
      else
        chips.push(`<span class="ap-chip status-live"><i class="fa-solid fa-circle-check"></i> লাইভ</span>`);
    }
    return chips.length ? `<div class="ap-exam-chips">${chips.join('')}</div>` : '';
  }

  // ---- Render exam list ----
  function renderList(docs) {
    const box = _overlayEl.querySelector('#apExamList');
    const total = docs.length;
    let live = 0, scheduled = 0;
    docs.forEach(({ data }) => {
      if (data.publishAt && typeof data.publishAt.toDate === 'function') {
        data.publishAt.toDate().getTime() > Date.now() ? scheduled++ : live++;
      } else {
        live++;
      }
    });

    // Update stats
    const setVal = (id, v) => { const el = _overlayEl.querySelector(`#${id}`); if (el) el.textContent = v; };
    setVal('apStatTotal', total);
    setVal('apStatLive', live);
    setVal('apStatScheduled', scheduled);

    if (!docs.length) {
      box.innerHTML = `<div class="ap-empty"><i class="fa-solid fa-inbox"></i>এখনো কোনো পরীক্ষা যোগ করা হয়নি।</div>`;
      return;
    }

    box.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'ap-exam-list';
    docs.forEach(({ id, data }, idx) => list.appendChild(buildRow(id, data, idx + 1)));
    box.appendChild(list);
  }

  // ---- Build single exam row ----
  function buildRow(id, data, num) {
    const row = document.createElement('div');
    row.className = 'ap-exam-row';
    row.dataset.rowId = id;

    row.innerHTML = `
      <div class="ap-exam-num">${num}</div>
      <div class="ap-exam-body">
        <div class="ap-exam-title">${esc(data.title || '(নাম নেই)')}</div>
        ${data.description ? `<div class="ap-exam-desc">${esc(data.description)}</div>` : ''}
        <a class="ap-exam-link" href="${escAttr(data.link || '#')}" target="_blank" rel="noopener">
          <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:9.5px;margin-right:3px;"></i>${esc(data.link || '')}
        </a>
        ${chipsHtml(data)}
        <div class="ap-inline-edit-wrap"></div>
      </div>
      <div class="ap-exam-actions">
        <button class="ap-icon-btn edit-btn" title="এডিট"><i class="fa-solid fa-pen"></i></button>
        <button class="ap-icon-btn danger del-btn" title="মুছুন"><i class="fa-solid fa-trash"></i></button>
      </div>`;

    row.querySelector('.edit-btn').onclick = () => toggleInlineEdit(id, data, row);
    row.querySelector('.del-btn').onclick = () => deleteExam(id, data.title);
    return row;
  }

  // ---- Inline edit ----
  function toggleInlineEdit(id, data, row) {
    const wrap = row.querySelector('.ap-inline-edit-wrap');

    // If this row is already open, close it
    if (_editingId === id) {
      wrap.innerHTML = '';
      _editingId = null;
      row.querySelector('.edit-btn').innerHTML = '<i class="fa-solid fa-pen"></i>';
      return;
    }

    // Close any other open edit
    const prevRow = _overlayEl.querySelector('[data-row-id]._editing');
    if (prevRow) {
      prevRow.querySelector('.ap-inline-edit-wrap').innerHTML = '';
      prevRow.querySelector('.edit-btn').innerHTML = '<i class="fa-solid fa-pen"></i>';
      prevRow.classList.remove('_editing');
    }

    _editingId = id;
    row.classList.add('_editing');
    row.querySelector('.edit-btn').innerHTML = '<i class="fa-solid fa-xmark"></i>';

    wrap.innerHTML = `
      <div class="ap-inline-edit">
        <div class="ap-inline-edit-title"><i class="fa-solid fa-pen" style="margin-right:5px;"></i>এডিট করুন</div>
        <div class="ap-field">
          <label class="ap-label">পরীক্ষার নাম *</label>
          <input class="ap-input ie-title" type="text" value="${escAttr(data.title || '')}">
        </div>
        <div class="ap-field">
          <label class="ap-label">বিবরণ</label>
          <textarea class="ap-textarea ie-desc">${esc(data.description || '')}</textarea>
        </div>
        <div class="ap-field">
          <label class="ap-label">লিংক *</label>
          <div class="ap-input-group">
            <i class="fa-solid fa-arrow-up-right-from-square ap-input-group-icon"></i>
            <input class="ap-input ie-link" type="url" value="${escAttr(data.link || '')}">
          </div>
        </div>
        <div class="ap-field-row">
          <div class="ap-field">
            <label class="ap-label">সময়সীমা (মিনিট)</label>
            <input class="ap-input ie-dur" type="number" min="1" max="999"
              value="${Number.isFinite(data.durationMinutes) ? data.durationMinutes : ''}">
          </div>
          <div class="ap-field">
            <label class="ap-label">প্রশ্ন সংখ্যা</label>
            <input class="ap-input ie-qc" type="number" min="1" max="999"
              value="${Number.isFinite(data.questionCount) ? data.questionCount : ''}">
          </div>
        </div>
        <div class="ap-field">
          <label class="ap-label">প্রকাশের সময়</label>
          <input class="ap-input ie-pa" type="datetime-local" value="${tsToLocalInput(data.publishAt)}">
        </div>
        <div class="ap-form-actions">
          <button class="ap-btn ap-btn-primary ie-save-btn"><i class="fa-solid fa-check"></i> সংরক্ষণ</button>
          <button class="ap-btn ap-btn-ghost ie-cancel-btn">বাতিল</button>
        </div>
      </div>`;

    wrap.querySelector('.ie-cancel-btn').onclick = () => {
      wrap.innerHTML = '';
      _editingId = null;
      row.classList.remove('_editing');
      row.querySelector('.edit-btn').innerHTML = '<i class="fa-solid fa-pen"></i>';
    };

    wrap.querySelector('.ie-save-btn').onclick = async () => {
      const title = wrap.querySelector('.ie-title').value.trim();
      const description = wrap.querySelector('.ie-desc').value.trim();
      const link = wrap.querySelector('.ie-link').value.trim();
      if (!title || !link) { toast('নাম ও লিংক আবশ্যক', 'err'); return; }
      try { new URL(link); } catch (e) { toast('সঠিক URL দিন', 'err'); return; }

      const durVal = parseInt1to999(wrap.querySelector('.ie-dur').value.trim(), 'সময়সীমা');
      if (durVal === false) return;
      const qcVal = parseInt1to999(wrap.querySelector('.ie-qc').value.trim(), 'প্রশ্ন সংখ্যা');
      if (qcVal === false) return;
      const paVal = localInputToTs(wrap.querySelector('.ie-pa').value);
      if (paVal === false) { toast('সঠিক প্রকাশের সময় দিন', 'err'); return; }

      const update = {
        title, description, link,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      update.durationMinutes = durVal !== null ? durVal : firebase.firestore.FieldValue.delete();
      update.questionCount = qcVal !== null ? qcVal : firebase.firestore.FieldValue.delete();
      update.publishAt = paVal !== null ? paVal : firebase.firestore.FieldValue.delete();

      const saveBtn = wrap.querySelector('.ie-save-btn');
      saveBtn.disabled = true;
      try {
        await _db.collection('exams').doc(id).update(update);
        toast('পরিবর্তন সংরক্ষণ হয়েছে ✓');
      } catch (e) {
        toast('সংরক্ষণ ব্যর্থ: ' + (e.message || ''), 'err');
        saveBtn.disabled = false;
      }
      // Firestore realtime will re-render the row automatically
    };
  }

  // ---- Delete exam ----
  async function deleteExam(id, title) {
    if (!confirm(`"${title || 'এই পরীক্ষাটি'}" মুছে ফেলতে চান? এটি পূর্বাবস্থায় ফেরানো যাবে না।`)) return;
    try {
      await _db.collection('exams').doc(id).delete();
      toast('পরীক্ষাটি মুছে ফেলা হয়েছে');
    } catch (e) {
      toast('মোছা ব্যর্থ হয়েছে', 'err');
    }
  }

  // ---- Start realtime listener ----
  function startListener() {
    if (_examsUnsub) { _examsUnsub(); _examsUnsub = null; }
    _examsUnsub = _db.collection('exams').orderBy('createdAt', 'asc')
      .onSnapshot(
        (snap) => {
          const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
          renderList(docs);
        },
        (err) => {
          const box = _overlayEl && _overlayEl.querySelector('#apExamList');
          if (box) box.innerHTML = `<div class="ap-empty"><i class="fa-solid fa-triangle-exclamation"></i>তালিকা লোড ব্যর্থ: ${esc(err.message || '')}</div>`;
        }
      );
  }

  // ---- Verify admin + show panel ----
  async function verifyAndShow() {
    const user = _auth.currentUser;
    if (!user) { close(); return; }
    _currentUser = user;

    let isAdmin = false;
    try {
      const doc = await _db.collection('admins').doc(user.uid).get();
      isAdmin = doc.exists && doc.data().isAdmin === true;
    } catch (e) { isAdmin = false; }

    if (!isAdmin) { close(); return; }

    const gate = _overlayEl.querySelector('#apGate');
    const body = _overlayEl.querySelector('#apBody');
    const who = _overlayEl.querySelector('#apWho');
    const logoutBtn = _overlayEl.querySelector('#apLogoutBtn');

    if (gate) gate.style.display = 'none';
    if (body) body.style.display = 'flex';
    if (who) { who.textContent = user.email || ''; who.style.display = 'inline'; }
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';

    startListener();
    wireStepNav();
  }

  // ---- Public API ----
  function open() {
    if (typeof firebase === 'undefined' || typeof FIREBASE_CONFIG === 'undefined') return;
    if (typeof fbAuth !== 'undefined') {
      _auth = fbAuth;
    } else {
      try { _auth = firebase.auth(); } catch (e) { return; }
    }
    if (typeof fbDb !== 'undefined') {
      _db = fbDb;
    } else {
      try { _db = firebase.firestore(); } catch (e) { return; }
    }

    injectStyles();

    if (!_mounted) {
      _overlayEl = buildOverlay();
      document.body.appendChild(_overlayEl);
      _mounted = true;

      _overlayEl.querySelector('#apCloseBtn').onclick = close;
      _overlayEl.querySelector('#apLogoutBtn').onclick = async () => {
        await _auth.signOut();
        close();
      };
    }

    // Re-show if already mounted
    _overlayEl.style.display = 'flex';
    requestAnimationFrame(() => _overlayEl.classList.add('ap-visible'));

    verifyAndShow();
  }

  function close() {
    if (!_overlayEl) return;
    _overlayEl.classList.remove('ap-visible');
    setTimeout(() => {
      if (_overlayEl) _overlayEl.style.display = 'none';
      // Reset gate
      const gate = _overlayEl && _overlayEl.querySelector('#apGate');
      const body = _overlayEl && _overlayEl.querySelector('#apBody');
      if (gate) gate.style.display = 'flex';
      if (body) body.style.display = 'none';
    }, 300);

    if (_examsUnsub) { _examsUnsub(); _examsUnsub = null; }
    _editingId = null;
    _currentUser = null;
  }

  return { open, close };
})();
