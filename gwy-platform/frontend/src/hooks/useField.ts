import { useId, useState } from "react";

export interface FieldController {
  /** 当前是否处于「应展示错误」状态（已失焦 或 表单已提交过） */
  invalid: boolean;
  /** 当前应展示的错误文案（未到展示条件或校验通过则为空串） */
  error: string;
  /** 用于 aria-describedby 关联错误元素的 id；无错误时为 undefined */
  describedBy: string | undefined;
  /** 输入框 onBlur 时调用，触发「失焦即校验」 */
  onBlur: () => void;
}

/**
 * 受控字段校验控制器（Apple 级实时反馈）。
 *
 * 设计要点：
 * - 校验函数 validate 每次渲染都基于最新 value 复算，错误随输入实时变化（改对即清、改错即显）。
 * - 错误默认在「失焦」或「表单已提交过」后才展示，避免一进入表单就满屏标红。
 * - submitted 为父级表单级信号：首次提交后置 true，此后所有字段错误立即显示并随输入实时更新。
 * - 配合 .input.is-invalid / .field-error 样式，以及 aria-invalid / aria-describedby 实现可达性。
 */
export function useField(opts: {
  value: string;
  validate?: (v: string) => string | null;
  /** 表单级「已提交」信号：为 true 时立即展示该字段错误，并随输入实时更新 */
  submitted: boolean;
}): FieldController {
  const [touched, setTouched] = useState(false);
  const rawId = useId();
  const id = "fld-" + rawId.replace(/:/g, "");
  const rawError = opts.validate ? opts.validate(opts.value) : null;
  const show = opts.submitted || touched;
  const invalid = !!rawError && show;
  return {
    invalid,
    error: invalid ? rawError! : "",
    describedBy: invalid ? id : undefined,
    onBlur: () => setTouched(true),
  };
}
