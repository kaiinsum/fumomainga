export type OrderStatus = 'pending' | 'paid' | 'shipping' | 'done' | 'cancelled';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Chờ thanh toán / duyệt',
  paid: 'Đã xác nhận thanh toán',
  shipping: 'Đang giao hàng',
  done: 'Hoàn thành',
  cancelled: 'Đã huỷ',
};

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

export interface Customer {
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  /** Vị trí ước tính theo IP lúc đặt (máy chủ tự thêm). */
  geo?: { ip: string; country: string; region: string; city: string; lat: number | null; lon: number | null };
}

/** Đơn đầy đủ (admin xem). */
export interface Order {
  code: string;
  status: OrderStatus;
  customer: Customer;
  items: OrderItem[];
  total: number;
  createdAt: number;
  updatedAt: number;
  paidClaimAt?: number;
  adminNote: string;
}

/** Đơn khách xem khi tra cứu (đã ẩn bớt thông tin). */
export interface PublicOrder {
  code: string;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  paidClaimAt: number | null;
  items: OrderItem[];
  total: number;
  customer: { name: string; phone: string };
}

export const EMPTY_CUSTOMER: Customer = { name: '', phone: '', email: '', address: '', note: '' };

// ---------- Đánh giá sản phẩm đã mua + voucher ----------
export interface VoucherInfo {
  voucher: string;
  offer: string;
  expiresAt: number | null;
  used: boolean;
}

export interface ReviewBrief {
  rating: number;
  text: string;
  createdAt: number;
}

/** Kèm theo khi tra cứu đơn: từng sản phẩm trong đơn đã đánh giá chưa + voucher của đơn. */
export interface FeedbackInfo {
  enabled: boolean;
  offer: string;
  paid: boolean;
  products: { id: string; name: string; review: ReviewBrief | null }[];
  voucher: VoucherInfo | null;
}

/** Đánh giá công khai ở trang sản phẩm. */
export interface PublicReview extends ReviewBrief {
  name: string;
  variant: string;
}

export interface FeedbackConfig {
  enabled: boolean;
  offer: string;
  prefix: string;
  validDays: number;
}

export interface AdminReview extends ReviewBrief {
  key: string;
  code: string;
  productId: string;
  productName: string;
  name: string;
  hidden: boolean;
}

export interface AdminVoucher extends VoucherInfo {
  code: string;
  createdAt: number;
}
