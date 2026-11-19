/**
 * Vercel Function: POST /api/chat — trợ lý AI của shop.
 * AI trả lời dựa trên file kiến thức (.md, admin tải lên ở Admin → Trợ lý AI; mặc định knowledge/kien-thuc.md)
 * và dữ liệu sản phẩm admin đồng bộ — chỉ trong phạm vi website.
 * Cần MỘT trong hai biến môi trường trên Vercel (Project → Settings → Environment Variables):
 *  - GEMINI_API_KEY    → dùng Google Gemini (có gói miễn phí, lấy khoá ở aistudio.google.com)
 *  - ANTHROPIC_API_KEY → dùng Claude (trả phí, console.anthropic.com)
 * Có cả hai thì ưu tiên Gemini.
 */
import Anthropic from '@anthropic-ai/sdk';
import { ApiError as GeminiApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { catalogToPrompt, loadAiContext } from '../_lib/ai';
import { HttpError, rateLimit } from '../_lib/orders';

const MODEL = 'claude-opus-5-5';
/** Gemini (gói miễn phí của Google AI Studio). Đổi model bằng biến GEMINI_MODEL nếu cần. */
const GEMINI_MODEL = process.env['GEMINI_MODEL'] || 'gemini-3.8-flash';
const MAX_TURNS = 12; // chỉ gửi 12 tin gần nhất
const MAX_CHARS = 1000; // mỗi tin của khách tối đa 1000 ký tự

/** Quy tắc cố định — đặt đầu system prompt. */
const RULES = `Bạn là trợ lý tư vấn của shop thú bông, trò chuyện với khách ngay trên website của shop.

Phạm vi trả lời:
- CHỈ trả lời về shop và website này: sản phẩm đang bán, giá, còn hàng/hết hàng, so sánh sản phẩm (rẻ nhất, mắc nhất, theo danh mục...), cách đặt hàng, thanh toán, giao hàng, đổi trả, liên hệ, tin tức của shop.
- Chỉ dùng thông tin trong <kien_thuc> và <du_lieu_website> bên dưới. Không dùng hiểu biết bên ngoài về sản phẩm, giá thị trường hay shop khác.
- Câu hỏi về số liệu (bao nhiêu sản phẩm, còn hàng không, rẻ nhất / mắc nhất...) thì lấy đúng từ phần "Số liệu tính sẵn" và bảng sản phẩm; không tự ước lượng. Website chỉ biết còn hàng/hết hàng, không có số lượng tồn kho từng cái — nếu khách hỏi số lượng cụ thể, nói rõ điều đó và mời nhắn shop.
- Khi <du_lieu_website> và <kien_thuc> khác nhau về giá hoặc tình trạng hàng, ưu tiên <du_lieu_website> (mới hơn).
- Không có thông tin thì nói thật là chưa rõ và mời khách liên hệ shop (trang /lien-he) — không bịa giá, chính sách hay tình trạng hàng.
- Câu hỏi không liên quan tới shop (bài tập, lập trình, tin tức thế giới, chuyện riêng...) thì từ chối nhẹ nhàng trong một câu và gợi ý khách hỏi về sản phẩm của shop.

Cách trả lời:
- Luôn bằng tiếng Việt, thân thiện, dễ thương nhưng ngắn gọn (thường 1–4 câu; dùng gạch đầu dòng khi liệt kê).
- Nhắc tới sản phẩm hoặc trang thì kèm đường dẫn dạng /san-pham/..., /gio-hang, /tra-cuu-don-hang, /lien-he.
- Không nhận đặt hàng hay thanh toán trong khung chat; hướng dẫn khách đặt qua giỏ hàng trên website.
- Thông tin có ghi [CẦN ĐIỀN] là thông tin tham khảo; vẫn dùng được nhưng nhắc khách xác nhận lại với shop.`;

async function buildSystem(): Promise<string> {
  const { knowledge, catalog } = await loadAiContext();
  return `${RULES}

<kien_thuc>
${knowledge || '(chưa có)'}
</kien_thuc>

<du_lieu_website>
${catalog ? catalogToPrompt(catalog) : 'Chưa đồng bộ dữ liệu sản phẩm — chỉ dùng thông tin trong <kien_thuc>.'}
</du_lieu_website>`;
}

/** Tạo client khi cần (thiếu khoá thì không lỗi ngay lúc khởi động hàm). */
let anthropic: Anthropic | null = null;
let gemini: GoogleGenAI | null = null;

type ChatTurn = { role: 'user' | 'assistant'; content: string };

function cleanHistory(input: unknown): ChatTurn[] | null {
  if (!Array.isArray(input)) return null;
  const turns = input
    .filter(
      (m): m is ChatTurn =>
        !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && !!m.content.trim(),
    )
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, m.role === 'user' ? MAX_CHARS : 4000) }));
  // Hội thoại phải bắt đầu bằng tin của khách và kết thúc bằng tin của khách.
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') return null;
  return turns;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export async function POST(request: Request): Promise<Response> {
  // Mỗi IP tối đa 60 câu hỏi / giờ (đếm chung mọi máy chủ) — chống spam làm cạn quota AI.
  try {
    await rateLimit(request, 'chat', 60, 3600);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: 'Bạn hỏi hơi nhiều rồi, nghỉ một chút rồi hỏi tiếp nhé!' }, 429);
    // Database lỗi → vẫn cho chat (đã có giới hạn trong bộ nhớ ở cổng API).
  }
  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Dữ liệu không hợp lệ.' }, 400);
  }
  const messages = cleanHistory(body.messages);
  if (!messages) return json({ error: 'Tin nhắn không hợp lệ.' }, 400);

  const geminiKey = process.env['GEMINI_API_KEY'];
  if (!geminiKey && !process.env['ANTHROPIC_API_KEY']) {
    console.error('Chưa có GEMINI_API_KEY hoặc ANTHROPIC_API_KEY trên Vercel.');
    return json({ error: 'Trợ lý AI chưa được cấu hình.' }, 503);
  }
  const system = await buildSystem();
  // Có GEMINI_API_KEY → dùng Gemini (miễn phí); không có → dùng Claude.
  return geminiKey ? askGemini(geminiKey, system, messages) : askClaude(system, messages);
}

