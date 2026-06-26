// ============================================
// 派派 Poipoi - Live2D Desktop Pet Renderer
// Supports both Electron IPC and browser SSE modes
// ============================================

// Detect mode
const isElectron = typeof window.pi !== 'undefined' && window.pi.send;

const API_BASE = '';

// ========== 全局错误兜底：任何未捕获错误都强制显示窗口 ==========
window.addEventListener('error', function(e) {
  console.error('[pet-global] Uncaught error:', e.error || e.message);
  signalRendererReady();
});
window.addEventListener('unhandledrejection', function(e) {
  console.error('[pet-global] Unhandled rejection:', e.reason);
  signalRendererReady();
});

// ========== 安全通知主进程显示窗口（防未捕获异常导致窗口不显示） ==========
function signalRendererReady() {
  try {
    if (isElectron) {
      window.pi.send({ type: 'renderer-ready' });
    } else {
      document.getElementById('window-frame').style.opacity = '1';
    }
  } catch (e) {
    console.error('signalRendererReady failed:', e);
  }
}

// ========== Theme System ==========
const THEMES = [
  { id: 'theme-starry',  icon: '🌙', name: '星夜' },
  { id: 'theme-warm-tea', icon: '🌸', name: '暖茶' },
  { id: 'theme-aurora',  icon: '🌀', name: '极光' },
];
let themeIndex = 0;

function applyTheme(index) {
  const theme = THEMES[index];
  document.body.className = theme.id;
  const indicator = document.getElementById('theme-indicator');
  if (indicator) indicator.textContent = theme.icon;
  // 保存到 localStorage
  try { localStorage.setItem('poipoi-theme', theme.id); } catch(e) {}
  showBubble(`🎨 切换为「${theme.name}」主题`);
}

function cycleTheme() {
  themeIndex = (themeIndex + 1) % THEMES.length;
  applyTheme(themeIndex);
}

// 优先从 localStorage 恢复上次的主题
function loadSavedTheme() {
  try {
    const saved = localStorage.getItem('poipoi-theme');
    if (saved) {
      const idx = THEMES.findIndex(t => t.id === saved);
      if (idx >= 0) {
        themeIndex = idx;
        document.body.className = saved;
        const indicator = document.getElementById('theme-indicator');
        if (indicator) indicator.textContent = THEMES[idx].icon;
        return;
      }
    }
  } catch(e) {}
  // 默认星夜
  document.body.className = 'theme-starry';
}

let app = null;        // PIXI Application


// ========== Live2D Initialization ==========

function getContainerSize() {
  const container = document.getElementById('live2d-container');
  if (container) {
    return { w: container.clientWidth, h: container.clientHeight };
  }
  return { w: window.innerWidth, h: window.innerHeight };
}

async function initLive2D() {
  const canvas = document.getElementById('live2d-canvas');
  const { w, h } = getContainerSize();

  // 确保即使 PIXI 初始化失败也发送 renderer-ready
  try {
    app = new PIXI.Application({
      view: canvas,
      width: w,
      height: h,
      transparent: true,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      backgroundColor: 0x000000,
      backgroundAlpha: 0,
    });
  } catch (e) {
    console.error('PIXI init failed:', e);
    // 通知主进程显示窗口（即使没有 Live2D）
    signalRendererReady();
    return;
  }

  // 等待一帧让 WebGL 上下文就绪
  await new Promise(r => requestAnimationFrame(r));
  try {
    await loadLive2DModel();
  } catch (e) {
    console.error('Live2D error:', e);
    showBubble('模型加载失败: ' + e.message);
    showPlaceholder();
  }

  // 通知主进程：渲染器已就绪，可以显示窗口
  signalRendererReady();

  window.addEventListener('resize', () => {
    const { w: cw, h: ch } = getContainerSize();
    app.renderer.resize(cw, ch);
    if (window.__live2dModel) {
      window.__live2dModel.x = cw / 2;
    } else if (window.__petContainer) {
      window.__petContainer.x = cw / 2;
      window.__petContainer.y = ch / 2 + 20;
    }
  });
}

