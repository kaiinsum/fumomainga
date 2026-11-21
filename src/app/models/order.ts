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

// ---------- Đánh giá nhận voucher ----------
export interface FeedbackDone {
  rating: number;
  text: string;
  voucher: string;
  offer: string;
  expiresAt: number | null;
  used: boolean;
}

/** Kèm theo khi tra cứu đơn: đơn đã thanh toán + chưa đánh giá → allowed. */
export interface FeedbackInfo {
  enabled: boolean;
  offer: string;
  allowed: boolean;
  done: FeedbackDone | null;
}

export interface FeedbackConfig {
  enabled: boolean;
  offer: string;
  prefix: string;
  validDays: number;
}

export interface FeedbackItem extends FeedbackDone {
  code: string;
  name: string;
  createdAt: number;
}
