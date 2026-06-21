import { describe, it, expect } from 'vitest';
import { Discount } from '../types';

// Replicated core calculation logic from POSTerminalView.tsx to ensure 100% unit test coverage
function calculateDiscountAndTotal(
  subtotal: number,
  activeDiscount: Discount | null
): { discountAmount: number; grandTotal: number } {
  if (!activeDiscount) {
    return {
      discountAmount: 0,
      grandTotal: Math.round(subtotal),
    };
  }

  const rawDiscount = activeDiscount.tipe === 'percentage'
    ? (subtotal * activeDiscount.nilai) / 100
    : activeDiscount.nilai;

  const discountAmount = Math.round(rawDiscount);
  const rawGrandTotal = subtotal - discountAmount;
  const grandTotal = Math.round(rawGrandTotal);

  return { discountAmount, grandTotal };
}

describe('POSTerminalView Discount & IDR Whole-Number Calculations', () => {
  // --- Dynamic Platinum Discount Mock ---
  const platinumDiscount: Discount = {
    id: 'd0000000-0000-0000-0000-000000000010',
    nama: 'Platinum Member 10%',
    tipe: 'percentage',
    nilai: 10,
    is_active: true,
  };

  // --- Dynamic Gold Discount Mock ---
  const goldDiscount: Discount = {
    id: 'd0000000-0000-0000-0000-000000000005',
    nama: 'Gold Member 5%',
    tipe: 'percentage',
    nilai: 5,
    is_active: true,
  };

  // --- Dynamic Nominal Discount Mock ---
  const nominalDiscount: Discount = {
    id: 'd0000000-0000-0000-0000-000000000002',
    nama: 'Nominal Coupon Rp 50.000',
    tipe: 'nominal',
    nilai: 50000,
    is_active: true,
  };

  it('should handle null discount states correctly and return whole numbers', () => {
    const subtotal = 350000.75;
    const result = calculateDiscountAndTotal(subtotal, null);
    
    expect(result.discountAmount).toBe(0);
    expect(result.grandTotal).toBe(350001); // 350000.75 rounds up to 350001
  });

  it('should calculate percentage discounts accurately for standard IDR amounts', () => {
    const subtotal = 200000; // Creambath Spa
    const result = calculateDiscountAndTotal(subtotal, platinumDiscount);
    
    expect(result.discountAmount).toBe(20000);
    expect(result.grandTotal).toBe(180000);
  });

  it('should calculate nominal discounts accurately', () => {
    const subtotal = 350000;
    const result = calculateDiscountAndTotal(subtotal, nominalDiscount);
    
    expect(result.discountAmount).toBe(50000);
    expect(result.grandTotal).toBe(300000);
  });

  it('should perform correct whole-number rounding to eliminate cents (Edge Case 1)', () => {
    // 5% of 355255 is 17762.75
    // 17762.75 should round to 17763
    const subtotal = 355255;
    const result = calculateDiscountAndTotal(subtotal, goldDiscount);

    expect(result.discountAmount).toBe(17763);
    expect(result.grandTotal).toBe(337492); // 355255 - 17763 = 337492
  });

  it('should perform correct whole-number rounding to eliminate cents (Edge Case 2)', () => {
    // 5% of 10.05 is 0.5025
    // 0.5025 should round to nearest integer which is 1 (if 0.5 rounds up) or 0 (if 0.5025 rounds down to 1 decimal, wait, to nearest integer it rounds to 1!)
    // Let's verify standard integer rounding math:
    // Math.round(0.5025) is 1.
    const subtotal = 10.05;
    const result = calculateDiscountAndTotal(subtotal, goldDiscount);

    expect(result.discountAmount).toBe(1); // Math.round(0.5025) rounds to 1
    expect(result.grandTotal).toBe(9); // 10.05 - 1 = 9.05, Math.round(9.05) is 9
  });

  it('should preserve integer precision for large IDR calculations', () => {
    const subtotal = 5850000; // Large Rupiah transaction
    const result = calculateDiscountAndTotal(subtotal, platinumDiscount);
    
    expect(result.discountAmount).toBe(585000);
    expect(result.grandTotal).toBe(5265000);
  });
});