async function loadLive2DModel() {
  // Initialize Cubism framework
  if (PIXI.live2d.CubismFramework) {
    try { PIXI.live2d.startUpCubism4(); } catch(e) {
      // Fallback: call methods directly
      if (typeof PIXI.live2d.CubismFramework.startUp === 'function' && !PIXI.live2d.CubismFramework.isInitialized()) {
        PIXI.live2d.CubismFramework.startUp();
        PIXI.live2d.CubismFramework.initialize();
      }
    }
  }

  // Load the model from file
  const modelUrl = 'public/model/runtime/mao_pro.model3.json';
  const model = await PIXI.live2d.Live2DModel.from(modelUrl, {
    autoInteract: false,
  });

  // Position at bottom center, partially behind the input area
  await new Promise(r => setTimeout(r, 50));
  const { w: cw, h: ch } = getContainerSize();
  model.anchor.set(0.5, 1);
  const scale = Math.min(
    cw / (model.width || 600) * 2.0,
    ch / (model.height || 600) * 1.9
  );
  model.scale.set(scale);
  model.x = cw / 2;
  model.y = ch + 360;

  app.stage.addChild(model);
  window.__live2dModel = model;
  window.__petContainer = model;

  // Play idle motion after load
  setTimeout(() => { try { model.motion('Idle'); } catch(e) {} }, 500);

  // 表情和动作由 AI 对话情绪分析触发，空闲时不自动切换

  document.getElementById('loading')?.classList.add('hidden');
}

function showPlaceholder() {
  const container = new PIXI.Container();
  app.stage.addChild(container);

  // Cute character body
  const body = new PIXI.Graphics();
  body.beginFill(0x6366f1, 0.85);
  body.drawRoundedRect(-40, -50, 80, 100, 20);
  body.endFill();
  container.addChild(body);

  // Head
  const head = new PIXI.Graphics();
  head.beginFill(0x818cf8, 0.95);
  head.drawCircle(0, -60, 35);
  head.endFill();
  container.addChild(head);

  // Eyes
  const lEye = new PIXI.Graphics();
  lEye.beginFill(0xffffff); lEye.drawEllipse(-12, -65, 8, 10); lEye.endFill();
  const lPupil = new PIXI.Graphics();
  lPupil.beginFill(0x1a1a2e); lPupil.drawCircle(-12, -65, 4); lPupil.endFill();
  container.addChild(lEye); container.addChild(lPupil);

  const rEye = new PIXI.Graphics();
  rEye.beginFill(0xffffff); rEye.drawEllipse(12, -65, 8, 10); rEye.endFill();
  const rPupil = new PIXI.Graphics();
  rPupil.beginFill(0x1a1a2e); rPupil.drawCircle(12, -65, 4); rPupil.endFill();
  container.addChild(rEye); container.addChild(rPupil);

  // Blush
  const blushL = new PIXI.Graphics();
  blushL.beginFill(0xff6b9d, 0.3); blushL.drawEllipse(-18, -55, 8, 4); blushL.endFill();
  const blushR = new PIXI.Graphics();
  blushR.beginFill(0xff6b9d, 0.3); blushR.drawEllipse(18, -55, 8, 4); blushR.endFill();
  container.addChild(blushL); container.addChild(blushR);

  // Smile
  const smile = new PIXI.Graphics();
  smile.lineStyle(2, 0xffffff, 0.7);
  smile.arc(0, -52, 12, 0.15, Math.PI - 0.15);
  container.addChild(smile);

  // Arms (simple)
  const lArm = new PIXI.Graphics();
  lArm.beginFill(0x6366f1, 0.85); lArm.drawRoundedRect(-55, -30, 15, 40, 7); lArm.endFill();
  const rArm = new PIXI.Graphics();
  rArm.beginFill(0x6366f1, 0.85); rArm.drawRoundedRect(40, -30, 15, 40, 7); rArm.endFill();
  container.addChild(lArm); container.addChild(rArm);

  const { w: cw, h: ch } = getContainerSize();
  container.x = cw / 2;
  container.y = ch / 2 + 20;
  container.scale.set(1.2);

  // Store for animation control
  window.__petContainer = container;
  window.__petParts = { lPupil, rPupil, lArm, rArm, smile };

  // Floating animation
  let time = 0;
  app.ticker.add(() => {
    time += 0.025;
    const { w: cw2, h: ch2 } = getContainerSize();
    container.y = ch2 / 2 + 20 + Math.sin(time) * 6;
    container.rotation = Math.sin(time * 0.4) * 0.025;
    lArm.rotation = Math.sin(time * 0.6) * 0.05;
    rArm.rotation = Math.sin(time * 0.6 + 1) * 0.05;
  });

  // Blink
  setInterval(() => {
    window.__petParts.lPupil.scale.y = 0.1;
    window.__petParts.rPupil.scale.y = 0.1;
    setTimeout(() => {
      window.__petParts.lPupil.scale.y = 1;
      window.__petParts.rPupil.scale.y = 1;
    }, 150);
  }, 3000);

  // Wave animation when talking
  window.__waveArm = () => {
    let wt = 0;
    const wave = () => {
      wt += 0.15;
      rArm.rotation = Math.sin(wt * 3) * 0.3 - 0.3;
      if (wt < Math.PI * 2) requestAnimationFrame(wave);
      else rArm.rotation = 0;
    };
    wave();
  };

  setTimeout(() => document.getElementById('loading')?.classList.add('hidden'), 300);
}

