const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

const questions = [
  { key: "usefulness", label: "内容实用度", prompt: "听完能用上吗？" },
  { key: "insight", label: "见解深度", prompt: "有没有独到洞察？" },
  { key: "clarity", label: "结构清晰度", prompt: "听得懂、跟得上吗？" },
  { key: "caseQuality", label: "案例质量", prompt: "有真实例支撑吗？" },
  { key: "interaction", label: "互动参与感", prompt: "有参与感还是全程被动？" }
];

let currentUser = null;
let authMode = "login";

function route() {
  return window.location.pathname;
}

function isActive(path) {
  const current = route();
  if (path === "/") return current === "/";
  return current.startsWith(path);
}

function html(strings, ...values) {
  return strings.reduce((output, part, index) => output + part + (values[index] ?? ""), "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatScore(value, suffix = "") {
  return value === null || value === undefined ? "暂无" : `${Number(value).toFixed(1)}${suffix}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(payload.error || payload || "请求失败");
  }

  return payload;
}

function go(path) {
  window.history.pushState({}, "", path);
  render();
}

function shell(content) {
  const publicSurvey = route().startsWith("/survey/");
  const nav = publicSurvey ? "" : html`
    <a class="${isActive("/") ? "active" : ""}" href="/" data-link>入口</a>
    <a class="${isActive("/teacher") ? "active" : ""}" href="/teacher" data-link>讲师后台</a>
    <a class="${isActive("/admin") ? "active" : ""}" href="/admin" data-link>管理员</a>
    ${currentUser ? `<button type="button" data-action="logout">退出 ${escapeHtml(currentUser.name)}</button>` : ""}
  `;

  app.innerHTML = html`
    <div class="shell">
      <header class="topbar">
        <div class="topbar-inner">
          <div class="brand">
            <div class="brand-mark">KPI</div>
            <div class="brand-name">课程分享绩效调研</div>
          </div>
          ${nav ? `<nav class="nav">${nav}</nav>` : ""}
        </div>
      </header>
      <main class="main">${content}</main>
    </div>
  `;

  bindCommonEvents();
}

function bindCommonEvents() {
  document.querySelectorAll("[data-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      go(link.getAttribute("href"));
    });
  });

  document.querySelectorAll("[data-action='logout']").forEach((button) => {
    button.addEventListener("click", async () => {
      await api("/api/auth/logout", { method: "POST" });
      currentUser = null;
      showToast("已退出登录");
      go("/");
    });
  });
}

function renderHome() {
  shell(html`
    <section class="auth-layout">
      <div class="panel pad">
        <p class="eyebrow">现场学员评 · 后台自动核算</p>
        <h1>课程分享满意度调研与<span class="nowrap">绩效评分</span></h1>
        <p class="sub">围绕“知识分享/项目复盘分享”收集学员评价，系统按 5 个问卷维度汇总总分，并在绩效核算时剔除最高分和最低分。</p>

        <div class="entry-strip">
          <a class="entry" href="/teacher" data-link>
            <strong>讲师</strong>
            <span>注册账号、创建课程、生成问卷二维码、查看个人绩效。</span>
          </a>
          <a class="entry" href="/admin" data-link>
            <strong>管理员</strong>
            <span>查看全部讲师、全部课程、明细评价和绩效核算结果。</span>
          </a>
          <div class="entry">
            <strong>学员</strong>
            <span>扫描讲师课程二维码进入问卷，按 5 个维度直接评分。</span>
          </div>
        </div>
      </div>

      <div class="panel pad">
        <h2>KPI 核算口径</h2>
        <table class="kpi-table">
          <thead>
            <tr>
              <th>问卷维度</th>
              <th>分值</th>
            </tr>
          </thead>
          <tbody>
            ${questions.map((item, index) => html`
              <tr>
                <td>${index + 1}. ${item.label}<br><span class="hint">${item.prompt}</span></td>
                <td>0-20 分</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <p class="hint" style="margin-top:12px;">绩效目标：满意度 95% 以上对应 120-100 分；94%-89% 对应 100-85 分；88%-81% 对应 84-70 分；80%-77% 对应 69-60 分；低于 77% 此项考核为 0。KPI 权重为 30%。</p>
      </div>
    </section>
  `);
}

function renderAuth(targetRole = "teacher") {
  const isAdmin = targetRole === "admin";
  const title = isAdmin ? "管理员登录" : "讲师后台";
  const subtitle = isAdmin ? "查看全部课程分享调研数据与绩效核算结果。" : "注册或登录后创建课程问卷，生成专属二维码。";

  shell(html`
    <section class="auth-layout">
      <div class="panel pad">
        <p class="eyebrow">${isAdmin ? "全局数据" : "讲师专属"}</p>
        <h1>${title}</h1>
        <p class="sub">${subtitle}</p>
        <div class="entry-strip">
          <div class="entry">
            <strong>评分方式</strong>
            <span>五项维度各 20 分，学员提交后自动汇总总分。</span>
          </div>
          <div class="entry">
            <strong>剔除规则</strong>
            <span>有效样本达到 3 份后，核算时剔除最高分和最低分。</span>
          </div>
          <div class="entry">
            <strong>绩效权重</strong>
            <span>按 KPI 档位换算绩效分，并同步计算 30% 权重得分。</span>
          </div>
        </div>
      </div>

      <div class="panel pad auth-card">
        ${isAdmin ? "" : html`
          <div class="tabs">
            <button type="button" class="tab ${authMode === "login" ? "active" : ""}" data-auth-mode="login">登录</button>
            <button type="button" class="tab ${authMode === "register" ? "active" : ""}" data-auth-mode="register">注册</button>
          </div>
        `}

        <form id="authForm">
          ${!isAdmin && authMode === "register" ? html`
            <div class="field">
              <label for="name">讲师姓名</label>
              <input id="name" name="name" autocomplete="name" required />
            </div>
          ` : ""}
          <div class="field">
            <label for="email">邮箱</label>
            <input id="email" name="email" type="email" autocomplete="email" value="${isAdmin ? "admin@example.com" : ""}" required />
          </div>
          <div class="field">
            <label for="password">密码</label>
            <input id="password" name="password" type="password" autocomplete="${authMode === "register" ? "new-password" : "current-password"}" value="${isAdmin ? "admin123456" : ""}" required />
          </div>
          <button class="btn" type="submit">
            <span class="button-icon">${isAdmin ? "A" : "T"}</span>
            ${isAdmin ? "进入管理员后台" : authMode === "register" ? "注册并进入后台" : "进入讲师后台"}
          </button>
        </form>
      </div>
    </section>
  `);

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      authMode = button.dataset.authMode;
      renderAuth(targetRole);
    });
  });

  document.querySelector("#authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const endpoint = !isAdmin && authMode === "register" ? "/api/auth/register" : "/api/auth/login";

    try {
      const data = await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
      if (isAdmin && data.user.role !== "admin") throw new Error("该账号不是管理员");
      if (!isAdmin && data.user.role !== "teacher") throw new Error("该账号不是讲师");
      currentUser = data.user;
      showToast("登录成功");
      go(isAdmin ? "/admin" : "/teacher");
    } catch (error) {
      showToast(error.message);
    }
  });
}

