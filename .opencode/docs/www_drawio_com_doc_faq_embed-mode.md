# Embed mode | draw.io

> Source: https://www.drawio.com/doc/faq/embed-mode
> Cached: 2026-08-13T01:19:23.591Z

---

- [](/)
- [Reference](/docs/reference/)
- Embed mode

On this page# Embed mode

Embed mode allows you to integrate the draw.io editor into your own application using an iframe. When the `embed=1` URL parameter is set, the editor communicates with the parent page or opener window via `postMessage`. This mode is only supported on [https://embed.diagrams.net](https://embed.diagrams.net).

Once the page has loaded, it sends a `ready` message to the opener or parent window. After receiving this message, the host application can send diagram data as XML or compressed XML. The editor returns XML when the user clicks *Apply*, or an empty string when the user clicks *Cancel*.

## URL parameters[​](#url-parameters)

The following URL parameters are available in embed mode:

`spin=1`: Shows a *Loading...* spinner while waiting for diagram data. You can also pass a custom message, for example `spin=Loading+diagram...`.

`modified=0`: Disables the modified-state update after *Save* is selected and enables a status message after changes are made. If set to `0`, the status bar is cleared after changes. Otherwise, the value is used as a resource key. You can also specify this setting in the [load message](#load-action).

`keepmodified=1`: If `modified` specifies a resource key, this parameter maintains the modified state after *Save* is selected.

`libraries=1`: Enables the shape libraries in the left panel. The default is `0` (disabled).

`themes=1`: Shows the *Theme* submenu in the *Extras* menu, allowing users to change the [editor theme](/docs/manual/editor/appearance/) from within the embedded editor. Has no effect if the theme is fixed via the `ui` or `sketch` URL parameters, as those take precedence. The selected theme is stored in the browser&#x27;s local storage for the embedding site and is applied the next time the embedded editor is loaded. The default is `0` (disabled).

`noSaveBtn=1`: Replaces the *Save* button with a *Save and Exit* button. You can also specify this setting in the [load message](#load-action). When this parameter is set, the `saveAndExit` parameter is ignored.

`saveAndExit=1`: Displays an additional *Save and Exit* button alongside the *Save* button. You can also specify this setting in the [load message](#load-action). If `noSaveBtn=1` is set, use `saveAndExit=0` to hide the *Save and Exit* button.

`noExitBtn=1`: Hides the *Exit* button. You can also specify this setting in the [load message](#load-action).

**Note:** To hide all buttons in embed mode, use `saveAndExit=0&noSaveBtn=1&noExitBtn=1`.

`ready=message`: Specifies the message to send when the editor is ready. The default is `ready`. This parameter is ignored when the JSON protocol is used.

`returnbounds=1`: Returns a JSON structure with the diagram bounds immediately after receiving the diagram XML.

`proto=json`: Enables the [JSON protocol](#json-protocol) for message passing.

`configure=1`: Sends a `configure` event and waits for a `configure` action before initialising the editor. See [Configuration](#configuration).

## Configuration[​](#configuration)

When the `configure=1` URL parameter is set, the editor sends `{event: &#x27;configure&#x27;}` to the parent window and waits for `{action: &#x27;configure&#x27;, config: obj}` before creating the main application and sending the `init` event. The `obj` value follows the format described in [Configure the draw.io editor](/docs/reference/configure-diagram-editor/), for example:

```
{"action": "configure", "config": {"defaultFonts": ["Humor Sans"]}}

```

In addition to the standard configuration options, the following inline embed mode options can be set via the configure message:

PropertyDescription`passiveScroll`Enables passive scroll mode for inline embeds. Keyboard events are only handled when the graph container has focus, preventing the editor from capturing keystrokes meant for the host page. Non-zoom scroll-wheel events are forwarded to the parent frame as `{event: &#x27;scrollWheel&#x27;, deltaX, deltaY}` messages instead of panning the diagram. When enabled in `embedInline` mode, the Escape key no longer triggers the exit action.`noResizers`Hides the bottom and right resize handles in inline embed mode. Useful when the host application controls the size of the editor container.`preserveViewState`Preserves the original `dx`, `dy`, `grid`, `page`, `fold`, `connect`, and `arrows` attribute values from the loaded diagram XML when saving, instead of overwriting them with the current runtime state. This is useful in embed contexts where the host application overrides view settings (via URL parameters like `grid=0`, `pv=0` or config defaults like `defaultFoldingEnabled`) that should not be persisted back to the diagram source.`useInternalClipboard`Disables the native clipboard handler that uses a hidden `contentEditable` div for Ctrl+C/V/X. Instead, the original `mxKeyHandler` bindings are kept, which use `mxClipboard` for internal copy/paste. Useful in embed contexts (e.g. VS Code webviews) where native clipboard events on the hidden div do not fire.`passThroughKeys`An array of keyboard chords the embedding host wants to handle itself instead of draw.io. Each entry is `{key, ctrl, shift, alt, command}` — `key` is matched case-insensitively against `KeyboardEvent.key`, `ctrl` matches Ctrl or Cmd, and `command` is an opaque string the host understands. On a match, draw.io intercepts the keydown in the capture phase, suppresses its own handling of it, and posts `{event: &#x27;shortcut&#x27;, command}` back to the host so the host can run the corresponding command. This lets an embedding host reclaim shortcuts (for example Ctrl+P to open the host&#x27;s own quick-open) even across a cross-origin iframe, where it cannot inject its own key listener.`suppressNewWindows`Set to `true` when the host blocks opening new windows or tabs (for example a VS Code webview). draw.io then avoids `window.open`: link clicks are reported to the host via the [`openLink`](#save-and-exit-events) event and are not opened locally, and the "open in new window/tab" options in the Save, Export and HTML dialogs are hidden (`popupsAllowed` is forced off). Printing still needs a popup/print window the host blocks, so a host using this flag should also hide the print action (for example via `hideMenuItems`). Can also be set with `?suppressNewWindows=1` on the iframe URL. Default `false`.
## JSON protocol[​](#json-protocol)

When `proto=json` is set, the editor and host application exchange JSON-encoded messages via `postMessage`. This section describes the available events and actions.

### Initialisation[​](#initialisation)

When the editor is ready, it sends `{event: &#x27;init&#x27;}` and expects a [load action](#load-action) in response.

### Load action[​](#load-action)

The `load` action provides the diagram data to the editor:

```
{"action": "load", "xml": "<mxGraphModel>...</mxGraphModel>"}

```

The `xml` value can be any supported diagram format, including:

- Standard draw.io XML

- SVG or PNG files with [embedded XML](/docs/manual/export/xml-in-png/)

- PNG data URIs with base64 encoding

- SVG data URIs with UTF-8 or base64 encoding

- Visio files as data URIs with a `data:application/vnd.visio;base64` prefix

- Lucidchart and Gliffy files as JSON strings

The legacy parameter name `xmlpng` can still be used for PNG+XML data.

You can also import specific data formats using a `descriptor` object:

```
{"action": "load", "descriptor": {"format": "csv", "data": "..."}}
{"action": "load", "descriptor": {"format": "mermaid", "data": "..."}}

```

For the `mermaid` descriptor, an additional `wrap` option controls whether the converted diagram is wrapped in an editable Mermaid group — see [Mermaid descriptor options](#mermaid-descriptor-options).

The load action supports the following optional parameters:

ParameterDescription`autosave`Set to `1` to enable the [autosave](#autosave) feature.`modified`Controls the modified-state behaviour. Uses the same semantics as the `modified` URL parameter.`saveAndExit`Controls the *Save and Exit* button. Uses the same semantics as the `saveAndExit` URL parameter. URL parameters take precedence.`noSaveBtn`Controls the *Save* button visibility. Uses the same semantics as the `noSaveBtn` URL parameter.`noExitBtn`Controls the *Exit* button visibility. Uses the same semantics as the `noExitBtn` URL parameter.`title`Displays a title in the menu bar.`libs`Specifies which shape libraries to load.`dark`Enables dark mode.`theme`Sets the editor theme.`rough`Enables sketch (hand-drawn) mode.`toSketch`Converts the diagram to sketch style on load.`border`Sets the border around the diagram.`background`Sets the background colour.`viewport`Sets the visible viewport rectangle for inline embed mode: `{x, y, width, height}` in window coordinates. Used to keep dialogs and windows within the visible area of the host page — see the [`viewport` action](#viewport). To control the initial scroll position of the diagram, use `scroll` instead.`rect`Sets the initial visible rectangle.`minWidth`Sets the minimum width for the editor canvas.`minHeight`Sets the minimum height for the editor canvas.`scale`Sets an exact zoom scale after loading and positions the diagram at the origin of the viewport. When provided, this takes precedence over `fit` and `maxFitScale`. Unlike `fit`, which computes the scale automatically, `scale` applies the precise value given. This is useful when the host application needs to match an external rendering scale exactly (e.g. transitioning from an SVG preview to the editor).`scaleBorder`Sets the border (in screen pixels) around the diagram when using `scale`. Defaults to `0`. Only used with `scale`.`fit`Set to `1` to fit the diagram to the viewport after loading. Ignored when `scale` is provided.`maxFitScale`Sets the maximum scale when fitting the diagram to the viewport. Only used with `fit`.`scroll`Scrolls the diagram so that the given point appears at the top-left corner of the viewport after loading: `{x, y}` in model coordinates (the same coordinate space as `mxGeometry`). Applied after `scale` or `fit`, so it can be combined with either to control both the zoom and the visible area. Scrolling is limited by the available scroll range of the canvas. Not applicable in chromeless mode, where the automatic fit takes precedence.`publishClose`Set to `1` to change the *Save and Exit* button label to *Publish* and the *Exit* button label to *Close*.`sourceMetadata`Optional. Stores a key-value pair as an attribute on the model root cell after the diagram loads. This is useful for preserving the original source data (e.g. mermaid code) in the diagram model. See [Source metadata](#source-metadata).`exportProtocol`Set to `true` to route [UI-triggered exports](#ui-triggered-exports) through the JSON protocol instead of the browser&#x27;s save dialog.`diffSync`Set to `true` to enable [diff-based synchronisation](#diff-sync). Set to `{patchOnly: true}` to omit full XML from autosave messages.`layout`Runs a layout on the diagram after it loads. Either a preset name (`verticalFlow`, `horizontalFlow`, `verticalTree`, `horizontalTree`, `radialTree`, `organic`) or a custom-layout array using the same format as the [`layout` action](#layout) (also accepted as a JSON string). The layout runs before the sync baseline is established, so the laid-out diagram becomes the baseline and the returned `load` response reflects the new positions. Requires the ELK layout bundle, which loads automatically.
After the diagram loads, the editor returns a `load` event message containing diagram size information. When `diffSync` is enabled, the response includes a `checksum` field for verifying state consistency.

### Mermaid descriptor options[​](#mermaid-descriptor-options)

When loading a `mermaid` descriptor, the descriptor object accepts an additional `wrap` option:

```
{"action": "load", "descriptor": {"format": "mermaid", "data": "graph TD\n  A-->B", "wrap": true}}

```

PropertyDescription`wrap`Set to `true` to wrap the converted diagram in an editable Mermaid group: a single `transparentBounds` group cell that carries the Mermaid source as a `mermaidData` attribute, so the diagram can be re-edited as Mermaid later (the group&#x27;s pen handle, or double-clicking it, reopens the Mermaid editor). This matches the result of inserting Mermaid through the editor&#x27;s *Insert > Mermaid* dialog. The wrapped group is normalised so its padded bounds start at the page origin. Defaults to `false` for backwards compatibility, in which case the raw converted cells are loaded as-is and are not re-editable as Mermaid.
### Source metadata[​](#source-metadata)

When loading a diagram via the `descriptor` format (e.g. mermaid), you can optionally store the original source data in the diagram model by including a `sourceMetadata` object in the load message:

```
{
  "action": "load",
  "descriptor": {"format": "mermaid", "data": "graph TD\n  A-->B"},
  "sourceMetadata": {"key": "mermaidSource", "value": "graph TD\n  A-->B"}
}

```

PropertyDescription`key`The attribute name to set on the model root cell (e.g. `mermaidSource`).`value`The attribute value to store (e.g. the original mermaid source code).
Both `key` and `value` must be provided for the metadata to be stored. The attribute is set on the root cell of the `mxGraphModel` after the diagram has been loaded and converted, using `graph.setAttributeForCell`. This makes the metadata available in the saved XML output and can be read back by the host application.

The `sourceMetadata` parameter is optional and has no effect when omitted or when either `key` or `value` is missing.

**`sourceMetadata` vs. the Mermaid `wrap` group.** The two are independent and may be combined. `sourceMetadata` stores a single arbitrary key-value pair on the **model root cell** — a diagram-level attribute that round-trips in the saved XML — and is applied after the diagram loads regardless of `wrap`. The Mermaid descriptor&#x27;s `wrap: true` option instead stores the Mermaid source on the **wrapper group cell** (as `mermaidData`) to make that group re-editable as Mermaid. So when `wrap` is omitted (the default), `sourceMetadata` is the way to preserve the original source in the model; when `wrap: true` is used, the source is already carried on the group, and `sourceMetadata` remains available for any separate host-defined metadata on the root.

### Response message format[​](#response-message-format)

Most response messages from the editor (including `load`, `save`, `autosave`, `fit`, and `export`) include a common set of fields that describe the current editor state:

FieldDescription`event`The event type (e.g. `save`, `autosave`, `load`, `fit`, `export`).`bounds`The diagram bounding box in view coordinates (affected by zoom): `{x, y, width, height}`.`modelBounds`The diagram bounding box in model coordinates (zoom-independent): `{x, y, width, height}`. Use this for sizing c

... [Content truncated]