// ========== SSE Communication ==========

let currentResponseText = '';

// ========== Communication ==========

function initComms() {
  if (isElectron) {
    // Electron mode: use IPC
    window.pi.getStatus().then(s => updateStatus(s.running ? 'online' : 'offline'));
    window.pi.onEvent(handlePiEvent);
  } else {
    // Browser mode: use SSE
    const evtSource = new EventSource('/events');
    evtSource.onmessage = (e) => {
      try { handlePiEvent(JSON.parse(e.data)); } catch (_) {}
    };
    evtSource.onerror = () => { updateStatus('offline'); setTimeout(initComms, 2000); };
  }
}

async function sendToPi(text) {
  if (!text.trim()) return;
  
  // 根据模式处理消息
  let finalMessage = text;
  if (currentMode === 'chat') {
    // 聊天模式：禁止执行后台任务，仅回复文字
    finalMessage = '[系统提示：当前为聊天模式。请仅回复文字，不要执行任何工具、修改文件或系统操作。]\n' +
      text + '\n\n[如果用户请求执行后台任务、查询系统或修改文件，请提醒用户切换到后台任务模式。]';
  } else {
    // 任务模式：可以执行用户要求的后台任务
    finalMessage = '[系统提示：当前为后台任务模式。]\n' + text;
  }
  
  showBubble('思考中...');
  updateStatus('thinking');
  currentResponseText = '';
  try {
    if (isElectron) {
      await window.pi.send({ type: 'prompt', message: finalMessage });
    } else {
      await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'prompt', message: finalMessage }),
      });
    }
  } catch (e) {
    showBubble('连接失败，请检查 pi 是否在运行');
    updateStatus('offline');
  }
  // Keep input visible for next message
  showInput();
}

