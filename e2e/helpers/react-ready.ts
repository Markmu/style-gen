import { expect, type Locator } from '@playwright/test'

export async function waitForReactElement(locator: Locator) {
  await expect(locator).toBeAttached({ timeout: 15000 })
  await expect
    .poll(
      () =>
        locator.evaluate((element) =>
          Object.keys(element).some(
            (key) => key.startsWith('__reactProps$') || key.startsWith('__reactFiber$'),
          ),
        ),
      { timeout: 15000 },
    )
    .toBe(true)
}

export const waitForReactInput = waitForReactElement
