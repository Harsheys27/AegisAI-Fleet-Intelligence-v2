// =================== BACKGROUND PARTICLE FIELD ===================
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let W, H, particles = [], nodes = [], animFrame;

// Reduced counts: 80→30 particles, 20→8 nodes
const PARTICLE_COUNT = 30;
const NODE_COUNT = 8;

// Throttle canvas to ~20 fps (50 ms between frames)
const FRAME_INTERVAL = 50;
let lastFrameTime = 0;

let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}

function initParticles() {
  particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.4 + 0.05
    });
  }
  nodes = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    nodes.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
    });
  }
}

function drawBG(timestamp) {
  // Throttle: skip frame if not enough time has passed
  if (timestamp - lastFrameTime < FRAME_INTERVAL) {
    animFrame = requestAnimationFrame(drawBG);
    return;
  }
  lastFrameTime = timestamp;

  ctx.clearRect(0, 0, W, H);

  // Grid – single path for all lines (much faster than one stroke per line)
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(79,142,247,0.03)';
  ctx.lineWidth = 1;
  const gSize = 60;
  for (let x = 0; x < W; x += gSize) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y < H; y += gSize) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();

  // Node connections – single style set, batched per segment
  ctx.lineWidth = 0.5;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 250) {
        ctx.strokeStyle = `rgba(34,211,200,${0.06 * (1 - dist / 200)})`;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
  }

  // Moving nodes
  ctx.fillStyle = 'rgba(34,211,200,0.15)';
  nodes.forEach(n => {
    n.x += n.vx; n.y += n.vy;
    if (n.x < 0 || n.x > W) n.vx *= -1;
    if (n.y < 0 || n.y > H) n.vy *= -1;
    ctx.beginPath();
    ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Particles – batch same fill style
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
    if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(79,142,247,${p.alpha})`;
    ctx.fill();
  });

  animFrame = requestAnimationFrame(drawBG);
}

resize();
initParticles();
requestAnimationFrame(drawBG);
window.addEventListener('resize', () => { resize(); initParticles(); });

// =================== UNIFIED MOUSEMOVE (throttled via rAF) ===================
let _mousePending = false;
document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (_mousePending) return;
  _mousePending = true;
  requestAnimationFrame(() => {
    const x = mouseX / window.innerWidth - 0.5;
    const y = mouseY / window.innerHeight - 0.5;
    const heroEl = document.querySelector('#hero');
    if (heroEl) {
      heroEl.style.transform =
        `perspective(1000px) rotateY(${x * 6}deg) rotateX(${-y * 4}deg)`;
    }
    const orbEl = document.querySelector('.ai-orb');
    if (orbEl) {
      orbEl.style.transform =
        `translateX(calc(-50% + ${x * 60}px)) translateY(${y * 60}px)`;
    }
    _mousePending = false;
  });
});

// =================== PAGE NAVIGATION ===================
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
  document.getElementById(page + '-page').classList.add('active');
  const navEl = document.getElementById('nav-' + page);
  if (navEl) navEl.classList.add('active');
  window.scrollTo(0, 0);
  if (page === 'dashboard') initDashboard();
  if (page === 'home') initHomeCharts();
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

// =================== COUNTERS ===================
// Reusable animated counter helper.
// Start from 0 and count smoothly to target using requestAnimationFrame.
// Prevents overlap/flicker by cancelling any previous animation on the same element.
const _counterAnimState = new Map(); // elementId -> { rafId }

function animateCounter(elementId, targetValue, suffix = "") {
  const el = document.getElementById(elementId);
  if (!el) return;

  const rawTarget = typeof targetValue === 'string' ? Number(targetValue) : targetValue;
  const target = Number.isFinite(rawTarget) ? rawTarget : 0;

  const duration = 1900; // ~1.5–2s

  // Cancel any in-flight animation for this element
  const prev = _counterAnimState.get(elementId);
  if (prev?.rafId) cancelAnimationFrame(prev.rafId);

  el.textContent = (0).toLocaleString() + suffix;

  const start = performance.now();

  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    // easeOutCubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = target * eased;

    // Percentage counters: keep up to 1 decimal if needed; otherwise round.
    const displayNum = Number.isInteger(target)
      ? Math.round(current)
      : Math.round(current * 10) / 10;

    el.textContent = displayNum.toLocaleString(undefined, Number.isInteger(displayNum) ? undefined : { maximumFractionDigits: 1 }) + suffix;

    if (progress < 1) {
      const rafId = requestAnimationFrame(update);
      _counterAnimState.set(elementId, { rafId });
    }
  }

  const rafId = requestAnimationFrame(update);
  _counterAnimState.set(elementId, { rafId });
}

// Backwards compat (no longer used for this app's stat cards)
function animateCounters() {
  // no-op: stat cards use animateCounter(...) with explicit IDs.
}


// =================== BAR ANIMATIONS ===================
function animateBars() {
  document.querySelectorAll('.bar-fill, .ex-bar-fill').forEach(el => {
    setTimeout(() => {
      el.style.width = el.dataset.width + '%';
    }, 300 + Math.random() * 400);
  });
}

// =================== CHART DEFAULTS ===================
const chartDefaults = {
  color: 'rgba(200,215,255,0.65)',
  font: { family: "'DM Sans', sans-serif", size: 11 },
  borderColor: 'rgba(255,255,255,0.05)',
  backgroundColor: 'rgba(255,255,255,0.03)',
};

function makeGradient(ctx, color, opacity1 = 0.4, opacity2 = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, 300);
  g.addColorStop(0, color.replace('rgb', 'rgba').replace(')', `,${opacity1})`));
  g.addColorStop(1, color.replace('rgb', 'rgba').replace(')', `,${opacity2})`));
  return g;
}

// Guard: track which charts have been initialised to avoid duplicate Chart instances
let chartsInit = {};

// =================== DASHBOARD ===================
function initDashboard() {
  // Animate dashboard stat cards (they are populated by loadFleetSummary(),
  // but initDashboard may run before that settles on navigation).
  // We keep this empty so we don't double-animate with the same API payload.

  fetch("http://127.0.0.1:8000/exceptions")

    .then(res => res.json())
    .then(data => {
      const total = Object.values(data).reduce((a, b) => a + b, 0);
      document.getElementById("totalExceptionCount").innerText = total;
    });

  fetch("http://127.0.0.1:8000/dashboard-charts")
    .then(res => res.json())
    .then(data => {

      // ================= TREND CHART =================
      const trendEl = document.getElementById('trendChart');
      if (trendEl) {
        const labels = Object.keys(data.exception_trends || {});
        const values = Object.values(data.exception_trends || {});

        if (trendEl._chartInstance) trendEl._chartInstance.destroy();

        trendEl._chartInstance = new Chart(trendEl, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Exception Count',
                data: values,
                backgroundColor: 'rgba(248,113,113,0.7)',
                borderRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { color: 'rgba(200,215,255,0.6)' } }
            },
            scales: {
              x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(200,215,255,0.4)' } },
              y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(200,215,255,0.4)' } }
            }
          }
        });
      }

      // ================= RISK CHART =================
      const riskEl = document.getElementById('riskChart');
      if (riskEl) {
        const labels = Object.keys(data.risk_distribution || {});
        const values = Object.values(data.risk_distribution || {});

        if (riskEl._chartInstance) riskEl._chartInstance.destroy();

        riskEl._chartInstance = new Chart(riskEl, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [{
              data: values,
              backgroundColor: [
                'rgba(52,211,153,0.8)',
                'rgba(245,158,11,0.8)',
                'rgba(248,113,113,0.8)'
              ]
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: 'rgba(200,215,255,0.6)', font: { size: 11 } }
              }
            }
          }
        });
      }

      // ================= DRIVER CHART =================
      const driverEl = document.getElementById('driverChart');
      if (driverEl) {
        const labels = Object.keys(data.driver_distribution || {});
        const values = Object.values(data.driver_distribution || {});

        if (driverEl._chartInstance) driverEl._chartInstance.destroy();

        driverEl._chartInstance = new Chart(driverEl, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Drivers',
              data: values,
              backgroundColor: 'rgba(52,211,153,0.8)',
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: 'rgba(200,215,255,0.4)' } },
              y: { ticks: { color: 'rgba(200,215,255,0.4)' } }
            }
          }
        });
      }
    })
    .catch(err => console.error("Dashboard error:", err));

  // ================= VEHICLES TABLE =================
  fetch("http://127.0.0.1:8000/vehicles")
    .then(res => res.json())
    .then(vehicles => {
      const tbody = document.getElementById("risk-table-body");
      if (!tbody) return;

      function riskClass(risk) {
        const r = String(risk || '').toLowerCase();
        if (r.includes('high')) return 'risk-high';
        if (r.includes('medium') || r.includes('moderate')) return 'risk-med';
        if (r.includes('low')) return 'risk-low';
        return '';
      }

      tbody.innerHTML = vehicles.map(v => {
        const rc = riskClass(v.risk);
        const riskText = String(v.risk ?? '');
        return `
        <tr>
          <td><strong>${v.vehicle_id}</strong></td>
          <td>${v.score}</td>
          <td>${v.exceptions}</td>
          <td><span class="risk-badge ${rc}">${riskText}</span></td>
        </tr>
      `;
      }).join("");
    });

  // ================= AI INSIGHTS =================
  fetch("http://127.0.0.1:8000/ai-insights")
    .then(res => res.json())
    .then(data => {
      const el = document.getElementById("ai-insights");
      if (!el) return;

      const insights = Array.isArray(data.insights) ? data.insights : [];

      function getSeverity(text = "") {
        const t = String(text).toLowerCase();
        if (t.includes('highest') || t.includes('critical') || t.includes('very high') || t.includes('high risk') || t.includes('risk level: high') || t.includes('warning') || t.includes('danger')) return 'high';
        if (t.includes('medium') || t.includes('moderate') || t.includes('elevated') || t.includes('risk level: medium') || t.includes('caution')) return 'medium';
        if (t.includes('low') || t.includes('safe') || t.includes('below average') || t.includes('risk level: low')) return 'low';
        return 'low';
      }

      function getIcon(text = "") {
        const t = String(text).toLowerCase();
        if (t.includes('highest') || t.includes('critical') || t.includes('risk') || t.includes('high')) return '⚠';
        if (t.includes('medium') || t.includes('moderate') || t.includes('caution')) return '▣';
        return '⟐';
      }

      const removedCardMatchers = [
        'driver',
        'safety score'
      ];

      const filteredInsights = insights.filter((i) => {
        const text = String(i || '').toLowerCase();
        return !removedCardMatchers.some((m) => text.includes(m));
      });

      el.innerHTML = filteredInsights
        .map((i) => {
          const severity = getSeverity(i);
          const icon = getIcon(i);
          const title = (String(i).trim().slice(0, 42) + (String(i).trim().length > 42 ? '…' : '')).replace(/^[-•\s]+/, '');
          return `
            <div class="insight-item" data-severity="${severity}">
              <span class="insight-dot" aria-hidden="true" style="background: ${severity === 'high' ? '#ef4444' : severity === 'medium' ? '#f59e0b' : '#22c55e'}"></span>
              <div class="insight-main">
                <div class="insight-title">${icon} ${title}</div>
                <div class="insight-text">${String(i)}</div>
              </div>
            </div>
          `;
        })
        .join("");
    })
    .catch(() => {
      document.getElementById("ai-insights").innerHTML = "Unable to load AI insights";
    });
}

// =================== SIDEBAR (chat-only analysis) ===================
async function initSidebar() {
  const sb = document.getElementById("sidebar-vehicles");
  if (!sb) return;
  try {
    const response = await fetch("http://127.0.0.1:8000/vehicles");
    const vehicles = await response.json();
    sb.innerHTML = vehicles.map(v => `
      <div class="sidebar-vehicle" onclick="sendPrompt('Analyze vehicle TT${v.vehicle_id}')">
        <div>
          <div class="sv-id">${v.vehicle_id}</div>
          <div class="sv-meta">Score: ${(v.safety_score ?? v.score ?? 0)}/100</div>
        </div>
        <div class="sv-dot" style="background:${v.risk === 'high' ? '#ef4444' : v.risk === 'medium' ? '#f59e0b' : '#22c55e'}"></div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Sidebar fetch failed:', e);
  }
}
initSidebar();

