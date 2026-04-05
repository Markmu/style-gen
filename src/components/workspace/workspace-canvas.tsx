"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { WorkspaceState } from "@/hooks/use-workspace-state";
import type { VisualRecipe } from "@/types/models";
import { UploadZone } from "@/components/workspace/upload-zone";
import { CanvasToolbar } from "@/components/workspace/canvas-toolbar";
import { StyleTagBar } from "@/components/workspace/style-tag-bar";

type CanvasView = "upload" | "reference" | "result" | "comparison";

function deriveCanvasView(
  state: WorkspaceState,
  referenceImageUrl: string | null,
  resultImageUrl: string | null,
): CanvasView {
  if (!referenceImageUrl) return "upload";
  if (resultImageUrl && state === "generation_ready") return "result";
  return "reference";
}

interface WorkspaceCanvasProps {
  state: WorkspaceState;
  referenceImageUrl: string | null;
  resultImageUrl: string | null;
  recipe: VisualRecipe | null;
  isUploading: boolean;
  uploadProgress: number;
  onFileSelected: (file: File) => void;
  onReplace: () => void;
}

export function WorkspaceCanvas({
  state,
  referenceImageUrl,
  resultImageUrl,
  recipe,
  isUploading,
  uploadProgress,
  onFileSelected,
  onReplace,
}: WorkspaceCanvasProps) {
  const baseView = deriveCanvasView(state, referenceImageUrl, resultImageUrl);

  // 对比视图通过 CanvasToolbar 手动切换，仅 generation_ready 时可用
  const [toolbarView, setToolbarView] = useState<"result" | "comparison">(
    "result",
  );

  // 当 baseView 不是 result 时，重置 toolbar 视图
  useEffect(() => {
    if (baseView !== "result") {
      setToolbarView("result");
    }
  }, [baseView]);

  const canvasView: CanvasView =
    baseView === "result" && toolbarView === "comparison"
      ? "comparison"
      : baseView;

  // 全屏放大状态（结果图点击放大）
  const [isExpanded, setIsExpanded] = useState(false);

  // 全局 Esc 键关闭全屏
  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsExpanded(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isExpanded]);

  // 对比视图的自适应布局
  const [comparisonLayout, setComparisonLayout] = useState<
    "side-by-side" | "stacked"
  >("side-by-side");

  useEffect(() => {
    if (canvasView !== "comparison" || !referenceImageUrl) return;

    const img = new window.Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      setComparisonLayout(ratio < 0.8 ? "stacked" : "side-by-side");
    };
    img.onerror = () => {
      setComparisonLayout("side-by-side");
    };
    img.src = referenceImageUrl;
  }, [canvasView, referenceImageUrl]);

  return (
    <div className="rounded-xl bg-[var(--surface-mid)] ring-1 ring-[var(--border)]">
      {/* 视图切换容器，使用 CSS transition */}
      <div className="transition-all duration-200">
        {/* Upload 视图 */}
        {(canvasView === "upload" || state === "uploading") && (
          <div className="p-6">
            <UploadZone
              referenceImageUrl={null}
              isUploading={isUploading || state === "uploading"}
              uploadProgress={uploadProgress}
              onFileSelected={onFileSelected}
              onReplace={onReplace}
            />
          </div>
        )}

        {/* Reference 视图 */}
        {canvasView === "reference" && referenceImageUrl && (
          <div className="relative">
            {/* 分析中的视觉反馈 */}
            {state === "analyzing" && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/30 backdrop-blur-[2px]">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent" />
                  <p className="text-sm font-medium text-white">
                    AI 正在分析风格特征...
                  </p>
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-xl">
              <Image
                src={referenceImageUrl}
                alt="参考图"
                width={1024}
                height={1024}
                className="h-auto max-h-[600px] w-full object-contain"
                unoptimized
              />
            </div>

            {/* StyleTagBar: 分析完成后展示 */}
            {recipe && state !== "analyzing" && (
              <div className="px-4 py-3">
                <StyleTagBar recipe={recipe} />
              </div>
            )}
          </div>
        )}

        {/* Result 视图 */}
        {canvasView === "result" && resultImageUrl && (
          <div className="relative">
            {/* CanvasToolbar 位于画布内部顶部 */}
            {referenceImageUrl && (
              <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2">
                <CanvasToolbar
                  resultImageUrl={resultImageUrl}
                  referenceImageUrl={referenceImageUrl}
                  activeView={toolbarView}
                  onViewChange={setToolbarView}
                />
              </div>
            )}

            <div className="overflow-hidden rounded-xl">
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="w-full"
              >
                <Image
                  src={resultImageUrl}
                  alt="生成结果"
                  width={1024}
                  height={1024}
                  className="h-auto max-h-[600px] w-full object-contain"
                  unoptimized
                />
              </button>
            </div>
          </div>
        )}

        {/* Comparison 视图 */}
        {canvasView === "comparison" &&
          referenceImageUrl &&
          resultImageUrl && (
            <div className="relative">
              {/* CanvasToolbar 位于画布内部顶部 */}
              <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2">
                <CanvasToolbar
                  resultImageUrl={resultImageUrl}
                  referenceImageUrl={referenceImageUrl}
                  activeView={toolbarView}
                  onViewChange={setToolbarView}
                />
              </div>

              <div className="p-4 pt-14">
                <div
                  className={
                    comparisonLayout === "side-by-side"
                      ? "grid grid-cols-2 gap-3"
                      : "grid grid-cols-1 gap-3"
                  }
                >
                  {/* 参考图 */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[var(--text-secondary)]">
                      参考图
                    </p>
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

                  {/* 结果图 */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[var(--text-secondary)]">
                      生成结果
                    </p>
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
            </div>
          )}
      </div>

      {/* 全屏查看 overlay */}
      {isExpanded && resultImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setIsExpanded(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(false);
            }}
            className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            aria-label="关闭全屏查看"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>

          <Image
            src={resultImageUrl}
            alt="生成结果（放大）"
            width={1024}
            height={1024}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            unoptimized
          />
        </div>
      )}
    </div>
  );
}
