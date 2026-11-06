# Auditoría Integral de Nova Negocio (`v2.10.2` → `v2.10.3`) · Código, UX, Módulos y Textos

> [!IMPORTANT]
> **Estado de ejecución (`v2.10.3` · `versionCode 65` · runtime `2.2.4`)**: **100% IMPLEMENTADO, AUDITADO Y VERIFICADO** (`npx tsc --noEmit -p . --noUnusedLocals` sin errores y las 19 suites de `npm run test:all` aprobadas al 100%).

---

## Resumen de Ejecución en `v2.10.3`

| Bloque | Cambio ejecutado | Archivos modificados | Estado |
| :--- | :--- | :--- | :---: |
| **Motor y SQLite** | Carga perezosa (`lazy getters`) en `load(b)` para `lots`, `lines`, `payByAccount` y `m` (solo consultan SQLite cuando la pantalla activa los lee). | `App.tsx` | ✅ |
| **Motor y SQLite** | Eliminada la doble lectura `N+1` de `this.setting("line:" + line.id)` en `saleDetail()`. | `src/business.ts` | ✅ |
| **Motor y SQLite** | Mapas $O(1)$ (`basketQtyMap` en dueño y `cartQtyMap` en vendedor) para consultar piezas en el carrito sin hacer `.find()` por tarjeta. | `App.tsx`, `src/seller.tsx`, `src/screens/ownerContext.ts`, `src/screens/InventoryPages.tsx` | ✅ |
| **Motor y SQLite** | Reutilización de `products` en memoria durante el guardado de `Producto` y `Entrada` en lugar de invocar `b.stock()` dos veces adicionales. | `App.tsx` | ✅ |
| **Limpieza de código** | Eliminados estilos muertos `s.fab`, `s.fabText`, `s.tileAdd` y `s.tileAddText`; eliminada mutación `list.splice(...)` en `Ventas`. | `src/ui.tsx`, `src/screens/SalesPages.tsx` | ✅ |
| **Módulo `Vender` + `Clientes`** | Indicador superior de cliente activo (`Cliente: <Nombre>` con botón `Quitar`) en `Vender` cuando se inicia venta desde `Clientes`. | `src/screens/InventoryPages.tsx`, `App.tsx`, `src/screens/ownerContext.ts` | ✅ |
| **Módulo `Vender`** | Ícono `i` (`s.tileInfo`) resaltado con color de marca (`C.brandSoft` / `C.brand`) cuando el producto cuenta con descripción en su ficha. | `src/ui.tsx` | ✅ |
| **Módulo `Ventas` + `Reportes`** | Integración de `ReportsPage` (`Por producto` ordenable por `$`, piezas o ganancia, `Por vendedor`, `Promociones` y `Compartir reporte`) directamente dentro de `Ventas → Resumen de ventas` sincronizado con el periodo elegido. | `src/screens/SalesPages.tsx`, `src/screens/Reports.tsx` | ✅ |
| **Módulo `Stock` y `Lotes`** | Redirección automática de la página duplicada `"Catálogo"` hacia `"Stock"`; chips de filtro en `Lotes` (`Con existencias`, `Próximos 60 días`, `Agotados`, `Todos`) mostrando por omisión los lotes activos. | `App.tsx`, `src/screens/InventoryPages.tsx` | ✅ |
| **Módulo `Clientes`** | Tarjetas de clientes completamente táctiles (`onPress` en toda la tarjeta para abrir la ficha del cliente). | `src/screens/CustomersPages.tsx` | ✅ |
| **Módulo `Cobros`** | Reemplazo de la tabla horizontal rígida de 7 columnas (`930 px`) por filas móviles responsivas de ancho completo en `s.list` + búsqueda sin acentos (`normalize`). | `src/screens/Payments.tsx` | ✅ |
| **App del Vendedor** | Búsqueda sin distinción de acentos (`normalize`) en `Stock` del vendedor y limpieza de notas redundantes en el cobro. | `src/seller.tsx` | ✅ |
| **Microcopia y Textos** | Textos concisos y eliminación de notas repetitivas en formulario de `Producto`, `Corte de caja`, `Ajustes` y carrito del vendedor. | `App.tsx`, `src/screens/SalesPages.tsx`, `src/screens/Parameters.tsx`, `src/seller.tsx` | ✅ |

---

## 1. Autocrítica: Auditoría de decisiones previas (`2.9.0` → `2.10.2`)

1. **Parches sobre parches en el carrito (`2.10.0` → `2.10.2`)**:
   - En `2.10.0` se agregó `CartButton` arriba a la derecha con animación de vuelo (`CartFlyLayer`), pero se dejó intacta la barra negra inferior `s.cartBar`.
   - En `2.10.1` se suprimió solo el `notify("Venta registrada...")` al terminar de cobrar, dejando viva la barra negra inferior.
   - En `2.10.2` se convirtieron `s.cartBar`, `s.toast` y `UpdateNotice` en píldoras flotantes compactas y se limitó `s.cartBar` a `Vender` y `Stock`.
2. **Toque directo en las tarjetas de producto (`2.9.0` → `2.10.3`)**:
   - En `2.10.2` se eliminó el botón fijo inferior `＋ Agregar` (`s.tileAdd`) para que tocar la tarjeta agregue directo al carrito y el botón `i` (`s.tileInfo`) abra la ficha.
   - En `2.10.3` se eliminaron los estilos muertos (`s.tileAdd`, `s.tileAddText`, `s.fab`, `s.fabText`), se resaltó el botón `i` cuando el producto tiene descripción y se cambiaron las consultas de cantidad en carrito a mapas $O(1)$ (`basketQtyMap` y `cartQtyMap`).

