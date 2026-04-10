import { test, expect, type Page } from '@playwright/test'
import {
  authenticateTestUser,
} from './helpers/auth'
import {
  mockUploadPresign,
  mockAnalysisCreate,
  mockAnalysisPolling,
  loadFixture,
} from './helpers/mock-api'
import { TEST_IMAGE_PATH } from './helpers/workspace-actions'

const TEMPLATE_PREFIX = 'e2e-test-'

// ─── Helpers ──────────────────────────────────────────────────────────

/** 到达 Prompt 编辑器状态（保存模板的前置条件） */
async function reachPromptEditor(page: Page) {
  await authenticateTestUser(page)
  await mockUploadPresign(page)
  const analysisCompleted = loadFixture('analysis-completed.json')

  // 设置分析 mock
  const taskId = 'mock-analysis-task-id'
  await mockAnalysisCreate(page, taskId)
  await mockAnalysisPolling(page, taskId, analysisCompleted)

  // 导航到工作区并上传
  await page.goto('/workspace')
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(TEST_IMAGE_PATH)

  // 等待分析完成 — 等编辑器区域出现（不依赖特定文案）
  await expect(page.getByRole('button', { name: '保存为模板' })).toBeVisible({ timeout: 15000 })
}

/** 生成唯一的模板名称，避免跨测试冲突 */
function uniqueTemplateName(suffix = '') {
  return `${TEMPLATE_PREFIX}${Date.now()}${suffix ? `-${suffix}` : ''}`
}

// ─── Happy Path: 模板 CRUD 完整闭环 ───────────────────────────────────

