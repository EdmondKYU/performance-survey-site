const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

const fallbackTemplates = [
  {
    id: "course_share",
    name: "课程分享满意度调研",
    shortName: "课程分享",
    ownerRoleName: "讲师",
    itemName: "课程",
    itemNamePlaceholder: "例如：5 月项目复盘分享",
    itemNoteName: "课程备注",
    itemNotePlaceholder: "可填写分享主题、项目背景或适用对象",
    defaultCategory: "知识分享/项目复盘分享",
    respondentNameLabel: "评价人",
    respondentDepartmentLabel: "所属部门",
    respondentNameFallback: "匿名学员",
    dataSource: "现场学员评",
    achievementLabel: "满意度",
    achievementSuffix: "%",
    maxTotal: 100,
    questions: [
      { key: "usefulness", label: "内容实用度", prompt: "听完能用上吗？" },
      { key: "insight", label: "见解深度", prompt: "有没有独到洞察？" },
      { key: "clarity", label: "结构清晰度", prompt: "听得懂、跟得上吗？" },
      { key: "caseQuality", label: "案例质量", prompt: "有真实例支撑吗？" },
      { key: "interaction", label: "互动参与感", prompt: "有参与感还是全程被动？" }
    ]
  },
  {
    id: "cross_department",
    name: "跨部门协同满意度调研",
    shortName: "跨部门协同",
    ownerRoleName: "负责人",
    itemName: "协同事项",
    itemNamePlaceholder: "例如：新品上市跨部门协同",
    itemNoteName: "协同说明",
    itemNotePlaceholder: "可填写协同背景、参与部门、交付目标或周期",
    defaultCategory: "跨部门协同",
    respondentNameLabel: "评价人",
    respondentDepartmentLabel: "所属部门",
    respondentNameFallback: "匿名评价人",
    dataSource: "协作满意度问卷评分",
    achievementLabel: "协作得分",
    achievementSuffix: "",
    maxTotal: 120,
    questions: [
      { key: "requirementClarity", label: "需求清晰度", prompt: "目标、需求与验收口径是否清晰？" },
      { key: "deliveryStandard", label: "交付规范性", prompt: "交付物是否规范、完整、可复用？" },
      { key: "responseSpeed", label: "响应时效性", prompt: "响应是否及时，关键节点是否不拖延？" },
      { key: "collaborationFit", label: "协作配合度", prompt: "跨部门配合是否主动、顺畅？" },
      { key: "communicationEffect", label: "沟通有效性", prompt: "信息传递是否准确、减少反复？" },
      { key: "processControl", label: "过程可控性", prompt: "过程是否有预警、有节奏、有闭环？" }
    ]
  },
  {
    id: "work_cooperation",
    name: "工作配合度满意度调研",
    shortName: "工作配合度",
    ownerRoleName: "被考核成员",
    itemName: "考核周期",
    itemNamePlaceholder: "例如：6 月工作配合度考核",
    itemNoteName: "考核说明",
    itemNotePlaceholder: "可填写被考核成员、所在部门、重点协作事项或考核周期",
    defaultCategory: "月度上级对成员工作配合满意度调研",
    respondentNameLabel: "评价人",
    respondentDepartmentLabel: "所属部门",
    respondentNameFallback: "匿名主管",
    dataSource: "上级主管评",
    achievementLabel: "配合度得分",
    achievementSuffix: "",
    maxTotal: 120,
    questions: [
      { key: "executionDepth", label: "执行落实度", prompt: "交办的事放心吗？" },
      { key: "ownership", label: "主动担责", prompt: "推一步走一步还是自己跑？" },
      { key: "reportCommunication", label: "汇报沟通", prompt: "进度看得见吗？出事早知道吗？" },
      { key: "adaptability", label: "灵活应变", prompt: "变了能不能跟着转？" },
      { key: "teamAlignment", label: "团队补位", prompt: "别人忙不过来会搭把手吗？" },
      { key: "emotionalStability", label: "情绪稳定度", prompt: "压力下解决问题还是制造情绪？" }
    ]
  }
];

let currentUser = null;
let authMode = "login";
let templates = fallbackTemplates;

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

