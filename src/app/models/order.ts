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