function handlePiEvent(event) {
  switch (event.type) {
    case 'message_update':
      if (event.assistantMessageEvent?.type === 'text_delta') {
        currentResponseText += event.assistantMessageEvent.delta;
        updateBubble(currentResponseText);
      }
      break;

    case 'agent_start':
    case 'turn_start':
      updateStatus('thinking');
      currentResponseText = '';
      setExpression('exp_01'); // 思考中 → 默认表情
      // 后台任务模式：被布置任务时触发动作（前4个随机）
      if (currentMode === 'task') {
        playMotion(Math.floor(Math.random() * 4));
      }
      break;

    case 'agent_end':
    case 'turn_end':
      updateStatus('online');
      // 后台任务模式：任务完成时触发动作（后3个随机）
      if (currentMode === 'task') {
        playMotion(4 + Math.floor(Math.random() * 3));
      }
      break;

    case 'message_end':
      if (event.message?.role === 'user') {
        const t = extractText(event.message.content);
        if (t) {
          historyMessages.push({ role: 'user', text: t });
          analyzeAndSetExpression(t); // 根据用户说的话调整表情
        }
      }
      if (event.message?.role === 'assistant') {
        const text = extractText(event.message.content);
        if (text) {
          historyMessages.push({ role: 'assistant', text });
          showBubble(text);
          analyzeAndSetExpression(text); // 派派根据自己说的话变换表情
        }
        if (window.__waveArm) window.__waveArm();
      }
      // 保留最近 200 条对话记录，每条最多 4000 字符避免内存暴涨
      if (historyMessages.length > 200) historyMessages = historyMessages.slice(-200);
      if (historyMessages.length > 0) {
        const last = historyMessages[historyMessages.length - 1];
        if (last.text.length > 4000) last.text = last.text.slice(0, 4000) + '…';
      }
      break;

    case 'connected':
      updateStatus('online');
      break;
  }
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(c => c.type === 'text').map(c => c.text).join(' ');
  }
  return '';
}

// ========== Chat Bubble ==========

let bubbleTimeout = null;

function scrollBubbleToBottom() {
  const textEl = document.getElementById('chat-text');
  textEl.scrollTop = textEl.scrollHeight;
}

function showBubble(text) {
  const bubble = document.getElementById('chat-bubble');
  const textEl = document.getElementById('chat-text');
  textEl.textContent = text;
  bubble.classList.remove('hidden');
  scrollBubbleToBottom();
  clearTimeout(bubbleTimeout);
  // 任务模式的回复内容较长，不自动隐藏，让用户读完
  if (currentMode !== 'task') {
    bubbleTimeout = setTimeout(() => bubble.classList.add('hidden'), 10000);
  }
}

function updateBubble(text) {
  const textEl = document.getElementById('chat-text');
  textEl.textContent = text;
  document.getElementById('chat-bubble').classList.remove('hidden');
  scrollBubbleToBottom();
  clearTimeout(bubbleTimeout);
}

function hideBubble() {
  document.getElementById('chat-bubble').classList.add('hidden');
  clearTimeout(bubbleTimeout);
}

// ========== Input ==========

function showInput() {
  document.getElementById('input-area').classList.remove('hidden');
  document.getElementById('chat-input').focus();
}

function hideInput() {
  document.getElementById('input-area').classList.add('hidden');
}

function updateModeLabel(text) {
  const label = document.getElementById('input-mode-label');
  if (label) label.textContent = text;
}

function setMode(mode) {
  currentMode = mode;
  const label = document.getElementById('input-mode-label');
  const input = document.getElementById('chat-input');
  if (mode === 'chat') {
    updateModeLabel('💬 聊天');
    if (input) input.placeholder = '和派派聊天...';
    if (label) label.classList.remove('task-mode');
  } else {
    updateModeLabel('📋 后台任务');
    if (input) input.placeholder = '给派派布置一个任务...';
    if (label) label.classList.add('task-mode');
  }
}

function toggleMode() {
  setMode(currentMode === 'chat' ? 'task' : 'chat');
}

// ========== 表情控制（情绪驱动） ==========

function setExpression(exprId) {
  const model = window.__live2dModel;
  if (model && typeof model.expression === 'function') {
    try { model.expression(exprId); } catch(e) {}
  }
}

