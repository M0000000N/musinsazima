const $ = id => document.getElementById(id);
const state = { config: { extensionId: 'emlpgnbgpnonhkoonamfmhefboaddpak', version: '0.4.2', extensionDownloadUrl: './downloads/Musinsazima-extension-0.4.2.zip' }, connected: false, connecting: true, status: null, policies: [], policiesLoaded: false, busy: false, refreshing: false, revision: 0, editing: false, preferencesInitialized: false, connectAttempted: false, scheduleDirty: false, updatedAt: null };
const setupSteps = ['install', 'connect', 'consent', 'preferences'];
const dateFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
let statusTimer;
let toastTimer;
class ExtensionUnavailable extends Error {}
function bridge(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const runtime = window.chrome?.runtime;
    if (!runtime || typeof runtime.sendMessage !== 'function' || !/^[a-p]{32}$/.test(state.config.extensionId)) { reject(new ExtensionUnavailable('확장 프로그램이 연결되지 않았습니다. 설치 후 다시 확인해 주세요.')); return; }
    let settled = false;
    const finish = (error, data) => { if (settled) return; settled = true; clearTimeout(timeout); error ? reject(error) : resolve(data); };
    const timeout = setTimeout(() => finish(new ExtensionUnavailable('확장 프로그램의 응답이 없습니다. 설치 상태를 확인하고 다시 시도해 주세요.')), action === 'connect' ? 25_000 : 10_000);
    try {
      runtime.sendMessage(state.config.extensionId, { type: 'musinsazima-web', requestId: crypto.randomUUID(), action, payload }, response => {
        if (runtime.lastError) { finish(new ExtensionUnavailable('확장 프로그램이 연결되지 않았습니다. 설치 후 다시 확인해 주세요.')); return; }
        if (!response || typeof response.ok !== 'boolean') { finish(new ExtensionUnavailable('확장 프로그램의 응답을 확인하지 못했습니다. 최신 파일로 다시 설치해 주세요.')); return; }
        if (!response.ok) { finish(new Error(typeof response.error === 'string' && response.error.length <= 300 ? response.error : '요청을 처리하지 못했습니다. 다시 확인해 주세요.')); return; }
        finish(null, response.data);
      });
    } catch { finish(new ExtensionUnavailable('확장 프로그램에 연결하지 못했습니다. 설치 후 페이지를 새로 열어 주세요.')); }
  });
}
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500); }
const jobActive = () => ['queued', 'running'].includes(state.status?.applicationJob?.status);
function versionParts(value) { return typeof value === 'string' && /^\d{1,5}(?:\.\d{1,5}){2,3}$/.test(value) ? value.split('.').map(Number) : null; }
function newerVersion(latest, installed) {
  const a = versionParts(latest); const b = versionParts(installed); if (!a || !b) return false;
  for (let index = 0; index < Math.max(a.length, b.length); index++) { if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0); }
  return false;
}
function renderVersion() {
  const reported = state.status?.version || state.status?.features?.version;
  const installed = state.connected && versionParts(reported) ? reported : null;
  $('app-version').textContent = installed ? `설치 ${installed}` : state.connected ? '확장 연결됨' : `최신 ${state.config.version}`;
  $('app-version').title = `다운로드 가능한 최신 버전: ${state.config.version}`;
  $('extension-update').hidden = !installed || !newerVersion(state.config.version, installed);
  $('extension-update-title').textContent = `확장 프로그램 ${state.config.version} 업데이트가 있습니다.`;
  $('extension-update-version').textContent = installed ? `현재 설치된 버전: ${installed}` : '';
  $('extension-update-running').hidden = !jobActive();
}
function jobMessage(value) { return typeof value === 'string' && value.length <= 300 && !/[\r\n]|(?:chrome-extension|file):\/\/|\bat\s+\S+\s*\(/.test(value) ? value.trim() : ''; }
function stage() {
  if (state.connecting && !state.status) return 'loading';
  if (!state.connected || !state.status) return 'install';
  if (state.editing) return 'preferences';
  if (state.status.onboarding?.completed) return 'dashboard';
  if (!state.status.session?.authenticated) return 'connect';
  return state.status.onboarding?.consentAccepted ? 'preferences' : 'consent';
}
function render() {
  const current = stage();
  document.body.classList.toggle('editing-preferences', state.editing);
  renderVersion();
  $('extension-state').classList.toggle('connected', state.connected);
  $('extension-state-text').textContent = state.connecting ? '연결 확인 중' : state.connected ? '브라우저 연결됨' : '연결 필요';
  $('setup-layout').hidden = current === 'dashboard';
  $('dashboard').hidden = current !== 'dashboard';
  if (current === 'dashboard') { renderDashboard(); scheduleStatus(); return; }
  const previous = $('setup-layout').dataset.stage;
  $('setup-layout').dataset.stage = current;
  const copy = {
    loading: ['연결 확인 중', '시작 준비를 확인하고 있습니다.', '잠시만 기다려 주세요.'],
    install: ['1 / 4 · 확장 프로그램 연결', '이 브라우저에 신청 도우미를 연결해요.', '확장 프로그램을 설치하면 이 페이지에서 신청을 관리할 수 있습니다.'],
    connect: ['2 / 4 · 무신사 계정 확인', '평소 쓰는 무신사 계정을 연결해 주세요.', '현재 브라우저에서 로그인한 무신사 계정으로 신청합니다.'],
    consent: ['3 / 4 · 필수 이용 동의', '신청에 필요한 동의를 확인해 주세요.', '아래 정책은 각 체험단의 실제 신청에 적용됩니다.'],
    preferences: state.editing ? ['나의 신청 조건', '사이즈와 배송 요청을 바꿔 주세요.', '다음 신청부터 저장한 조건을 사용합니다.'] : ['4 / 4 · 사이즈·배송 설정', '나에게 맞는 신청 조건을 정해 주세요.', '저장한 우선순위대로 사이즈를 고르고, 마감이 가까운 순서로 신청합니다.'],
  };
  const texts = copy[current];
  $('setup-step-label').textContent = texts[0]; $('setup-title').textContent = texts[1]; $('setup-description').textContent = texts[2];
  for (const step of setupSteps) $(`${step}-screen`).hidden = step !== current;
  for (const item of document.querySelectorAll('[data-progress]')) {
    const index = setupSteps.indexOf(item.dataset.progress); const active = setupSteps.indexOf(current);
    item.classList.toggle('current', index === active); item.classList.toggle('finished', active > index);
    if (index === active) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
  }
  $('detect-extension').disabled = state.busy || state.refreshing;
  $('detect-extension').textContent = state.refreshing ? '연결을 확인하고 있습니다…' : '설치했어요 · 연결 확인';
  $('connect-musinsa').disabled = state.busy;
  $('connect-musinsa').textContent = state.busy ? '무신사 연결을 확인하고 있습니다…' : state.connectAttempted ? '로그인했어요 · 연결 확인' : '무신사 계정 연결 확인 ↗';
  $('connect-help').textContent = state.connectAttempted ? '열린 무신사 탭에서 로그인한 뒤 이 버튼을 다시 눌러 주세요.' : '';
  $('consent-next').disabled = state.busy || !$('setup-consent').checked || !state.policiesLoaded;
  $('setup-consent').disabled = state.busy;
  if (current === 'preferences' && !state.preferencesInitialized) populatePreferences();
  $('cancel-preferences').hidden = !state.editing; $('cancel-preferences').disabled = state.busy;
  $('save-preferences').disabled = state.busy;
  for (const input of $('preferences-screen').querySelectorAll('input,select')) input.disabled = state.busy;
  $('save-preferences').textContent = state.busy ? '설정을 저장하고 있습니다…' : state.editing ? '조건 저장' : '저장하고 자동 신청 켜기';
  $('pref-start-note').textContent = state.editing ? '다음 신청부터 변경한 조건을 적용합니다.' : '저장하면 자동 신청이 켜집니다. 매일 자동 신청하려면 브라우저와 컴퓨터가 켜져 있어야 합니다.';
  if (previous && previous !== current && current !== 'loading') $('setup-title').focus({ preventScroll: true });
  scheduleStatus();
}
function renderDashboard() {
  const status = state.status; const settings = status.settings; const active = jobActive(); const consent = settings.applicationConsent === true;
  $('automation-badge').textContent = settings.enabled ? '자동 신청 켜짐' : '일시 중지'; $('automation-badge').className = `badge ${settings.enabled ? '' : 'neutral'}`;
  $('automation-dot').className = `state-dot ${settings.enabled ? 'active' : ''}`;
  $('automation-title').textContent = active ? status.applicationJob.status === 'queued' ? '신청 시작 대기 중' : '신청 진행 중' : settings.enabled ? '다음 점검 대기 중' : '자동 신청 일시 중지';
  $('automation-description').textContent = !status.session?.authenticated ? '무신사 연결을 다시 확인해 주세요.' : !consent ? '필수 동의를 켜면 자동 신청을 사용할 수 있습니다.' : settings.enabled ? '저장한 조건으로 매일 오전 10시에 신청합니다.' : '조건은 저장되어 있습니다. 다시 켜면 적용됩니다.';
  $('toggle-automation').textContent = settings.enabled ? '자동 신청 일시 중지' : '자동 신청 다시 시작';
  $('toggle-automation').disabled = state.busy || (!settings.enabled && (!consent || !status.session?.authenticated));
  const count = Number($('apply-count').value);
  $('apply-button').textContent = Number.isSafeInteger(count) && count >= 1 && count <= 100 ? `지금 바로 ${count}개 신청하기` : '지금 바로 신청하기';
  const ready = settings.enabled && consent && status.session?.authenticated && status.readiness?.liveReady !== false;
  $('apply-button').disabled = state.busy || active || !ready; $('apply-count').disabled = state.busy || active;
  $('stop-job').hidden = !active; $('stop-job').disabled = state.busy;
  $('refresh-status').disabled = state.refreshing || state.busy;
  $('save-schedule').disabled = state.busy;
  if (!state.scheduleDirty) $('schedule-count').value = settings.scheduledApplicationTarget ?? 100;
  $('schedule-description').textContent = `매일 최대 ${settings.scheduledApplicationTarget ?? 100}개 · 한국 시간 · 마감 임박순`;
  $('consent-toggle').checked = consent; $('consent-toggle').disabled = state.busy || (!consent && (!status.session?.authenticated || !state.policiesLoaded));
  $('consent-summary').textContent = consent ? '필수 동의 켜짐 · 신청할 때 자동으로 체크합니다.' : '필수 동의 꺼짐 · 자동 신청이 중지되었습니다.';
  $('musinsa-connected').textContent = status.session?.authenticated ? '정상' : '확인 필요'; $('musinsa-connected').className = `badge ${status.session?.authenticated ? '' : 'warning'}`;
  $('reconnect-musinsa').disabled = state.busy || active;
  $('session-help').textContent = status.session?.authenticated ? '이 브라우저에 로그인한 무신사 계정을 사용합니다.' : '무신사에서 로그인한 뒤 연결 확인을 눌러 주세요.';
  $('edit-preferences').disabled = state.busy;
  const rows = [['배송 요청사항', settings.deliveryRequest || '선택 안 함'], ['신발', (settings.shoeSizes || []).join(' → ')], ['상의·기타 의류', (settings.clothingSizes || []).join(' → ')], ['여성·공용 하의', (settings.womenBottomSizes || []).join(' → ')], ['남성 하의', (settings.menBottomSizes || []).join(' → ')], ['프리 사이즈', settings.allowFreeSize ? '단일 FREE 옵션 허용' : '허용하지 않음'], ['신청 카테고리', selectedCategoryNames(settings).join(' · ')]];
  const fragment = document.createDocumentFragment();
  for (const [name, value] of rows) { const row = document.createElement('div'); const term = document.createElement('dt'); term.textContent = name; const detail = document.createElement('dd'); detail.textContent = value; row.append(term, detail); fragment.append(row); }
  $('conditions-list').replaceChildren(fragment);
  const job = status.applicationJob; const output = $('job-message'); output.hidden = !job; output.className = 'job-message';
  if (job) {
    const confirmed = Number.isSafeInteger(job.confirmed) && job.confirmed >= 0 ? job.confirmed : 0;
    const message = jobMessage(job.message);
    if (job.status === 'queued') output.textContent = `${job.target}개 신청을 기다리고 있습니다.`;
    else if (job.status === 'running') output.textContent = `${job.target}개 중 ${confirmed}개 신청 완료 · 진행 중${message ? `\n${message}` : ''}`;
    else if (job.status === 'completed') output.textContent = job.exhausted ? `${confirmed}개 신청 완료. 더 이상 신청 가능한 목록이 없습니다.` : `${confirmed}개 신청을 완료했습니다.${confirmed < job.target && message ? ` ${message}` : ''}`;
    else if (['stopped', 'failed'].includes(job.status)) { output.textContent = `${confirmed}개 신청 후 중지되었습니다.${message ? ` ${message}` : ' 무신사 연결을 확인해 주세요.'}`; output.classList.add('warning'); }
    else output.hidden = true;
  }
  $('updated-at').textContent = state.updatedAt ? `최근 확인 ${dateFormat.format(state.updatedAt)}` : '';
}
function selectedCategoryNames(settings) { return [['shoes', '신발'], ['clothing', '의류'], ['other', '가방·소품·뷰티·기타']].filter(([key]) => !(settings.excludedCategories || []).includes(key)).map(([, name]) => name); }
function scheduleStatus() {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { if (!document.hidden && !state.busy) void refreshStatus(); else scheduleStatus(); }, jobActive() ? 5000 : 20_000);
}
async function loadPolicies() {
  if (state.policiesLoaded || !state.connected) return;
  const response = await bridge('policies');
  const policies = Array.isArray(response?.policies) ? response.policies : [];
  const safe = policies.map(policy => {
    try {
      const url = new URL(policy.href, location.href); const base = new URL('./policies/', location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith(base.pathname) || url.search || url.hash || !/^[a-z0-9_.-]+$/i.test(url.pathname.slice(base.pathname.length))) return null;
      if (typeof policy.title !== 'string' || !policy.title.trim() || policy.title.length > 160) return null;
      return { title: policy.title, href: url.href };
    } catch { return null; }
  }).filter(Boolean);
  state.policiesLoaded = safe.length === 4;
  state.policies = safe;
  for (const target of ['setup-policies', 'dashboard-policies']) {
    const fragment = document.createDocumentFragment();
    for (const policy of safe) { const row = document.createElement('li'); const link = document.createElement('a'); link.textContent = policy.title; link.href = policy.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true'); link.append(arrow); row.append(link); fragment.append(row); }
    $(target).replaceChildren(fragment);
  }
  if (!state.policiesLoaded) throw new Error('필수 정책을 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.');
}
async function refreshStatus(manual = false) {
  if (state.refreshing || state.busy) return;
  state.refreshing = true; const revision = state.revision; render();
  try {
    const status = await bridge('status');
    if (!status?.settings) throw new Error('신청 설정을 불러오지 못했습니다. 다시 확인해 주세요.');
    if (revision !== state.revision) return;
    state.status = status; state.connected = true; state.connecting = false; state.updatedAt = new Date();
    $('error-banner').hidden = true; $('setup-error').textContent = '';
    await loadPolicies();
    if (manual) toast('브라우저 연결을 확인했습니다.');
  } catch (error) {
    state.connecting = false;
    if (error instanceof ExtensionUnavailable) { state.connected = false; if (manual) $('setup-error').textContent = error.message; }
    else { $('setup-error').textContent = error.message; $('error-banner').textContent = error.message; $('error-banner').hidden = false; }
  } finally { state.refreshing = false; render(); }
}
async function mutate(action, payload) {
  if (state.busy) return false;
  state.busy = true; state.revision++; render();
  try {
    await bridge(action, payload);
    const status = await bridge('status'); if (!status?.settings) throw new Error('저장 후 상태를 확인하지 못했습니다. 새로고침해 주세요.');
    state.status = status; state.connected = true; state.updatedAt = new Date(); $('error-banner').hidden = true;
    return true;
  } catch (error) { if (error instanceof ExtensionUnavailable) state.connected = false; throw error; }
  finally { state.busy = false; render(); }
}
function populatePreferences() {
  const settings = state.status?.settings; if (!settings) return;
  for (const [id, key] of [['pref-shoes', 'shoeSizes'], ['pref-clothing', 'clothingSizes'], ['pref-women-bottoms', 'womenBottomSizes'], ['pref-men-bottoms', 'menBottomSizes']]) $(id).value = (settings[key] || []).join(', ');
  const delivery = settings.deliveryRequest || ''; const select = $('pref-delivery');
  for (const option of [...select.options]) if (option.dataset.saved) option.remove();
  if (delivery && ![...select.options].some(option => option.value === delivery)) { const option = new Option(delivery, delivery); option.dataset.saved = 'true'; select.append(option); }
  select.value = delivery;
  $('pref-free').checked = settings.allowFreeSize === true;
  for (const category of ['shoes', 'clothing', 'other']) $(`pref-category-${category}`).checked = !(settings.excludedCategories || []).includes(category);
  $('pref-count').value = settings.scheduledApplicationTarget ?? 100;
  state.preferencesInitialized = true;
}
function sizes(id, label, shoes = false) {
  const values = [...new Set($(id).value.split(/[,，\n→]+/).map(value => value.trim().toUpperCase()).filter(Boolean))];
  if (!values.length || values.length > 6 || values.some(value => value.length > 16 || (shoes && !/^\d{3}$/.test(value)))) throw new Error(`${label} 사이즈를 확인해 주세요. 쉼표로 구분해 최대 6개까지 입력할 수 있습니다.`);
  return values;
}
function count(id) { const value = Number($(id).value); if (!Number.isSafeInteger(value) || value < 1 || value > 100) throw new Error('신청 개수는 1~100 사이의 정수로 입력해 주세요.'); return value; }
function preferences() {
  if (!$('pref-delivery').value) throw new Error('배송 요청사항을 선택해 주세요.');
  const excludedCategories = ['kids', ...['shoes', 'clothing', 'other'].filter(category => !$(`pref-category-${category}`).checked)];
  if (['shoes', 'clothing', 'other'].every(category => excludedCategories.includes(category))) throw new Error('신청할 카테고리를 하나 이상 선택해 주세요.');
  return { shoeSizes: sizes('pref-shoes', '신발', true), clothingSizes: sizes('pref-clothing', '상의·기타 의류'), womenBottomSizes: sizes('pref-women-bottoms', '여성·공용 하의'), menBottomSizes: sizes('pref-men-bottoms', '남성 하의'), allowFreeSize: $('pref-free').checked, deliveryRequest: $('pref-delivery').value, excludedCategories, scheduledApplicationTarget: count('pref-count') };
}
async function connectMusinsa() {
  if (state.busy) return;
  state.connectAttempted = true; $('setup-error').textContent = '';
  try { await mutate('connect', {}); if (state.status?.session?.authenticated) toast('이 브라우저의 무신사 계정을 확인했습니다.'); else toast('무신사 탭에서 로그인한 뒤 연결 확인을 눌러 주세요.'); }
  catch (error) { $('setup-error').textContent = error.message; toast(error.message); }
}
$('detect-extension').addEventListener('click', () => void refreshStatus(true));
$('connect-musinsa').addEventListener('click', () => void connectMusinsa());
$('reconnect-musinsa').addEventListener('click', () => void connectMusinsa());
$('copy-extensions-address').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('extensions-address').textContent); toast('관리 주소를 복사했습니다. 브라우저 주소창에 붙여 넣어 주세요.'); } catch { toast(`주소창에 ${$('extensions-address').textContent} 를 입력해 주세요.`); } });
$('setup-consent').addEventListener('change', render);
$('consent-screen').addEventListener('submit', async event => {
  event.preventDefault(); if (!$('setup-consent').checked || !state.policiesLoaded || state.busy) return;
  $('setup-error').textContent = '';
  try { await mutate('consent', { accepted: true }); }
  catch (error) { $('setup-error').textContent = error.message; }
});
$('preferences-screen').addEventListener('submit', async event => {
  event.preventDefault(); if (state.busy) return; $('setup-error').textContent = '';
  try {
    const settings = preferences(); const editing = state.editing;
    const saved = await mutate(editing ? 'settings' : 'complete', editing ? settings : { settings });
    if (saved) { state.editing = false; state.preferencesInitialized = false; state.scheduleDirty = false; $('schedule-error').textContent = ''; $('apply-error').textContent = ''; render(); toast(editing ? '신청 조건을 저장했습니다.' : '준비를 마쳤습니다. 매일 오전 10시에 자동 신청합니다.'); }
  } catch (error) { $('setup-error').textContent = error.message; }
});
$('preferences-screen').addEventListener('input', () => { $('setup-error').textContent = ''; });
$('edit-preferences').addEventListener('click', () => { state.editing = true; state.preferencesInitialized = false; $('setup-error').textContent = ''; render(); $('setup-title').scrollIntoView({ block: 'start' }); });
$('cancel-preferences').addEventListener('click', () => { if (state.busy) return; state.editing = false; state.preferencesInitialized = false; $('setup-error').textContent = ''; render(); });
$('refresh-status').addEventListener('click', () => void refreshStatus());
$('schedule-count').addEventListener('input', () => { state.scheduleDirty = true; $('schedule-error').textContent = ''; });
$('apply-count').addEventListener('input', () => { $('apply-error').textContent = ''; if (stage() === 'dashboard') renderDashboard(); });
$('schedule-form').addEventListener('submit', async event => {
  event.preventDefault(); if (state.busy) return; $('schedule-error').textContent = '';
  try { const requested = count('schedule-count'); if (await mutate('settings', { scheduledApplicationTarget: requested })) { state.scheduleDirty = false; render(); toast(`매일 최대 ${requested}개 신청하도록 저장했습니다.`); } }
  catch (error) { $('schedule-error').textContent = error.message; }
});
$('apply-form').addEventListener('submit', async event => {
  event.preventDefault(); if (state.busy || jobActive()) return; $('apply-error').textContent = '';
  try { const requested = count('apply-count'); if (await mutate('start', { count: requested })) toast(`${requested}개 신청을 시작합니다.`); }
  catch (error) { $('apply-error').textContent = error.message; }
});
$('stop-job').addEventListener('click', async () => { if (state.busy) return; try { if (await mutate('stop', {})) toast('현재 신청 중지를 요청했습니다.'); } catch (error) { $('apply-error').textContent = error.message; } });
$('toggle-automation').addEventListener('click', async () => { if (state.busy || !state.status) return; try { const enabled = !state.status.settings.enabled; if (await mutate('settings', { enabled })) toast(enabled ? '자동 신청을 다시 켰습니다.' : '자동 신청을 일시 중지했습니다.'); } catch (error) { toast(error.message); } });
$('consent-toggle').addEventListener('change', async () => { if (state.busy) return; const enabled = $('consent-toggle').checked; try { if (await mutate('settings', { applicationConsent: enabled, enabled })) toast(enabled ? '필수 동의와 자동 신청을 켰습니다.' : '필수 동의와 자동 신청을 껐습니다.'); } catch (error) { toast(error.message); render(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !state.busy) void refreshStatus(); });
async function init() {
  const edge = /Edg\//.test(navigator.userAgent); $('extensions-address').textContent = edge ? 'edge://extensions' : 'chrome://extensions';
  $('update-extensions-address').textContent = $('extensions-address').textContent;
  try {
    const response = await fetch(new URL('./config.json', location.href), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const config = await response.json();
      if (typeof config.extensionId === 'string' && /^[a-p]{32}$/.test(config.extensionId)) state.config.extensionId = config.extensionId;
      if (typeof config.version === 'string' && /^\d+\.\d+\.\d+$/.test(config.version)) state.config.version = config.version;
      if (typeof config.extensionDownloadUrl === 'string') { const url = new URL(config.extensionDownloadUrl, location.href); if ((url.origin === location.origin || (url.hostname === 'github.com' && url.pathname.startsWith('/m0000000n/musinsazima/releases/download/'))) && ['http:', 'https:'].includes(url.protocol)) state.config.extensionDownloadUrl = url.href; }
    }
  } catch { /* The pinned public extension ID still allows a previously installed version to connect. */ }
  $('extension-download').href = state.config.extensionDownloadUrl;
  $('extension-update-download').href = state.config.extensionDownloadUrl;
  render(); await refreshStatus();
}
void init();
