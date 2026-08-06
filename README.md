# App de Órdenes de Compra

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

El archivo `render.yaml` prepara el servicio para Render con un disco persistente, necesario para conservar la base SQLite. En Render, cree un servicio desde este repositorio y seleccione un plan con disco persistente. La aplicación quedará disponible con una URL pública.
