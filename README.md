# 🛒 Compras de la Tienda — Sistema Contable, Vales e Inventario Semanal

Sistema integral e inteligente de contabilidad, importador de vales de venta multiformato (con bot extractor), liquidación semanal automática, control de inventario de cierre a apertura (con traspaso automático semana a semana), comisiones por gestores/equipo, gastos fijos, inversiones extraordinarias y transporte/fletes.

---

## 🌟 Características Principales

1. **🤖 Bot Extractor Inteligente de Vales**:
   - Pega notas o mensajes de WhatsApp (con o sin emojis, listas tabulares, textos libres).
   - Reconoce cliente, teléfono, dirección, productos, cantidades, precios de compra y venta, transporte/flete, gestor y comisión.
   - Si un producto o gestor no existe, el bot los aprende y registra automáticamente.

2. **📦 Inventario Inteligente de Semana a Semana**:
   - Inventario Inicial + Compras de la semana - Ventas (según vales) - Bajas/Mermas = Inventario Final Calculado.
   - Ajuste y conteo físico real (Inventario Final Físico) con detección de diferencias y cuadre.
   - **Botón "Cerrar Semana e Iniciar Nueva"**: Traspasa automáticamente el inventario final de la semana previa como inventario inicial de la semana actual.

3. **💰 Liquidación y Márgenes Semanales**:
   - Ingresos brutos por vales.
   - Costo total de mercancía vendida (CMV).
   - Margen bruto y % de rentabilidad.
   - Comisiones al equipo/gestores detalladas por persona y vales.
   - Gastos operativos y fletes/transportación.
   - Ganancia neta real de la tienda editable y descargable.

4. **💼 Inversiones Extras y Bajas**:
   - Registro de inversiones de capital (inyecciones para compras mayores o expansión).
   - Registro de bajas/mermas justificadas (averías, roturas, devoluciones técnicas).

5. **⚡ 100% Autónomo y Portable**:
   - Funciona sin necesidad de instalar servidores complejos ni Node.js.
   - Persistencia local automática e instantánea en `localStorage` / `IndexedDB` (tus datos nunca se borran al recargar o cerrar el navegador).
   - Exportación e importación de respaldos en JSON y exportación directa a Excel (.xlsx).
   - También incluye un servidor opcional en Node.js (`server.js`) con Bot de API REST para integraciones externas.

---

## 🚀 Cómo Iniciar

### Opción 1 (Directo en el navegador - Recomendada):
Simplemente haz doble clic en el archivo `index.html` o ábrelo con Google Chrome, Edge o tu navegador favorito. ¡Listo para trabajar!

### Opción 2 (Servidor Local con Node.js):
```bash
npm install
npm start
```
Abre en tu navegador: `http://localhost:3000`

---

## 📂 Estructura del Proyecto

- `index.html`: Aplicación web moderna (Single-Page Application con Tailwind CSS, Lucide Icons y SheetJS para Excel).
- `package.json`: Configuración de dependencias (Express, CORS) para ejecutar como bot y servidor web.
- `server.js`: Servidor API REST y bot procesador de vales por HTTP.
- `.gitignore`: Reglas de exclusión para Git.
