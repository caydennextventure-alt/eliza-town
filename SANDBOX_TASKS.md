# Object App Sandbox（物体小应用）任务追踪（MVP → Pro）

> 目的：不做平台级开放世界脚本；只让 **Town Owner** 在自己的 Town 里把“可交互物体”绑定成可玩的“小应用”（棋盘/布告栏/贩卖机/电视等），允许来访者互动与多人同步；并通过 Eliza 辅助生成/迭代。

## 0) 范围与约束（硬边界）

### In scope
- **Object Instance**：地图上的“可交互物体实例”，有稳定 `objectInstanceId`、命中区域（hitbox）、交互距离、锚点。
- **Object App**：绑定在 objectInstance 上的应用（版本化发布/回滚）。
- **Session（多局）**：同一物体可同时开多局（大厅列表 + join/create/observe）。
- **Visibility**：`public / friends / private`（来访者互动只靠该权限）。
- **Copy Policy**：可设置允许/不允许复制；复制时 **包含素材/贴图**。
- **TV 白名单**：电视只允许白名单站点来源（后端校验 + 受控播放器）。

### Out of scope（至少 MVP）
- 访问 Town 其他资源：修改地图、操控别的物体/NPC、全局经济等。
- 后端执行任意用户代码（JS/Lua/Python）。
- 主站同域执行用户 HTML/JS（XSS/钓鱼风险）。

### 核心原则（必须）
- **后端权威**：所有交互都走 `submitAction`，后端验证后推进 state。
- **Capability**：客户端/iframe 只拿到“当前 session”的能力，不能越权到别的 object/app/world。
- **资源限制**：频控、state 大小限制、会话数量限制、执行步数限制、kill switch。

## 1) 关键名词（统一口径）
- **World / Town**：一个 `worldId` = 一个 Town（先可只有 default world；后续扩展 1 user = 1 town）。
- **Object Instance**：地图上实例：`objectInstanceId` + `objectType` + `hitbox` + `anchor` + `radius` + `metadata`。
- **App**：绑定 object 的应用元信息：owner、visibility、copyPolicy、当前发布版本。
- **App Version**：不可变发布产物：config/spec/uiSchema/dsl/assetsRefs。
- **Session**：该 app/version 下的一次多人会话：state、participants、status、createdAt/updatedAt。

## 2) 已确定决策（来自产品输入）
- 来访者互动：只靠 `public/friends/private`（不引入额外复杂权限系统）。
- 复制策略：复制时 **包含素材/贴图**（实现上需“复制存储对象”或“不可变资产+引用计数”）。
- 同一物体：**支持多局**（sessions lobby 必做）。
- TV：**白名单网站**（后端校验域名+路径/重定向；前端用受控播放器组件）。

## 3) “先做 Sandbox 还是先做 1 user = 1 town？”建议

### 推荐顺序（更稳、返工更少）
1) **先补齐 Auth/Identity + World 作用域（Phase 0）**：即便仍只有 1 个 default world，也要让后端能拿到真实 userId。  
2) **做 Object App Sandbox（Phase 1–4）**：所有表/接口从第一天就带 `worldId` + ownerId 校验。  
3) 再扩展到 **1 user = 1 town（Phase 7）**：Sandbox 逻辑几乎不用改，只是 world 来源与路由/地图存储变了。

### 为什么不必先做 1 user = 1 town
- 多 world 会牵涉 engine/worldStatus 创建、路由、地图存储与隔离，工程量大且会阻塞 Sandbox 的核心验证。
- 只要 Sandbox 从第一天就把 `worldId` 当硬边界，后续扩展多 world 改动可控。

> 例外：如果你当下必须让每个人一进来就看到“只属于自己”的地图编辑与摆放，那就要把 Phase 7 提前。但一般建议先把 Sandbox 骨架跑通。

## 4) 里程碑与任务清单（每阶段都有 DoD）

### Phase 0 — Identity/权限底座（阻断高危入口）
**目标**：有可靠的 userId/ownerId；写接口鉴权；频控与审计可用；为 friends/private 做准备。

- [x] Auth：后端统一通过 `ctx.auth.getUserIdentity()` 获取 userId（至少 anonymous id）
- [ ] Auth 配置：配置 Clerk/Convex auth（已添加 `convex/auth.config.ts` 模板；前端 `VITE_CLERK_PUBLISHABLE_KEY` + Convex 侧验证 JWT）
- [x] Visibility 判定函数：`canViewApp(userId, app)` / `canJoinSession(userId, app)`
- [x] Friends 模式 MVP：owner 维护 `friendsAllowlist`（userId 列表）或 `friendEdges` 表（二选一）
- [x] 基础频控（基础设施）：`rateLimitBuckets` + `internal.rateLimit.consume`
- [ ] 基础频控（落点）：对 Sandbox 的 `joinOrCreate / submitAction / createSession` 接口加 rate limit（Phase 2 实现时补）
- [x] 审计日志（基础设施）：`auditLogs` + `internal.audit.log`
- [ ] 审计日志（落点）：对 publish/rollback/copy/submitAction 等关键接口写审计（Phase 2+）
- [x] Kill switch：基础设施（`killSwitches` 表 + internal API；appVersion 级联落点在 Phase 2 做）
- [x] 生产安全：收口高危通用入口（例如可任意 `sendInput` 的 mutation）或加 allowlist

