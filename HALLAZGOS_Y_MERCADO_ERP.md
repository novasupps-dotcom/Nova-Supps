# Hallazgos de Auditoría y Benchmark de Mercado · Nova Negocio (v2.10.4)

> **Documento Ejecutivo de Producto, UX y Arquitectura de Software**  
> **Aplicación**: Nova Negocio (`com.novasupps.negocio`) · Mini-ERP & POS Móvil para Suplementos Deportivos  
> **Versión auditada**: `2.10.4` (`versionCode: 66` · `runtimeVersion: "2.2.4"`)

---

## 1. Resumen Ejecutivo: Mejoras Aplicadas en `v2.10.4`

Antes de contrastar la plataforma con el mercado de software comercial, en la versión **`2.10.4`** se resolvieron de raíz los puntos críticos de fricción visual y operativa detectados en el uso diario:

1. **Unificación total del carrito y eliminación de la barra negra inferior (`s.cartBar`)**:
   - **Hallazgo**: Existía duplicidad visual entre el botón superior del carrito (`CartButton` en `AppHeader`) y la barra negra flotante inferior (`BottomDock`), la cual seguía ocupando espacio sobre la barra de navegación.
   - **Solución implementada**: Se eliminó por completo la barra negra inferior tanto en la vista del dueño ([`App.tsx`](file:///C:/Users/EmmanuelMartinez/.gemini/antigravity/worktrees/nova-supps-limpio/refactor_mini_erp_codebase/App.tsx)) como en la del vendedor ([`src/seller.tsx`](file:///C:/Users/EmmanuelMartinez/.gemini/antigravity/worktrees/nova-supps-limpio/refactor_mini_erp_codebase/src/seller.tsx)). El botón superior del carrito ([`CartButton`](file:///C:/Users/EmmanuelMartinez/.gemini/antigravity/worktrees/nova-supps-limpio/refactor_mini_erp_codebase/src/ui.tsx)) ahora concentra el conteo de piezas, el importe total y el acceso directo al cobro desde cualquier pantalla.
2. **Ocultación de sabores sin existencias al abrir la tarjeta de producto**:
   - **Hallazgo**: Cuando un producto tenía múltiples sabores y alguno estaba en `0 disponibles`, ese sabor agotado seguía apareciendo en la lista modal de selección, generando ruido visual y toques fallidos.
   - **Solución implementada**: En [`ProductGrid`](file:///C:/Users/EmmanuelMartinez/.gemini/antigravity/worktrees/nova-supps-limpio/refactor_mini_erp_codebase/src/ui.tsx), el selector de sabores (`familyMembers`) ahora filtra automáticamente los sabores con existencias disponibles (`limitOf(p.id) > 0 || qtyOf(p.id) > 0`), mostrando únicamente los sabores listos para vender.
3. **Eliminación y ocultación de botones sin uso o inaplicables**:
   - En [`src/ui.tsx`](file:///C:/Users/EmmanuelMartinez/.gemini/antigravity/worktrees/nova-supps-limpio/refactor_mini_erp_codebase/src/ui.tsx): Se oculta el botón `i` (`tileInfo`) en productos individuales que no tienen descripción capturada (manteniendo pulsación larga para quien desee ver la foto en grande).
   - En [`src/screens/InventoryPages.tsx`](file:///C:/Users/EmmanuelMartinez/.gemini/antigravity/worktrees/nova-supps-limpio/refactor_mini_erp_codebase/src/screens/InventoryPages.tsx): Se oculta el botón `Al carrito` en `Stock` y en `Detalle producto` cuando el artículo está agotado o archivado.
   - En [`src/screens/CustomersPages.tsx`](file:///C:/Users/EmmanuelMartinez/.gemini/antigravity/worktrees/nova-supps-limpio/refactor_mini_erp_codebase/src/screens/CustomersPages.tsx): Se ocultan los botones de `WhatsApp` y `Enviar catálogo` cuando el cliente no tiene teléfono válido y se elimina el botón redundante de llamada telefónica.
4. **Filtros multicapa en `Ventas` (por Producto, Tipo de Suplemento y Marca)**:
   - En [`src/screens/SalesPages.tsx`](file:///C:/Users/EmmanuelMartinez/.gemini/antigravity/worktrees/nova-supps-limpio/refactor_mini_erp_codebase/src/screens/SalesPages.tsx): Se incorporó un selector de dimensión (`Todo el catálogo`, `Tipo de suplemento`, `Marca`, `Producto`) con chips dinámicos y búsqueda transversal que cruza folios, clientes, nombres de producto, marcas y categorías de suplemento.
5. **Pop-up interactivo de Seguimientos con eliminación de notificaciones y acciones directas**:
   - En [`App.tsx`](file:///C:/Users/EmmanuelMartinez/.gemini/antigravity/worktrees/nova-supps-limpio/refactor_mini_erp_codebase/App.tsx) y [`src/screens/CustomersPages.tsx`](file:///C:/Users/EmmanuelMartinez/.gemini/antigravity/worktrees/nova-supps-limpio/refactor_mini_erp_codebase/src/screens/CustomersPages.tsx): Los seguimientos pendientes ahora abren un modal interactivo con acciones por cliente (`WhatsApp`, `Vender`, `+7 días` para posponer y botón de papelera `Eliminar notificación` para descartar el recordatorio individualmente o `Eliminar todas`).
6. **Diseño Responsive (320 dp a 1100+ dp)**:
   - Cuadrícula de productos adaptable de `1` a `5` columnas según el ancho de la ventana (`useWindowDimensions`), barra de pestañas centrada con ancho máximo en tablets (`maxWidth: 520`), y tarjetas de acciones con ajuste flexible (`flexWrap: "wrap"`).

---

## 2. Benchmark de Mercado: Nova Negocio frente a la Industria POS / Mini-ERP

Para evaluar a **Nova Negocio** con criterio de software comercial de clase mundial, se contrasta su estado actual contra los 4 segmentos líderes del mercado:

| Capacidad / Módulo | Square for Retail / Shopify POS | Loyverse POS / Kyte | Bind ERP / Alegra (LATAM) | **Nova Negocio (`v2.10.4`)** | Brecha / Oportunidad |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Velocidad de Checkout (Toques hasta cobrar)** | 2–3 toques, carrito unificado en cabecera/lateral | 3 toques, barra inferior pesada | 5+ pasos (orientado a facturación) | **2 toques** (tocar tarjeta → tocar carrito superior → cobrar) | **A la par de Square/Shopify**. Oportunidad: calculadora de cambio en efectivo. |
| **Manejo de Variantes (Sabores / Tamaños)** | Matriz de variantes con ocultación opcional de agotados | Variantes en lista simple (muestra agotados) | SKUs separados sin agrupación visual en POS | **Agrupación automática por familia + ocultación de sabores agotados** | **Superior a Loyverse/Bind**. Oportunidad: matriz combinada *Tamaño × Sabor*. |
| **Control de Lotes y Caducidades (FEFO)** | Solo con plugins de pago adicionales (\+$50 USD/mes) | No nativo | Nativo (orientado a almacén de escritorio) | **Nativo en móvil (FEFO automático + alerta 60 días)** | **Ventaja competitiva fuerte**. Oportunidad: bloqueo o alerta al vender lote próximo a vencer. |
| **Importación Inteligente de Compras (PDF)** | OCR de órdenes de compra (planes Plus) | Manual o CSV en web | XML CFDI / captura manual | **Lectura directa de PDF de proveedor con cálculo de margen y terminal** | **Diferenciador único en su nicho**. Oportunidad: cuentas por pagar a proveedores. |
| **CRM y Recompra (Seguimientos)** | Marketing automatizado por correo/SMS | Historial básico de compras | Sólo directorio fiscal | **Pop-up de seguimientos + WhatsApp 1-toque + ciclo por cliente** | Oportunidad: **recordatorio automático basado en los servicios del suplemento** (ej. 30 servicios = aviso al día 25). |
| **Operación Offline-First + Vendedores en Nube** | Requiere conexión frecuente | Sincronización nube con conflictos ocasionales | 100% dependiente de internet | **SQLite local instantáneo + sincronización Supabase para vendedores** | Oportunidad: sincronización en tiempo real (*Supabase Realtime*) sin esperar refresco. |

---

## 3. Hallazgos Principales y Áreas de Oportunidad en Toda la Aplicación

A continuación se documentan todas las áreas de oportunidad identificadas a nivel de **Arquitectura de Código**, **Experiencia de Usuario (UX/UI)** y **Funcionalidad de Negocio (Mini-ERP)**.

### 3.1. Punto de Venta (`Vender`) y Flujo de Caja
1. **Calculadora de cambio en pagos en efectivo**:
   - *Hallazgo*: Al cobrar en efectivo, el sistema registra el importe exacto de la venta, pero no tiene un campo rápido de *«Recibí $500 → Cambio $120»*.
   - *Sugerencia de mercado*: En el estándar POS (Square, Loyverse), mostrar botones rápidos de billetes (`Exacto`, `$200`, `$500`, `$1000`) al elegir `Efectivo` acelera el cobro en mostrador y evita errores de cambio.
2. **Descuento directo por renglón o por ticket sin crear promoción previa**:
   - *Hallazgo*: Actualmente los descuentos dependen de las promociones configuradas en `Ajustes → Promociones` o de modificar el precio después de vender (`Ajustar venta`).
   - *Sugerencia de mercado*: Permitir en la hoja de cobro un descuento rápido puntual (`-$50` o `-10%`) autorizado por el dueño para cerrar ventas en mostrador sin salir a Ajustes.
3. **Ventas en espera (*Parked Sales* / Carritos guardados)**:
   - *Hallazgo*: Solo existe un carrito activo a la vez (`basket`). Si un cliente está eligiendo productos y llega otro cliente a pagar algo rápido, hay que vaciar el carrito o terminar primero.
   - *Sugerencia de mercado*: Botón `Poner en espera` dentro del carrito cuando hay productos cargados, permitiendo atender a otro cliente y retomar el carrito anterior con un toque.

### 3.2. Inventario, Catálogo y Compras (`Stock`, `Lotes`, `Cargar pedido`)
1. **Sugerencia inteligente de reabastecimiento (*Days of Supply* / Velocidad de venta)**:
   - *Hallazgo*: La alerta de stock bajo usa únicamente un número fijo (`minStock`, por defecto `5` piezas). Un producto que vende 10 piezas por semana necesita un mínimo distinto al que vende 1 pieza al mes.
   - *Sugerencia de mercado*: Aunque el reporte Excel de stock (`src/stockExcel.ts`) ya calcula *días de inventario*, llevar ese indicador directamente a la pantalla `Stock → Por pedir` (ej. *«Te quedan para 4 días al ritmo actual»*) convertiría a Nova Negocio en un sistema predictivo.
2. **Cuentas por pagar a proveedores (Compras a crédito)**:
   - *Hallazgo*: En `Cargar pedido (PDF)` se puede elegir con qué cuenta se pagó o `No registrar`, pero si el proveedor otorga crédito (ej. pago a 15 o 30 días), no queda un saldo pendiente por pagar al proveedor.
   - *Sugerencia de mercado*: Agregar la opción `A crédito (por pagar)` al cargar un pedido para llevar el control de pasivos con proveedores igual que ya se lleva el control de `Por cobrar` con clientes.
3. **Kardex de movimientos auditable por producto**:
   - *Hallazgo*: En `Detalle producto` se ven los lotes activos y las existencias, pero no una línea de tiempo cronológica de cada entrada, venta, cancelación o ajuste de conteo de ese SKU.
   - *Sugerencia de mercado*: Añadir una sección plegable `Historial de movimientos (Kardex)` dentro de `Detalle producto` para auditoría rápida de diferencias de inventario.

### 3.3. CRM Especializado en Suplementos (`Clientes` y `Seguimientos`)
1. **Seguimiento automático por agotamiento de suplemento (Recompra inteligente)**:
   - *Hallazgo*: Las fechas de seguimiento (`nextDate`) se asignan manualmente (`+7d`, `+15d`, `+30d`) al editar un cliente o desde el nuevo pop-up de seguimientos.
   - *Sugerencia de mercado (Alto ROI para suplementos)*: Los suplementos tienen una duración predecible (30 servicios ≈ 30 días; 60 servicios ≈ 45–60 días). Al registrar una venta con cliente asignado, ofrecer un chip automático o programar automáticamente un seguimiento 5 días antes de que se termine su suplemento (*«A Juan se le está por terminar su Psychotic Black · 60 serv.»*).
2. **Etiquetas de objetivo del cliente (Hipertrofia, Definición, Salud, Rendimiento)**:
   - *Hallazgo*: El campo `notes` del cliente es texto libre.
   - *Sugerencia de mercado*: Permitir etiquetas rápidas de perfil deportivo en `Clientes` para filtrar a quién ofrecerle nuevos lanzamientos (ej. filtrar todos los clientes que consumen `Preentreno` o `Proteína aislada`).

### 3.4. Analítica, Ventas y Finanzas (`Ventas`, `Cobros`, `Corte de caja`)
1. **Comparativa contra periodo anterior ($\Delta\%$ en `Resumen de ventas`)**:
   - *Hallazgo*: `Resumen de ventas` muestra ingresos, utilidad neta y margen de los últimos 7/30/90 días, pero sin contexto comparativo frente a los 7/30/90 días previos.
   - *Sugerencia de mercado*: Mostrar un indicador porcentual junto a la venta y utilidad neta (ej. `+14% vs. mes anterior`) como hacen Shopify POS y Square Dashboard.
2. **Devoluciones parciales de un folio**:
   - *Hallazgo*: Hoy se puede cancelar la venta completa (`Cancelar venta`, que regresa todo el stock a sus lotes originales) o ajustar precios/cantidades (`Ajustar venta`), pero no registrar formalmente una devolución parcial con motivo de merma vs. reingreso a stock vendible.
   - *Sugerencia de mercado*: Flujo guiado de `Devolver producto` dentro de `Detalle venta` que pregunte si el envase sigue sellado (regresa al lote) o abierto/dañado (se envía a merma).

### 3.5. Arquitectura de Código y Mantenibilidad Técnica
1. **Modularización de [`App.tsx`](file:///C:/Users/EmmanuelMartinez/.gemini/antigravity/worktrees/nova-supps-limpio/refactor_mini_erp_codebase/App.tsx) (~5,140 líneas) y [`src/business.ts`](file:///C:/Users/EmmanuelMartinez/.gemini/antigravity/worktrees/nova-supps-limpio/refactor_mini_erp_codebase/src/business.ts) (~3,090 líneas)**:
   - *Hallazgo*: Aunque las pantallas principales (`SalesPages`, `InventoryPages`, `CustomersPages`, `SettingsPages`, `OrderImport`, `CatalogImport`) ya fueron extraídas a `src/screens/`, el contenedor `App.tsx` aún concentra todos los modales de edición (`form`), el flujo de cobro con Mercado Pago Point y la sincronización en la nube.
   - *Sugerencia técnica*: Extraer los formularios modales (`ProductFormModal`, `CustomerFormModal`, `CheckoutSheetModal`, `CloudSyncController`) en módulos dedicados para reducir `App.tsx` por debajo de las 1,200 líneas y facilitar pruebas unitarias aisladas.
2. **Paginación SQLite en historial de ventas para negocios con >5,000 folios**:
   - *Hallazgo*: En `2.10.3` se optimizó `load(b)` con carga perezosa (`lazy getters`) para que las pestañas que no usan lotes o renglones no ejecuten SQL innecesario. Sin embargo, `b.sales()` sigue trayendo todas las ventas históricas cuando se entra a `Ventas`.
   - *Sugerencia técnica*: Implementar consulta filtrada por rango de fechas directo en SQLite (`WHERE date >= ?`) con carga bajo demanda (*infinite scroll*) para garantizar que la app mantenga tiempos de respuesta menores a 16 ms incluso tras 5 años de operación continua.
3. **Sincronización en tiempo real con vendedores (*Supabase Realtime*)**:
   - *Hallazgo*: La sincronización entre el teléfono del dueño y los teléfonos de los vendedores opera por intervalos y al abrir/volver a la aplicación.
   - *Sugerencia técnica*: Suscribir el canal de `seller_sales` y `catalog_snapshot` mediante WebSockets de Supabase para que las existencias se descuenten al instante en todos los dispositivos en cuanto cualquier vendedor cierre una venta.

---

## 4. Hoja de Ruta Recomendada (Priorización por Retorno de Inversión)

| Prioridad | Iniciativa | Impacto en el Negocio | Complejidad |
| :---: | :--- | :--- | :---: |
| **P1 · Inmediato** | **Ciclo de recompra automático de suplementos**: Al vender un suplemento a un cliente, sugerir o agendar seguimiento automático a los 25–30 días. | **Muy Alto** (Incrementa retención y ventas recurrentes por WhatsApp sin esfuerzo manual). | Baja |
| **P1 · Inmediato** | **Calculadora de cambio rápido en efectivo** (`$200`, `$500`, `$1000`) y **descuento directo en el carrito**. | **Alto** (Agiliza el mostrador y evita cálculos mentales). | Baja |
| **P2 · Corto Plazo** | **Días de inventario restantes (*Days of Supply*)** visibles en `Stock → Por pedir` según velocidad real de venta de los últimos 30 días. | **Alto** (Evita quedarse sin stock de los productos estrella como creatinas y proteínas). | Media |
| **P2 · Corto Plazo** | **Kardex por producto** en `Detalle producto` (bitácora auditable de quién vendió, cargó o ajustó cada pieza). | **Medio-Alto** (Control total contra pérdidas o errores de captura). | Media |
| **P3 · Mediano Plazo** | **Cuentas por pagar a proveedores** integrada con `Cargar pedido (PDF)` y **Comparativa $\Delta\%$ mensual** en `Resumen de ventas`. | **Medio-Alto** (Completa el ciclo financiero de un ERP comercial). | Media |
| **P3 · Mediano Plazo** | **Desacoplamiento de modales de `App.tsx`** y **paginación SQL por periodo** en `b.sales()`. | **Alto a largo plazo** (Escalabilidad para decenas de miles de ventas). | Media |
