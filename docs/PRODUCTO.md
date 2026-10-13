# Producto 0.4

Piloto interno Nova Supps para captura móvil de catálogo, inventario, ventas, caja, CRM, campañas, compañías y ubicaciones. React Native / Expo 55 con SQLite local. Android e iOS comparten el código, pero este paquete entrega únicamente un APK Android de 64 bits.

La carga nueva incorpora 41 productos con 43 imágenes del catálogo actualizado, 40 SKU con existencias, 9 ventas, 12 renglones y 8 clientes del Excel. La actualización desde 0.3 agrega los folios VNS0008 y VNS0009 y el gasto IL002 una sola vez, conserva operaciones locales y respeta metadatos comerciales que el usuario ya modificó. Las ventas históricas conservan los importes del Excel aunque VNS0009 tenga precios por SKU opuestos a la lista.

En Android, Atrás recorre las pantallas visitadas y llega a Inicio. Desde Inicio aparece la confirmación de salida. El acceso biométrico usa la huella o el rostro que ya estén configurados en el dispositivo; la base SQLite permanece sin cifrado adicional. El catálogo muestra la descripción editable y las imágenes extraídas del PDF.

Validación pendiente en el teléfono del usuario: respaldar los datos de 0.3, instalar sobre esa versión sin desinstalar, comprobar que las ventas nuevas no se duplicaron, revisar las 43 fotografías y las variantes, probar el botón Atrás, la biometría, una venta nueva y la exportación de respaldo. Confirmar físicamente caducidades, costos, variantes, ubicaciones y cuentas reales.

No hay sincronización entre teléfonos, integración bancaria, importación arbitraria de Excel desde la app ni publicación en tiendas. Una compilación de iOS requiere macOS y firma de Apple.
