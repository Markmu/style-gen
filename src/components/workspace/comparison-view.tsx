"use client";

import Image from "next/image";

interface ComparisonViewProps {
  referenceImageUrl: string;
  resultImageUrl: string;
}

export function ComparisonView({
  referenceImageUrl,
  resultImageUrl,
}: ComparisonViewProps) {
  return (
    <div className="rounded-lg bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]">
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
        参考图 vs 生成结果
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {/* Reference image (left) */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--text-secondary)]">参考图</p>
          <div className="overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
            <Image
              src={referenceImageUrl}
              alt="参考图"
              width={512}
              height={512}
              className="h-auto w-full object-contain"
              unoptimized
            />
          </div>
        </div>

        {/* Result image (right) */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--text-secondary)]">生成结果</p>
          <div className="overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
            <Image
              src={resultImageUrl}
              alt="生成结果"
              width={512}
              height={512}
              className="h-auto w-full object-contain"
              unoptimized
            />
          </div>
        </div>
      </div>
    </div>
  );
}
