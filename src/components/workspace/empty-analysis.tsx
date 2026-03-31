"use client";

export function EmptyAnalysis() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-gray-400"
        >
          <path d="M12 3v2m0 14v2M5.636 5.636l1.414 1.414m9.9 9.9l1.414 1.414M3 12h2m14 0h2M5.636 18.364l1.414-1.414m9.9-9.9l1.414-1.414" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-700">风格分析</h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">
        上传参考图后，AI 会自动分析视觉风格
        <br />
        并生成可编辑的 Prompt
      </p>
    </div>
  );
}