function analyzeAndSetExpression(text) {
  if (!text) { setExpression('exp_01'); return; }

  const t = text.toLowerCase();

  // 非常开心 / 兴奋 → ✨ 闪亮大眼睛
  if (/哈哈|太好|真棒|好开心|太棒了|厉害|wow|amazing|yay|😂|❤️|🥰|🎉/.test(t)) {
    setExpression('exp_04');
    return;
  }

  // 被夸奖 / 被喜欢 → 😳 脸红
  if (/可爱|喜欢|爱|好看|漂亮|乖|贴心|聪明|adorable|sweet|lovely|beautiful/.test(t)) {
    if (/喜欢|爱|cute/.test(t)) {
      setExpression('exp_06');
      return;
    }
    setExpression('exp_02');
    return;
  }

  // 正向 / 开心 → 😊 微笑眯眼
  if (/开心|高兴|好|不错|棒|nice|good|happy|smile|cute|fun|😊|😄/.test(t)) {
    setExpression('exp_02');
    return;
  }

  // 悲伤 / 共情 → 😢 悲伤
  if (/难过|伤心|哭|不开心|难受|委屈|呜呜|sad|cry|😢|😭|🥺/.test(t)) {
    setExpression('exp_05');
    return;
  }

  // 生气 / 吐槽 → 😠 生气
  if (/生气|愤怒|烦|讨厌|滚|气|疯|angry|mad|😠|😡/.test(t)) {
    setExpression('exp_08');
    return;
  }

  // 无聊 / 困 → 😌 闭眼
  if (/困|累|无聊|没意思|tired|bored|sleepy|zzz/.test(t)) {
    setExpression('exp_03');
    return;
  }

  // 疑问句 → 默认（中性思考）
  if (/[？?]/.test(t)) {
    setExpression('exp_01');
    return;
  }

  // 默认
  setExpression('exp_01');
}

// ========== 动作播放（后台任务绑定）==========
// 防抖：防止频繁触发导致动作打架
let lastMotionTime = 0;
const MOTION_COOLDOWN = 2500; // 两次动作之间至少间隔 2.5 秒
let isMotionPlaying = false;

// 7 个动作映射：
//   [0~3] 前四个 → 被布置后台任务时触发
//   [4~6] 后三个 → 任务完成提交给用户时触发
const MOTIONS = [
  { group: 'Idle',   index: 0 },  // ① 待机呼吸（Idle组，1个动作）
  { group: 'TapBody', index: 0 },  // ② mtn_02（TapBody组）
  { group: 'TapBody', index: 1 },  // ③ mtn_03
  { group: 'TapBody', index: 2 },  // ④ mtn_04
  { group: 'TapBody', index: 3 },  // 特殊动作 ① special_01
  { group: 'TapBody', index: 4 },  // 特殊动作 ② special_02
  { group: 'TapBody', index: 5 },  // 特殊动作 ③ special_03
];

// 播放指定索引的动作（安全调用 + 防抖）
function playMotion(idx) {
  const now = Date.now();
  if (now - lastMotionTime < MOTION_COOLDOWN) return; // 冷却中，忽略
  if (isMotionPlaying) return; // 动作正在播放，不打断

  const model = window.__live2dModel;
  if (!model || typeof model.motion !== 'function') return;
  const m = MOTIONS[idx];
  if (!m) return;
  
  lastMotionTime = now;
  isMotionPlaying = true;
  try {
    model.motion(m.group, m.index);
  } catch(e) {}
  
  // 动作播放完自动解锁（动作通常 2-4 秒，保守设 3 秒）
  setTimeout(() => {
    isMotionPlaying = false;
  }, 3000);
}



// ========== 当前模式与功能 ==========
let activeFeature = null;  // 'talk' | 'history' | null
let currentMode = 'chat';  // 'chat' | 'task'

function closeFeature(feature) {
  if (!feature) return;
  switch (feature) {
    case 'talk': hideInput(); hideBubble(); break;
    case 'history': document.getElementById('history-overlay')?.classList.add('hidden'); break;
  }
}

// ========== History ==========

let historyMessages = [];



function showHistory() {
  const overlay = document.getElementById('history-overlay');
  if (!overlay) return;
  renderHistory();
  overlay.classList.remove('hidden');
}

function renderHistory() {
  const content = document.getElementById('history-content');
  const count = document.getElementById('history-count');
  if (!content) return;
  
  if (historyMessages.length === 0) {
    content.innerHTML = '<div style="text-align:center;padding:40px;color:#999;font-size:13px">暂无对话记录</div>';
    count.textContent = '';
    return;
  }
  
  const displayCount = Math.min(historyMessages.length, 100);
  count.textContent = `(${historyMessages.length}条，显示最近${displayCount}条)`;
  content.innerHTML = historyMessages.slice(-displayCount).map(m => 
    `<div class="hist-msg hist-${m.role}">` +
    `<div class="hist-role">${m.role === 'user' ? '👤 你' : '派派'}</div>` +
    `<div class="hist-text">${escapeHtml(m.text)}</div>` +
    `</div>`
  ).join('');
  
  content.scrollTop = content.scrollHeight;
}

