// 后端接口封装：统一 /api 前缀、错误处理、Auth 头注入（WBS 2.1~7.1 全量联通）
const BASE = "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("access_token");
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败: ${res.status}`);
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

  // AI 私教 / 自适应（WBS 3.1 / 3.2）
  explain: (question_id: number, selected?: string) =>
    request<{ knowledge_point: string; explanation: string; citations: string[]; model: string | null }>("/ai/explain", {
      method: "POST",
      body: JSON.stringify({ question_id, selected }),
    }),
  recommend: (top_n = 10) => request<{ knowledge_points: string[]; questions: any[] }>(`/ai/recommend?top_n=${top_n}`),

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
};
