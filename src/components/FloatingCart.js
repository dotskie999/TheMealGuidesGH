'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { marketMoney } from '@/lib/markets';

export default function FloatingCart() {
  const { items, subtotal, ready } = useCart();
  const pathname = usePathname();
  if (!ready || !items.length || pathname === '/cart' || pathname.startsWith('/receipt/')) return null;
  return (
    <div className="floating-cart-shell">
      <Link href="/cart" className="floating-cart" aria-label={`View cart with ${items.length} items`}>
        <span className="cart-count"><ShoppingBag size={20} strokeWidth={2.5} />{items.length}</span>
        <span>View cart</span><strong>{marketMoney(subtotal)}</strong>
      </Link>
    </div>
  );
}
