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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">
        参考图 vs 生成结果
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {/* Reference image (left) */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500">参考图</p>
          <div className="overflow-hidden rounded-lg border border-gray-100">
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
          <p className="text-xs font-medium text-gray-500">生成结果</p>
          <div className="overflow-hidden rounded-lg border border-gray-100">
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
