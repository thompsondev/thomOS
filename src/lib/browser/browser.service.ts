import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { chromium, type Browser, type Page } from 'playwright';

export type PageField = {
  name: string;
  type: string;
  label: string;
  selector: string;
};

export type PageInspection = {
  url: string;
  title: string;
  fields: PageField[];
  fileInputs: Array<{ name: string; selector: string }>;
  submitSelectors: string[];
  screenshotPath: string | null;
};

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private browser: Browser | null = null;
  private readonly screenshotRoot = join(
    process.cwd(),
    'storage',
    'screenshots',
  );

  async onModuleDestroy() {
    await this.close();
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
      });
    }
    return this.browser;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async inspectApplicationPage(
    url: string,
    userId: string,
  ): Promise<PageInspection> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForTimeout(1500);

      const fields = (await page.evaluate(() => {
        const results: Array<{
          name: string;
          type: string;
          label: string;
          selector: string;
        }> = [];
        const inputs = Array.from(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (globalThis as any).document.querySelectorAll(
            'input, textarea, select',
          ),
        ) as Array<{
          type?: string;
          tagName: string;
          id: string;
          getAttribute: (name: string) => string | null;
          closest: (sel: string) => { textContent?: string | null } | null;
        }>;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cssEscape = (globalThis as any).CSS?.escape ?? ((s: string) => s);

        for (const [index, el] of inputs.entries()) {
          const type =
            el.tagName.toLowerCase() === 'input'
              ? el.type || 'text'
              : el.tagName.toLowerCase();
          if (
            type === 'hidden' ||
            type === 'submit' ||
            type === 'button' ||
            type === 'checkbox' ||
            type === 'radio'
          ) {
            continue;
          }

          const name = el.getAttribute('name') || el.id || `field_${index}`;
          const id = el.id;
          const labelEl = id
            ? doc.querySelector(`label[for="${cssEscape(id)}"]`)
            : el.closest('label');
          const label =
            labelEl?.textContent?.trim() ||
            el.getAttribute('aria-label') ||
            el.getAttribute('placeholder') ||
            name;

          let selector = '';
          if (id) selector = `#${cssEscape(id)}`;
          else if (el.getAttribute('name'))
            selector = `[name="${el.getAttribute('name')}"]`;
          else
            selector = `${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`;

          results.push({ name, type, label, selector });
        }
        return results;
      })) as PageField[];

      const fileInputs = (await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cssEscape = (globalThis as any).CSS?.escape ?? ((s: string) => s);
        return Array.from(doc.querySelectorAll('input[type="file"]')).map(
          (
            el: { id: string; getAttribute: (n: string) => string | null },
            index: number,
          ) => {
            const name = el.getAttribute('name') || el.id || `file_${index}`;
            const selector = el.id
              ? `#${cssEscape(el.id)}`
              : el.getAttribute('name')
                ? `[name="${el.getAttribute('name')}"]`
                : `input[type="file"]:nth-of-type(${index + 1})`;
            return { name, selector };
          },
        );
      })) as Array<{ name: string; selector: string }>;

      const submitSelectors = (await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cssEscape = (globalThis as any).CSS?.escape ?? ((s: string) => s);
        const selectors: string[] = [];
        doc
          .querySelectorAll(
            'button[type="submit"], input[type="submit"], button',
          )
          .forEach(
            (
              el: {
                textContent?: string | null;
                getAttribute: (n: string) => string | null;
                id: string;
              },
              index: number,
            ) => {
              const text = (el.textContent || el.getAttribute('value') || '')
                .trim()
                .toLowerCase();
              if (
                text.includes('submit') ||
                text.includes('apply') ||
                text.includes('send application') ||
                el.getAttribute('type') === 'submit'
              ) {
                if (el.id) selectors.push(`#${cssEscape(el.id)}`);
                else selectors.push(`button:nth-of-type(${index + 1})`);
              }
            },
          );
        return selectors.slice(0, 5);
      })) as string[];

      const screenshotPath = await this.captureScreenshot(page, userId);

      return {
        url: page.url(),
        title: await page.title(),
        fields,
        fileInputs,
        submitSelectors,
        screenshotPath,
      };
    } finally {
      await page.close();
    }
  }

  async fillAndPrepareApplication(options: {
    url: string;
    userId: string;
    fieldValues: Record<string, string>;
    resumePath?: string | null;
    confirmSubmit?: boolean;
  }): Promise<{
    filled: string[];
    uploaded: boolean;
    submitted: boolean;
    screenshotPath: string | null;
    blockers: string[];
  }> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    const filled: string[] = [];
    const blockers: string[] = [];
    let uploaded = false;
    let submitted = false;

    try {
      await page.goto(options.url, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      await page.waitForTimeout(1500);

      for (const [selector, value] of Object.entries(options.fieldValues)) {
        if (!value?.trim()) continue;
        try {
          const locator = page.locator(selector).first();
          if ((await locator.count()) === 0) continue;
          await locator.fill(value, { timeout: 3000 });
          filled.push(selector);
        } catch {
          blockers.push(`Could not fill ${selector}`);
        }
      }

      if (options.resumePath) {
        const fileInput = page.locator('input[type="file"]').first();
        if ((await fileInput.count()) > 0) {
          try {
            await fileInput.setInputFiles(options.resumePath);
            uploaded = true;
          } catch {
            blockers.push('Could not upload resume file');
          }
        } else {
          blockers.push('No file input found for resume upload');
        }
      }

      if (options.confirmSubmit) {
        const submit = page
          .locator(
            'button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply")',
          )
          .first();
        if ((await submit.count()) > 0) {
          await submit.click({ timeout: 5000 });
          submitted = true;
          await page.waitForTimeout(2000);
        } else {
          blockers.push('Submit button not found');
        }
      } else {
        blockers.push(
          'Submit skipped — approval fills the form only; pass confirmSubmit to click submit',
        );
      }

      const screenshotPath = await this.captureScreenshot(page, options.userId);
      return { filled, uploaded, submitted, screenshotPath, blockers };
    } finally {
      await page.close();
    }
  }

  private async captureScreenshot(
    page: Page,
    userId: string,
  ): Promise<string | null> {
    try {
      await mkdir(join(this.screenshotRoot, userId), { recursive: true });
      const path = join(this.screenshotRoot, userId, `${Date.now()}.png`);
      await page.screenshot({ path, fullPage: true });
      return path;
    } catch (err: unknown) {
      this.logger.warn(
        `Screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