function getTemplate(templateId) {
  return templates.find((template) => template.id === templateId) || templates[0] || fallbackTemplates[0];
}

function templateForCourse(course = {}) {
  return course.template || getTemplate(course.templateId);
}

function questionsFor(template) {
  return (template || getTemplate()).questions || [];
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
    <a class="${isActive("/") ? "active" : ""}" href="/" data-link>首页</a>
    <a class="${isActive("/teacher") ? "active" : ""}" href="/teacher" data-link>负责人后台</a>
    <a class="${isActive("/admin") ? "active" : ""}" href="/admin" data-link>管理员</a>
    ${currentUser ? `<button type="button" data-action="logout">退出 ${escapeHtml(currentUser.name)}</button>` : ""}
  `;

  app.innerHTML = html`
    <div class="shell">
      <header class="topbar">
        <div class="topbar-inner">
          <div class="brand">
            <div class="brand-mark">KPI</div>
            <div class="brand-name">通用考核调研平台</div>
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
        <p class="eyebrow">扫码调研 · 后台自动核算</p>
        <h1>通用考核调研平台</h1>
        <p class="sub">把不同 KPI 表格沉淀成可复用问卷模板。负责人创建问卷后生成二维码，评价人扫码打分，系统按模板规则剔除最高分和最低分并计算绩效分。</p>

        <div class="entry-strip">
          <a class="entry" href="/teacher" data-link>
            <strong>负责人</strong>
            <span>注册账号、选择模板、创建问卷、生成二维码、查看个人数据。</span>
          </a>
          <a class="entry" href="/admin" data-link>
            <strong>管理员</strong>
            <span>查看全部负责人、全部问卷、明细评价和绩效核算结果。</span>
          </a>
          <div class="entry">
            <strong>评价人</strong>
            <span>扫码进入对应问卷，按模板维度直接评分并提交反馈。</span>
          </div>
        </div>
      </div>

      <div class="panel pad">
        <h2>当前问卷模板</h2>
        <div class="template-list">
          ${templates.map((template) => html`
            <article class="template-card">
              <div>
                <strong>${escapeHtml(template.shortName)}</strong>
                <span>${escapeHtml(template.name)}</span>
              </div>
              <div class="template-meta">
                <span>${template.questions.length} 个维度</span>
                <span>满分 ${template.maxTotal}</span>
              </div>
            </article>
          `).join("")}
        </div>
        <p class="hint" style="margin-top:12px;">已支持：${templates.map((template) => template.name).join("、")}。后续新增 KPI 表格时，只需要继续增加模板。</p>
      </div>
    </section>
  `);
}

function renderAuth(targetRole = "teacher") {
  const isAdmin = targetRole === "admin";
  const title = isAdmin ? "管理员登录" : "负责人后台";
  const subtitle = isAdmin ? "查看全部考核调研数据与绩效核算结果。" : "注册或登录后选择问卷模板，生成专属二维码。";

  shell(html`
    <section class="auth-layout">
      <div class="panel pad">
        <p class="eyebrow">${isAdmin ? "全局数据" : "负责人专属"}</p>
        <h1>${title}</h1>
        <p class="sub">${subtitle}</p>
        <div class="entry-strip">
          <div class="entry">
            <strong>评分方式</strong>
            <span>按模板维度评分，每项 0-20 分，提交后自动汇总。</span>
          </div>
          <div class="entry">
            <strong>剔除规则</strong>
            <span>有效样本达到 3 份后，核算时剔除最高分和最低分。</span>
          </div>
          <div class="entry">
            <strong>绩效核算</strong>
            <span>按所选模板 KPI 档位换算绩效分，并展示核算结果。</span>
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
              <label for="name">负责人姓名</label>
              <input id="name" name="name" autocomplete="name" required />
            </div>
          ` : ""}
          <div class="field">
            <label for="email">邮箱</label>
            <input id="email" name="email" type="email" autocomplete="email" required />
          </div>
          <div class="field">
            <label for="password">密码</label>
            <input id="password" name="password" type="password" autocomplete="${authMode === "register" ? "new-password" : "current-password"}" required />
          </div>
          <button class="btn" type="submit">
            <span class="button-icon">${isAdmin ? "A" : "T"}</span>
            ${isAdmin ? "进入管理员后台" : authMode === "register" ? "注册并进入后台" : "进入负责人后台"}
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
      if (!isAdmin && data.user.role !== "teacher") throw new Error("该账号不是负责人");
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

function safeFilename(value) {
  return String(value || "问卷二维码")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

async function renderTeacherDashboard() {
  if (!currentUser || currentUser.role !== "teacher") return renderAuth("teacher");

  shell(`<div class="state-message"><div class="panel pad">正在读取负责人数据...</div></div>`);

  try {
    const data = await api("/api/teacher/dashboard");
    shell(html`
      <section class="dashboard-stack">
        <div class="view-head">
          <div>
            <p class="eyebrow">负责人后台</p>
            <h1>${escapeHtml(data.user.name)} 的调研数据</h1>
            <p class="sub">选择考核模板创建问卷后，把二维码发给评价人扫码填写。</p>
          </div>
          <div class="action-row">
            <button class="btn secondary" type="button" data-refresh>刷新数据</button>
          </div>
        </div>

        <div class="grid four">
          ${metric("问卷事项", data.courses.length)}
          ${metric("评价总数", data.responses.length)}
          ${metric("模板数量", data.templates.length)}
          ${metric("开放问卷", data.courses.filter((course) => course.active).length)}
        </div>

        <div class="grid two">
          <div class="panel pad">
            <h2>创建考核问卷</h2>
            <form id="courseForm" class="course-form">
              <div class="field">
                <label for="templateId">问卷模板</label>
                <select id="templateId" name="templateId">
                  ${data.templates.map((template) => html`
                    <option value="${template.id}">${escapeHtml(template.name)}</option>
                  `).join("")}
                </select>
              </div>
              <div class="field">
                <label for="title" id="titleLabel">问卷事项</label>
                <input id="title" name="title" placeholder="${escapeHtml(data.templates[0]?.itemNamePlaceholder || "请输入问卷事项")}" required />
              </div>
              <div class="field">
                <label for="scheduledAt">发生时间</label>
                <input id="scheduledAt" name="scheduledAt" type="datetime-local" />
              </div>
              <div class="field">
                <label for="description" id="descriptionLabel">备注说明</label>
                <textarea id="description" name="description" placeholder="${escapeHtml(data.templates[0]?.itemNotePlaceholder || "可填写背景说明")}"></textarea>
              </div>
              <button class="btn" type="submit"><span class="button-icon">+</span>生成问卷二维码</button>
            </form>
          </div>

          <div class="panel pad">
            <h2>模板核算概览</h2>
            ${renderTemplateStats(data.templateStats)}
          </div>
        </div>

        <div class="panel pad">
          <div class="view-head" style="margin-bottom:14px;">
            <div>
              <h2>我的问卷二维码</h2>
              <p class="sub">二维码根据当前访问地址生成。正式发布后，二维码会指向公网域名。</p>
            </div>
          </div>
          ${data.courses.length ? `<div class="course-list">${data.courses.map(renderCourseItem).join("")}</div>` : `<div class="empty">还没有问卷。创建第一份考核问卷后，这里会出现二维码和核算结果。</div>`}
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

function renderTemplateStats(items = []) {
  if (!items.length) return `<div class="empty">暂无模板数据。</div>`;
  return html`
    <div class="template-stat-list">
      ${items.map(({ template, stats }) => html`
        <div class="template-stat">
          <div>
            <strong>${escapeHtml(template.shortName)}</strong>
            <span>${stats.count} 份评价</span>
          </div>
          <div>
            <b>${formatScore(stats.achievement, template.achievementSuffix)}</b>
            <span>${escapeHtml(template.achievementLabel)}</span>
          </div>
          <div>
            <b>${formatScore(stats.kpiScore)}</b>
            <span>绩效分</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDimensionGrid(averages = {}, template = getTemplate()) {
  return html`
    <div class="grid two">
      ${questionsFor(template).map((item) => metric(item.label, formatScore(averages[item.key], " /20"), item.prompt)).join("")}
    </div>
  `;
}

function renderCourseItem(course) {
  const template = templateForCourse(course);
  const status = course.active ? `<span class="badge ok">问卷开放</span>` : `<span class="badge warn">已关闭</span>`;
  return html`
    <article class="course-item">
      <div>
        <h3>${escapeHtml(course.title)}</h3>
        <p class="sub">${escapeHtml(course.description || "暂无备注")}</p>
        <div class="course-meta">
          ${status}
          <span class="badge blue">${escapeHtml(template.shortName)}</span>
          <span class="badge blue">${escapeHtml(course.category)}</span>
          <span class="badge">${formatDate(course.scheduledAt)}</span>
          <span class="badge">${course.stats.count} 份评价</span>
        </div>
        <div class="grid four">
          ${metric(template.achievementLabel, formatScore(course.stats.achievement, template.achievementSuffix), course.stats.trimNote)}
          ${metric("绩效分", formatScore(course.stats.kpiScore), course.stats.band)}
          ${metric("原始均分", formatScore(course.stats.rawAverage), `满分 ${template.maxTotal}`)}
          ${metric("评价数", course.stats.count, "已提交问卷")}
        </div>
        <div class="action-row" style="margin-top:14px;">
          <button class="btn small secondary" data-copy="${escapeHtml(surveyUrl(course.id))}"><span class="button-icon">C</span>复制链接</button>
          <button class="btn small secondary" data-download-qr="${course.id}" data-title="${escapeHtml(course.title)}"><span class="button-icon">↓</span>保存二维码</button>
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
  const templateSelect = document.querySelector("#templateId");
  const titleInput = document.querySelector("#title");
  const descriptionInput = document.querySelector("#description");
  const titleLabel = document.querySelector("#titleLabel");
  const descriptionLabel = document.querySelector("#descriptionLabel");

  function updateTemplateHints() {
    const template = getTemplate(templateSelect?.value);
    if (titleLabel) titleLabel.textContent = template.itemName;
    if (descriptionLabel) descriptionLabel.textContent = template.itemNoteName;
    if (titleInput) titleInput.placeholder = template.itemNamePlaceholder;
    if (descriptionInput) descriptionInput.placeholder = template.itemNotePlaceholder;
  }

  templateSelect?.addEventListener("change", updateTemplateHints);
  updateTemplateHints();

  document.querySelector("#courseForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api("/api/courses", { method: "POST", body: JSON.stringify(payload) });
      showToast("考核问卷已创建");
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

  document.querySelectorAll("[data-download-qr]").forEach((button) => {
    button.addEventListener("click", async () => {
      const courseId = button.dataset.downloadQr;
      const title = button.dataset.title || "问卷二维码";
      button.disabled = true;
      try {
        const response = await fetch(qrUrl(courseId));
        if (!response.ok) throw new Error("二维码生成失败");
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${safeFilename(title)}-二维码.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast("二维码已保存");
      } catch (error) {
        showToast(error.message);
      } finally {
        button.disabled = false;
      }
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
            <h1>全部考核调研数据</h1>
            <p class="sub">可查看所有负责人、所有问卷、评价明细，并导出原始评价。</p>
          </div>
          <div class="action-row">
            <a class="btn secondary" href="/api/admin/export"><span class="button-icon">E</span>导出 CSV</a>
            <button class="btn secondary" type="button" data-refresh>刷新数据</button>
          </div>
        </div>

        <div class="grid four">
          ${metric("负责人数", data.teachers.length)}
          ${metric("问卷数", data.courses.length)}
          ${metric("评价总数", data.responses.length)}
          ${metric("模板数量", data.templates.length)}
        </div>

        <div class="panel pad">
          <h2>模板核算概览</h2>
          ${renderTemplateStats(data.templateStats)}
        </div>

        <div class="panel pad">
          <h2>问卷绩效排行</h2>
          ${renderCoursesTable(data.courses)}
        </div>

        <div class="panel pad">
          <h2>负责人汇总</h2>
          ${renderTeachersTable(data.teachers)}
        </div>

        <div class="panel pad">
          <h2>全部评价明细</h2>
          ${renderResponsesTable(data.responses, true)}
        </div>
      </section>
    `);

    document.querySelector("[data-refresh]")?.addEventListener("click", renderAdminDashboard);
    bindAdminEvents();
  } catch (error) {
    if (error.message.includes("请先登录")) {
      currentUser = null;
      return renderAuth("admin");
    }
    shell(`<div class="state-message"><div class="panel pad">${escapeHtml(error.message)}</div></div>`);
  }
}

