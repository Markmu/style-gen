export type ProductStatus =
  | "empty"
  | "loading"
  | "queued"
  | "processing"
  | "success"
  | "failedRecoverable"
  | "restored"
  | "authRequired"
  | "noResults";

export type StatusTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface StatusCopy {
  status: ProductStatus;
  title: string;
  description: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  tone: StatusTone;
}

export type StatusCopyOverride = Partial<
  Omit<StatusCopy, "status" | "tone"> & { tone: StatusTone }
>;

export const PRODUCT_STATUS_COPY: Record<ProductStatus, StatusCopy> = {
  empty: {
    status: "empty",
    title: "准备开始",
    description: "添加参考图或选择模板，保留当前空间用于下一步创作。",
    primaryActionLabel: "添加参考图",
    secondaryActionLabel: "浏览模板",
    tone: "neutral",
  },
  loading: {
    status: "loading",
    title: "正在加载",
    description: "内容正在进入工作区，请稍等片刻。",
    tone: "neutral",
  },
  queued: {
    status: "queued",
    title: "已进入队列",
    description: "任务正在排队，当前内容会保留，可以继续等待或返回编辑。",
    primaryActionLabel: "继续等待",
    secondaryActionLabel: "返回编辑",
    tone: "warning",
  },
  processing: {
    status: "processing",
    title: "正在处理",
    description: "系统正在处理当前请求，参考内容和输入会保持在原位。",
    secondaryActionLabel: "返回编辑",
    tone: "accent",
  },
  success: {
    status: "success",
    title: "已完成",
    description: "结果已准备好，可以继续编辑、下载或再次生成。",
    primaryActionLabel: "继续编辑",
    secondaryActionLabel: "再次生成",
    tone: "success",
  },
  failedRecoverable: {
    status: "failedRecoverable",
    title: "可以恢复",
    description: "当前步骤没有完成，但已保留可复用上下文。",
    primaryActionLabel: "重试",
    secondaryActionLabel: "返回编辑",
    tone: "danger",
  },
  restored: {
    status: "restored",
    title: "已恢复历史",
    description: "历史结果已回到工作区，可以继续调整提示词或再次生成。",
    primaryActionLabel: "继续编辑",
    secondaryActionLabel: "再次生成",
    tone: "success",
  },
  authRequired: {
    status: "authRequired",
    title: "需要登录",
    description: "登录后可以继续当前任务，页面上下文会尽量保留。",
    primaryActionLabel: "登录",
    secondaryActionLabel: "返回工作台",
    tone: "warning",
  },
  noResults: {
    status: "noResults",
    title: "没有匹配结果",
    description: "调整关键词或清空搜索，仍可回到工作台继续创作。",
    primaryActionLabel: "清空搜索",
    secondaryActionLabel: "返回工作台",
    tone: "neutral",
  },
};

export const PRODUCT_STATUSES = Object.keys(PRODUCT_STATUS_COPY) as ProductStatus[];

export function getStatusCopy(
  status: ProductStatus,
  overrides: StatusCopyOverride = {},
): StatusCopy {
  const baseCopy = PRODUCT_STATUS_COPY[status];
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as StatusCopyOverride;

  return {
    ...baseCopy,
    ...definedOverrides,
    status,
    tone: definedOverrides.tone ?? baseCopy.tone,
  };
}
