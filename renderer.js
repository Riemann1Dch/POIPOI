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

/** 把用户指令精简为简短的任务名 */
function summarizeTask(text) {
  if (!text) return '执行任务';
  // 去掉语气词和标点，取前 12 个字
  let t = text.replace(/^(派派|帮我|请|给[我]?|把|来|顺便)\s*/, '').trim();
  t = t.replace(/[，。！？、：；"'「」『』【】《》（）\n\r]+/g, ' ').trim();
  return t.length > 12 ? t.substring(0, 12) + '…' : t || '执行任务';
}

async function sendToPi(text) {
  if (!text.trim()) return;

  // 保存用户指令作为任务名（去掉语气词、智能总结）
  const clean = text.replace(/^\[系统提示[^\]]*\]\s*/gm, '').trim();
  if (clean) lastUserCommand = summarizeTask(clean);
  
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
      updateStatus('thinking');
      currentResponseText = '';
      setExpression('exp_01');
      playMotion(Math.floor(Math.random() * 4));
      if (currentMode === 'task') {
        taskQueue = taskQueue.filter(t => t.status !== 'running');
        addTask(lastUserCommand || '执行任务…');
      }
      break;

    case 'turn_start':
      updateStatus('thinking');
      currentResponseText = '';
      setExpression('exp_01');
      if (currentMode === 'task') {
        playMotion(Math.floor(Math.random() * 4));
      }
      break;

    case 'agent_end':
      updateStatus('online');
      playMotion(4 + Math.floor(Math.random() * 3));
      if (currentMode === 'task') {
        const running = taskQueue.find(t => t.status === 'running');
        if (running) {
          updateTask(running.id, 'completed');
          // 仅停靠状态弹气泡（展开时用户可直接看到状态栏）
          setTimeout(() => { if (isDocked) showNotifBubble(); }, 300);
        }
      }
      break;

    case 'turn_end':
      updateStatus('online');
      if (currentMode === 'task') {
        playMotion(4 + Math.floor(Math.random() * 3));
      }
      break;

    // 监听 tool_execution 事件更新已有任务名为更具体的工具名
    case 'tool_execution':
      if (currentMode === 'task' && event.data) {
        const toolName = event.data.tool || event.data.name || '工具调用';
        const args = event.data.args || event.data.arguments || {};
        const argStr = Object.keys(args).slice(0, 2).map(k => args[k]).join(', ');
        const desc = argStr ? `${toolName}(${argStr.substring(0, 40)})` : toolName;
        // 更新已有运行中任务的描述，而不是新增一条
        const running = taskQueue.find(t => t.status === 'running');
        if (running) {
          running.name = desc;
          updateTaskBar();
        } else {
          addTask(desc, 'running');
        }
      }
      break;

    case 'message_end':
      if (event.message?.role === 'user') {
        const t = extractText(event.message.content);
        if (t) {
          // 去除系统提示前缀，只保留用户输入
          // 去除所有系统提示前缀（包括聊天模式的换行后第二条）
          let clean = t.replace(/^\[系统提示[^\]]*\]\s*/gm, '').trim();
          clean = clean.replace(/^\[如果用户请求[^\]]*\]\s*/gm, '').trim();
          historyMessages.push({ role: 'user', text: clean || t });
          analyzeAndSetExpression(clean || t);
          if (clean) lastUserCommand = summarizeTask(clean);
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

function extractTaskName(event) {
  // 尝试从事件数据中提取有意义的任务名
  if (event.data?.tool) return event.data.tool;
  if (event.data?.name) return event.data.name;
  if (event.data?.description) return event.data.description;
  if (event.message?.content) {
    const text = extractText(event.message.content);
    if (text && text.length < 60) return text;
  }
  // 检查 tool_use / tool_call block
  if (event.message?.content && Array.isArray(event.message.content)) {
    for (const block of event.message.content) {
      if (block.type === 'tool_use' || block.type === 'tool_call') {
        const name = block.name || block.tool;
        const input = block.input || block.arguments || {};
        const inp = Object.values(input).filter(v => typeof v === 'string').join(' ');
        return inp ? `${name}: ${inp.substring(0, 40)}` : name;
      }
    }
  }
  return '执行任务...';
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
  saveWindowState();
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
let isDocked = false;       // 窗口是否停靠（停靠时才弹气泡）

function closeFeature(feature) {
  if (!feature) return;
  switch (feature) {
    case 'talk': hideInput(); hideBubble(); break;
    case 'history': document.getElementById('history-overlay')?.classList.add('hidden'); break;
  }
}

function showHistory() {
  const overlay = document.getElementById('history-overlay');
  if (!overlay) return;
  renderHistory();
  overlay.classList.remove('hidden');
}

// ========== 窗口状态还原 ==========

/** 保存当前窗口状态到 localStorage */
function saveWindowState() {
  const state = {
    scrollPosition: document.getElementById('chat-text')?.scrollTop || 0,
    inputText: document.getElementById('chat-input')?.value || '',
    inputFocused: document.activeElement === document.getElementById('chat-input'),
    currentMode: currentMode,
    activeFeature: activeFeature,
    historyCount: historyMessages.length,
    timestamp: Date.now(),
  };
  try { localStorage.setItem('poipoi-window-state', JSON.stringify(state)); } catch(e) {}
}

/** 从 localStorage 加载并恢复窗口状态 */
function loadWindowState() {
  try {
    const raw = localStorage.getItem('poipoi-window-state');
    if (!raw) return;
    const state = JSON.parse(raw);
    if (!state || !state.timestamp) return;

    // 忽略超过 30 分钟的旧状态（避免隔夜恢复过期状态）
    if (Date.now() - state.timestamp > 30 * 60 * 1000) return;
    // 如果历史对话条数发生变化（清空或大幅增减），不恢复
    if (state.historyCount && Math.abs(state.historyCount - historyMessages.length) > 5) return;

    // 恢复模式
    if (state.currentMode && state.currentMode !== currentMode) {
      setMode(state.currentMode);
    }

    // 恢复活跃功能
    if (state.activeFeature === 'talk') {
      closeFeature(activeFeature);
      showInput();
      activeFeature = 'talk';
      // 恢复输入框内容
      if (state.inputText) {
        document.getElementById('chat-input').value = state.inputText;
      }
      // 恢复焦点
      if (state.inputFocused) {
        setTimeout(() => {
          const input = document.getElementById('chat-input');
          input?.focus();
          // 光标放到文本末尾
          if (input && state.inputText) {
            input.selectionStart = input.selectionEnd = state.inputText.length;
          }
        }, 100);
      }
    } else if (state.activeFeature === 'history') {
      closeFeature(activeFeature);
      showHistory();
      activeFeature = 'history';
      // 恢复滚动位置
      if (state.scrollPosition > 0) {
        setTimeout(() => {
          const content = document.getElementById('history-content');
          if (content) content.scrollTop = state.scrollPosition;
        }, 50);
      }
    }

    // 恢复聊天气泡滚动位置
    if (state.scrollPosition > 0) {
      setTimeout(() => {
        const textEl = document.getElementById('chat-text');
        if (textEl && !textEl.classList.contains('hidden')) {
          textEl.scrollTop = state.scrollPosition;
        }
      }, 50);
    }
  } catch(e) {
    console.error('Failed to restore window state:', e);
  }
}

// ========== 后台任务状态管理 ==========

let taskQueue = [];           // 任务队列
let taskIdCounter = 0;
let lastUserCommand = '';     // 用户最近一条指令，用作任务名

function addTask(name, status = 'running') {
  const id = ++taskIdCounter;
  taskQueue.push({ id, name, status, time: Date.now() });
  updateTaskBar();
  return id;
}

function updateTask(id, status) {
  const task = taskQueue.find(t => t.id === id);
  if (task) {
    task.status = status;
    task.time = Date.now();
    updateTaskBar();
  }
}

function updateTaskBar() {
  const bar = document.getElementById('task-status-bar');
  const icon = document.getElementById('task-status-icon');
  const text = document.getElementById('task-status-text');
  if (!bar || !icon || !text) return;

  const running = taskQueue.filter(t => t.status === 'running');
  const latest = taskQueue[taskQueue.length - 1];

  if (running.length > 0) {
    bar.classList.remove('hidden', 'completed', 'failed');
    bar.classList.add('running');
    icon.textContent = '⚙️';
    text.textContent = '进行中';
    // 清除之前可能残留的自动隐藏定时器
    if (window.__taskBarTimer) clearTimeout(window.__taskBarTimer);
  } else if (latest) {
    bar.classList.remove('hidden', 'running');
    if (latest.status === 'completed') {
      bar.classList.add('completed');
      icon.textContent = '✅';
      text.textContent = '已完成';
    } else if (latest.status === 'failed') {
      bar.classList.add('failed');
      icon.textContent = '❌';
      text.textContent = '失败';
    }
    // 3 秒后自动隐藏
    if (window.__taskBarTimer) clearTimeout(window.__taskBarTimer);
    window.__taskBarTimer = setTimeout(() => {
      bar.classList.add('hidden');
      // 清除已完成的任务记录，避免再次触发显示
      taskQueue = taskQueue.filter(t => t.status === 'running');
    }, 3000);
  } else {
    bar.classList.add('hidden');
  }
}

function showTaskDetail() {
  let overlay = document.getElementById('task-detail-overlay');
  if (!overlay) {
    // 创建详情弹窗
    overlay = document.createElement('div');
    overlay.id = 'task-detail-overlay';
    overlay.innerHTML = `
      <div id="task-detail-header">
        <span>📋 后台任务</span>
        <button id="task-detail-close">✕</button>
      </div>
      <div id="task-detail-list"></div>
    `;
    document.getElementById('window-frame').appendChild(overlay);

    document.getElementById('task-detail-close').addEventListener('click', () => {
      overlay.classList.add('hidden');
    });

    // 点击外部关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  }

  // 渲染任务列表
  const list = document.getElementById('task-detail-list');
  if (taskQueue.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#999">暂无任务记录</div>';
  } else {
    list.innerHTML = taskQueue.slice().reverse().map(t => {
      const statusText = t.status === 'running' ? '进行中' : t.status === 'completed' ? '已完成' : '失败';
      return `<div class="task-detail-item">
        <span class="task-dot ${t.status}"></span>
        <span style="flex:1">${escapeHtml(t.name)}</span>
        <span style="color:var(--text-dim);font-size:11px">${statusText}</span>
      </div>`;
    }).join('');
  }

  overlay.classList.remove('hidden');
}

// ========== 猫咪按钮左侧漫画气泡 ==========

/** 显示任务完成气泡 */
function showNotifBubble() {
  const bubble = document.getElementById('notif-bubble');
  if (!bubble) return;
  
  bubble.classList.remove('hidden');
  bubble.style.transform = 'scale(0)';
  bubble.style.opacity = '0';
  
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bubble.style.transition = 'transform 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.35s ease';
      bubble.style.transform = '';
      bubble.style.opacity = '1';
    });
  });
}