**DoD**
- 任意写操作都能拿到真实 userId，并能阻止越权（private/friends 真的挡住）。

---

### Phase 1 — Object Instance（地图可交互物体）
**目标**：系统能“识别/命中/选中”一个 objectInstance，并拿到稳定 id（为 App 绑定做准备）。

- [ ] Map 数据结构：新增/完善 `interactables[]`
  - [ ] `objectInstanceId`（稳定、可序列化）
  - [ ] `objectType`（board/vending/tv/bulletin/custom...）
  - [ ] `hitbox`（rect/poly）、`anchor`、`interactionRadius`
  - [ ] `displayName` / `tags` / `metadata`
- [ ] Map Editor：创建/编辑/删除 interactable；保存 stable id（重载不变）
- [ ] Client hit-test：鼠标 hover/click 命中 hitbox，显示交互提示（Open/Play）
- [ ] Object Registry：objectType → 默认 icon/提示文案/推荐模板

**DoD**
- 地图里放一个 “board” object：访问者可点击并看到 “Open”，并能拿到 `objectInstanceId`。

---

### Phase 2 — App/Version/Session 核心骨架（UI 先走 Schema）
**目标**：完成 Object→App 绑定、发布版本、多 session、大厅列表、多人同步（不用 DSL、先用模板/配置）。

#### 2.1 Convex Schema
- [ ] `apps`
  - [ ] `worldId`, `objectInstanceId`, `ownerId`
  - [ ] `kind`（template id）
  - [ ] `visibility`（public/friends/private）
  - [ ] `friendsAllowlist`（仅 friends 模式需要）
  - [ ] `copyPolicy`（no-copy / copyable）
  - [ ] `publishedVersion`（可空：未发布）
- [ ] `appVersions`
  - [ ] `appId`, `version`, `status`（draft/published/disabled）
  - [ ] `spec`（人类可读）
  - [ ] `config`（模板配置）
  - [ ] `uiSchema`（声明式 UI）
  - [ ] `assetsRefs`（图片/音频等引用）
- [ ] `appSessions`
  - [ ] `appId`, `worldId`, `objectInstanceId`, `version`
  - [ ] `state`（JSON）
  - [ ] `participants`（userId 列表 + role：player/observer）
  - [ ] `status`（open/closed/archived）
  - [ ] `createdAt`, `updatedAt`
- [ ] `appAssets`（为了“复制包含素材/贴图”）
  - [ ] `assetId`, `ownerId`, `appId`, `storageId`, `mime`, `size`, `hash`
  - [ ] 复制策略：**MVP 建议复制 storage blob**（新 owner 新 storageId）；后续可做 hash 去重 + 引用计数

#### 2.2 API（Convex）
- [ ] `apps.attach(objectInstanceId, kind)`（owner）
- [ ] `apps.updateDraft(appId, draft)`（owner）
- [ ] `apps.publish(appId)` / `apps.rollback(appId, version)`（owner）
- [ ] `apps.copy(appId)`（受 copyPolicy 控制；复制包含 assets）
- [ ] `sessions.list(objectInstanceId)`（大厅列表：多局）
- [ ] `sessions.join(sessionId)` / `sessions.create(objectInstanceId)` / `sessions.observe(sessionId)`
- [ ] `sessions.submitAction(sessionId, action)`（后端权威推进 state）

#### 2.3 前端（通用 App Shell）
- [ ] Lobby：列出该物体当前 sessions（人数/状态/版本/创建者）
- [ ] Session View：订阅 state + 渲染 uiSchema + 提交 action
- [ ] 错误兜底：版本 disabled/崩溃时返回 town + 提示

#### 2.4 UI Schema v0（先可控）
- [ ] Layout：Stack/Row/Grid + theme tokens
- [ ] Widgets：Text/Button/Input/List/Tabs
- [ ] 受控弹层：Toast/Confirm/Modal（禁止任意 HTML）

**DoD**
- 一个 “Counter App” 模板：两个人加入同一 session，点按钮计数同步；同一物体能创建多个 session 并在 Lobby 可见。

---

### Phase 3 — 模板库（先把闭环做出“好玩”）
**目标**：用模板先验证“创作→发布→来访互动”的完整闭环，并沉淀通用组件与安全策略。

- [ ] Bulletin Board（布告栏）
  - [ ] state：posts（分页/上限）、anti-spam（cooldown）
  - [ ] action：post/delete(owner)/report
  - [ ] 文本治理：长度/过滤/举报
