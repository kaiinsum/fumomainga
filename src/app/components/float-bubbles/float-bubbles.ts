import { Component, ElementRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const HISTORY_KEY = 'fumo.chat';

/**
 * Bong bóng nổi góc phải: TikTok, Facebook và trợ lý AI.
 * Trợ lý AI gọi /api/chat (Vercel Function) — AI trả lời dựa trên file knowledge/kien-thuc.md.
 */
@Component({
  selector: 'app-float-bubbles',
  imports: [FormsModule],
  template: `
    @if (open()) {
      <section class="chat" role="dialog" aria-label="Trợ lý AI">
        <header>
          <span class="avatar">{{ s().logoEmoji }}</span>
          <div>
            <b>Trợ lý {{ s().shopName }}</b>
            <small>AI · trả lời tự động</small>
          </div>
          <button type="button" class="icon-btn" title="Xoá hội thoại" (click)="reset()">↺</button>
          <button type="button" class="icon-btn" title="Đóng" (click)="open.set(false)">✕</button>
        </header>

        <div class="log" #log>
          <div class="msg assistant">{{ s().chatGreeting }}</div>
          @for (m of messages(); track $index) {
            <div class="msg" [class]="'msg ' + m.role">{{ m.content }}</div>
          }
          @if (busy()) {
            <div class="msg assistant typing"><i></i><i></i><i></i></div>
          }
          @if (error()) {
            <div class="err">{{ error() }}</div>
          }
        </div>

        @if (!messages().length) {
          <div class="quick">
            @for (q of quick; track q) {
              <button type="button" (click)="send(q)">{{ q }}</button>
            }
          </div>
        }

        <form (ngSubmit)="send(draft)">
          <input
            name="msg"
            [(ngModel)]="draft"
            placeholder="Nhập câu hỏi..."
            maxlength="1000"
            autocomplete="off"
            [disabled]="busy()"
            aria-label="Câu hỏi"
          />
          <button type="submit" class="send" [disabled]="busy() || !draft.trim()" aria-label="Gửi">➤</button>
        </form>
      </section>
    }

    <div class="stack">
      @if (s().shopeeUrl && !open()) {
        <a class="bubble shopee" [href]="s().shopeeUrl" target="_blank" rel="noopener" title="Shopee" aria-label="Gian hàng Shopee">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 2.5a4.25 4.25 0 0 0-4.2 3.75H4.6a.9.9 0 0 0-.9.96l.95 13.1A1.9 1.9 0 0 0 6.55 22h10.9a1.9 1.9 0 0 0 1.9-1.69l.95-13.1a.9.9 0 0 0-.9-.96h-3.2A4.25 4.25 0 0 0 12 2.5Zm0 1.6a2.65 2.65 0 0 1 2.58 2.15H9.42A2.65 2.65 0 0 1 12 4.1Z"/>
            <path fill="#ee4d2d" d="M12.3 10.2c-1.6 0-2.7.85-2.7 2.05 0 1.3 1.15 1.75 2.35 2.1.95.28 1.45.5 1.45 1.02 0 .5-.55.83-1.35.83-.9 0-1.65-.4-2.2-.95l-.75 1c.65.7 1.7 1.15 2.9 1.15 1.75 0 2.9-.88 2.9-2.15 0-1.4-1.25-1.85-2.45-2.2-.9-.26-1.35-.47-1.35-.93 0-.43.45-.73 1.15-.73.7 0 1.3.3 1.8.72l.7-1c-.65-.55-1.5-.91-2.55-.91Z"/>
          </svg>
        </a>
      }
      @if (s().tiktokUrl && !open()) {
        <a class="bubble tiktok" [href]="s().tiktokUrl" target="_blank" rel="noopener" title="TikTok" aria-label="TikTok">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.6 2.6 0 0 1-2.6-2.6 2.6 2.6 0 0 1 3.4-2.47V9.67a5.7 5.7 0 0 0-.8-.06 5.69 5.69 0 0 0-5.69 5.69A5.69 5.69 0 0 0 9.86 21a5.69 5.69 0 0 0 5.69-5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.28 4.28 0 0 1-3.25-1.48Z"
            />
          </svg>
        </a>
      }
      @if (s().facebookUrl && !open()) {
        <a class="bubble facebook" [href]="s().facebookUrl" target="_blank" rel="noopener" title="Facebook" aria-label="Facebook">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M13.5 21v-7.5h2.53l.38-2.94H13.5V8.69c0-.85.24-1.43 1.46-1.43h1.56V4.63a20.9 20.9 0 0 0-2.27-.12c-2.25 0-3.79 1.37-3.79 3.9v2.15H7.92v2.94h2.54V21h3.04Z"
            />
          </svg>
        </a>
      }
      @if (s().chatEnabled) {
        <button type="button" class="bubble ai" [class.on]="open()" (click)="toggle()" [attr.aria-expanded]="open()" title="Hỏi trợ lý AI">
          @if (open()) { ✕ } @else {
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 3C6.48 3 2 6.92 2 11.75c0 2.47 1.18 4.7 3.08 6.29L4.5 21.5l3.86-1.93c1.13.36 2.36.55 3.64.55 5.52 0 10-3.92 10-8.75S17.52 3 12 3Zm-4 10a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 8 13Zm4 0a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 12 13Zm4 0a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 16 13Z"
              />
            </svg>
            <span class="tag">AI</span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    :host { position: fixed; right: 18px; bottom: 18px; z-index: 60; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
    .stack { display: flex; flex-direction: column; gap: 10px; align-items: center; }
    .bubble { position: relative; width: 52px; height: 52px; border-radius: 50%; border: none; display: grid; place-items: center;
      cursor: pointer; color: #fff; box-shadow: 0 8px 22px rgba(0,0,0,.18); transition: transform .2s; font-size: 1.1rem; font-weight: 800; }
    .bubble:hover { transform: translateY(-3px) scale(1.05); }
    .bubble svg { width: 26px; height: 26px; }
    .tiktok { background: #111; box-shadow: -2px -2px 0 #25f4ee inset, 2px 2px 0 #fe2c55 inset, 0 8px 22px rgba(0,0,0,.2); }
    .facebook { background: #1877f2; }
    .shopee { background: #ee4d2d; }
    .ai { width: 60px; height: 60px; background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 55%, #b26bff)); }
    .ai:not(.on) { animation: pulse 2.6s ease-in-out infinite; }
    .ai svg { width: 30px; height: 30px; }
    .tag { position: absolute; top: -4px; right: -4px; background: #fff; color: var(--primary-dark); font-size: .65rem; font-weight: 900;
      padding: 1px 6px; border-radius: 999px; box-shadow: 0 2px 6px rgba(0,0,0,.15); }
    @keyframes pulse { 0%, 100% { box-shadow: 0 8px 22px rgba(0,0,0,.18), 0 0 0 0 color-mix(in srgb, var(--primary) 45%, transparent); }
      50% { box-shadow: 0 8px 22px rgba(0,0,0,.18), 0 0 0 12px transparent; } }

    .chat { width: min(370px, calc(100vw - 36px)); height: min(540px, calc(100dvh - 110px)); display: flex; flex-direction: column;
      background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 18px; overflow: hidden;
      box-shadow: 0 20px 50px rgba(0,0,0,.22); animation: pop .25s ease-out; }
    @keyframes pop { from { opacity: 0; transform: translateY(12px) scale(.97); } }
    header { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 14px; background: var(--primary); color: var(--on-primary); }
    header div { flex: 1; display: flex; flex-direction: column; line-height: 1.2; }
    header small { opacity: .85; font-size: .75rem; }
    .avatar { font-size: 1.6rem; }
    .icon-btn { background: transparent; border: none; color: inherit; font-size: 1rem; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
    .icon-btn:hover { background: rgba(255,255,255,.2); }
    .log { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
    .msg { max-width: 85%; padding: 9px 13px; border-radius: 16px; font-size: .9rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    .msg.assistant { align-self: flex-start; background: var(--surface-2); border-bottom-left-radius: 4px; }
    .msg.user { align-self: flex-end; background: var(--primary); color: var(--on-primary); border-bottom-right-radius: 4px; }
    .typing { display: flex; gap: 4px; }
    .typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); animation: blink 1s infinite; }
    .typing i:nth-child(2) { animation-delay: .15s; } .typing i:nth-child(3) { animation-delay: .3s; }
    @keyframes blink { 50% { opacity: .25; } }
    .err { font-size: .82rem; color: var(--error, #b32d2e); text-align: center; }
    .quick { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 10px; }
    .quick button { font: inherit; font-size: .8rem; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--border);
      background: var(--surface); color: var(--primary-dark); cursor: pointer; }
    form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--border); }
    form input { flex: 1; min-width: 0; font: inherit; font-size: .9rem; padding: 9px 13px; border-radius: 999px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text); outline: none; }
    form input:focus { border-color: var(--primary); }
    .send { width: 40px; border-radius: 50%; border: none; background: var(--primary); color: var(--on-primary); cursor: pointer; font-size: 1rem; }
    .send:disabled { opacity: .4; cursor: default; }
    @media (prefers-reduced-motion: reduce) { .ai:not(.on), .chat { animation: none; } }
  `,
})
export class FloatBubblesComponent {
  readonly s = inject(SettingsService).settings;
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  readonly open = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly messages = signal<ChatMessage[]>(this.load());
  readonly quick = ['Shop có những sản phẩm gì?', 'Đặt hàng thế nào?', 'Phí ship bao nhiêu?'];
  draft = '';

  toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) this.scrollDown();
  }

  reset(): void {
    this.messages.set([]);
    this.error.set('');
    this.save();
  }

  async send(text: string): Promise<void> {
    const content = text.trim();
    if (!content || this.busy()) return;
    this.draft = '';
    this.error.set('');
    this.messages.update((list) => [...list, { role: 'user', content }]);
    this.busy.set(true);
    this.scrollDown();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: this.messages() }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) throw new Error(data.error || 'Trợ lý AI chưa sẵn sàng.');
      this.messages.update((list) => [...list, { role: 'assistant', content: data.reply! }]);
      this.save();
    } catch (e) {
      // Bỏ tin vừa gửi để khách có thể gửi lại.
      this.messages.update((list) => list.slice(0, -1));
      this.draft = content;
      const contact = this.s().contactPhone ? ` Bạn có thể gọi ${this.s().contactPhone}.` : '';
      this.error.set((e instanceof Error ? e.message : 'Không gửi được tin nhắn.') + contact);
    } finally {
      this.busy.set(false);
      this.scrollDown();
    }
  }

  private scrollDown(): void {
    requestAnimationFrame(() => {
      const log = this.host.querySelector('.log');
      if (log) log.scrollTop = log.scrollHeight;
    });
  }

  private load(): ChatMessage[] {
    try {
      const raw = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]');
      return Array.isArray(raw) ? raw.slice(-20) : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(this.messages().slice(-20)));
    } catch {
      /* bỏ qua */
    }
  }
}