function renderCoursesTable(courses) {
  if (!courses.length) return `<div class="empty">还没有问卷数据。</div>`;
  const sorted = courses.slice().sort((a, b) => (b.stats.kpiScore || 0) - (a.stats.kpiScore || 0));
  return html`
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>问卷事项</th>
            <th>模板</th>
            <th>负责人</th>
            <th>评价数</th>
            <th>剔除后得分</th>
            <th>绩效分</th>
            <th>核算说明</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map((course) => {
            const template = templateForCourse(course);
            return html`
            <tr>
              <td>${escapeHtml(course.title)}<br><span class="hint">${formatDate(course.scheduledAt)}</span></td>
              <td>${escapeHtml(template.shortName)}</td>
              <td>${escapeHtml(course.teacherName)}<br><span class="hint">${escapeHtml(course.teacherEmail)}</span></td>
              <td>${course.stats.count}</td>
              <td>${formatScore(course.stats.achievement, template.achievementSuffix)}</td>
              <td>${formatScore(course.stats.kpiScore)}</td>
              <td>${escapeHtml(course.stats.trimNote)}<br><span class="hint">${escapeHtml(course.stats.band)}</span></td>
            </tr>
          `;}).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTeachersTable(teachers) {
  if (!teachers.length) return `<div class="empty">还没有负责人注册。</div>`;
  return html`
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>负责人</th>
            <th>邮箱</th>
            <th>评价数</th>
            <th>模板绩效概览</th>
            <th>重置密码</th>
          </tr>
        </thead>
        <tbody>
          ${teachers.map((teacher) => html`
            <tr>
              <td>${escapeHtml(teacher.name)}</td>
              <td>${escapeHtml(teacher.email)}</td>
              <td>${teacher.templateStats.reduce((sum, item) => sum + item.stats.count, 0)}</td>
              <td>${teacher.templateStats.map((item) => `${item.template.shortName}: ${formatScore(item.stats.kpiScore)}（${item.stats.count}份）`).join(" / ")}</td>
              <td>
                <form class="reset-password-form" data-reset-password="${teacher.id}" data-reset-email="${escapeHtml(teacher.email)}">
                  <input name="password" type="password" minlength="6" placeholder="输入新密码" autocomplete="new-password" required />
                  <button class="btn small secondary" type="submit">重置</button>
                </form>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function bindAdminEvents() {
  document.querySelectorAll("[data-reset-password]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const passwordInput = form.querySelector("input[name='password']");
      const password = passwordInput.value;
      if (password.length < 6) {
        showToast("新密码至少 6 位");
        return;
      }

      const button = form.querySelector("button[type='submit']");
      button.disabled = true;

      try {
        await api(`/api/admin/users/${form.dataset.resetPassword}/password`, {
          method: "POST",
          body: JSON.stringify({ password })
        });
        passwordInput.value = "";
        showToast(`${form.dataset.resetEmail} 的密码已重置`);
      } catch (error) {
        showToast(error.message);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function renderResponsesTable(responses, admin = false) {
  if (!responses.length) return `<div class="empty">还没有评价人提交评价。</div>`;
  return html`
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>提交时间</th>
            ${admin ? "<th>负责人</th><th>问卷事项</th><th>模板</th>" : "<th>模板</th>"}
            <th>评价人</th>
            <th>所属部门</th>
            <th>维度得分</th>
            <th>总分</th>
            <th>建议</th>
          </tr>
        </thead>
        <tbody>
          ${responses.map((response, index) => {
            const template = getTemplate(response.templateId);
            const displayName = admin
              ? response.participantName
              : `第 ${response.participantSequence || index + 1} 号`;
            return html`
            <tr>
              <td>${formatDate(response.createdAt)}</td>
              ${admin ? `<td>${escapeHtml(response.teacherName)}<br><span class="hint">${escapeHtml(response.teacherEmail)}</span></td><td>${escapeHtml(response.courseTitle)}</td><td>${escapeHtml(template.shortName)}</td>` : `<td>${escapeHtml(template.shortName)}</td>`}
              <td>${escapeHtml(displayName)}</td>
              <td>${escapeHtml(response.department || "-")}</td>
              <td>${questionsFor(template).map((item) => `${item.label} ${response.scores?.[item.key] ?? "-"}`).join(" / ")}</td>
              <td><strong>${formatScore(response.total)}</strong><span class="hint"> / ${template.maxTotal}</span></td>
              <td>${escapeHtml(response.comment || "-")}</td>
            </tr>
          `;}).join("")}
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
    const template = data.template || getTemplate(course.templateId);

    shell(html`
      <section class="dashboard-stack">
        <div class="view-head">
          <div>
            <p class="eyebrow">${escapeHtml(template.dataSource)}</p>
            <h1>${escapeHtml(course.title)}</h1>
            <p class="sub">${escapeHtml(template.ownerRoleName)}：${escapeHtml(teacher?.name || "未知")} · ${escapeHtml(course.category || template.defaultCategory)}</p>
          </div>
          <div class="compact-panel">
            <strong>${course.active ? "问卷开放中" : "问卷已关闭"}</strong>
            <div class="hint">${formatDate(course.scheduledAt)}</div>
          </div>
        </div>

        ${course.active ? renderSurveyForm(courseId, course, template) : `<div class="panel pad"><div class="empty">该问卷已关闭。</div></div>`}
      </section>
    `);

    if (course.active) bindSurveyForm(courseId, template);
  } catch (error) {
    shell(`<div class="state-message"><div class="panel pad">${escapeHtml(error.message)}</div></div>`);
  }
}

function renderSurveyForm(courseId, course, template) {
  const initialScore = Math.min(18, 20);
  const initialTotal = questionsFor(template).length * initialScore;
  return html`
    <form id="surveyForm" class="survey-form">
      <div class="grid two">
        <div class="field">
          <label for="participantName">${escapeHtml(template.respondentNameLabel)}</label>
          <input id="participantName" name="participantName" placeholder="请填写评价人姓名" required />
        </div>
        <div class="field">
          <label for="department">${escapeHtml(template.respondentDepartmentLabel)}</label>
          <input id="department" name="department" placeholder="例如：运营部" required />
        </div>
      </div>

      <div class="score-card">
        ${questionsFor(template).map((item) => html`
          <div class="score-row" data-score-row="${item.key}">
            <div class="score-title">${item.label}<span>${item.prompt}</span></div>
            <input type="range" min="0" max="20" step="1" value="${initialScore}" name="${item.key}" aria-label="${item.label}" required />
            <input class="score-number" type="number" min="0" max="20" step="1" value="${initialScore}" data-score-number="${item.key}" aria-label="${item.label}分数" required />
          </div>
        `).join("")}
      </div>

      <div class="field">
        <label for="comment">建议与反馈</label>
        <textarea id="comment" name="comment" placeholder="请填写具体建议、风险提醒或协作改善方向" required></textarea>
      </div>

      <div class="survey-total">
        <div>
          <div class="hint">当前问卷总分</div>
          <div class="total-number"><span id="totalScore">${initialTotal}</span> / ${template.maxTotal}</div>
        </div>
        <button class="btn" type="submit"><span class="button-icon">✓</span>提交评价</button>
      </div>
    </form>
  `;
}

function bindSurveyForm(courseId, template) {
  const form = document.querySelector("#surveyForm");
  const totalScore = document.querySelector("#totalScore");
  const questions = questionsFor(template);

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
            <p class="sub">本次总分 ${formatScore(result.response.total)} / ${template.maxTotal}，感谢你的反馈。</p>
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
    const templateData = await api("/api/templates");
    templates = templateData.templates?.length ? templateData.templates : fallbackTemplates;
  } catch {
    templates = fallbackTemplates;
  }

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
