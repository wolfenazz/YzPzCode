<div align="center">

<img src="app/src/assets/YzPzCodeLogo.png" alt="YzPzCode Logo" width="120"/>

<h1>YzPzCode</h1>

<p><strong>Tu equipo de programación con IA, a una sola ventana.</strong></p>

<p><i>Deja de lidiar con 5 terminales diferentes.<br>YzPzCode reúne a Claude, Gemini, Codex, Opencode, Cursor, Kilo, Hermes y Pi en una sola interfaz limpia —<br>además de 10 CLIs de herramientas SaaS, un navegador integrado con inspector de diseño visual, un diseñador impulsado por IA,<br>y un editor de imágenes integrado estilo Photoshop — más un agente de programación con IA integrado (YZPZ Agent), ejecutándose en un harness de agente local.</i></p>

[![GitHub stars](https://img.shields.io/github/stars/wolfenazz/YzPzCode?style=for-the-badge&logo=github&color=yellow)](https://github.com/wolfenazz/YzPzCode/stargazers)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%20v2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/React%2019-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-F74C00?style=for-the-badge&logo=rust&logoColor=white)](https://rust-lang.org)
[![License](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)

<p>
<a href="https://github.com/wolfenazz/YzPzCode/releases">
  <img src="https://img.shields.io/badge/⬇_Download-000000?style=for-the-badge&logo=github&logoColor=white" alt="Download"/>
</a>
&nbsp;
<a href="#-see-it-in-action">
  <img src="https://img.shields.io/badge/📸_Screenshots-FF6B6B?style=for-the-badge&logo=github" alt="Screenshots"/>
</a>
&nbsp;
<a href="docs/userguid.md">
  <img src="https://img.shields.io/badge/📖_Docs-4ECDC4?style=for-the-badge" alt="Docs"/>
</a>
</p>

<br>

</div>

---

<p><i>Nota: Esta app está en desarrollo, y es posible que algunas funciones no funcionen del todo bien. Seguimos actualizando la app cada vez más. En el futuro, todo funcionará por completo.</i></p>

- El problema

<div align="center">

| [¡] La forma antigua | [+] La forma YzPzCode |
|:--------------:|:-------------------:|
| Tres ventanas de terminal | **Una sola app** |
| Tres CLIs diferentes | **Los 8 agentes de IA integrados** |
| Alt-tab como un loco | **Cuadrícula lado a lado** |
| Navegador aparte para devtools | **Navegador integrado con inspector** |
| Copiar y pegar entre ellas | **Compara al instante** |
| Perdiendo la cabeza | **Mantente en el flujo** |

</div>

---

## - Ver la app en acción

<div align="center">

<img src="docs/capture/Capture1.PNG" width="48%" style="border-radius:8px"/>
<img src="docs/capture/Capture2.PNG" width="48%" style="border-radius:8px"/>
<br><br>
<img src="docs/capture/Capture3.PNG" width="48%" style="border-radius:8px"/>
<img src="docs/capture/Capture4.PNG" width="48%" style="border-radius:8px"/>

<br><br>
<i>Limpio. Rápido. Potente.</i>

</div>

<br>

[![Video Demo](docs/capture/Capture1.PNG)](docs/capture/MomentsDesktopclipfromApr132026.mp4)

<p align="center"><i>Mira YzPzCode en acción - Demo en video</i></p>

</div>

---

## Capacidades principales

<table>
<tr>
<td><b>Cuadrícula multi-agente</b><br><sub>Ejecuta Claude, Gemini, Codex, Kilo, Pi y más en vistas sincronizadas, lado a lado.</sub></td>
<td><b>Inicialización automática</b><br><sub>Detecta y configura al instante los CLIs instalados localmente.</sub></td>
<td><b>Preajustes de espacio de trabajo</b><br><sub>Guarda y restaura combinaciones óptimas de agentes para flujos de trabajo específicos.</sub></td>
<td><b>Terminales nativas</b><br><sub>Impulsadas por sesiones PTY reales para una interacción CLI auténtica.</sub></td>
</tr>
<tr>
<td><b>Soporte multiplataforma</b><br><sub>Binarios optimizados para Windows, macOS y Linux.</sub></td>
<td><b>Eficiencia de recursos</b><br><sub>Construido con Tauri y Rust, utilizando una fracción de la RAM que requiere Electron.</sub></td>
<td><b>Explorador integrado</b><br><sub>Gestiona archivos y directorios sin salir de la aplicación.</sub></td>
<td><b>Integración con Git</b><br><sub>Supervisa el estado del repositorio y las estadísticas de diff de un vistazo.</sub></td>
</tr>
<tr>
<td><b>Editor Monaco</b><br><sub>Editor multitab integrado basado en Monaco con resaltado de sintaxis, buscar/reemplazar y vistas previas de archivos enriquecidas (PDF, DOCX, XLSX, PPTX, DrawIO, imágenes).</sub></td>
<td><b>Integración con IDE</b><br><sub>Lanza sin fricciones a más de 10 entornos de desarrollo compatibles.</sub></td>
<td><b>Seguimiento de autenticación</b><br><sub>Supervisa el estado de las credenciales en todas las herramientas CLI activas.</sub></td>
<td><b>Entrega continua</b><br><sub>Los mecanismos de actualización automatizados garantizan el acceso a las últimas funciones.</sub></td>
</tr>
<tr>
<td><b>Navegador integrado</b><br><sub>Navegador basado en webview con pestañas, zoom, preajustes de dispositivo y exportación de capturas.</sub></td>
<td><b>Inspector de diseño visual</b><br><sub>Inspecciona, captura y aplica estilos de cualquier página web.</sub></td>
<td><b>Diseñador de IA</b><br><sub>Generación de diseños de interfaz a partir de prompts, con vista previa en vivo y exportación de código.</sub></td>
<td><b>Discord Rich Presence</b><br><sub>Muestra tu espacio de trabajo y tu actividad en tu perfil de Discord.</sub></td>
</tr>
<tr>
<td><b>Gestión de CLIs de herramientas</b><br><sub>Detecta, instala y verifica la autenticación de 10 CLIs SaaS (GitHub, Stripe, Supabase, Vercel y más).</sub></td>
<td><b>Multi-espacio de trabajo</b><br><sub>Varios espacios de trabajo abiertos con cambio de pestañas y estado por espacio de trabajo.</sub></td>
<td><b>Comandos gestionados</b><br><sub>Ejecuta comandos no interactivos con seguimiento de estado y monitoreo de PID.</sub></td>
<td><b>Personalización de la interfaz</b><br><sub>8 colores de acento, 3 niveles de densidad, cursor personalizado y activación/desactivación de animaciones.</sub></td>
</tr>
<tr>
<td><b>YZPZ Agent</b><br><sub>Agente de programación con IA integrado (harness de agente local) con chat en streaming, registros de herramientas e historial de sesiones.</sub></td>
<td><b>Equipos de agentes y aprobaciones</b><br><sub>Orquesta subagentes, aprueba solicitudes de herramientas y haz seguimiento de tareas en tiempo real.</sub></td>
<td><b>Editor de prompts enriquecido</b><br><sub>Barra de formato más menciones de archivos con `@` que se resuelven a rutas del espacio de trabajo.</sub></td>
<td><b>Prompts rápidos del inspector</b><br><sub>Prompts predefinidos de un clic (Mejorar / Ajustar) para el inspector de elementos, totalmente personalizables.</sub></td>
</tr>
<tr>
<td><b>Editor de imágenes</b><br><sub>Editor integrado estilo Photoshop con sistema de capas, pintura, selecciones e historial de deshacer.</sub></td>
<td><b>Sistema de capas</b><br><sub>Capas raster, de imagen, de texto y de formas con opacidad, bloqueo y 16 modos de fusión.</sub></td>
<td><b>Conjunto completo de herramientas</b><br><sub>Herramientas de mover, marco, lazo, recortar, pincel, borrador, relleno, texto, formas, cuentagotas, zoom y mano.</sub></td>
<td><b>Vista de imágenes</b><br><sub>Abre archivos PNG, JPG, WebP, SVG, GIF, BMP, AVIF y TIFF directamente en el espacio de trabajo.</sub></td>
</tr>
</table>

---
## - CLIs de agentes de IA

<div align="center">

<table>
<tr>
<td align="center" width="120">
<img src="app/src/assets/claude.png" width="48" height="48" style="border-radius:12px"/>
<br><br><b>Claude</b><br><code>claude</code><br><sub>Razonamiento profundo, explicaciones pacientes</sub>
</td>
<td align="center" width="120">
<img src="app/src/assets/gemini-cli-logo.svg" width="48" height="48" style="border-radius:12px"/>
<br><br><b>Gemini</b><br><code>gemini</code><br><sub>Rápido, multimodal, lo mejor de Google</sub>
</td>
<td align="center" width="120">
<img src="app/src/assets/codex.png" width="48" height="48" style="border-radius:12px"/>
<br><br><b>Codex</b><br><code>codex</code><br><sub>Generación de código que funciona</sub>
</td>
<td align="center" width="120">
<img src="app/src/assets/opencode.png" width="48" height="48" style="border-radius:12px"/>
<br><br><b>Opencode</b><br><code>opencode</code><br><sub>Libertad de código abierto</sub>
</td>
<td align="center" width="120">
<img src="app/src/assets/cursor-ai.png" width="48" height="48" style="border-radius:12px"/>
<br><br><b>Cursor</b><br><code>cursor</code><br><sub>Asistencia de IA a nivel de IDE</sub>
</td>
<td align="center" width="120">
<img src="app/src/assets/kiloCode.gif" width="48" height="48" style="border-radius:12px"/>
<br><br><b>Kilo</b><br><code>kilo</code><br><sub>Agente de código para cualquier tarea</sub>
</td>
<td align="center" width="120">
<img src="app/src/assets/Hermes-logo.png" width="48" height="48" style="border-radius:12px"/>
<br><br><b>Hermes</b><br><code>hermes</code><br><sub>Agente de código rápido y eficiente</sub>
</td>
<td align="center" width="120">
<img src="app/src/assets/pi.svg" width="48" height="48" style="border-radius:12px"/>
<br><br><b>Pi</b><br><code>pi</code><br><sub>Entorno de código para terminal minimalista</sub>
</td>
</tr>
</table>

</div>

---

## - CLIs de herramientas SaaS

YzPzCode también gestiona y verifica la autenticación de estos 10 CLIs de herramientas:

<div align="center">

<table>
<tr>
<td align="center" width="100"><b>GitHub</b><br><code>gh</code></td>
<td align="center" width="100"><b>Stripe</b><br><code>stripe</code></td>
<td align="center" width="100"><b>Supabase</b><br><code>supabase</code></td>
<td align="center" width="100"><b>Valyu</b><br><code>valyu-cli</code></td>
<td align="center" width="100"><b>PostHog</b><br><code>posthog-cli</code></td>
</tr>
<tr>
<td align="center"><b>ElevenLabs</b><br><code>elevenlabs</code></td>
<td align="center"><b>Ramp</b><br><code>ramp</code></td>
<td align="center"><b>GWS</b><br><code>gws</code></td>
<td align="center"><b>AgentMail</b><br><code>agentmail-cli</code></td>
<td align="center"><b>Vercel</b><br><code>vercel</code></td>
</tr>
</table>

</div>

---
## - Navegador integrado y herramientas de diseño visual

Integrado directamente en el espacio de trabajo — no más cambiar de ventana para el desarrollo web:

- **Navegador multitab**: Navega y previsualiza tus apps en un panel webview
- **Preajustes de dispositivo**: Responsive, iPhone 14 Pro, iPad — cambia la orientación
- **Controles de zoom**: Ajusta el zoom del 50% al 200%
- **Exportación de capturas**: Captura el HTML completo de la página
- **Modo ventana emergente**: Arrastra el navegador a su propia ventana

### Inspector de diseño visual
- **Modo inspección**: Pasa el cursor sobre cualquier elemento para ver su estructura HTML, selectores y atributos
- **Modo capturar estilo**: Haz clic para capturar los estilos CSS calculados (con pseudo-elementos) al portapapeles
- **Modo capturar elemento de UI**: Captura en profundidad un componente de UI completo — árbol de estructura (hasta 8 niveles), cuadrícula de layout, espaciado, tipografía, colores, modelo de caja, recursos y un análisis de intención de diseño generado automáticamente
- **Modo aplicar**: Aplica los estilos capturados a los elementos objetivo con soporte de deshacer y generación de clases CSS
- **Prompts rápidos**: Chips de prompts predefinidos de un clic (grupos Mejorar / Ajustar) que rellenan el editor de instrucciones, totalmente personalizables y restablecibles desde Configuración → Prompts rápidos

---

## - Diseñador de IA

Genera diseños de interfaz completos a partir de prompts en lenguaje natural:

- **Generación basada en prompts**: Describe lo que quieres y obtén un diseño completo
- **Múltiples temas**: Elige entre temas de diseño curados
- **Tipos de página**: Páginas de aterrizaje, paneles de control y más
- **Vista previa en vivo**: Ve los diseños en marcos de dispositivo responsive
- **Panel de personalización**: Ajusta colores, fuentes y espaciado
- **Inspector de elementos**: Inspecciona las propiedades de los componentes generados
- **Exportación de código**: Exporta el código HTML/CSS/JS generado
- **Historial de diseños**: Explora y restaura iteraciones de diseño anteriores
- **Gestión de skills**: Gestiona habilidades de ingeniería de prompts para obtener mejores resultados

---
## - YZPZ Agent (agente de IA integrado)

YzPzCode ahora incluye su propio agente de programación con IA — no se requiere ningún CLI externo:

- **Vista de agente**: Una vista dedicada del espacio de trabajo para sesiones de programación basadas en chat, junto a las vistas de terminal, editor y navegador
- **Harness de agente local**: Un harness sidecar de Node.js (incluido con la app, iniciado y supervisado automáticamente por el host de Rust) ejecuta el motor del agente
- **Chat en streaming**: Transmisión de mensajes en tiempo real con renderizado enriquecido de texto, llamadas a herramientas, resultados e imágenes
- **Registros de ejecución de herramientas**: Observa cada llamada a herramienta mientras se ejecuta — estado, entrada y resultados en un registro en vivo
- **Aprobaciones y permisos**: Aprueba o rechaza de forma interactiva las solicitudes de herramientas antes de que se ejecuten
- **Tareas y subagentes**: Listas de tareas en vivo y seguimiento de la actividad de los subagentes, además de **equipos de agentes** que orquestan varios subagentes en una tarea
- **Selección de proveedor y modelo**: Elige cualquier proveedor/modelo compatible (con claves de API y URLs base personalizadas opcionales) y establece un prompt de sistema personalizado
- **Historial de sesiones y reanudación**: Las sesiones están limitadas a cada espacio de trabajo — explora el historial y reanuda en cualquier momento
- **Estrategias de compactación**: Controla la compactación del contexto para mantener eficientes las sesiones de larga duración
- **Indicadores de uso y contexto**: Haz seguimiento del uso de tokens y del presupuesto de contexto en tiempo real mientras trabajas
- **Editor de prompts enriquecido**: Formatea los prompts (negrita, cursiva, código, citas, listas, enlaces) y escribe `@` para buscar con coincidencia difusa y adjuntar archivos del espacio de trabajo
- **Comandos slash por agente**: Una referencia integrada de los `/commands` disponibles para cada CLI de agente compatible

---
<!--CHUNK-END-->