/** 手动隐藏气泡 */
function hideNotifBubble() {
  const bubble = document.getElementById('notif-bubble');
  if (!bubble) return;
  if (window.__bubbleTimer) clearTimeout(window.__bubbleTimer);
  bubble.style.transition = '';
  bubble.style.transform = '';
  bubble.style.opacity = '';
  bubble.classList.add('hidden');
}

// ========== History ==========

let historyMessages = [];




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
      if (txt.value.trim()) {
        sendToPi(txt.value);
        txt.value = '';
        saveWindowState();
      }
    }
  });

  // Send button
  document.getElementById('send-btn').addEventListener('click', () => {
    const txt = document.getElementById('chat-input');
    if (txt.value.trim()) {
        sendToPi(txt.value);
        txt.value = '';
        saveWindowState();
      }
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
            saveWindowState();
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
            saveWindowState();
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
            saveWindowState();
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
      saveWindowState();
      hideInput();
      document.getElementById('history-overlay')?.classList.add('hidden');
      activeFeature = null;
    }
  });

  // 点击任务状态栏查看详情
  document.getElementById('task-status-bar').addEventListener('click', (e) => {
    if (!e.target.closest('#task-detail-overlay')) {
      showTaskDetail();
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
  
  // 停靠/展开仅切换菜单栏样式，不影响窗口内容
  if (isElectron) {
    window.pi.onBlur(() => {
      saveWindowState();
    });

    // 监听停靠状态
    window.pi.onDockState((state) => {
      const menuBar = document.getElementById('menu-bar');
      isDocked = state === 'docked';
      if (state === 'docked') {
        if (menuBar) menuBar.classList.add('docked');
      } else {
        if (menuBar) menuBar.classList.remove('docked');
      }
      // 窗口移动后重新定位气泡
    });

    // wake-up 事件：窗口被唤醒时检查状态是否需要恢复
    window.pi.onWakeUp(() => {
      setTimeout(loadWindowState, 300);
    });

    // 侧边栏标签点击 → 恢复窗口（点击拖动冲突在 enableDrag 中已处理）
    document.getElementById('sidebar-tab').addEventListener('click', (e) => {
      if (dragActive) { dragActive = false; return; }
      hideNotifBubble();
      window.pi.send({ type: 'reset-tray' });
      e.stopPropagation();
      window.pi.restoreWindow();
    });
  }

  // 启动实时时钟
  updateClock();
  setInterval(updateClock, 1000);

  // 如果是窗口恢复而非首次启动，尝试还原状态
  const hasSavedState = !!localStorage.getItem('poipoi-window-state');
  if (hasSavedState) {
    setTimeout(loadWindowState, 600);
  }

  // 加载完成后显示欢迎语（仅首次启动无保存状态时显示）
  if (!hasSavedState) {
    setTimeout(() => {
      showBubble('你好呀！我是派派，双击和我聊天吧 😊');
    }, 500);
  }
});
