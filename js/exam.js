// ---------- পরীক্ষা (Exam) — full-page realtime exam-link list ----------
// Admin adds/edits/deletes exam links from admin.html (Firestore `exams`
// collection). This file only READS that collection in realtime and shows
// each link to normal users on its own bottom-nav page (view-exam) — no
// admin controls live in the main app at all, so a regular visitor can
// never see or touch anything admin-only.
// Firestore security is enforced server-side in firestore.rules
// (`allow write: if isAdmin()` on the `exams` collection) — anything here
// is only for the UI.
//
// ---- Admin button (admins/{uid}) ----
// Same check admin.html itself uses: a signed-in user counts as admin only
// if their own admins/{uid} Firestore doc exists AND has isAdmin:true (see
// firestore.rules `isAdmin()`; that doc can only be added/removed manually
// from the Firebase Console). Verified fresh each time this page is opened
// so promoting/demoting someone in the Console takes effect on their very
// next visit — cached per uid within the session so repeat visits don't
// re-query Firestore needlessly, and reset the moment the signed-in user
// changes (sign-out, or a different account signs in).

let examUnsub = null;
let examListCache = [];
let examListenerStarted = false;
let examAdminCheckedUid = null; // uid the last admin check was run for
let examIsAdminCache = false;

// Called once from js/app.js during startup. The listener is opened right
// away (not only when the tab is first tapped) so the page is already
// populated the instant someone switches to it — same as how the surah
// list is fetched once up front instead of on first tab-open.
function initExam(){
  startExamRealtime();
  const adminBtn = document.getElementById('examAdminBtn');
  if(adminBtn) adminBtn.onclick = () => window.open('admin.html', '_blank', 'noopener');
}

// Called every time the "পরীক্ষা" tab (bottom nav or drawer) is opened.
function onExamViewOpened(){
  const container = document.getElementById('examListContainer');
  if(!container) return;
  if(examListenerStarted) renderExamList(container);
  else startExamRealtime();
  checkExamAdminStatus();
}

// Verifies (or re-uses a cached verification of) admins/{uid} for whoever
// is currently signed in, and shows/hides the "এডমিন প্যানেল" button
// accordingly — never shown to a signed-out visitor or a regular account.
async function checkExamAdminStatus(){
  const btn = document.getElementById('examAdminBtn');
  if(!btn) return;
  const user = (typeof state !== 'undefined') ? state.user : null;

  if(!user){
    examAdminCheckedUid = null;
    examIsAdminCache = false;
    btn.style.display = 'none';
    return;
  }

  // Already verified this exact account this session — just apply it.
  if(examAdminCheckedUid === user.uid){
    btn.style.display = examIsAdminCache ? 'flex' : 'none';
    return;
  }

  btn.style.display = 'none'; // hide while (re-)verifying, never flash a wrong state
  if(typeof fbDb === 'undefined' || !fbDb || !firebaseReady) return; // Firebase not ready yet — next visit/refresh will re-check

  try{
    const doc = await fbDb.collection('admins').doc(user.uid).get();
    examIsAdminCache = doc.exists && doc.data().isAdmin === true;
  }catch(e){
    examIsAdminCache = false;
  }
  examAdminCheckedUid = user.uid;

  // The signed-in account may have changed while the query was in flight
  // (e.g. a quick sign-out) — only apply the result if it's still current.
  const stillSameUser = (typeof state !== 'undefined') && state.user && state.user.uid === user.uid;
  if(stillSameUser) btn.style.display = examIsAdminCache ? 'flex' : 'none';
}

function startExamRealtime(){
  const container = document.getElementById('examListContainer');
  if(!container) return;

  if(typeof fbDb === 'undefined' || !fbDb || !firebaseReady){
    // Firebase not ready yet (e.g. still loading on first paint) — retry
    // shortly instead of showing a false "failed" message.
    if(!examListenerStarted) setTimeout(startExamRealtime, 800);
    return;
  }
  if(examUnsub) return; // already listening

  examListenerStarted = true;
  examUnsub = fbDb.collection('exams').orderBy('createdAt', 'desc')
    .onSnapshot(
      (snap) => {
        examListCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderExamList(container);
      },
      (err) => {
        console.warn('Exam list listener failed:', err);
        container.innerHTML = `<div class="error-box">পরীক্ষার তালিকা লোড করা যায়নি।<br><button onclick="startExamRealtimeRetry()">আবার চেষ্টা করুন</button></div>`;
      }
    );
}

function startExamRealtimeRetry(){
  if(examUnsub){ examUnsub(); examUnsub = null; }
  examListenerStarted = false;
  startExamRealtime();
}

// Modern "exam card" list — replaces the old generic .list-item rendering.
// Each card shows, when the admin set them on the exam doc, the exam's
// duration (durationMinutes) and question count (questionCount) as small
// info chips, so a student knows what they're getting into before tapping.
function renderExamList(container){
  if(!examListCache.length){
    container.innerHTML = `<div class="error-box">এখন কোনো পরীক্ষা চালু নেই। নতুন পরীক্ষা যোগ হলে এখানেই দেখা যাবে।</div>`;
    return;
  }
  container.innerHTML = '';
  examListCache.forEach(exam => {
    const card = document.createElement('div');
    card.className = 'exam-card';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;

    const chips = [];
    if(Number.isFinite(exam.durationMinutes)){
      chips.push(`<span class="exam-chip"><i class="fa-regular fa-clock"></i> ${exam.durationMinutes} মিনিট</span>`);
    }
    if(Number.isFinite(exam.questionCount)){
      chips.push(`<span class="exam-chip"><i class="fa-solid fa-list-ol"></i> ${exam.questionCount} টি প্রশ্ন</span>`);
    }

    card.innerHTML = `
      <div class="exam-card-icon"><i class="fa-solid fa-pen-to-square"></i></div>
      <div class="exam-card-body">
        <div class="exam-card-title">${escapeHtml(exam.title || 'পরীক্ষা')}</div>
        ${exam.description ? `<div class="exam-card-desc">${escapeHtml(exam.description)}</div>` : ''}
        ${chips.length ? `<div class="exam-card-meta">${chips.join('')}</div>` : ''}
      </div>
      <div class="exam-card-cta"><i class="fa-solid fa-arrow-right"></i></div>`;

    const open = () => { if(exam.link) window.open(exam.link, '_blank', 'noopener'); };
    card.onclick = open;
    card.onkeydown = (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); } };
    container.appendChild(card);
  });
}