- [ ] Vending Machine（贩卖机）
  - [ ] state：items、库存、购买记录（可选）
  - [ ] action：buy（校验库存/冷却）
- [ ] Board Game（先从 TicTacToe/Checkers；Chess 作为增强）
  - [ ] state：board、turn、players、history
  - [ ] action：move/forfeit/rematch/observe
  - [ ] 后端合法性校验 + 并发版本控制（stateVersion/OCC）
- [ ] TV（白名单站点播放）
  - [ ] state：channel/url（必须通过白名单校验）
  - [ ] UI：受控 VideoPlayer 组件（不要任意 iframe）
  - [ ] 后端 URL 规范化与白名单规则（domain + path + embed 规则；禁止重定向绕过）

**DoD**
- 至少 2 个模板（建议：布告栏 + 棋盘）支持 public 可玩 + 多 session；TV 白名单校验有测试用例。

---

### Phase 4 — Eliza Builder（自然语言生成草稿 + 预览 + 发布）
**目标**：让 owner 用自然语言“生成/修改”物体应用（先生成模板配置与 uiSchema；不直接生成可执行代码）。

- [ ] Studio：Builder Chat UI
  - [ ] 选择物体 → “Describe your app”
  - [ ] Eliza 先问澄清问题（多人/权限/旁观/是否可复制）
  - [ ] 输出：spec + config + uiSchema（结构化展示 + 可预览）
- [ ] 后端生成 action：`apps.generateDraft(appId, prompt)`
  - [ ] 对模型输出做 schema 校验与清理（不信任 LLM 输出）
  - [ ] 自动 smoke test：用一组动作跑通（避免发布即崩）
- [ ] Preview：创建 private session（只 owner 可见）
- [ ] Publish：生成 version，写审计日志

**DoD**
- 通过自然语言生成一个“投票箱/接龙板”类 app（模板派生），可 preview 与发布。

---

### Phase 5 — 受限 DSL（更高创意上限）
**目标**：让“非模板”逻辑也能跑，但仍保持安全与确定性（不执行任意 JS）。

- [ ] DSL 规格 v1
  - [ ] events：onOpen/onAction（onTick 先不开放或强限）
  - [ ] data：`session.state`（JSON），只允许有限大小
  - [ ] effects：setState/toast/broadcast/openModal/close
  - [ ] limits：steps/depth/alloc/stateSize/effectsCount
- [ ] 解释器（纯函数/确定性）
- [ ] 类型与校验：编译期/运行期错误返回给 UI
- [ ] 运行日志与 kill switch：异常率过高自动下架版本（可选）

**DoD**
- 用 DSL 实现一个新玩法（非模板），无需新增后端逻辑即可运行。

---

### Phase 6 — Pro UI（跨域 iframe 沙箱，可选）
**目标**：给高级创作者更自由的 UI/渲染能力，同时不扩大安全面。

- [ ] 独立 origin 的 iframe Host（单独部署）
- [ ] sandbox + CSP（默认禁止外连；只允许 postMessage）
- [ ] postMessage 协议（INIT/STATE_UPDATE/ACTION/ERROR）
- [ ] capability token：只允许对当前 session submitAction；token 过期与撤销
- [ ] 审核/门槛：Pro UI 仅允许通过验证的 owner 使用（可选）

**DoD**
- 一个复杂 UI Demo（例如更精致棋盘），不影响主站安全与性能。

---

### Phase 7 — 1 user = 1 town（多 world）
**目标**：每个用户一个 worldId（town），Sandbox 复用同一套逻辑；同一套表按 `worldId` 完整隔离。

- [ ] World 创建/路由：用户首次进入自动创建 worldStatus/engine/world 记录
- [ ] Town 地图存储：每 world 一份 map（含 interactables）
- [ ] 访问路径：public town URL / friends / private
- [ ] 数据隔离：所有 Sandbox 表按 worldId 查询与校验

**DoD**
- 用户 A 与 B 各有自己的 town；A 的 objects/apps/sessions 不会出现在 B 的 world 里；来访按 visibility 生效。

## 5) 风险清单（持续更新）
- **XSS/钓鱼**：Pro UI 若处理不当会高危 → 先 schema UI，再逐步开放 iframe
- **滥用/刷成本**：submitAction / generateDraft / createSession → 频控与配额必须从 Phase 0 开始
- **内容治理**：布告栏/TV 需要举报与下架机制
- **复制资产**：复制包含素材会带来存储成本与版权风险 → 建议 hash 去重 + 引用计数（后续优化）

## 6) 发布前验收 Checklist（最低要求）
- [ ] 所有写接口：鉴权 + worldId/objectId/appId/sessionId 一致性校验
- [ ] submitAction：后端权威校验 + 并发版本控制 + 速率限制
- [ ] public 可玩：不会泄露 private/friends 的内容
- [ ] TV：白名单校验通过测试用例（绕过/重定向/短链等）
- [ ] kill switch：能快速下架恶意版本（至少 admin/owner 可禁用）
