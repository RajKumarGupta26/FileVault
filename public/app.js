(function () {
"use strict";

const $ = (sel, root=document) => root.querySelector(sel);
const API = '/api';
const TOKEN_KEY = 'filevault_token';
const USER_KEY = 'filevault_user';
const MAX_FILE_SIZE = 250 * 1024 * 1024;

/* ===================== Helpers ===================== */
function toast(msg, isErr=false){
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  $('#toast-stack').appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),300); }, 3200);
}
function formatBytes(bytes){
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes)/Math.log(k));
  return parseFloat((bytes/Math.pow(k,i)).toFixed(1)) + ' ' + sizes[i];
}
function formatDate(ts){
  return new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
}
function fileGlyph(type){
  if (!type) return '📄';
  if (type.startsWith('image/')) return '🖼️';
  if (type.startsWith('video/')) return '🎞️';
  if (type.startsWith('audio/')) return '🎧';
  if (type.includes('pdf')) return '📕';
  if (type.includes('zip') || type.includes('compressed')) return '🗜️';
  return '📄';
}
function escapeHtml(s){ const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function getToken(){ return localStorage.getItem(TOKEN_KEY); }
function getStoredUser(){ try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
function setSession(token, user){
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function clearSession(){
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function api(path, { method='GET', body, isForm=false } = {}){
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (!isForm && body) headers['Content-Type'] = 'application/json';

  const res = await fetch(API + path, {
    method,
    headers,
    body: isForm ? body : (body ? JSON.stringify(body) : undefined)
  });

  let data;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok){
    const msg = (data && data.message) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ===================== Auth screen ===================== */
let authMode = 'login';
const authForm = $('#auth-form');
const dial = $('#dial');

function setAuthMode(mode){
  authMode = mode;
  $('#auth-title').textContent = mode==='login' ? 'Welcome back' : 'Open a new vault';
  $('#auth-sub').textContent = mode==='login' ? 'Enter your credentials to open the vault.' : 'Choose a name and password to get started.';
  $('#auth-submit').textContent = mode==='login' ? 'Unlock vault' : 'Create vault';
  $('#toggle-caption').textContent = mode==='login' ? 'New here?' : 'Already have a vault?';
  $('#toggle-mode').textContent = mode==='login' ? 'Create an account' : 'Sign in instead';
  $('#auth-error').textContent = '';
}
$('#toggle-mode').addEventListener('click', ()=> setAuthMode(authMode==='login' ? 'signup' : 'login'));

function playDial(cb){
  dial.classList.add('spin');
  $('#dial-glyph').textContent = '✓';
  setTimeout(()=>{ dial.classList.remove('spin'); $('#dial-glyph').textContent = 'FV'; cb(); }, 480);
}

authForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const errEl = $('#auth-error');
  errEl.textContent = '';
  const name = $('#in-name').value.trim();
  const password = $('#in-pass').value;

  if (!name || !password){ errEl.textContent = 'Please fill in both fields.'; return; }

  const submitBtn = $('#auth-submit');
  submitBtn.disabled = true;
  try {
    const data = await api(authMode === 'signup' ? '/auth/signup' : '/auth/login', {
      method: 'POST',
      body: { name, password }
    });
    setSession(data.token, data.user);
    playDial(()=>{
      enterApp();
      toast(authMode === 'signup' ? `Vault created — welcome, ${data.user.name}.` : `Welcome back, ${data.user.name}.`);
    });
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

$('#logout-btn').addEventListener('click', ()=>{
  clearSession();
  history.pushState({}, '', '/');
  showAuth();
  toast('Signed out.');
});

/* ===================== Theme ===================== */
function applyTheme(t){
  document.body.setAttribute('data-theme', t);
  localStorage.setItem('filevault_theme', t);
}
applyTheme(localStorage.getItem('filevault_theme') || 'dark');
$('#theme-toggle').addEventListener('click', ()=>{
  applyTheme(document.body.getAttribute('data-theme')==='dark' ? 'light' : 'dark');
});

/* ===================== Upload ===================== */
const dropzone = $('#dropzone');
const fileInput = $('#file-input');
$('#browse-btn').addEventListener('click', ()=> fileInput.click());
dropzone.addEventListener('click', (e)=>{ if (e.target.id==='browse-btn') return; fileInput.click(); });
fileInput.addEventListener('change', ()=> handleFiles(fileInput.files));

['dragenter','dragover'].forEach(evt=>{
  dropzone.addEventListener(evt, (e)=>{ e.preventDefault(); dropzone.classList.add('drag'); });
});
['dragleave','drop'].forEach(evt=>{
  dropzone.addEventListener(evt, (e)=>{ e.preventDefault(); dropzone.classList.remove('drag'); });
});
dropzone.addEventListener('drop', (e)=>{
  if (e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

async function handleFiles(fileList){
  const form = new FormData();
  let anyValid = false;
  for (const file of Array.from(fileList)){
    if (file.size > MAX_FILE_SIZE){
      toast(`"${file.name}" exceeds the 250 MB limit.`, true);
      continue;
    }
    form.append('files', file);
    anyValid = true;
  }
  fileInput.value = '';
  if (!anyValid) return;

  try {
    await api('/files/upload', { method:'POST', body: form, isForm:true });
    toast('Files deposited.');
    refreshGrid();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ===================== Dashboard ===================== */
async function refreshGrid(){
  const user = getStoredUser();
  if (!user) return;
  $('#greeting').textContent = user.name + "'s vault";

  let files;
  try {
    const data = await api('/files');
    files = data.data;
  } catch (err) {
    if (err.status === 401){ clearSession(); showAuth(); }
    toast(err.message, true);
    return;
  }

  const grid = $('#file-grid');
  const empty = $('#empty-state');
  grid.innerHTML = '';
  empty.classList.toggle('hidden', files.length>0);

  const used = files.reduce((s,f)=>s+f.size,0);
  $('#quota-text').textContent = `${formatBytes(used)} of 1 GB used`;
  $('#quota-fill').style.width = Math.min(100, (used/(1024*1024*1024))*100) + '%';

  files.forEach(f=>{
    const card = document.createElement('div');
    card.className = 'file-card';
    card.innerHTML = `
      <div class="file-top">
        <div class="file-icon">${fileGlyph(f.mimeType)}</div>
        <div>
          <div class="file-name">${escapeHtml(f.originalName)}</div>
          <div class="file-meta mono">${formatBytes(f.size)} · ${formatDate(f.createdAt)}</div>
        </div>
      </div>
      <div class="file-actions">
        <button data-act="download">⭳ Get</button>
        <button data-act="share">🔗 Share</button>
        <button data-act="delete">🗑 Del</button>
      </div>
    `;
    card.querySelector('[data-act="download"]').addEventListener('click', ()=>downloadFile(f.id, f.originalName));
    card.querySelector('[data-act="share"]').addEventListener('click', ()=>openShareModal(f.id));
    card.querySelector('[data-act="delete"]').addEventListener('click', ()=>deleteFile(f.id));
    grid.appendChild(card);
  });
}

async function downloadFile(id, name){
  try {
    const res = await fetch(`${API}/files/${id}/download`, {
      headers: { Authorization: 'Bearer ' + getToken() }
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Download started.');
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteFile(id){
  if (!confirm('Delete this file permanently?')) return;
  try {
    await api(`/files/${id}`, { method:'DELETE' });
    toast('File deleted.');
    refreshGrid();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ===================== Share modal ===================== */
async function openShareModal(id){
  let data;
  try {
    data = await api(`/files/${id}/share`, { method:'POST', body:{} });
  } catch (err) {
    toast(err.message, true);
    return;
  }
  renderShareModal(id, data.data);
}

function renderShareModal(id, info){
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="seal">🔗</div>
      <h3 style="text-align:center">Share "${escapeHtml(info.originalName)}"</h3>
      <p class="sub" style="text-align:center">Anyone with this link or QR code can view and download it — on any device.</p>
      <div class="qr-box"><img src="${info.qrDataUrl}" alt="QR code for share link"></div>
      <div class="link-row">
        <input class="field mono" id="share-link-input" readonly value="${info.shareUrl}">
        <button class="btn btn-primary" id="copy-link-btn">Copy</button>
      </div>

      <div class="divider-or">or share this code</div>
      <div class="access-code-display">
        <div class="code-label">Access code</div>
        <div class="code-value" id="share-code-value">${info.shareCode ? info.shareCode.slice(0,3) + ' ' + info.shareCode.slice(3) : '—'}</div>
      </div>
      <button class="btn" style="width:100%" id="copy-code-btn">Copy code</button>
      <div style="margin-top:14px;">
        <label class="field-label">Expire after</label>
        <select class="field" id="expire-select">
          <option value="">Never</option>
          <option value="1">1 hour</option>
          <option value="24">24 hours</option>
          <option value="168">7 days</option>
        </select>
      </div>
      <div style="margin-top:14px;">
        <label class="field-label">Optional password</label>
        <input class="field" id="share-password-input" type="password" placeholder="Leave blank for no password">
      </div>
      <div class="modal-row">
        <button class="btn btn-ghost" id="revoke-btn">Revoke link</button>
        <button class="btn btn-primary" id="apply-share-btn">Update</button>
      </div>
      <div class="modal-row" style="margin-top:8px;">
        <button class="btn" id="close-share-btn" style="width:100%">Done</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  $('#copy-link-btn', backdrop).addEventListener('click', ()=>{
    navigator.clipboard.writeText(info.shareUrl).then(()=>toast('Link copied.')).catch(()=>toast('Could not copy — select and copy manually.', true));
  });
  $('#copy-code-btn', backdrop).addEventListener('click', ()=>{
    if (!info.shareCode) return;
    navigator.clipboard.writeText(info.shareCode).then(()=>toast('Code copied.')).catch(()=>toast('Could not copy — select and copy manually.', true));
  });
  $('#apply-share-btn', backdrop).addEventListener('click', async ()=>{
    const hrs = $('#expire-select', backdrop).value;
    const password = $('#share-password-input', backdrop).value;
    try {
      const data = await api(`/files/${id}/share`, {
        method:'POST',
        body:{ expiresInHours: hrs || undefined, password: password || undefined }
      });
      toast('Share settings updated.');
      backdrop.remove();
      renderShareModal(id, data.data);
    } catch (err) {
      toast(err.message, true);
    }
  });
  $('#revoke-btn', backdrop).addEventListener('click', async ()=>{
    try {
      await api(`/files/${id}/share`, { method:'DELETE' });
      toast('Share link revoked.');
      backdrop.remove();
    } catch (err) {
      toast(err.message, true);
    }
  });
  $('#close-share-btn', backdrop).addEventListener('click', ()=> backdrop.remove());
  backdrop.addEventListener('click', (e)=>{ if (e.target===backdrop) backdrop.remove(); });
}

/* ===================== Access-code entry (receiver side) ===================== */
function openCodeEntryModal(){
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="seal">🔢</div>
      <h3 style="text-align:center">Enter access code</h3>
      <p class="sub" style="text-align:center">Type the 6-digit code someone shared with you.</p>
      <input class="field code-digit-field" id="code-entry-input" maxlength="6" inputmode="numeric" placeholder="482913" autofocus>
      <div class="form-error" id="code-entry-error" style="text-align:center; margin-top:8px;"></div>
      <div class="modal-row" style="margin-top:18px;">
        <button class="btn btn-ghost" id="code-entry-cancel">Cancel</button>
        <button class="btn btn-primary" id="code-entry-submit">Find file</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const input = $('#code-entry-input', backdrop);
  input.focus();
  input.addEventListener('input', ()=>{
    input.value = input.value.replace(/\D/g,'').slice(0,6);
  });

  async function submitCode(){
    const code = input.value.trim();
    const errEl = $('#code-entry-error', backdrop);
    errEl.textContent = '';
    if (code.length !== 6){ errEl.textContent = 'Enter all 6 digits.'; return; }

    try {
      const data = await api(`/share/code/${code}`);
      backdrop.remove();
      renderCodeResultModal(code, data.data);
    } catch (err) {
      errEl.textContent = err.message;
    }
  }
  $('#code-entry-submit', backdrop).addEventListener('click', submitCode);
  input.addEventListener('keydown', (e)=>{ if (e.key==='Enter') submitCode(); });
  $('#code-entry-cancel', backdrop).addEventListener('click', ()=> backdrop.remove());
  backdrop.addEventListener('click', (e)=>{ if (e.target===backdrop) backdrop.remove(); });
}

function renderCodeResultModal(code, info){
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="seal">${fileGlyph(info.mimeType)}</div>
      <h3 style="text-align:center">${escapeHtml(info.originalName)}</h3>
      <p class="sub" style="text-align:center">${formatBytes(info.size)} · shared by ${escapeHtml(info.uploadedBy)}</p>
      ${info.hasPassword ? `
        <div style="margin-bottom:14px;">
          <label class="field-label">This file is password protected</label>
          <input class="field" id="code-dl-password" type="password" placeholder="Enter password">
        </div>` : ''}
      <button class="btn btn-primary" style="width:100%" id="code-download-btn">⭳ Download file</button>
      <div class="modal-row" style="margin-top:10px;">
        <button class="btn btn-ghost" style="width:100%" id="code-result-close">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  $('#code-download-btn', backdrop).addEventListener('click', async ()=>{
    const password = info.hasPassword ? ($('#code-dl-password', backdrop) || {}).value : undefined;
    try {
      const res = await fetch(`${API}/share/code/${code}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok){
        const data = await res.json().catch(()=>({}));
        throw new Error(data.message || 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = info.originalName;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast('Download started.');
    } catch (err) {
      toast(err.message, true);
    }
  });
  $('#code-result-close', backdrop).addEventListener('click', ()=> backdrop.remove());
  backdrop.addEventListener('click', (e)=>{ if (e.target===backdrop) backdrop.remove(); });
}

const codeEntryAuthBtn = document.getElementById('open-code-entry-auth');
if (codeEntryAuthBtn) codeEntryAuthBtn.addEventListener('click', openCodeEntryModal);
const codeEntryAppBtn = document.getElementById('open-code-entry-app');
if (codeEntryAppBtn) codeEntryAppBtn.addEventListener('click', openCodeEntryModal);

/* ===================== Public share screen ===================== */
async function renderShareScreen(shareId){
  $('#auth-screen').classList.add('hidden');
  $('#app-screen').classList.add('hidden');
  $('#share-screen').classList.remove('hidden');
  const card = $('#share-card');
  card.innerHTML = `<div class="spinner"></div>`;

  let info;
  try {
    const data = await api(`/share/${shareId}`);
    info = data.data;
  } catch (err) {
    card.innerHTML = `
      <div style="text-align:center">
        <div class="seal" style="background:linear-gradient(135deg,var(--danger),#a34038)">✕</div>
        <h3>Link unavailable</h3>
        <p class="sub">${escapeHtml(err.message)}</p>
      </div>
    `;
    return;
  }

  card.innerHTML = `
    <div class="brand" style="margin-bottom:18px"><div class="brand-mark">FV</div><div class="brand-name">FileVault</div></div>
    <div style="display:flex; gap:14px; align-items:center; background:var(--panel-2); border:1px solid var(--steel); border-radius:12px; padding:16px; margin-bottom:20px;">
      <div class="file-icon">${fileGlyph(info.mimeType)}</div>
      <div>
        <div class="file-name">${escapeHtml(info.originalName)}</div>
        <div class="file-meta mono">${formatBytes(info.size)} · shared by ${escapeHtml(info.uploadedBy)}</div>
      </div>
    </div>
    ${info.hasPassword ? `
      <div style="margin-bottom:14px;">
        <label class="field-label">This file is password protected</label>
        <input class="field" id="share-dl-password" type="password" placeholder="Enter password">
      </div>` : ''}
    <button class="btn btn-primary" style="width:100%" id="public-download-btn">⭳ Download file</button>
    <p class="sub" style="text-align:center; margin-top:14px; font-size:11px;">Downloaded ${info.downloadCount} time${info.downloadCount===1?'':'s'}.</p>
  `;

  $('#public-download-btn', card).addEventListener('click', async ()=>{
    const password = info.hasPassword ? ($('#share-dl-password', card) || {}).value : undefined;
    try {
      const res = await fetch(`${API}/share/${shareId}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok){
        const data = await res.json().catch(()=>({}));
        throw new Error(data.message || 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = info.originalName;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast('Download started.');
    } catch (err) {
      toast(err.message, true);
    }
  });
}

/* ===================== Routing / bootstrap ===================== */
function enterApp(){
  $('#auth-screen').classList.add('hidden');
  $('#share-screen').classList.add('hidden');
  $('#app-screen').classList.remove('hidden');
  refreshGrid();
}
function showAuth(){
  setAuthMode('login');
  $('#app-screen').classList.add('hidden');
  $('#share-screen').classList.add('hidden');
  $('#auth-screen').classList.remove('hidden');
}

function boot(){
  const path = window.location.pathname;
  const shareMatch = path.match(/^\/share\/([A-Za-z0-9_-]+)/);
  if (shareMatch){
    renderShareScreen(shareMatch[1]);
    return;
  }
  const token = getToken();
  const user = getStoredUser();
  if (token && user) enterApp(); else showAuth();
}

boot();

})();
