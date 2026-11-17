/**
 * Vercel Function: POST /api/chat — trợ lý AI của shop.
 * AI chỉ trả lời dựa trên file knowledge/kien-thuc.md ("file học trước").
 * Cần biến môi trường ANTHROPIC_API_KEY trên Vercel (Project → Settings → Environment Variables).
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 12; // chỉ gửi 12 tin gần nhất
const MAX_CHARS = 1000; // mỗi tin của khách tối đa 1000 ký tự

const knowledge = readFileSync(join(process.cwd(), 'knowledge', 'kien-thuc.md'), 'utf8')
  // Bỏ phần ghi chú HTML dành cho chủ shop.
  .replace(/<!--[\s\S]*?-->/g, '')
  .trim();

const SYSTEM = `Bạn là trợ lý tư vấn của shop thú bông, trò chuyện với khách trên website của shop.

Quy tắc:
- Luôn trả lời bằng tiếng Việt, giọng thân thiện, dễ thương nhưng ngắn gọn (thường 1–4 câu, dùng gạch đầu dòng khi liệt kê).
- Chỉ dùng thông tin trong phần KIẾN THỨC bên dưới. Nếu không có thông tin, nói thật là bạn chưa rõ và mời khách liên hệ shop qua điện thoại/Zalo hoặc trang /lien-he — không tự bịa giá, chính sách hay tình trạng hàng.
- Thông tin có ghi [CẦN ĐIỀN] là thông tin tham khảo; vẫn có thể dùng nhưng nhắc khách xác nhận lại với shop.
- Khi nhắc tới trang trên website, ghi đường dẫn dạng /san-pham, /tin-tuc, /lien-he.
- Không nhận đặt hàng hay thanh toán trong khung chat; hướng dẫn khách cách đặt hàng theo phần KIẾN THỨC.
- Từ chối nhẹ nhàng những yêu cầu không liên quan tới shop.

<kien_thuc>
${knowledge}
</kien_thuc>`;

const client = new Anthropic();

type ChatTurn = { role: 'user' | 'assistant'; content: string };

function cleanHistory(input: unknown): Anthropic.Beta.BetaMessageParam[] | null {
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
  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Dữ liệu không hợp lệ.' }, 400);
  }
  const messages = cleanHistory(body.messages);
  if (!messages) return json({ error: 'Tin nhắn không hợp lệ.' }, 400);

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      // Chat tư vấn ngắn: effort thấp cho nhanh và rẻ.
      output_config: { effort: 'low' },
      // Nếu model từ chối vì bộ lọc an toàn, server tự chạy lại bằng model dự phòng.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // File kiến thức nằm trong system → được cache, các lượt sau rẻ hơn.
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
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