// =================== CHATBOT ===================
const _LEVEL_COLORS = {
  Low: '#22c55e',
  Medium: '#f59e0b',
  Moderate: '#f59e0b',
  High: '#ef4444',
};

function formatAIText(text) {
  console.time('formatAIText');

  const replacements = [
    [/(RISK LEVEL|Risk Level): (Low|Moderate|High)/g,
      (_, label, level) => `<span style="color:${_LEVEL_COLORS[level]};font-weight:700"> ${label}: ${level}</span>`],
    [/(CONFIDENCE|Confidence): (Low|Medium|High)/g,
      (_, label, level) => `<span style="color:${_LEVEL_COLORS[level]};font-weight:700"> ${label}: ${level}</span>`],
    [/Grade: A\+/g, '<span class="grade-badge grade-badge-ap">🟢 Grade A+</span>'],
    [/Grade: A(?!\+)/g, '<span class="grade-badge grade-badge-a">🟢 Grade A</span>'],
    [/Grade: B/g, '<span class="grade-badge grade-badge-b">🟡 Grade B</span>'],
    [/Grade: C/g, '<span class="grade-badge grade-badge-c">🟠 Grade C</span>'],
    [/Grade: D/g, '<span class="grade-badge grade-badge-d">🟠 Grade D</span>'],
    [/Grade: F/g, '<span class="grade-badge grade-badge-f">🔴 Grade F</span>'],
    [/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary)">$1</strong>'],
    [/•\s*/g, ''],
  ];

  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  
  if (result.includes('<table')) {
    result = result.replace(/>\s*\n\s*</g, '><');
  }
  
  result = result.replace(/\n/g, '<br>');
  result = result.replace(/(<br>\s*){3,}/g, '<br><br>');

  console.timeEnd('formatAIText');
  return result;
}

