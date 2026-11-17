/**
 * Vercel Function: POST /api/chat — trợ lý AI của shop.
 * AI trả lời dựa trên file kiến thức (.md, admin tải lên ở Admin → Trợ lý AI; mặc định knowledge/kien-thuc.md)
 * và dữ liệu sản phẩm admin đồng bộ — chỉ trong phạm vi website.
 * Cần biến môi trường ANTHROPIC_API_KEY trên Vercel (Project → Settings → Environment Variables).
 */
import Anthropic from '@anthropic-ai/sdk';
import { catalogToPrompt, loadAiContext } from './_lib/ai';

const MODEL = 'claude-opus-5-5';
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
    const system = await buildSystem();
    const response = await client.beta.messages.create({
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
