# Nova Negocio 2.2 · Fuente corregida y validada · 12-oct-2026

Las correcciones de código están terminadas y verificadas. Ver docs/VALIDACION_2.2.md.

- Fuente 2.2.0 / versionCode 38.
- SecureStore integrado, migración conservando credenciales y escrituras atómicas.
- Avisos y seguimientos integrados; SQL de permisos y triggers probado localmente.
- Lector con cámara, código del producto y fotos de Android.
- Actualizaciones con reinicio protegido durante cobros.
- Pantallas separadas, tabla de cobros y Parámetros en cuatro secciones.
- Configuración, script de refirma local, pruebas portables y documentación.

Pendiente para generar el APK instalable:
1. Crear las cuentas y proyectos de Expo y Firebase (el usuario confirmó que aún no existen).
2. Ejecutar eas init / eas update:configure y conservar projectId y owner.
3. Poner google-services.json real en la raíz y configurar FCM V1 con eas credentials.
4. El usuario carga schema.sql en Supabase y da Run; no se ejecutó en producción.
5. Compilar con EAS, descargar el APK y refirmar localmente con scripts/resign_apk.py.
6. Instalar encima de 2.1 y probar avisos, cámara y un cobro real con Ya cobré.

No existe aún un APK 2.2 entregable. La fuente y el bundle de prueba no sustituyen la compilación nativa.

Guía: docs/COMPILAR_ANDROID_EAS.md.
Tarjeta de recompensas: pendiente de definir reglas.
iPhone/TestFlight: pendiente de cuenta Apple Developer.

