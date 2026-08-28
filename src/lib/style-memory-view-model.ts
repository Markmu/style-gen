import type {
  StyleMemoryListItem,
  TemplateVerificationStatus,
} from "@/types/models";

/**
 * plan-04：Style Memory 卡片视图模型（架构 §6.1 / PRD §3.1 线框）。
 * 输入为 plan-02 列表 DTO `StyleMemoryListItem`，全部展示内容来自真实字段：
 * 状态徽标、规则摘要（服务端已取前 2 条）、预览选择（已验证 → 代表结果 +
 * 参考图标注；pending 卡 → 来源图或“无预览”）、变量数与最近使用。
 * 不再从名称派生任何风格标签（PRD 规则 6：卡片事实必须来自实际保存内容）。
 */

export const RULES_PENDING_LABEL = "No rules yet";
export const NEVER_USED_LABEL = "Never used";

/**
 * plan-05：列表页当前查询条件（search/status 等）在 URL 持久化时同步写入
 * sessionStorage 的键。详情页读取它用于「返回列表」与删除确认导航恢复原查询
 * （AC-07「回列表（原 query 恢复）」；TC-7.3 契约）。
 */
export const STYLE_MEMORY_LIST_QUERY_STORAGE_KEY = "style-memory-list-query";

/** 主预览选择：verified → 代表结果；pending → 来源图；均缺失 → 无预览 */
export type StyleMemoryPreviewKind = "representative" | "source" | "none";

export interface StyleMemoryPreview {
  kind: StyleMemoryPreviewKind;
  /** 主预览图 URL；kind 为 none 时为 null */
  mainImageUrl: string | null;
  mainAlt: string;
  /** 已验证卡片的来源图小图（带「参考图」标注）；其余为 null */
  referenceImageUrl: string | null;
}

export interface StyleMemoryCardViewModel {
  id: string;
  name: string;
  verificationStatus: TemplateVerificationStatus;
  statusBadge: {
    /** “User verified” | “Pending verification”（文字 + 视觉标识，不只依赖颜色，PRD 规则 3） */
    label: string;
    isVerified: boolean;
  };
  /** retainedRulesPreview 以 “ · ” 连接；空数组 → “规则待补充” */
  rulesSummary: string;
  /** “{N} 个变量” */
  variableLabel: string;
  /** 最近使用相对文案；lastUsedAt 为 null → “尚未使用” */
  lastUsedLabel: string;
  preview: StyleMemoryPreview;
  actions: {
    viewDetailLabel: "View details";
    useLabel: "Use";
    viewDetailHref: string;
  };
}

/** lastUsedAt 相对时间文案（供卡片与单测复用；时钟 skew 时按“刚刚使用”处理） */
export function formatStyleMemoryLastUsed(
  iso: string,
  now: number = Date.now(),
): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return NEVER_USED_LABEL;

  const elapsedMs = now - time;
  if (elapsedMs < 60 * 60 * 1000) return "Used just now";

  const hours = Math.floor(elapsedMs / (60 * 60 * 1000));
  if (hours < 24) return `Used ${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `Used ${days} days ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `Used ${months} months ago`;

  return `Used ${Math.floor(months / 12)} years ago`;
}

function buildPreview(memory: StyleMemoryListItem): StyleMemoryPreview {
  const sourceAlt = `Source reference for ${memory.name}`;

  if (memory.verificationStatus === "user_verified") {
    // 已验证：代表结果为主预览 + 来源图小图（“参考图”标注）；
    // 代表结果缺失（旧资产/资产失效）时退回来源图，不虚构结果。
    if (memory.representativeImageUrl) {
      return {
        kind: "representative",
        mainImageUrl: memory.representativeImageUrl,
        mainAlt: `Representative result for ${memory.name}`,
        referenceImageUrl: memory.sourceImageUrl,
      };
    }
    if (memory.sourceImageUrl) {
      return {
        kind: "source",
        mainImageUrl: memory.sourceImageUrl,
        mainAlt: sourceAlt,
        referenceImageUrl: null,
      };
    }
    return { kind: "none", mainImageUrl: null, mainAlt: sourceAlt, referenceImageUrl: null };
  }

  // pending 卡：只展示真实来源图，无则“无预览”，不用示例结果暗示成功（PRD 规则 7）
  if (memory.sourceImageUrl) {
    return {
      kind: "source",
      mainImageUrl: memory.sourceImageUrl,
      mainAlt: sourceAlt,
      referenceImageUrl: null,
    };
  }
  return { kind: "none", mainImageUrl: null, mainAlt: sourceAlt, referenceImageUrl: null };
}

export function deriveStyleMemoryCardViewModel(
  memory: StyleMemoryListItem,
): StyleMemoryCardViewModel {
  const rules = memory.retainedRulesPreview ?? [];
  const isVerified = memory.verificationStatus === "user_verified";

  return {
    id: memory.id,
    name: memory.name,
    verificationStatus: memory.verificationStatus,
    statusBadge: {
      label: isVerified ? "User verified" : "Pending verification",
      isVerified,
    },
    rulesSummary: rules.length > 0 ? rules.join(" · ") : RULES_PENDING_LABEL,
    variableLabel: `${memory.variableCount} variables`,
    lastUsedLabel: memory.lastUsedAt
      ? formatStyleMemoryLastUsed(memory.lastUsedAt)
      : NEVER_USED_LABEL,
    preview: buildPreview(memory),
    actions: {
      viewDetailLabel: "View details",
      useLabel: "Use",
      viewDetailHref: `/workspace/templates/${memory.id}`,
    },
  };
}