test.describe('模板功能 - 真实链路', () => {

  test.describe('保存模板', () => {

    test('应该能将当前 Prompt 保存为无变量模板', async ({ page }) => {
      await reachPromptEditor(page)

      // 点击「保存为模板」按钮
      await page.getByRole('button', { name: '保存为模板' }).click()

      // 对话框应出现
      await expect(page.getByRole('dialog', { name: '保存为模板' })).toBeVisible()

      // 输入模板名称
      const name = uniqueTemplateName('simple')
      await page.getByLabel('模板名称').fill(name)

      // 点击保存
      await page.getByRole('button', { name: '保存模板' }).click()

      // 对话框应关闭（保存成功）
      await expect(page.getByRole('dialog', { name: '保存为模板' })).not.toBeVisible()
    })

    test('应该能保存含 {{变量}} 标记的模板并自动识别变量', async ({ page }) => {
      await reachPromptEditor(page)

      // 打开保存对话框
      await page.getByRole('button', { name: '保存为模板' }).click()
      await expect(page.getByRole('dialog', { name: '保存为模板' })).toBeVisible()

      // 输入名称
      const name = uniqueTemplateName('with-var')
      await page.getByLabel('模板名称').fill(name)

      // 在内容区域插入变量：点击"{{}} 插入变量"
      await page.getByRole('button', { name: /\{\{\}\} 插入变量/ }).click()
      // 输入变量名
      const varInput = page.locator('#template-content').locator('..').getByPlaceholder('变量名')
      await varInput.fill('subject')
      // 点击确认
      await page.getByRole('button', { name: '确认' }).click()

      // 应显示已识别的变量预览（用 exact 避免与 textarea 内容冲突）
      await expect(page.getByText(/已识别变量/)).toBeVisible()
      await expect(page.locator('li').filter({ hasText: '{{subject}}' })).toBeVisible()

      // 保存
      await page.getByRole('button', { name: '保存模板' }).click()
      await expect(page.getByRole('dialog', { name: '保存为模板' })).not.toBeVisible()
    })

    test('空名称应展示校验错误', async ({ page }) => {
      await reachPromptEditor(page)

      await page.getByRole('button', { name: '保存为模板' }).click()
      await expect(page.getByRole('dialog', { name: '保存为模板' })).toBeVisible()

      // 不填名称直接点保存
      await page.getByRole('button', { name: '保存模板' }).click()

      // 应显示错误提示
      await expect(page.getByText('请输入模板名称')).toBeVisible()
    })

    test('同名模板应返回冲突错误 (409)', async ({ page }) => {
      await reachPromptEditor(page)

      const name = uniqueTemplateName('dup')

      // 第一次保存 — 成功
      await page.getByRole('button', { name: '保存为模板' }).click()
      await page.getByLabel('模板名称').fill(name)
      await page.getByRole('button', { name: '保存模板' }).click()
      await expect(page.getByRole('dialog', { name: '保存为模板' })).not.toBeVisible()

      // 第二次保存同名 — 应报错
      await page.getByRole('button', { name: '保存为模板' }).click()
      await page.getByLabel('模板名称').fill(name)
      await page.getByRole('button', { name: '保存模板' }).click()

      // 应显示同名冲突错误
      await expect(page.getByText(/同名|已存在|冲突/)).toBeVisible()
    })

    test('Escape 键应关闭对话框', async ({ page }) => {
      await reachPromptEditor(page)

      await page.getByRole('button', { name: '保存为模板' }).click()
      await expect(page.getByRole('dialog', { name: '保存为模板' })).toBeVisible()

      await page.getByRole('dialog', { name: '保存为模板' }).click()
      await page.keyboard.press('Escape')

      await expect(page.getByRole('dialog', { name: '保存为模板' })).not.toBeVisible()
    })
  })

  test.describe('模板 Drawer 与加载', () => {

    test('打开我的模板抽屉应加载列表', async ({ page }) => {
      await reachPromptEditor(page)

      // 先保存一个模板，确保列表非空
      await page.getByRole('button', { name: '保存为模板' }).click()
      await page.getByLabel('模板名称').fill(uniqueTemplateName('drawer-list'))
      await page.getByRole('button', { name: '保存模板' }).click()
      await expect(page.getByRole('dialog', { name: '保存为模板' })).not.toBeVisible()

      // 打开抽屉
      await page.getByRole('button', { name: '我的模板' }).click()

      // 抽屉标题
      await expect(page.getByRole('heading', { name: '我的模板' })).toBeVisible()

      // 应看到刚才创建的模板卡片
      await expect(page.getByText(/e2e-test-/)).toBeVisible()
    })

    test('点击使用应将模板内容加载到编辑器', async ({ page }) => {
      await reachPromptEditor(page)

      // 保存一个有特定内容的模板
      await page.getByRole('button', { name: '保存为模板' }).click()
      const name = uniqueTemplateName('load-content')
      await page.getByLabel('模板名称').fill(name)

      // 编辑内容为可识别的文本
      const contentTextarea = page.locator('#template-content')
      await contentTextarea.fill('E2E unique content for loading test')
      await page.getByRole('button', { name: '保存模板' }).click()
      await expect(page.getByRole('dialog', { name: '保存为模板' })).not.toBeVisible()

      // 打开抽屉并使用该模板
      await page.getByRole('button', { name: '我的模板' }).click()
      await expect(page.getByRole('heading', { name: '我的模板' })).toBeVisible()

      // 点击使用按钮
      await page.getByRole('button', { name: '使用' }).click()

      // 抽屉关闭
      await expect(page.getByRole('heading', { name: '我的模板' })).not.toBeVisible()

      // 编辑器内容应更新为模板内容
      await expect(page.getByText('E2E unique content for loading test')).toBeVisible()
    })
  })

  test.describe('变量向导 (Wizard)', () => {

    test('加载含变量模板应自动触发变量填值向导', async ({ page }) => {
      await reachPromptEditor(page)

      // 创建含变量的模板
      await page.getByRole('button', { name: '保存为模板' }).click()
      await page.getByLabel('模板名称').fill(uniqueTemplateName('wizard-trigger'))

      // 插入变量
      await page.getByRole('button', { name: /\{\{\}\} 插入变量/ }).click()
      await page.locator('#template-content').locator('..').getByPlaceholder('变量名').fill('scene')
      await page.getByRole('button', { name: '确认' }).click()

      await page.getByRole('button', { name: '保存模板' }).click()
      await expect(page.getByRole('dialog', { name: '保存为模板' })).not.toBeVisible()

      // 从抽屉加载该模板
      await page.getByRole('button', { name: '我的模板' }).click()
      await page.getByRole('button', { name: '使用' }).click()

      // 向导面板应出现
      await expect(page.getByRole('heading', { name: '变量填值' })).toBeVisible()
      // 显示变量数量描述
      await expect(page.getByText(/包含.*个变量/)).toBeVisible()
      // 变量输入框
      await expect(page.getByLabel('scene')).toBeVisible()
    })

    test('填写变量值并应用应替换标记并更新编辑器', async ({ page }) => {
      await reachPromptEditor(page)

      // 创建含变量的模板
      await page.getByRole('button', { name: '保存为模板' }).click()
      await page.getByLabel('模板名称').fill(uniqueTemplateName('wizard-apply'))

      await page.getByRole('button', { name: /\{\{\}\} 插入变量/ }).click()
      await page.locator('#template-content').locator('..').getByPlaceholder('变量名').fill('character')
      await page.getByRole('button', { name: '确认' }).click()

      await page.getByRole('button', { name: '保存模板' }).click()
      await expect(page.getByRole('dialog', { name: '保存为模板' })).not.toBeVisible()

      // 加载模板触发向导
      await page.getByRole('button', { name: '我的模板' }).click()
      await page.getByRole('button', { name: '使用' }).click()
      await expect(page.getByRole('heading', { name: '变量填值' })).toBeVisible()

      // 填写变量值
      await page.getByLabel('character').fill('cyberpunk samurai')

      // 应用
      await page.getByRole('button', { name: '应用并生成' }).click()

      // 向导消失，回到编辑器
      await expect(page.getByRole('heading', { name: '变量填值' })).not.toBeVisible()

      // 编辑器中应包含替换后的文本
      await expect(page.getByText('cyberpunk samurai')).toBeVisible()
    })

    test('跳过向导应保留原始 {{var}} 标记', async ({ page }) => {
      await reachPromptEditor(page)

      // 创建含变量的模板
      await page.getByRole('button', { name: '保存为模板' }).click()
      await page.getByLabel('模板名称').fill(uniqueTemplateName('wizard-skip'))

      await page.getByRole('button', { name: /\{\{\}\} 插入变量/ }).click()
      await page.locator('#template-content').locator('..').getByPlaceholder('变量名').fill('element')
      await page.getByRole('button', { name: '确认' }).click()

      await page.getByRole('button', { name: '保存模板' }).click()
      await expect(page.getByRole('dialog', { name: '保存为模板' })).not.toBeVisible()

      // 加载模板触发向导
      await page.getByRole('button', { name: '我的模板' }).click()
      await page.getByRole('button', { name: '使用' }).click()
      await expect(page.getByRole('heading', { name: '变量填值' })).toBeVisible()

      // 跳过
      await page.getByRole('button', { name: '跳过' }).click()

      // 向导消失
      await expect(page.getByRole('heading', { name: '变量填值' })).not.toBeVisible()

      // 编辑器中应保留原始 {{element}} 标记（跳过后内容回到 textarea）
      await expect(page.getByText('{{element}}')).toBeVisible()
    })
  })

  test.describe('模板管理操作', () => {

    test('删除模板应弹出确认对话框并执行删除', async ({ page }) => {
      await reachPromptEditor(page)

      // 创建待删除的模板
      await page.getByRole('button', { name: '保存为模板' }).click()
      const name = uniqueTemplateName('to-delete')
      await page.getByLabel('模板名称').fill(name)
      await page.getByRole('button', { name: '保存模板' }).click()
      await expect(page.getByRole('dialog', { name: '保存为模板' })).not.toBeVisible()

      // 打开抽屉
      await page.getByRole('button', { name: '我的模板' }).click()
      await expect(page.getByRole('heading', { name: '我的模板' })).toBeVisible()

      // 点击三点菜单 → 删除
      await page.getByRole('button', { name: '更多操作' }).click()
      await page.getByRole('button', { name: '删除' }).click()

      // 确认删除对话框出现
      await expect(page.getByRole('alertdialog', { name: /确认删除/ })).toBeVisible()

      // 确认删除
      await page.getByRole('button', { name: '删除' }).click()

      // 对话框关闭，模板从列表移除
      await expect(page.getByRole('alertdialog', { name: /确认删除/ })).not.toBeVisible()
      // 该模板不再可见
      await expect(page.getByText(name)).not.toBeVisible()
    })

    test('复制模板应在列表顶部生成副本', async ({ page }) => {
      await reachPromptEditor(page)

      // 创建源模板
      await page.getByRole('button', { name: '保存为模板' }).click()
      const name = uniqueTemplateName('to-dup')
      await page.getByLabel('模板名称').fill(name)
      await page.getByRole('button', { name: '保存模板' }).click()
      await expect(page.getByRole('dialog', { name: '保存为模板' })).not.toBeVisible()

      // 打开抽屉
      await page.getByRole('button', { name: '我的模板' }).click()
      await expect(page.getByRole('heading', { name: '我的模板' })).toBeVisible()

      // 三点菜单 → 复制
      await page.getByRole('button', { name: '更多操作' }).click()
      await page.getByRole('button', { name: '复制' }).click()

      // 副本应出现在列表中（名称带 " (copy)"）
      await expect(page.getByText(/\(copy\)/)).toBeVisible({ timeout: 5000 })
    })
  })
})

// ─── 清理：测试结束后删除所有 e2e-test- 前缀的模板 ───────────────────

test.afterEach(async ({ page }) => {
  try {
    // 通过浏览器上下文调用真实 API 清理测试数据（已有 session cookie）
    await page.evaluate(async (prefix) => {
      try {
        const listRes = await fetch('/api/templates?limit=50')
        if (!listRes.ok) return
        const listData = await listRes.json() as { items: { id: string; name: string }[] }

        for (const t of listData.items) {
          if (t.name.startsWith(prefix)) {
            await fetch(`/api/templates/${t.id}`, { method: 'DELETE' }).catch(() => {})
          }
        }
      } catch {
        // 清理失败不阻塞测试结果
      }
    }, TEMPLATE_PREFIX)
  } catch {
    // 清理失败静默处理
  }
})