---

## 2. Auditoría de Código, Base de Datos y Rendimiento

### 2.1. `load(b)` (`App.tsx`) con evaluación perezosa (`lazy getters`)
Antes de `2.10.3`, cada llamada a `refresh()` ejecutaba de golpe 8 consultas pesadas en SQLite (`b.stock()`, `b.sales()`, `b.customers()`, `b.accounts()`, `b.lots()`, `b.saleLinesBySale()`, `b.salePaymentsByAccount()` y `b.metrics()`).
- **Solución implementada en `2.10.3`**: `lots`, `lines` (`saleLinesBySale`), `payByAccount` (`salePaymentsByAccount`) y `m` (`metrics`) ahora son **getters perezosos con caché** dentro del objeto devuelto por `load(b)`. Mientras el usuario opera en `Vender`, `Clientes`, `Stock` o `Ajustes`, esas 4 consultas SQLite no se ejecutan hasta que una pantalla las solicita explícitamente.

### 2.2. Lectura duplicada en `saleDetail()` (`src/business.ts`)
- **Solución implementada en `2.10.3`**: Se eliminó el ciclo duplicado `for (const line of lines) Object.assign(line, this.setting("line:" + line.id, {}));` al final de `saleDetail()`, ya que los metadatos de cada renglón se leen y propagan al construir `lines`.

### 2.3. Consultas redundantes a `b.stock()` al guardar (`App.tsx`)
- **Solución implementada en `2.10.3`**: En `save()` (`case "Producto"` y `case "Entrada"`), se reutiliza el arreglo `products` ya cargado en memoria en lugar de invocar `b.stock()` dos veces adicionales antes de guardar.

---

## 3. Auditoría de UX y Módulos de Uso

### 3.1. Módulo `Vender` y Carrito
- **Cliente activo visible en `Vender`**: Cuando el dueño toca `Vender` en la tarjeta de un cliente en `Clientes` con el carrito vacío, la app navega a `Vender` y muestra en la parte superior la barra `Cliente: <Nombre>` con opción `Quitar`, dando retroalimentación inmediata de que la venta está asignada a ese cliente.

### 3.2. Módulo `Ventas`, `Resumen de ventas` y `Reportes`
- **Analítica unificada en `Resumen de ventas`**: `Ventas → Resumen` ahora integra directamente `<ReportsPage embedded />` sincronizado con el periodo seleccionado (`Hoy`, `7 días`, `Mes`, `Todo`), mostrando el ranking completo `Por producto` (ordenable por `Más vendidos ($)`, `Más piezas` y `Más ganancia`), `Por vendedor`, `Promociones` y el botón `Compartir reporte`, sin necesidad de ir a `Ajustes → Reportes`.

### 3.3. Módulo `Stock` y `Lotes`
- **Redirección de `"Catálogo"` a `"Stock"`**: `go("Catálogo")` y la restauración de sesión redirigen automáticamente a `"Stock"`, eliminando estados duplicados.
- **Filtros en `Lotes`**: La pantalla `Lotes` ahora incluye chips de filtro (`Con existencias`, `Próximos 60 días`, `Agotados`, `Todos`), mostrando por defecto únicamente los lotes con existencias disponibles (`qty > 0`).

### 3.4. Módulo `Clientes` (CRM)
- **Tarjetas táctiles**: Tocar cualquier parte de la tarjeta de un cliente abre de inmediato su formulario de edición/seguimiento (`open("Cliente", strings(c))`), además de conservar sus botones de acción rápida (`Whatsapp`, `Vender`, `Catálogo`, `Editar`).

### 3.5. Módulo `Cobros` (`src/screens/Payments.tsx`)
- **Tarjetas móviles sin scroll horizontal**: Se eliminó el `ScrollView horizontal` de `930 px` de ancho con 7 columnas fijas y se reemplazó por filas responsivas nativas dentro de `s.list` (`Folio · Cliente`, `Fecha · Forma de pago · Cuenta · Tipo`, e importe a la derecha con color semántico), además de búsqueda insensible a acentos con `normalize`.

---

## 4. Auditoría de Textos y Microcopia Aplicada

| Ubicación | Antes (`v2.10.2`) | Ahora (`v2.10.3`) |
| :--- | :--- | :--- |
| `App.tsx` (Precio en Producto) | `Tu precio: lo que recibes completo. El cliente paga $520.12 (absorbe la comisión 4.06%).` | **`Recibes este monto completo. Cliente paga $520.12 (4.06%).`** |
| `App.tsx` (Existencias en Producto) | `Existencias 10 → 12. Se corrige sin mover dinero ni contar como merma. Para registrar merma usa Conteo.` | **`Existencias 10 → 12 (corrección sin merma).`** |
| `App.tsx` (Foto en Producto) | `La app reduce y endereza las fotos JPG. PNG o WebP de máximo 1 MB.` | *(Eliminado)* |
| `App.tsx` (Pie de Producto) | `Los cambios de precio no alteran ventas anteriores. Usa Entrada para agregar unidades.` | *(Eliminado)* |
| `SalesPages.tsx` (Corte de caja) | `Aportaciones, retiros y traspasos van aparte: no son ventas. Si el efectivo no cuadra, registra la diferencia en Cuentas.` | **`Si el efectivo físico no cuadra, registra el ajuste en Cuentas.`** |
| `Parameters.tsx` (Ajustes) | `Lotes, cuentas y gastos. Tus datos no se pierden.` | **`Lotes, cuentas bancarias y gastos.`** |
| `seller.tsx` (Cobro vendedor) | `Mismo precio con cualquier forma de pago. Descuentos o crédito: pídeselos al dueño.` | *(Eliminado)* |
