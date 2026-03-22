const steps = [
  {
    icon: "🖼️",
    title: "上传参考图",
    description: "选择一张你喜欢的风格参考图片",
  },
  {
    icon: "🔍",
    title: "AI 提取视觉配方",
    description: "AI 自动分析图片的色彩、构图、风格等视觉特征",
  },
  {
    icon: "🎨",
    title: "一键生成同风格新图",
    description: "基于提取的视觉配方，一键生成全新的同风格作品",
  },
] as const;

export function ValueSection() {
  return (
    <section className="px-4 py-16 md:py-24">
      <h2 className="mb-12 text-center text-2xl font-bold text-gray-900 md:text-3xl">
        三步完成风格再创作
      </h2>
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-3">
        {steps.map((step, index) => (
          <div
            key={index}
            className="flex flex-col items-center rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-gray-100"
          >
            <div className="mb-4 text-4xl">{step.icon}</div>
            <div className="mb-1 text-sm font-semibold text-blue-600">
              Step {index + 1}
            </div>
            <h3 className="mb-2 text-lg font-bold text-gray-900">
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-gray-600">
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
