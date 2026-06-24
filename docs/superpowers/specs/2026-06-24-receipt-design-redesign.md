# Design Spec: Receipt Redesign for Fenina Salon & Reflexology

This document specifies the design details for the updated print and screen receipt preview (58mm thermal simulation) in AuraDesk POS, based on the provided reference image (`data/struk.jpeg`).

## Objective
Enhance the visual quality of the receipt modal in AuraDesk POS to mimic a premium, structured thermal receipt from Fenina Salon & Reflexology. The receipt preview on-screen should look high-end, clean, and professional, using a pure black-and-white palette.

---

## Design Specifications

### 1. Color Palette & Typography
*   **Palette**: Pure Monochromatic (Black, White, and Zinc-based greys for subtle separators/zebra stripes).
*   **Typography (Screen Preview)**: 
    *   Headers: Clean serif typeface (e.g., `font-serif` or `Georgia`/`Playfair Display` equivalents) for "FENINA", "SALON & REFLEXOLOGY", "NOTA KASIR", and "Terima Kasih".
    *   Body text & metadata: Standard monospace font (`font-mono` / `Courier New`) to simulate thermal printer typography.
*   **Typography (Print)**: Enforced `Courier New` monospace font for all elements, ensuring proper tabular alignment.

### 2. Branding (Header Section)
*   **Diamond Logo SVG**: 
    *   A thin-line diamond (rotated square) container.
    *   Inside the diamond: Centered text `"FENINA"` and `"SALON & REFLEXOLOGY"`.
    *   Small leaf/flower or diamond elements at the top and bottom tips of the diamond.
*   **Business Details**:
    *   Uppercase bold name: `"FENINA SALON & REFLEXOLOGY"`.
    *   Decorative rule: Horizontal thin border with a small flower or leaf symbol in the center.
    *   Contact information with inline Lucide icons:
        *   Phone: `+62 812 8114 7726`
        *   Instagram: `@FENINASALONANDREFLEXY`
        *   Address: `Jalan Hollywood Boulevard Ruko, Jl. Rodeo Drive No.27 Blok B6, Mekarmukti, Kec. Cikarang Utara, Kabupaten Bekasi, Jawa Barat 17530`
*   **Title**: `"NOTA KASIR"` in centered, tracking-widest uppercase serif text.

### 3. Metadata Section
Formatted in a table-like label/value structure:
*   `No. Nota : [value]`
*   `Tanggal  : [value]`
*   `Jam      : [value]`
*   `Kasir    : [operator]`
This metadata is enclosed within two clean, thin horizontal rules.

### 4. Items Table
*   **Columns**: `LAYANAN`, `QTY`, `HARGA`, `SUBTOTAL`.
*   **Dividers**: Columns are separated by dotted vertical borders (`border-r border-dotted`).
*   **Item rows**:
    *   Each row starts with a `Sparkles` icon on the left of the item name.
    *   Alternating rows have a very subtle grey background (`bg-zinc-50`) for readability on screen.
*   A solid line bounds the header and footer of the table.

### 5. Totals & Payment Section
*   **Total Row**: Large, bold label `"TOTAL"` with the grand total value in a larger font.
*   **Payment Details**:
    *   Cash icon + `"Tunai (Cash)"` with the paid amount.
    *   Change icon + `"Kembalian (Change)"` with the change amount.

### 6. Footer Section
*   Stylized italic serif texts: `"Terima Kasih"` and `"Atas Kunjungan Anda!"`.
*   A small heart icon (`❤`).
*   Additional subtexts:
    *   `Follow Instagram Kami: @feninasalonandreflexy`
    *   `Layanan Pelanggan: 0812-3456-7890`
*   A closing flower/lotus icon at the very bottom.

---

## Technical Implementation in `ReceiptModal.tsx`
*   Replace current `#thermal-receipt-area` content with the new structured HTML.
*   Ensure that the thermal print class bindings (`no-print`, `id="thermal-receipt-area"`) are fully preserved so that physical printing remains functional.
*   Import necessary icons from `lucide-react` (e.g., `Phone`, `Instagram`, `MapPin`, `Sparkles`, `Coins`, `Heart`, `DollarSign`).
