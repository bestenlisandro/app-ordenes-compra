# App de Órdenes de Compra

## Acceso y seguridad

La aplicación exige autenticación y aplica permisos RBAC en la API según rol, centro de costos y límite de aprobación. El usuario inicial se crea con `npm run db:seed`:

- Usuario: `admin`
- Contraseña inicial: valor de `ADMIN_PASSWORD` o, sólo para desarrollo, `Compras2026!`

Definí `AUTH_SECRET` y `ADMIN_PASSWORD` con valores seguros en el entorno de producción antes de desplegar. El administrador puede crear el resto de las cuentas desde **Accesos**. Los aprobadores disponen del módulo **Delegar** para transferir temporalmente su autoridad.

Aplicación full stack para gestionar órdenes de compra, proveedores y productos. Usa React/Vite, Tailwind, Express, Prisma y SQLite para iniciarse sin servicios externos.

## Requisitos

- Node.js 20 o superior y npm.

## Ejecución desde cualquier terminal

Desde la carpeta del proyecto, ejecute una sola vez:

```bash
npm install
copy .env.example .env
npm run setup
```

En PowerShell puede reemplazar el segundo comando por `Copy-Item .env.example .env`.

Luego inicie frontend y backend juntos:

```bash
npm run dev
```

En Windows también puede abrir `Iniciar-App.cmd` con doble clic. Mantenga la ventana abierta mientras use la aplicación.

Abra `http://localhost:5173`. La API queda en `http://localhost:4000`.

## Módulos incluidos

- **Órdenes:** creación, búsqueda, filtros y cambio de estado. Al marcar una orden como `Recibida`, sus unidades ingresan al stock.
- **Proveedores:** alta, edición y eliminación desde la interfaz.
- **Stock:** consulta de existencias, alerta de reposición y movimientos manuales de entrada/salida.
- **Reportes:** gráficos de compras por proveedor y órdenes agrupadas por estado.

Para una base PostgreSQL, cambie el `provider` de Prisma por `postgresql`, ajuste `DATABASE_URL` y ejecute `npm run db:push`.

## Publicación en Render

El archivo `render.yaml` prepara una publicación sin costo en Render. Para conservar los datos, conecte la variable `DATABASE_URL` a una base PostgreSQL de Supabase. El servicio gratuito puede tardar alrededor de un minuto en responder después de 15 minutos sin uso; Supabase Free admite hasta 500 MB y puede pausarse si no hay actividad durante una semana.