// ========== Clipboard / Copy ==========

function copyToClipboard(text, btn) {
  if (!text) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
    // 按钮反馈
    if (btn) {
      btn.classList.add('copied');
      btn.textContent = '✓';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.textContent = '📋';
      }, 1500);
    }
  } catch(e) {}
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ========== Status ==========

function updateStatus(status) {
  // Status tracking kept for internal use, UI removed
}

// ========== Context Menu (Native Electron) ==========

function showContextMenu() {
  if (isElectron) {
    window.pi.showContextMenu();
  }
}

// ========== Drag Window ==========
// JS-based drag via IPC (throttled)

let dragActive = false;
let dragRAF = null;

function enableDrag() {
  if (!isElectron) return;
  const handles = [
    document.getElementById('live2d-container'),
    document.getElementById('title-bar'),
    document.getElementById('sidebar-tab'),
  ].filter(Boolean);
  if (handles.length === 0) return;

  const startDrag = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('#input-area') || e.target.closest('#chat-bubble') || e.target.closest('#context-menu')) return;

    dragActive = false;
    const startX = e.screenX;
    const startY = e.screenY;
    const winX = window.screenX;
    const winY = window.screenY;

    let lastDx = 0, lastDy = 0;
    const onMove = (ev) => {
      lastDx = ev.screenX - startX;
      lastDy = ev.screenY - startY;
      if (Math.abs(lastDx) > 3 || Math.abs(lastDy) > 3) {
        dragActive = true;
        if (!dragRAF) {
          dragRAF = setTimeout(() => {
            dragRAF = null;
            window.pi.dragMove({ x: winX + lastDx, y: winY + lastDy });
          }, 50);
        }
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (dragRAF) { clearTimeout(dragRAF); dragRAF = null; }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  handles.forEach(h => h.addEventListener('mousedown', startDrag));
}

// ========== Bind Events ==========

function bindEvents() {
  // 双击宠物 = 呼出输入框（单击不触发，避免误操作）
  let clickTimer = null;
  document.getElementById('live2d-container').addEventListener('click', (e) => {
    if (dragActive) { dragActive = false; return; }
    if (e.target.closest('#input-area')) return;
    // 单击不做任何事，等候双击
  });
  document.getElementById('live2d-container').addEventListener('dblclick', (e) => {
    if (e.target.closest('#input-area')) return;
    const input = document.getElementById('input-area');
    if (input.classList.contains('hidden')) {
      // 双击默认为聊天模式
      setMode('chat');
      activeFeature = 'talk';
      showInput();
      document.getElementById('chat-input').focus();
      // 显示气泡提示
      if (document.getElementById('chat-bubble').classList.contains('hidden')) {
        showBubble('派派在这里，想聊什么呀？ 😊');
      }
    } else {
      hideInput();
    }
  });

  // 点击模式标签切换 聊天/后台任务 模式
  document.getElementById('input-mode-label').addEventListener('click', () => {
    toggleMode();
    document.getElementById('chat-input').focus();
  });

  // Send on Enter
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const txt = document.getElementById('chat-input');
      if (txt.value.trim()) sendToPi(txt.value), txt.value = '';
    }
  });

  // Send button
  document.getElementById('send-btn').addEventListener('click', () => {
    const txt = document.getElementById('chat-input');
    if (txt.value.trim()) sendToPi(txt.value), txt.value = '';
  });

  // Auto-resize
  document.getElementById('chat-input').addEventListener('input', () => {
    const el = document.getElementById('chat-input');
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 60) + 'px';
  });

  // 右侧菜单栏按钮点击（单击呼出，再次单击关闭对应功能）
  if (isElectron) {
    document.querySelectorAll('#menu-bar .menu-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        switch (action) {
          case 'talk': {
            if (activeFeature === 'talk') {
              closeFeature('talk');
              activeFeature = null;
            } else {
              closeFeature(activeFeature);
              setMode('chat');
              showInput();
              activeFeature = 'talk';
            }
            break;
          }
          case 'history': {
            if (activeFeature === 'history') {
              closeFeature('history');
              activeFeature = null;
            } else {
              closeFeature(activeFeature);
              showHistory();
              activeFeature = 'history';
            }
            break;
          }
          case 'theme':
            cycleTheme();
            break;
          case 'pi-cmd':
            closeFeature(activeFeature);
            activeFeature = null;
            window.pi.send({ type: 'open-pi-cmd' });
            break;
          case 'hide':
            closeFeature(activeFeature);
            activeFeature = null;
            window.pi.send({ type: 'hide' });
            break;
          case 'quit':
            window.pi.send({ type: 'quit' });
            break;
        }
      });
    });
  }

  // Click outside history overlay to close
  document.getElementById('history-overlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('history-overlay') || e.target.closest('#history-header')) {
      document.getElementById('history-overlay').classList.add('hidden');
      activeFeature = null;
    }
  });

  // 复制按钮
  const copyBubbleBtn = document.getElementById('copy-bubble-btn');
  if (copyBubbleBtn) {
    copyBubbleBtn.addEventListener('click', () => {
      const text = document.getElementById('chat-text')?.textContent || '';
      copyToClipboard(text, copyBubbleBtn);
    });
  }

  const copyHistoryBtn = document.getElementById('copy-history-btn');
  if (copyHistoryBtn) {
    copyHistoryBtn.addEventListener('click', () => {
      const content = document.getElementById('history-content');
      if (!content) return;
      // 提取纯文本，保留角色标记
      const msgs = content.querySelectorAll('.hist-msg');
      let text = '';
      msgs.forEach(msg => {
        const role = msg.querySelector('.hist-role')?.textContent || '';
        const txt = msg.querySelector('.hist-text')?.textContent || '';
        text += role + '\n' + txt + '\n\n';
      });
      copyToClipboard(text.trim(), copyHistoryBtn);
    });
  }

  // Esc
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideInput();
      document.getElementById('history-overlay')?.classList.add('hidden');
      activeFeature = null;
    }
  });
}

