import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { chromium, type Browser, type Page } from 'playwright';
import {
  detectBoard,
  PROFILE_FIELD_PATTERNS,
  type BoardKind,
} from './board-detector';

export type PageField = {
  name: string;
  type: string;
  label: string;
  selector: string;
};

export type PageInspection = {
  url: string;
  title: string;
  board: BoardKind;
  fields: PageField[];
  fileInputs: Array<{ name: string; selector: string; label: string }>;
  submitSelectors: string[];
  screenshotPath: string | null;
};

export type ApplicantProfile = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  github?: string | null;
  location?: string | null;
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
    source?: string | null,
  ): Promise<PageInspection> {
    const board = detectBoard(url, source);
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await this.openApplicationForm(page, board);
      await page.waitForTimeout(1200);

      const fields = await this.collectFields(page);
      const fileInputs = await this.collectFileInputs(page);
      const submitSelectors = await this.collectSubmitSelectors(page);
      const screenshotPath = await this.captureScreenshot(page, userId);

      return {
        url: page.url(),
        title: await page.title(),
        board,
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
    coverLetterPath?: string | null;
    profile?: ApplicantProfile;
    source?: string | null;
    confirmSubmit?: boolean;
  }): Promise<{
    board: BoardKind;
    filled: string[];
    uploaded: string[];
    submitted: boolean;
    screenshotPath: string | null;
    blockers: string[];
  }> {
    const board = detectBoard(options.url, options.source);
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    const filled: string[] = [];
    const uploaded: string[] = [];
    const blockers: string[] = [];
    let submitted = false;

    try {
      await page.goto(options.url, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      await this.openApplicationForm(page, board);
      await page.waitForTimeout(1200);

      // 1) Board/profile heuristics first
      const heuristicValues = this.buildHeuristicFieldValues(
        await this.collectFields(page),
        options.profile,
      );
      const mergedValues = {
        ...heuristicValues,
        ...options.fieldValues,
      };

      for (const [selector, value] of Object.entries(mergedValues)) {
        if (!value?.trim()) continue;
        try {
          const locator = page.locator(selector).first();
          if ((await locator.count()) === 0) continue;
          const tag = await locator.evaluate((el) =>
            (el as { tagName?: string }).tagName?.toLowerCase?.(),
          );
          if (tag === 'select') {
            await locator.selectOption({ label: value }).catch(async () => {
              await locator.selectOption({ value });
            });
          } else {
            await locator.fill(value, { timeout: 4000 });
          }
          filled.push(selector);
        } catch {
          blockers.push(`Could not fill ${selector}`);
        }
      }

      // 2) Upload resume + cover letter intelligently
      const fileInputs = await this.collectFileInputs(page);
      if (options.resumePath) {
        const resumeInput =
          fileInputs.find((f) => /resume|cv|curriculum/i.test(f.label + f.name))
            ?.selector || fileInputs[0]?.selector;
        if (resumeInput) {
          try {
            await page
              .locator(resumeInput)
              .first()
              .setInputFiles(options.resumePath);
            uploaded.push('resume');
          } catch {
            blockers.push('Could not upload resume');
          }
        } else {
          blockers.push('No resume file input found');
        }
      }

      if (options.coverLetterPath) {
        const coverInput =
          fileInputs.find((f) =>
            /cover|letter|supporting/i.test(f.label + f.name),
          )?.selector ||
          (fileInputs.length > 1 ? fileInputs[1].selector : null);
        if (coverInput) {
          try {
            await page
              .locator(coverInput)
              .first()
              .setInputFiles(options.coverLetterPath);
            uploaded.push('cover_letter');
          } catch {
            blockers.push('Could not upload cover letter');
          }
        } else {
          blockers.push('No cover letter file input found');
        }
      }

      // 3) Board-specific extras
      await this.applyBoardExtras(page, board, blockers);

      if (options.confirmSubmit) {
        submitted = await this.clickSubmit(page, board);
        if (!submitted) blockers.push('Submit button not found');
        else await page.waitForTimeout(2000);
      } else {
        blockers.push(
          'Submit skipped — form filled only; pass confirmSubmit to click submit',
        );
      }

      const screenshotPath = await this.captureScreenshot(page, options.userId);
      return {
        board,
        filled,
        uploaded,
        submitted,
        screenshotPath,
        blockers,
      };
    } finally {
      await page.close();
    }
  }

  private async openApplicationForm(page: Page, board: BoardKind) {
    const applySelectors = [
      'a:has-text("Apply")',
      'button:has-text("Apply")',
      'a:has-text("Apply for this job")',
      'button:has-text("Apply for this job")',
      'a:has-text("Submit application")',
      '[data-qa="btn-apply"]',
      '#application_form',
    ];

    if (board === 'greenhouse') {
      applySelectors.unshift('#apply_button', 'a[href*="#app"]');
    }
    if (board === 'lever') {
      applySelectors.unshift('.postings-btn-wrapper a', 'a.postings-btn');
    }
    if (board === 'ashby') {
      applySelectors.unshift('button:has-text("Apply for this Job")');
    }

    for (const selector of applySelectors) {
      try {
        const locator = page.locator(selector).first();
        if ((await locator.count()) === 0) continue;
        const visible = await locator.isVisible().catch(() => false);
        if (!visible) continue;
        await locator.click({ timeout: 3000 });
        await page.waitForTimeout(1000);
        break;
      } catch {
        // try next
      }
    }

    // Greenhouse often embeds application in #application
    if (board === 'greenhouse') {
      await page
        .locator('#application, #main_fields, form')
        .first()
        .waitFor({ state: 'visible', timeout: 4000 })
        .catch(() => undefined);
    }
  }

  private buildHeuristicFieldValues(
    fields: PageField[],
    profile?: ApplicantProfile,
  ): Record<string, string> {
    if (!profile) return {};
    const fullName = profile.fullName?.trim() || '';
    const [firstName, ...rest] = fullName.split(/\s+/);
    const lastName = rest.join(' ');
    const values: Record<string, string> = {};

    const profileMap = {
      firstName: firstName || '',
      lastName: lastName || '',
      fullName,
      email: profile.email || '',
      phone: profile.phone || '',
      linkedin: profile.linkedin || '',
      github: profile.github || '',
      location: profile.location || '',
    };

    for (const field of fields) {
      const hay = `${field.label} ${field.name}`;
      for (const rule of PROFILE_FIELD_PATTERNS) {
        if (rule.patterns.some((re) => re.test(hay))) {
          const value = profileMap[rule.key];
          if (value) values[field.selector] = value;
          break;
        }
      }
    }
    return values;
  }

  private async applyBoardExtras(
    page: Page,
    board: BoardKind,
    blockers: string[],
  ) {
    try {
      if (board === 'greenhouse' || board === 'lever' || board === 'ashby') {
        // Dismiss common consent / cookie banners that block inputs
        const consent = page
          .locator(
            'button:has-text("Accept"), button:has-text("I agree"), button:has-text("Got it")',
          )
          .first();
        if ((await consent.count()) > 0 && (await consent.isVisible())) {
          await consent.click({ timeout: 2000 }).catch(() => undefined);
        }
      }
    } catch {
      blockers.push('Board extras partially failed');
    }
  }

  private async clickSubmit(page: Page, board: BoardKind): Promise<boolean> {
    const selectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Submit application")',
      'button:has-text("Submit Application")',
      'button:has-text("Submit")',
      'button:has-text("Apply")',
      'input[value="Submit application"]',
    ];
    if (board === 'greenhouse') {
      selectors.unshift('#submit_app', 'input#submit_app');
    }

    for (const selector of selectors) {
      try {
        const locator = page.locator(selector).first();
        if ((await locator.count()) === 0) continue;
        if (!(await locator.isVisible())) continue;
        await locator.click({ timeout: 4000 });
        return true;
      } catch {
        // continue
      }
    }
    return false;
  }

  private async collectFields(page: Page): Promise<PageField[]> {
    return (await page.evaluate(() => {
      const results: Array<{
        name: string;
        type: string;
        label: string;
        selector: string;
      }> = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cssEscape = (globalThis as any).CSS?.escape ?? ((s: string) => s);
      const inputs = Array.from(
        doc.querySelectorAll('input, textarea, select'),
      ) as Array<{
        type?: string;
        tagName: string;
        id: string;
        getAttribute: (name: string) => string | null;
        closest: (sel: string) => { textContent?: string | null } | null;
      }>;

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
          type === 'radio' ||
          type === 'file'
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
        else selector = `${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`;

        results.push({ name, type, label, selector });
      }
      return results;
    })) as PageField[];
  }

  private async collectFileInputs(
    page: Page,
  ): Promise<Array<{ name: string; selector: string; label: string }>> {
    return (await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cssEscape = (globalThis as any).CSS?.escape ?? ((s: string) => s);
      return Array.from(doc.querySelectorAll('input[type="file"]')).map(
        (
          el: {
            id: string;
            getAttribute: (n: string) => string | null;
            closest: (s: string) => { textContent?: string | null } | null;
          },
          index: number,
        ) => {
          const name = el.getAttribute('name') || el.id || `file_${index}`;
          const labelEl = el.id
            ? doc.querySelector(`label[for="${cssEscape(el.id)}"]`)
            : el.closest('label');
          const label =
            labelEl?.textContent?.trim() ||
            el.getAttribute('aria-label') ||
            el.getAttribute('data-qa') ||
            name;
          const selector = el.id
            ? `#${cssEscape(el.id)}`
            : el.getAttribute('name')
              ? `[name="${el.getAttribute('name')}"]`
              : `input[type="file"]:nth-of-type(${index + 1})`;
          return { name, selector, label };
        },
      );
    })) as Array<{ name: string; selector: string; label: string }>;
  }

  private async collectSubmitSelectors(page: Page): Promise<string[]> {
    return (await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cssEscape = (globalThis as any).CSS?.escape ?? ((s: string) => s);
      const selectors: string[] = [];
      doc
        .querySelectorAll('button[type="submit"], input[type="submit"], button')
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
      return selectors.slice(0, 8);
    })) as string[];
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
