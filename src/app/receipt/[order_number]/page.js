'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChefHat, Download, ReceiptText } from 'lucide-react';
import Image from 'next/image';
import { useCart } from '@/context/CartContext';
import FacebookLink from '@/components/FacebookLink';
import { marketMoney, normalizeMarketCode } from '@/lib/markets';

function downloadReceipt(order, number) {
  const money=(value)=>marketMoney(value,normalizeMarketCode(order?.market_code));
  const width = 1080;
  const itemCount = Math.max(order?.items?.length || 0, 1);
  const height = 900 + itemCount * 105;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff8e8'; context.fillRect(0, 0, width, height);
  context.fillStyle = '#ffa600'; context.fillRect(0, 0, width, 220);
  context.fillStyle = '#6d351d'; context.textAlign = 'center';
  context.font = 'bold 54px Arial'; context.fillText('THE MEAL GUIDES', width / 2, 92);
  context.font = 'bold 30px Arial'; context.fillText('Your flavor journey is confirmed!', width / 2, 148);
  context.font = '24px Arial'; context.fillText('Keep this receipt handy for the cashier.', width / 2, 190);
  context.fillStyle = '#ffffff'; context.fillRect(70, 260, width - 140, 175);
  context.fillStyle = '#75665d'; context.font = 'bold 22px Arial'; context.fillText('ORDER NUMBER', width / 2, 310);
  context.fillStyle = '#8b4513'; context.font = 'bold 82px Arial'; context.fillText(`#${number}`, width / 2, 395);
  context.textAlign = 'left'; context.fillStyle = '#8b4513'; context.font = 'bold 30px Arial';
  context.fillText('Order summary', 80, 500);
  let y = 555;
  for (const item of order?.items || []) {
    context.fillStyle = '#31251f'; context.font = 'bold 25px Arial';
    context.fillText(`${item.quantity}×  ${item.name}`, 90, y);
    context.textAlign = 'right'; context.fillText(money(item.total_price), width - 90, y);
    context.textAlign = 'left';
    if (item.selected_options?.length) {
      context.fillStyle = '#75665d'; context.font = '20px Arial';
      context.fillText(item.selected_options.map((option) => option.option_name).join(', ').slice(0, 75), 140, y + 34);
    }
    y += 105;
  }
  context.strokeStyle = '#eadfce'; context.lineWidth = 3; context.beginPath(); context.moveTo(80, y - 35); context.lineTo(width - 80, y - 35); context.stroke();
  const deliveryLabel = order?.fulfillment_type === 'pickup' ? 'Fulfillment' : 'Delivery';
  const total = order?.order_total ?? order?.subtotal;
  context.fillStyle = '#31251f'; context.font = '24px Arial'; context.fillText('Subtotal', 90, y + 20);
  context.textAlign = 'right'; context.fillText(money(order?.subtotal), width - 90, y + 20);
  context.textAlign = 'left'; context.fillText(deliveryLabel, 90, y + 62);
  context.textAlign = 'right'; context.fillText(order?.fulfillment_type === 'pickup' ? 'Store pickup' : 'Paid to your rider', width - 90, y + 62);
  context.textAlign = 'left'; context.fillStyle = '#8b4513'; context.font = 'bold 34px Arial'; context.fillText('TOTAL', 90, y + 118);
  context.textAlign = 'right'; context.fillText(money(total), width - 90, y + 118);
  context.textAlign = 'center'; context.fillStyle = '#6d351d'; context.font = '22px Arial';
  context.fillText('Thank you for ordering with The Meal Guides.', width / 2, height - 75);
  const link = document.createElement('a');
  link.download = `the-meal-guides-order-${number}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
export default function ReceiptPage({ params }) {
  const { getSavedOrder } = useCart();
  const [order, setOrder] = useState(null);
  const number = decodeURIComponent(params.order_number);
  const money=(value)=>marketMoney(value,normalizeMarketCode(order?.market_code));
  useEffect(() => {
    const saved = getSavedOrder();
    setOrder(String(saved?.order_number) === number ? saved : null);
  }, [getSavedOrder, number]);
  return <main className="receipt-page"><section className="receipt-card"><Image className="receipt-logo" src="/the-meal-guides-logo.png" alt="The Meal Guides" width={110} height={73} /><div className="success-mark"><Check size={40} /></div><p className="kicker">Order received</p><h1>You&apos;re all set!</h1><p className="receipt-intro">We&apos;ve sent your order to the kitchen. Keep this screen handy.</p><div className="order-ticket"><span>Order number</span><strong>{number}</strong><div className="status-pill"><i /> Pending payment</div></div>
    {order && <div className="receipt-items"><div className="receipt-title"><ReceiptText /><h2>Order summary</h2></div>{order.items?.map((item) => <div className="receipt-item" key={item.cart_id}><span>{item.quantity}×</span><div><strong>{item.name}</strong>{item.selected_options?.length > 0 && <small>{item.selected_options.map((option) => option.option_name).join(', ')}</small>}</div><b>{money(item.total_price)}</b></div>)}<div className="receipt-breakdown"><div><span>Subtotal</span><strong>{money(order.subtotal)}</strong></div><div><span>Delivery</span><strong>{order.fulfillment_type==='pickup'?'Store pickup':'Paid directly to your rider'}</strong></div><div className="receipt-total"><span>Order total</span><strong>{money(order.order_total ?? order.subtotal)}</strong></div></div></div>}
    <div className="cashier-note"><ChefHat /><div><strong>Next stop</strong><p>An admin will contact you on WhatsApp in a few seconds.</p></div></div><div className="receipt-actions"><button className="primary-button" onClick={() => downloadReceipt(order, number)} disabled={!order}><Download size={19} /> Download receipt as PNG</button><FacebookLink /></div><Link href="/" className="secondary-button">Order something else</Link></section><p className="tiny-footer">Thank you for ordering with The Meal Guides.</p></main>;
}
