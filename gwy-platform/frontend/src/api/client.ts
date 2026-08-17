// 后端接口封装：统一 /api 前缀、错误处理、Auth 头注入（WBS 2.1~7.1 全量联通）
// 后端接口基址：默认同源 /api（开发期由 vite 代理转发到 :8000）；
// 部署时可经 VITE_API_BASE 指向独立后端域名（需后端 CORS 放行该来源）。
const BASE: string = import.meta.env.VITE_API_BASE || "/api";

// 401 未授权回调：由 AuthProvider 注册，用于清除失效 token 并跳转登录页。
let _onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  _onUnauthorized = fn;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("access_token");
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("access_token");
    if (_onUnauthorized) _onUnauthorized();
    const err: any = new Error("登录已失效，请重新登录");
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e: any = new Error(err.detail || `请求失败: ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json() as Promise<T>;
}

export interface UserOut {
  id: number;
  email: string;
  nickname: string | null;
  province: string | null;
  target_exam: string;
  plan: string;
  plan_expires_at: string | null;
  role: string;
  created_at: string;
}
export interface Ability {
  knowledge_point: string;
  mastery: number;
  attempts: number;
  correct: number;
  last_practiced: string;
}
export interface Dashboard {
  user: UserOut;
  total_answers: number;
  correct_rate: number;
  ability: Ability[];
}
export interface DayTrend {
  date: string;
  answers: number;
  correct: number;
}
export interface StudentStats {
  user: UserOut;
  total_answers: number;
  correct_rate: number;
  wrong_distinct: number;
  recurrence_rate: number; // 错题复错率 0-1（越低越好）
  reviewed_distinct: number; // 已复盘（标记掌握）的错题数
  mastered_kp: number; // 掌握度≥0.8 的知识点数
  ability: Ability[]; // 弱项知识点（掌握度升序，最多 8）
  last_7_days: DayTrend[];
  streak_days: number; // 连续打卡天数
}
export interface Question {
  id: number;
  subject: string;
  category: string;
  qtype: string;
  stem: string;
  difficulty: number;
  knowledge_point: string;
  source: string | null;
  is_verified: boolean;
  options: { id: number; label: string; content: string }[];
}
export interface FavoriteItem {
  question: Question;
  note: string; // 私人笔记（云端同步）
  tags: string[]; // 自定义标签，如 ["易错","重点"]
  created_at: string;
}
export interface WrongItem {
  question: Question;
  wrong_count: number;
  last_selected: string | null;
  attempts: number; // 该用户在该题的总作答次数
  recurrence_rate: number | null; // 错答占比 0-1（复错倾向）
  last_attempted_at: string | null; // 最近一次（含做对）作答时间，用于间隔复习提醒
}
export interface Citation {
  title: string;
  kp?: string;
  source?: string;
  score?: number; // 检索相关度（0~1 混合分）
}
// 引用详情反查的知识片段原文（点击引用卡片看详情时展示）
export interface KnowledgeChunkOut {
  id: number;
  kp: string;
  title: string;
  source: string;
  content: string;
  is_verified: boolean;
}
export interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  model?: string | null;
  offline?: boolean;
  created_at?: string;
}
export interface ChatSession {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message?: string | null;
}
export interface ChatSendOut {
  session_id: number;
  message: ChatMessage;
  title: string;
}
export interface PlanTask {
  id: number;
  kind: string; // practice | review_wrong | favorite | mock | explain | read
  title: string;
  target: string | null;
  ref_id: number | null;
  done: boolean; // 是否已打卡
}
export interface PlanDay {
  day: number;
  focus: string;
  summary: string;
  knowledge_points: string[];
  tasks: PlanTask[];
}
export interface PlanProgress {
  total_tasks: number;
  done_tasks: number;
  rate: number; // 完成率 0-1
  streak_days: number; // 连续打卡天数
  by_kind: Record<string, { total: number; done: number }>;
  last_checkin_at: string | null;
  today_total: number;
  today_done: number;
}
export interface PlanOut {
  plan_id: number;
  days: number;
  items: PlanDay[];
  model: string | null;
  offline: boolean;
  summary: string | null;
  generated_at: string;
  today_index: number; // 计划视角下「今天」第几天；0 表示未开始/已结束
  progress: PlanProgress;
}

export interface ReviewOut {
  id: number;
  item_type: string; // question | knowledge | essay_policy
  item_id: string;
  version: number;
  status: string; // pending | approved | rejected | corrected
  body: string;
  reviewer_1: string | null;
  reviewer_2: string | null;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
}
export interface ReviewStats {
  total: number;
  approved: number;
  sample_target: number;
  sample_rate: number;
  pass_rate: number; // 已通过占比
}

// 题库双签审核（待核实题接入审核台）
export interface QuestionOptionOut {
  label: string;
  content: string | null;
  is_correct: boolean;
}
export interface QuestionReviewOut {
  review_id: number | null;
  question_id: number;
  subject: string | null;
  category: string | null;
  qtype: string | null;
  stem: string | null;
  options: QuestionOptionOut[];
  answer: string | null;
  knowledge_point: string | null;
  source: string | null;
  copyright_owner: string | null;
  is_verified: boolean;
  review_status: string; // none | pending | approved | rejected
  reviewer_1: string | null;
  reviewer_2: string | null;
}
export interface QuestionReviewStats {
  total: number;
  verified: number;
  pending: number;
  awaiting_second: number;
}

export interface EssayPrompt {
  id: number;
  title: string;
  kp: string | null;
  material: string;
  requirement: string;
  max_score: number;
}

// 运营后台（仅 admin 角色可见）
export interface AdminUserRow {
  email: string;
  nickname: string | null;
  plan: string;
  target_exam: string;
  role: string;
  created_at: string;
}
export interface PlanCount {
  plan: string;
  count: number;
}
export interface SubjectCount {
  subject: string;
  count: number;
}
export interface DayMetric {
  date: string; // YYYY-MM-DD (UTC)
  value: number;
}
export interface AdminOverview {
  users_total: number;
  users_new_7d: number;
  users_by_plan: PlanCount[];
  pro_users: number;
  paid_orders: number;
  revenue_yuan: number;
  questions_total: number;
  questions_verified: number;
  questions_pending: number;
  question_subjects: SubjectCount[];
  pending_reviews: number;
  answers_total: number;
  avg_correct_rate: number;
  essays_graded: number;
  mock_exams: number;
  daily_new_users: DayMetric[];
  daily_answers: DayMetric[];
  daily_revenue: DayMetric[]; // 单位：元
  recent_users: AdminUserRow[];
}
export interface EssayHistoryItem {
  id: number;
  prompt_id: number | null;
  prompt_title: string | null;
  total: number;
  dimensions: Record<string, number>;
  needs_human_review: boolean;
  rationale: string | null;
  created_at: string;
}
export interface EssayModel {
  model_essay: string; // 生成的高分范文正文（markdown）
  outline: string[]; // 结构提纲
  key_points: string[]; // 高分要点
  offline?: boolean; // True 表示 LLM 不可用走了降级提示
}

// 申论对比点评（WBS 4.1 增强）：考生作答 vs 高分范文的维度级差距分析
export interface EssayGap {
  dimension: string; // 维度名（立意/结构/论证/语言/素材）
  comment: string; // 该维度考生与范文的具体差距（可能为空，表示差距不显著）
}
export interface EssayCompare {
  student_total: number; // 考生总分
  model_total: number; // 范文总分
  student_dimensions: Record<string, number>; // 考生五维分
  model_dimensions: Record<string, number>; // 范文五维分
  gaps: EssayGap[]; // 维度级差距（五维齐全）
  suggestions: string[]; // 可操作改进建议
  narrative: string; // 总体对比点评（markdown-ish 纯文本）
  model_essay: string; // 回传范文正文
  offline?: boolean; // True 表示 LLM 不可用走了启发式降级
}

// 能力测评（WBS 3.2 自适应诊断）
export interface AssessmentDim {
  knowledge_point: string;
  mastery: number; // 该维度本次正确率 0-1（雷达图数据）
}
export interface AssessmentPaperItem {
  id: number;
  subject: string;
  category: string;
  qtype: string;
  stem: string;
  difficulty: number;
  knowledge_point: string;
  is_verified: boolean;
  options: { id: number; label: string; content: string }[];
}
export interface AssessmentReport {
  id: number;
  overall: number;
  dimensions: AssessmentDim[];
  weak_points: string[];
  suggestions: string[];
  total: number;
  correct: number;
  created_at: string;
}
export interface AssessmentRecordOut {
  id: number;
  overall: number;
  dimensions: AssessmentDim[];
  weak_points: string[];
  suggestions: string[];
  questions_total: number;
  correct?: number | null;
  details?: Array<{
    question_id: number;
    is_correct: boolean;
    correct_answer: string;
    selected: string;
    stem: string;
    knowledge_point: string;
    options?: Array<{ label: string; content: string; is_correct: boolean }>;
  }> | null;
  created_at: string;
}

// 站内通知（Notification Center）
export interface NotificationOut {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}
export interface NotificationList {
  items: NotificationOut[];
  unread_count: number;
}

export interface AiQuota {
  plan: string;
  is_pro: boolean;
  limit: number; // 每日配额上限（pro 为 -1 表示不限）
  used: number;
  remaining: number; // 剩余次数（pro 为 -1）
  date: string; // YYYY-MM-DD
}

export const api = {
  health: () => request<{ status: string }>("/health"),

  // 运营后台（仅 admin 角色可见）
  adminOverview: () => request<AdminOverview>("/admin/overview"),

  // 认证（WBS 2.1）
  register: (body: { email: string; password: string; nickname?: string; province?: string; target_exam?: string }) =>
    request<{ access_token: string }>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ access_token: string }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request<UserOut>("/auth/me"),
  updateMe: (body: { nickname?: string; province?: string; target_exam?: string }) =>
    request<UserOut>("/auth/me", { method: "PATCH", body: JSON.stringify(body) }),

  // 学员中心 / 学情（WBS 2.1 / 3.2）
  dashboard: () => request<Dashboard>("/student/me"),
  // 学情数据看板（P0 信号：复错率 / 正确率 / 弱项 / 趋势 / 连续打卡）
  studentStats: () => request<StudentStats>("/student/stats"),

  // 错题本（WBS 2.2 衍生 / 复错率闭环）
  wrongList: () => request<WrongItem[]>("/student/wrong"),
  wrongReview: (question_id: number) =>
    request<{ ok: boolean }>(`/student/wrong/${question_id}/review`, { method: "POST" }),

  // 题库 / 刷题（WBS 2.2）
  bankList: (params: { subject?: string; category?: string; knowledge_point?: string; ids?: number[]; offset?: number; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.subject) q.set("subject", params.subject);
    if (params.category) q.set("category", params.category);
    if (params.knowledge_point) q.set("knowledge_point", params.knowledge_point);
    if (params.ids && params.ids.length) params.ids.forEach((i) => q.append("ids", String(i)));
    if (params.offset !== undefined) q.set("offset", String(params.offset));
    if (params.limit) q.set("limit", String(params.limit));
    return request<Question[]>(`/bank/questions?${q.toString()}`);
  },
  bankGet: (id: number) => request<Question>(`/bank/questions/${id}`),
  practice: (question_id: number, selected: string) =>
    request<{ question_id: number; is_correct: boolean; correct_answer: string | null; explanation: string | null; mastery: number; skipped?: boolean }>(
      "/bank/practice",
      { method: "POST", body: JSON.stringify({ question_id, selected }) }
    ),

  // 收藏夹（WBS 2.2 衍生 / 学习管理）
  favoriteList: () => request<FavoriteItem[]>("/bank/favorites"),
  favoriteAdd: (question_id: number) =>
    request<{ ok: boolean }>("/bank/favorites", { method: "POST", body: JSON.stringify({ question_id }) }),
  favoriteRemove: (question_id: number) =>
    request<{ ok: boolean }>(`/bank/favorites/${question_id}`, { method: "DELETE" }),
  favoriteUpdate: (question_id: number, body: { note?: string; tags?: string[] }) =>
    request<FavoriteItem>(`/bank/favorites/${question_id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // AI 私教 / 自适应（WBS 3.1 / 3.2）
  explain: (question_id: number, selected?: string) =>
    request<{ knowledge_point: string; explanation: string; citations: Citation[]; model: string | null; offline?: boolean }>("/ai/explain", {
      method: "POST",
      body: JSON.stringify({ question_id, selected }),
    }),
  recommend: (top_n = 10, seed?: number) =>
    request<{ knowledge_points: string[]; questions: any[] }>(
      `/ai/recommend?top_n=${top_n}${seed != null ? `&seed=${seed}` : ""}`
    ),
  // 会员配额（免费版每日 AI 讲解额度；pro 不限）
  quota: () => request<AiQuota>("/ai/quota"),
  // 引用详情反查：按知识点/来源/标题/正文检索知识原文（点击引用卡片看详情）
  knowledgeLookup: (q: string, limit = 6) =>
    request<KnowledgeChunkOut[]>(
      `/ai/knowledge/lookup?q=${encodeURIComponent(q)}&limit=${limit}`
    ),
  // AI 私教对话历史持久化（WBS 3.1：会话可回溯、刷新不丢）
  chatSessions: () => request<ChatSession[]>("/ai/chat/sessions"),
  chatCreate: () => request<ChatSession>("/ai/chat/sessions", { method: "POST" }),
  chatMessages: (sessionId: number) =>
    request<ChatMessage[]>(`/ai/chat/sessions/${sessionId}/messages`),
  chatSend: (sessionId: number, content: string, kp_hint?: string) =>
    request<ChatSendOut>(`/ai/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, kp_hint }),
    }),
  chatDelete: (sessionId: number) =>
    request<void>(`/ai/chat/sessions/${sessionId}`, { method: "DELETE" }),
  chatRename: (sessionId: number, title: string) =>
    request<ChatSession>(`/ai/chat/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  // 学习计划打卡 / 进度追踪（执行-复盘闭环）
  planGet: async (): Promise<PlanOut | null> => {
    try {
      return await request<PlanOut>("/ai/plan");
    } catch (e: any) {
      if (e?.status === 404) return null; // 尚未生成计划
      throw e;
    }
  },
  planGenerate: (days = 7, target?: string) =>
    request<PlanOut>("/ai/plan", {
      method: "POST",
      body: JSON.stringify({ days, target }),
    }),
  planToggle: (taskId: number) =>
    request<{ task: { id: number; done: boolean; checked_at: string | null }; progress: PlanProgress }>(
      `/ai/plan/tasks/${taskId}/toggle`,
      { method: "POST" }
    ),

  // 申论批改（WBS 4.1）
  essayPrompts: () => request<EssayPrompt[]>("/ai/essay-prompts"),
  essayGrade: (
    essay_text: string,
    prompt_material = "",
    max_score = 100,
    prompt_id: number | null = null,
    requirement = "",
  ) =>
    request<{ total: number; dimensions: Record<string, number>; needs_human_review: boolean; rationale: string; record_id: number | null }>(
      "/ai/essay-grade",
      { method: "POST", body: JSON.stringify({ essay_text, prompt_material, requirement, max_score, prompt_id }) }
    ),
  essayHistory: () => request<EssayHistoryItem[]>("/ai/essay-history"),
  // 申论范文参考（WBS 4.1 增强）：生成高分范文 + 结构提纲 + 高分要点
  essayModel: (
    material = "",
    requirement = "",
    prompt_id: number | null = null,
  ) =>
    request<EssayModel>("/ai/essay/model", {
      method: "POST",
      body: JSON.stringify({ material, requirement, prompt_id }),
    }),
  // 申论对比点评（WBS 4.1 增强）：将考生作答与范文做维度级对比
  essayCompare: (
    student_essay: string,
    material = "",
    requirement = "",
    prompt_id: number | null = null,
    model_essay: string | null = null,
    student_dimensions: Record<string, number> | null = null,
    student_total: number | null = null,
  ) =>
    request<EssayCompare>("/ai/essay/compare", {
      method: "POST",
      body: JSON.stringify({
        student_essay,
        material,
        requirement,
        prompt_id,
        model_essay,
        student_dimensions,
        student_total,
      }),
    }),

  // 在线模考（WBS 4.2）
  examStart: (subject?: string, count = 20) =>
    request<{ subject: string; count: number; requested: number; available: number; duration_seconds: number; paper: any[] }>("/exam/start", {
      method: "POST",
      body: JSON.stringify({ subject, count }),
    }),
  examSubmit: (answers: { question_id: number; selected: string }[]) =>
    request<{ id: number; total: number; correct: number; correct_rate: number; weak_points: string[]; details: any[] }>(
      "/exam/submit",
      { method: "POST", body: JSON.stringify({ answers }) }
    ),
  examHistory: (limit = 20, offset = 0) =>
    request<any[]>("/exam/history?limit=" + limit + "&offset=" + offset),
  examHistoryDetail: (id: number) =>
    request<any>("/exam/history/" + id),

  // 能力测评（WBS 3.2 自适应诊断）
  assessmentPaper: () =>
    request<AssessmentPaperItem[]>("/assessment/paper"),
  assessmentSubmit: (answers: { question_id: number; selected: string }[]) =>
    request<AssessmentReport>("/assessment/submit", {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
  assessmentHistory: (limit = 20, offset = 0) =>
    request<AssessmentRecordOut[]>("/assessment/history?limit=" + limit + "&offset=" + offset),
  assessmentHistoryDetail: (id: number) =>
    request<AssessmentRecordOut>("/assessment/history/" + id),

  // 站内通知（Notification Center）
  notifications: (limit = 30, offset = 0) =>
    request<NotificationList>(`/notifications?limit=${limit}&offset=${offset}`),
  markNotificationRead: (id: number) =>
    request<NotificationOut>("/notifications/" + id + "/read", { method: "POST" }),
  markAllNotificationsRead: () =>
    request<NotificationList>("/notifications/read-all", { method: "POST" }),

  // 计费 / 退费 / 会员（WBS 5.1 / 7.1）
  createOrder: (plan: string) =>
    request<{ id: number; plan: string; amount: number; status: string; pay_url: string | null }>("/billing/orders", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  paySandbox: (orderId: number) =>
    request<any>(`/billing/pay/sandbox/${orderId}`, { method: "POST" }),
  requestRefund: (order_id: number, reason?: string) =>
    request<{ id: number; order_id: number; amount: number; status: string }>("/billing/refund", {
      method: "POST",
      body: JSON.stringify({ order_id, reason }),
    }),
  myBilling: () => request<{ plan: string; plan_expires_at: string | null; orders: any[]; refunds: any[] }>("/billing/me"),
  billingPlans: () =>
    request<{ plans: any[]; currency: string; refund_policy: string }>("/billing/plans"),

  // 内容双签审核 / 信任保障（WBS 5.2 / c11 P0）
  reviewSubmit: (body: { item_type: string; item_id?: string; body: string; version?: number }) =>
    request<ReviewOut>("/content/review/submit", {
      method: "POST",
      body: JSON.stringify({ version: 1, ...body }),
    }),
  changePassword: (old_password: string, new_password: string) =>
    request<{ ok: boolean }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password, new_password }),
    }),
  // 账号找回 / 密码重置（WBS 2.1 安全）；开发模式 forgotPassword 会返回 dev_token
  forgotPassword: (email: string) =>
    request<{ ok: boolean; dev_token?: string; message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, new_password: string) =>
    request<{ ok: boolean; message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),
  reviewPending: () => request<ReviewOut[]>("/content/review/pending"),
  reviewSpotCheck: () => request<ReviewStats>("/content/review/spot-check"),
  // 审核员身份以服务端登录用户为准，前端不再传 reviewer
  reviewApprove: (id: number) =>
    request<ReviewOut>(`/content/review/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  reviewReject: (id: number, note?: string) =>
    request<ReviewOut>(`/content/review/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  reviewCorrect: (id: number, new_body: string) =>
    request<ReviewOut>(`/content/review/${id}/correct`, {
      method: "POST",
      body: JSON.stringify({ new_body }),
    }),
  // 题库审核：待核实题（is_verified=False）接入双签闭环
  reviewQuestionsPending: (limit = 20, offset = 0) =>
    request<QuestionReviewOut[]>(`/content/review/questions/pending?limit=${limit}&offset=${offset}`),
  reviewQuestionsStats: () =>
    request<QuestionReviewStats>("/content/review/questions/stats"),
  reviewQuestionSign: (question_id: number) =>
    request<QuestionReviewOut>(`/content/review/questions/${question_id}/sign`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  reviewQuestionReject: (question_id: number, note?: string) =>
    request<QuestionReviewOut>(`/content/review/questions/${question_id}/reject`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
};