// ========== Real-time Clock ==========

function updateClock() {
  const el = document.getElementById('clock-display');
  if (!el) return;
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  el.textContent = `${h}:${m}:${s}`;
}

// ========== Init ==========

document.addEventListener('DOMContentLoaded', async () => {
  // 恢复上次主题
  loadSavedTheme();

  await initLive2D();
  initComms();
  bindEvents();
  enableDrag();
  
  // 失去焦点 → 隐藏所有面板
  if (isElectron) {
    window.pi.onBlur(() => {
      hideInput();
      hideBubble();
      document.getElementById('history-overlay')?.classList.add('hidden');
      activeFeature = null;
    });

    // 监听停靠状态
    window.pi.onDockState((state) => {
      const menuBar = document.getElementById('menu-bar');
      if (state === 'docked') {
        hideInput();
        hideBubble();
        document.getElementById('history-overlay')?.classList.add('hidden');
        if (menuBar) menuBar.classList.add('docked');
        activeFeature = null;
      } else {
        if (menuBar) menuBar.classList.remove('docked');
      }
    });

    // 侧边栏标签点击 → 恢复窗口（点击拖动冲突在 enableDrag 中已处理）
    document.getElementById('sidebar-tab').addEventListener('click', (e) => {
      if (dragActive) { dragActive = false; return; }
      e.stopPropagation();
      window.pi.restoreWindow();
    });
  }

  // 启动实时时钟
  updateClock();
  setInterval(updateClock, 1000);

  // 加载完成后显示欢迎语
  setTimeout(() => {
    showBubble('你好呀！我是派派，双击和我聊天吧 😊');
  }, 500);
});