/** Hỏi Gemini. Lịch sử chat: vai "assistant" của web = vai "model" của Gemini. */
async function askGemini(apiKey: string, system: string, messages: ChatTurn[]): Promise<Response> {
  gemini ??= new GoogleGenAI({ apiKey });
  try {
    const res = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      config: {
        systemInstruction: system,
        maxOutputTokens: 2048,
        temperature: 0.5,
        // Bản Flash: bớt "suy nghĩ" cho nhanh và tiết kiệm hạn mức miễn phí.
        // Gemini 2.5 tắt hẳn bằng thinkingBudget 0; Gemini 3 trở lên dùng mức suy nghĩ thấp.
        ...(GEMINI_MODEL.includes('flash')
          ? { thinkingConfig: GEMINI_MODEL.includes('2.5') ? { thinkingBudget: 0 } : { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
      },
    });
    const reply = (res.text ?? '').trim();
    if (!reply) {
      // Bị bộ lọc an toàn chặn hoặc không có nội dung.
      return json({ reply: 'Xin lỗi, mình không trả lời được câu này. Bạn liên hệ shop qua trang /lien-he nhé!' });
    }
    return json({ reply });
  } catch (error) {
    if (error instanceof GeminiApiError) {
      console.error(`Gemini API error ${error.status}:`, error.message);
      if (error.status === 429) return json({ error: 'Trợ lý đang bận (hết lượt miễn phí tạm thời), bạn thử lại sau ít phút nhé.' }, 429);
      if (error.status === 400 && /api key/i.test(error.message)) return json({ error: 'Trợ lý AI chưa được cấu hình.' }, 503);
      if (error.status === 401 || error.status === 403) return json({ error: 'Trợ lý AI chưa được cấu hình.' }, 503);
      return json({ error: 'Trợ lý tạm thời gặp lỗi, bạn thử lại sau nhé.' }, 502);
    }
    console.error(error);
    return json({ error: 'Trợ lý tạm thời gặp lỗi, bạn thử lại sau nhé.' }, 500);
  }
}

async function askClaude(system: string, messages: ChatTurn[]): Promise<Response> {
  anthropic ??= new Anthropic();
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      // Chat tư vấn ngắn: effort thấp cho nhanh và rẻ.
      output_config: { effort: 'low' },
      // Nếu model từ chối vì bộ lọc an toàn, server tự chạy lại bằng model dự phòng.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Kiến thức + dữ liệu website nằm trong system → được cache, các lượt sau rẻ hơn.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
    });

    if (response.stop_reason === 'refusal') {
      return json({ reply: 'Xin lỗi, mình không trả lời được câu này. Bạn liên hệ shop qua trang /lien-he nhé!' });
    }
    const reply = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return json({ reply: reply || 'Xin lỗi, mình chưa có câu trả lời. Bạn thử hỏi lại nhé!' });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: 'Trợ lý đang bận, bạn thử lại sau ít phút nhé.' }, 429);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('ANTHROPIC_API_KEY chưa đúng hoặc chưa cài trên Vercel.');
      return json({ error: 'Trợ lý AI chưa được cấu hình.' }, 503);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${error.status}:`, error.message);
      return json({ error: 'Trợ lý tạm thời gặp lỗi, bạn thử lại sau nhé.' }, 502);
    }
    console.error(error);
    return json({ error: 'Trợ lý tạm thời gặp lỗi, bạn thử lại sau nhé.' }, 500);
  }
}
