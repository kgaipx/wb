// 后端接口封装：统一 /api 前缀、错误处理、Auth 头注入（WBS 2.1~7.1 全量联通）
// 后端接口基址：默认同源 /api（开发期由 vite 代理转发到 :8000）；
// 部署时可经 VITE_API_BASE 指向独立后端域名（需后端 CORS 放行该来源）。
const BASE: string = import.meta.env.VITE_API_BASE || "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("access_token");
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
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
export interface WrongItem {
  question: Question;
  wrong_count: number;
  last_selected: string | null;
}
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
export interface ChatReply {
  answer: string;
  citations: string[];
  model: string | null;
  offline: boolean;
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

export const api = {
  health: () => request<{ status: string }>("/health"),

  // 认证（WBS 2.1）
  register: (body: { email: string; password: string; nickname?: string; province?: string; target_exam?: string }) =>
    request<{ access_token: string }>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ access_token: string }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request<UserOut>("/auth/me"),

  // 学员中心 / 学情（WBS 2.1 / 3.2）
  dashboard: () => request<Dashboard>("/student/me"),

  // 错题本（WBS 2.2 衍生 / 复错率闭环）
  wrongList: () => request<WrongItem[]>("/student/wrong"),
  wrongReview: (question_id: number) =>
    request<{ ok: boolean }>(`/student/wrong/${question_id}/review`, { method: "POST" }),

  // 题库 / 刷题（WBS 2.2）
  bankList: (params: { subject?: string; category?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.subject) q.set("subject", params.subject);
    if (params.category) q.set("category", params.category);
    if (params.limit) q.set("limit", String(params.limit));
    return request<Question[]>(`/bank/questions?${q.toString()}`);
  },
  bankQuestion: (id: number) => request<Question>(`/bank/questions/${id}`),
  practice: (question_id: number, selected: string) =>
    request<{ question_id: number; is_correct: boolean; correct_answer: string; explanation: string | null; mastery: number }>(
      "/bank/practice",
      { method: "POST", body: JSON.stringify({ question_id, selected }) }
    ),

  // 收藏夹（WBS 2.2 衍生 / 学习管理）
  favoriteList: () => request<Question[]>("/bank/favorites"),
  favoriteAdd: (question_id: number) =>
    request<{ ok: boolean }>("/bank/favorites", { method: "POST", body: JSON.stringify({ question_id }) }),
  favoriteRemove: (question_id: number) =>
    request<{ ok: boolean }>(`/bank/favorites/${question_id}`, { method: "DELETE" }),

  // AI 私教 / 自适应（WBS 3.1 / 3.2）
  explain: (question_id: number, selected?: string) =>
    request<{ knowledge_point: string; explanation: string; citations: string[]; model: string | null }>("/ai/explain", {
      method: "POST",
      body: JSON.stringify({ question_id, selected }),
    }),
  recommend: (top_n = 10) => request<{ knowledge_points: string[]; questions: any[] }>(`/ai/recommend?top_n=${top_n}`),
  chat: (messages: ChatMessage[], kp_hint?: string) =>
    request<ChatReply>("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ messages, kp_hint }),
    }),
  plan: (days = 7, target?: string) =>
    request<PlanOut>("/ai/plan", {
      method: "POST",
      body: JSON.stringify({ days, target }),
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
  essayGrade: (essay_text: string, prompt_material = "", max_score = 100) =>
    request<{ total: number; dimensions: Record<string, number>; needs_human_review: boolean; rationale: string }>(
      "/ai/essay-grade",
      { method: "POST", body: JSON.stringify({ essay_text, prompt_material, max_score }) }
    ),

  // 在线模考（WBS 4.2）
  examStart: (subject?: string, count = 20) =>
    request<{ subject: string; count: number; paper: any[] }>("/exam/start", {
      method: "POST",
      body: JSON.stringify({ subject, count }),
    }),
  examSubmit: (answers: { question_id: number; selected: string }[]) =>
    request<{ total: number; correct: number; correct_rate: number; weak_points: string[]; details: any[] }>(
      "/exam/submit",
      { method: "POST", body: JSON.stringify({ answers }) }
    ),

  // 计费 / 退费 / 会员（WBS 5.1 / 7.1）
  createOrder: (plan: string) =>
    request<{ id: number; plan: string; amount: number; status: string }>("/billing/orders", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  requestRefund: (order_id: number, reason?: string) =>
    request<{ id: number; order_id: number; amount: number; status: string }>("/billing/refund", {
      method: "POST",
      body: JSON.stringify({ order_id, reason }),
    }),
  myBilling: () => request<{ plan: string; orders: any[]; refunds: any[] }>("/billing/me"),

  // 内容双签审核 / 信任保障（WBS 5.2 / c11 P0）
  reviewSubmit: (body: { item_type: string; item_id: string; body: string; version?: number }) =>
    request<ReviewOut>("/content/review/submit", {
      method: "POST",
      body: JSON.stringify({ version: 1, ...body }),
    }),
  reviewPending: () => request<ReviewOut[]>("/content/review/pending"),
  reviewSpotCheck: () => request<ReviewStats>("/content/review/spot-check"),
  reviewApprove: (id: number, reviewer: string) =>
    request<ReviewOut>(`/content/review/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ reviewer }),
    }),
  reviewReject: (id: number, reviewer: string, note?: string) =>
    request<ReviewOut>(`/content/review/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reviewer, note }),
    }),
  reviewCorrect: (id: number, reviewer: string, new_body: string) =>
    request<ReviewOut>(`/content/review/${id}/correct`, {
      method: "POST",
      body: JSON.stringify({ reviewer, new_body }),
    }),
};
