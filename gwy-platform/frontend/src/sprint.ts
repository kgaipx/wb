// —— 备考冲刺模式共享逻辑（Learn 冲刺面板 + Home 冲刺横幅共用）——
// 按剩余天数划分 4 阶段，给出阶段目标/每日建议/模考频次；薄弱点取自能力画像（mastery 升序、attempts>0，top3）

export interface SprintPhase {
  key: string;
  name: string;
  cond: (d: number) => boolean;
  target: string;
  daily: string;
  examFreq: string;
}

export const SPRINT_PHASES: SprintPhase[] = [
  { key: "base", name: "基础巩固", cond: (d) => d > 60, target: "系统过考点，建立知识框架", daily: "每日 30 题 + 错题当天复盘", examFreq: "每周 1 套摸底" },
  { key: "special", name: "专项突破", cond: (d) => d > 30, target: "主攻薄弱点，正确率提到 80%", daily: "每日 40 题专项 + 15 题回顾", examFreq: "每周 1-2 套限时模考" },
  { key: "paper", name: "套卷模拟", cond: (d) => d > 14, target: "全真限时模拟，训练时间分配", daily: "每 2 天 1 套完整套卷 + 复盘", examFreq: "隔天 1 套" },
  { key: "final", name: "冲刺回归", cond: (d) => d >= 0, target: "回归错题本，保持手感稳定心态", daily: "错题本过一遍 + 每日 20 题保持手感", examFreq: "考前 3 天停模考" },
];

export interface SprintAbility {
  knowledge_point: string;
  mastery: number;
  attempts: number;
}

export function calcSprint(
  daysLeft: number | null,
  ability: SprintAbility[]
): { phase: SprintPhase; weak: SprintAbility[]; daysLeft: number } | null {
  if (daysLeft === null || daysLeft < 0) return null;
  const phase = SPRINT_PHASES.find((p) => p.cond(daysLeft)) ?? SPRINT_PHASES[0];
  const weak = (ability || [])
    .filter((a) => a.attempts > 0)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 3);
  return { phase, weak, daysLeft };
}

/** 距目标日期剩余天数（跨设备：由调用方注入日期字符串）；日期已过返回 null */
export function daysLeftOf(targetDate: string): number | null {
  if (!targetDate) return null;
  const d = new Date(targetDate + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const left = Math.ceil((d.getTime() - Date.now()) / 86400000);
  return left < 0 ? null : left;
}