function metric(label, value, foot = "") {
  return html`
    <div class="metric">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      ${foot ? `<div class="metric-foot">${foot}</div>` : ""}
    </div>
  `;
}

function surveyUrl(courseId) {
  return `${window.location.origin}/survey/${courseId}`;
}

function qrUrl(courseId) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(surveyUrl(courseId))}`;
}

async function renderTeacherDashboard() {
  if (!currentUser || currentUser.role !== "teacher") return renderAuth("teacher");

  shell(`<div class="state-message"><div class="panel pad">正在读取讲师数据...</div></div>`);

  try {
    const data = await api("/api/teacher/dashboard");
    shell(html`
      <section class="dashboard-stack">
        <div class="view-head">
          <div>
            <p class="eyebrow">讲师后台</p>
            <h1>${escapeHtml(data.user.name)} 的课程数据</h1>
            <p class="sub">创建课程后，把二维码发给现场学员扫码填写。</p>
          </div>
          <div class="action-row">
            <button class="btn secondary" type="button" data-refresh>刷新数据</button>
          </div>
        </div>

        <div class="grid four">
          ${metric("问卷总数", data.stats.count, data.stats.trimNote)}
          ${metric("剔除后满意度", formatScore(data.stats.satisfaction, "%"), "按总分 100 折算")}
          ${metric("绩效分", formatScore(data.stats.kpiScore), data.stats.band)}
          ${metric("30% 权重得分", formatScore(data.stats.weightedScore), "知识分享/项目复盘分享")}
        </div>

        <div class="grid two">
          <div class="panel pad">
            <h2>创建课程问卷</h2>
            <form id="courseForm" class="course-form">
              <div class="field">
                <label for="title">课程名称</label>
                <input id="title" name="title" placeholder="例如：5 月项目复盘分享" required />
              </div>
              <div class="field">
                <label for="scheduledAt">授课时间</label>
                <input id="scheduledAt" name="scheduledAt" type="datetime-local" />
              </div>
              <div class="field">
                <label for="description">课程备注</label>
                <textarea id="description" name="description" placeholder="可填写分享主题、项目背景或适用对象"></textarea>
              </div>
              <button class="btn" type="submit"><span class="button-icon">+</span>生成问卷二维码</button>
            </form>
          </div>

          <div class="panel pad">
            <h2>维度均分</h2>
            ${renderDimensionGrid(data.stats.dimensionAverages)}
          </div>
        </div>

        <div class="panel pad">
          <div class="view-head" style="margin-bottom:14px;">
            <div>
              <h2>我的课程二维码</h2>
              <p class="sub">二维码根据当前访问地址生成。手机扫码时，请用局域网地址打开讲师后台。</p>
            </div>
          </div>
          ${data.courses.length ? `<div class="course-list">${data.courses.map(renderCourseItem).join("")}</div>` : `<div class="empty">还没有课程。创建第一场分享后，这里会出现二维码和核算结果。</div>`}
        </div>

        <div class="panel pad">
          <h2>最近评价明细</h2>
          ${renderResponsesTable(data.responses)}
        </div>
      </section>
    `);

    document.querySelector("[data-refresh]")?.addEventListener("click", renderTeacherDashboard);
    bindCourseEvents();
  } catch (error) {
    if (error.message.includes("请先登录")) {
      currentUser = null;
      return renderAuth("teacher");
    }
    shell(`<div class="state-message"><div class="panel pad">${escapeHtml(error.message)}</div></div>`);
  }
}

function renderDimensionGrid(averages = {}) {
  return html`
    <div class="grid two">
      ${questions.map((item) => metric(item.label, formatScore(averages[item.key], " /20"), item.prompt)).join("")}
    </div>
  `;
}

function renderCourseItem(course) {
  const status = course.active ? `<span class="badge ok">问卷开放</span>` : `<span class="badge warn">已关闭</span>`;
  return html`
    <article class="course-item">
      <div>
        <h3>${escapeHtml(course.title)}</h3>
        <p class="sub">${escapeHtml(course.description || "暂无备注")}</p>
        <div class="course-meta">
          ${status}
          <span class="badge blue">${escapeHtml(course.category)}</span>
          <span class="badge">${formatDate(course.scheduledAt)}</span>
          <span class="badge">${course.stats.count} 份评价</span>
        </div>
        <div class="grid four">
          ${metric("满意度", formatScore(course.stats.satisfaction, "%"), course.stats.trimNote)}
          ${metric("绩效分", formatScore(course.stats.kpiScore), course.stats.band)}
          ${metric("权重得分", formatScore(course.stats.weightedScore), "30%")}
          ${metric("原始均分", formatScore(course.stats.rawAverage), "未剔除")}
        </div>
        <div class="action-row" style="margin-top:14px;">
          <button class="btn small secondary" data-copy="${escapeHtml(surveyUrl(course.id))}"><span class="button-icon">C</span>复制链接</button>
          <button class="btn small ghost" data-toggle-course="${course.id}" data-active="${course.active ? "false" : "true"}">${course.active ? "关闭问卷" : "重新开放"}</button>
        </div>
      </div>
      <div class="qr-box">
        <img src="${qrUrl(course.id)}" alt="${escapeHtml(course.title)} 问卷二维码" />
        <div class="link-line">${escapeHtml(surveyUrl(course.id))}</div>
      </div>
    </article>
  `;
}

function bindCourseEvents() {
  document.querySelector("#courseForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api("/api/courses", { method: "POST", body: JSON.stringify(payload) });
      showToast("课程问卷已创建");
      renderTeacherDashboard();
    } catch (error) {
      showToast(error.message);
    }
  });

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      showToast("问卷链接已复制");
    });
  });

  document.querySelectorAll("[data-toggle-course]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.toggleCourse;
      const active = button.dataset.active === "true";
      try {
        await api(`/api/courses/${id}`, { method: "PATCH", body: JSON.stringify({ active }) });
        showToast(active ? "问卷已开放" : "问卷已关闭");
        renderTeacherDashboard();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

async function renderAdminDashboard() {
  if (!currentUser || currentUser.role !== "admin") return renderAuth("admin");

  shell(`<div class="state-message"><div class="panel pad">正在读取管理员数据...</div></div>`);

  try {
    const data = await api("/api/admin/dashboard");
    shell(html`
      <section class="dashboard-stack">
        <div class="view-head">
          <div>
            <p class="eyebrow">管理员后台</p>
            <h1>全部课程绩效数据</h1>
            <p class="sub">可查看所有讲师、所有课程、问卷明细，并导出原始评价。</p>
          </div>
          <div class="action-row">
            <a class="btn secondary" href="/api/admin/export"><span class="button-icon">E</span>导出 CSV</a>
            <button class="btn secondary" type="button" data-refresh>刷新数据</button>
          </div>
        </div>

        <div class="grid four">
          ${metric("讲师数", data.teachers.length)}
          ${metric("课程数", data.courses.length)}
          ${metric("评价总数", data.responses.length, data.stats.trimNote)}
          ${metric("全局绩效分", formatScore(data.stats.kpiScore), data.stats.band)}
        </div>

        <div class="panel pad">
          <h2>课程绩效排行</h2>
          ${renderCoursesTable(data.courses)}
        </div>

        <div class="panel pad">
          <h2>讲师汇总</h2>
          ${renderTeachersTable(data.teachers)}
        </div>

        <div class="panel pad">
          <h2>全部评价明细</h2>
          ${renderResponsesTable(data.responses, true)}
        </div>
      </section>
    `);

    document.querySelector("[data-refresh]")?.addEventListener("click", renderAdminDashboard);
  } catch (error) {
    if (error.message.includes("请先登录")) {
      currentUser = null;
      return renderAuth("admin");
    }
    shell(`<div class="state-message"><div class="panel pad">${escapeHtml(error.message)}</div></div>`);
  }
}

function renderCoursesTable(courses) {
  if (!courses.length) return `<div class="empty">还没有课程数据。</div>`;
  const sorted = courses.slice().sort((a, b) => (b.stats.kpiScore || 0) - (a.stats.kpiScore || 0));
  return html`
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>课程</th>
            <th>讲师</th>
            <th>评价数</th>
            <th>剔除后满意度</th>
            <th>绩效分</th>
            <th>权重得分</th>
            <th>核算说明</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map((course) => html`
            <tr>
              <td>${escapeHtml(course.title)}<br><span class="hint">${formatDate(course.scheduledAt)}</span></td>
              <td>${escapeHtml(course.teacherName)}<br><span class="hint">${escapeHtml(course.teacherEmail)}</span></td>
              <td>${course.stats.count}</td>
              <td>${formatScore(course.stats.satisfaction, "%")}</td>
              <td>${formatScore(course.stats.kpiScore)}</td>
              <td>${formatScore(course.stats.weightedScore)}</td>
              <td>${escapeHtml(course.stats.trimNote)}<br><span class="hint">${escapeHtml(course.stats.band)}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTeachersTable(teachers) {
  if (!teachers.length) return `<div class="empty">还没有讲师注册。</div>`;
  return html`
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>讲师</th>
            <th>邮箱</th>
            <th>评价数</th>
            <th>满意度</th>
            <th>绩效分</th>
            <th>30% 权重得分</th>
          </tr>
        </thead>
        <tbody>
          ${teachers.map((teacher) => html`
            <tr>
              <td>${escapeHtml(teacher.name)}</td>
              <td>${escapeHtml(teacher.email)}</td>
              <td>${teacher.stats.count}</td>
              <td>${formatScore(teacher.stats.satisfaction, "%")}</td>
              <td>${formatScore(teacher.stats.kpiScore)}</td>
              <td>${formatScore(teacher.stats.weightedScore)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderResponsesTable(responses, admin = false) {
  if (!responses.length) return `<div class="empty">还没有学员提交评价。</div>`;
  return html`
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>提交时间</th>
            ${admin ? "<th>讲师</th><th>课程</th>" : ""}
            <th>学员</th>
            <th>部门</th>
            <th>五维得分</th>
            <th>总分</th>
            <th>建议</th>
          </tr>
        </thead>
        <tbody>
          ${responses.map((response) => html`
            <tr>
              <td>${formatDate(response.createdAt)}</td>
              ${admin ? `<td>${escapeHtml(response.teacherName)}<br><span class="hint">${escapeHtml(response.teacherEmail)}</span></td><td>${escapeHtml(response.courseTitle)}</td>` : ""}
              <td>${escapeHtml(response.participantName || "匿名")}</td>
              <td>${escapeHtml(response.department || "-")}</td>
              <td>${questions.map((item) => `${item.label} ${response.scores[item.key]}`).join(" / ")}</td>
              <td><strong>${formatScore(response.total)}</strong></td>
              <td>${escapeHtml(response.comment || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function renderSurvey(courseId) {
  shell(`<div class="state-message"><div class="panel pad">正在打开问卷...</div></div>`);

  try {
    const data = await api(`/api/public/courses/${courseId}`);
    const course = data.course;
    const teacher = data.teacher;

    shell(html`
      <section class="dashboard-stack">
        <div class="view-head">
          <div>
            <p class="eyebrow">现场学员评价</p>
            <h1>${escapeHtml(course.title)}</h1>
            <p class="sub">讲师：${escapeHtml(teacher?.name || "未知讲师")} · ${escapeHtml(course.category || "知识分享/项目复盘分享")}</p>
          </div>
          <div class="compact-panel">
            <strong>${course.active ? "问卷开放中" : "问卷已关闭"}</strong>
            <div class="hint">${formatDate(course.scheduledAt)}</div>
          </div>
        </div>

        ${course.active ? renderSurveyForm(courseId, course) : `<div class="panel pad"><div class="empty">该课程问卷已关闭。</div></div>`}
      </section>
    `);

    if (course.active) bindSurveyForm(courseId);
  } catch (error) {
    shell(`<div class="state-message"><div class="panel pad">${escapeHtml(error.message)}</div></div>`);
  }
}

function renderSurveyForm(courseId, course) {
  return html`
    <form id="surveyForm" class="survey-form">
      <div class="grid two">
        <div class="field">
          <label for="participantName">学员姓名</label>
          <input id="participantName" name="participantName" placeholder="可匿名" />
        </div>
        <div class="field">
          <label for="department">部门/小组</label>
          <input id="department" name="department" placeholder="例如：运营部" />
        </div>
      </div>

      <div class="score-card">
        ${questions.map((item) => html`
          <div class="score-row" data-score-row="${item.key}">
            <div class="score-title">${item.label}<span>${item.prompt}</span></div>
            <input type="range" min="0" max="20" step="1" value="18" name="${item.key}" aria-label="${item.label}" />
            <input class="score-number" type="number" min="0" max="20" step="1" value="18" data-score-number="${item.key}" aria-label="${item.label}分数" />
          </div>
        `).join("")}
      </div>

      <div class="field">
        <label for="comment">建议与反馈</label>
        <textarea id="comment" name="comment" placeholder="可填写对课程内容、案例、互动方式的建议"></textarea>
      </div>

      <div class="survey-total">
        <div>
          <div class="hint">当前问卷总分</div>
          <div class="total-number"><span id="totalScore">90</span> / 100</div>
        </div>
        <button class="btn" type="submit"><span class="button-icon">✓</span>提交评价</button>
      </div>
    </form>
  `;
}

function bindSurveyForm(courseId) {
  const form = document.querySelector("#surveyForm");
  const totalScore = document.querySelector("#totalScore");

  function updateTotal() {
    const total = questions.reduce((sum, item) => {
      const input = form.querySelector(`input[type="range"][name="${item.key}"]`);
      return sum + Number(input.value || 0);
    }, 0);
    totalScore.textContent = total.toFixed(0);
  }

  questions.forEach((item) => {
    const range = form.querySelector(`input[type="range"][name="${item.key}"]`);
    const number = form.querySelector(`[data-score-number="${item.key}"]`);
    range.addEventListener("input", () => {
      number.value = range.value;
      updateTotal();
    });
    number.addEventListener("input", () => {
      const value = Math.min(20, Math.max(0, Number(number.value || 0)));
      range.value = value;
      number.value = value;
      updateTotal();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector("button[type='submit']");
    submitButton.disabled = true;

    const formData = new FormData(form);
    const scores = {};
    questions.forEach((item) => {
      scores[item.key] = Number(formData.get(item.key));
    });

    try {
      const payload = {
        participantName: formData.get("participantName"),
        department: formData.get("department"),
        comment: formData.get("comment"),
        scores
      };
      const result = await api(`/api/public/courses/${courseId}/responses`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      shell(html`
        <div class="state-message">
          <div class="panel pad">
            <div class="success-mark">✓</div>
            <h1>评价已提交</h1>
            <p class="sub">本次总分 ${formatScore(result.response.total)}，感谢你的反馈。</p>
          </div>
        </div>
      `);
    } catch (error) {
      showToast(error.message);
      submitButton.disabled = false;
    }
  });

  updateTotal();
}

async function render() {
  const path = route();
  if (path.startsWith("/survey/")) {
    const courseId = decodeURIComponent(path.split("/").filter(Boolean)[1] || "");
    return renderSurvey(courseId);
  }
  if (path.startsWith("/teacher")) return renderTeacherDashboard();
  if (path.startsWith("/admin")) return renderAdminDashboard();
  return renderHome();
}

async function boot() {
  try {
    const data = await api("/api/auth/me");
    currentUser = data.user;
  } catch {
    currentUser = null;
  }
  render();
}

window.addEventListener("popstate", render);
boot();