function addMessage(role, content, extra = '') {
  const chatWindow = document.getElementById('chat-window');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `
    <div class="msg-avatar ${role === 'user' ? 'user-av' : 'ai'}">${role === 'user' ? 'U' : '⬡'}</div>
    <div class="msg-body">
      <div class="msg-bubble ${role === 'user' ? 'user' : 'ai'}">${content}</div>
      ${extra}
    </div>
  `;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return div;
}

function addTyping() {
  const chatWindow = document.getElementById('chat-window');
  const div = document.createElement('div');
  div.className = 'msg';
  div.id = 'typing-indicator';
  div.innerHTML = `
    <div class="msg-avatar ai">⬡</div>
    <div class="msg-body">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function removeTyping() {
  document.getElementById('typing-indicator')?.remove();
}

async function getAIResponse(input) {
  console.time('getAIResponse');
  const vehicleMatch = input.match(/\d+/);
  try {
    const response = await fetch("http://127.0.0.1:8000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicle_id: parseInt(vehicleMatch ? vehicleMatch[0] : 0)
      })
    });

    const data = await response.json();
    console.log("BACKEND RESPONSE:", data);

    if (data.reply) {
      console.timeEnd('getAIResponse');
      return { type: "text", text: data.reply };
    }

    let cleanedAnalysis = data.ai_analysis || '';
    cleanedAnalysis = cleanedAnalysis
      .split('\n')
      .filter(line => {
        const l = line.toLowerCase();
        return !l.includes('recommended vehicle') && 
               !l.includes('recommended usage') && 
               !l.includes('risk contribution');
      })
      .join('\n')
      .trim();

    const breakdownRows = data.breakdown && Object.entries(data.breakdown).length > 0
      ? Object.entries(data.breakdown)
          .map(([type, count]) => `<tr><td>${type}</td><td>${count}</td></tr>`)
          .join('')
      : '<tr><td colspan="2" style="text-align:center;color:var(--text-muted)">No exceptions recorded</td></tr>';

    console.timeEnd('getAIResponse');
    return {
      type: "text",
      text: `<div class="aegis-table-container">
  <div class="table-title">Table 1: Vehicle Summary</div>
  <table class="aegis-table">
    <thead>
      <tr><th>Metric</th><th>Value</th></tr>
    </thead>
    <tbody>
      <tr><td>Vehicle ID</td><td>TT${data.vehicle_id ?? "N/A"}</td></tr>
      <tr><td>Driver Name</td><td>${data.driver_name}</td></tr>
      <tr><td>Safety Score</td><td>${data.safety_score}</td></tr>
      <tr><td>Grade</td><td>Grade: ${data.grade}</td></tr>
      <tr><td>Risk Level</td><td>Risk Level: ${data.risk_level}</td></tr>
      <tr><td>Confidence</td><td>Confidence: ${data.confidence}</td></tr>
      <tr><td>Trips Analyzed</td><td>${data.total_trips}</td></tr>
      <tr><td>Past Total Exceptions</td><td>${data.total_exceptions}</td></tr>
      <tr><td>Unique Exception Types</td><td>${data.unique_exception_types}</td></tr>
      <tr><td>Highest Risk Exception</td><td>${data.highest_risk_exception}</td></tr>
    </tbody>
  </table>
</div>

<div class="aegis-table-container">
  <div class="table-title">Table 2: Exception Breakdown</div>
  <table class="aegis-table">
    <thead>
      <tr><th>Exception Type</th><th>Count</th></tr>
    </thead>
    <tbody>
      ${breakdownRows}
    </tbody>
  </table>
</div>

<div class="aegis-table-container">
  <div class="table-title">Table 3: AI Analysis</div>
  <table class="aegis-table">
    <thead>
      <tr><th>Analysis</th></tr>
    </thead>
    <tbody>
      <tr><td class="ai-analysis-cell">${cleanedAnalysis}</td></tr>
    </tbody>
  </table>
</div>`
    };
  } catch (err) {
    console.error("FULL ERROR:", err);
    if (err.stack) console.error(err.stack);
    console.timeEnd('getAIResponse');
    return { type: "text", text: "Failed to connect." };
  }
}

let isProcessing = false;

function sendPrompt(text) {
  const input = document.getElementById('chat-input');
  if (input) input.value = text;
  submitChat();
}

async function submitChat() {
  if (isProcessing) return;
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  const sp = document.getElementById('suggested-prompts');
  if (sp) sp.style.display = 'none';

  input.value = '';
  input.style.height = '';
  isProcessing = true;

  console.time('addMessage-user');
  addMessage('user', text);
  console.timeEnd('addMessage-user');

  addTyping();

  const response = await getAIResponse(text);
  removeTyping();

  console.time('addMessage-ai');
  addMessage('ai', formatAIText(response.text));
  console.timeEnd('addMessage-ai');

  isProcessing = false;
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitChat();
  }
}

function autoResize(el) {
  el.style.height = '';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// =================== CHECKBOX ===================
function toggleCheck(el) {
  el.classList.toggle('checked');
  el.textContent = el.classList.contains('checked') ? '✓' : '';
}

// =================== INIT ===================
window.addEventListener('load', () => {
  loadFleetSummary();
  setInterval(() => {
    loadFleetSummary();
  }, 30000);

  // Make sure Dashboard navigation triggers the counters even if the
  // previous API call completed before navigation.
  window.addEventListener('focus', () => {
    const dashActive = document.getElementById('dashboard-page')?.classList.contains('active');
    if (dashActive) loadFleetSummary();
  });
});


async function loadFleetSummary() {
  try {
    const response = await fetch("http://127.0.0.1:8000/fleet-summary");
    const data = await response.json();

    // HOME PAGE (animate AFTER API response)
    animateCounter("homeTotalVehicles", data.total_vehicles);
    animateCounter("homeTotalTrips", data.total_trips);
    animateCounter("homeAvgScore", data.avg_safety_score, "%");
    animateCounter("homeRepeatVehicles", data.repeat_vehicles);
    animateCounter("homeTotalExceptions", data.total_exceptions);

    // DASHBOARD PAGE (animate AFTER API response)
    animateCounter("dbTotalTrips", data.total_trips);
    animateCounter("dbTotalVehicles", data.total_vehicles);
    animateCounter("dbAvgScore", data.avg_safety_score, "%");
    animateCounter("dbRepeatVehicles", data.repeat_vehicles);

  } catch(err) {
    console.error("Fleet Summary Error:", err);
  }
}