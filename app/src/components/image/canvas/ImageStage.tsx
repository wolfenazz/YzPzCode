// ─── Image Editor — Konva canvas stage ────────────────────────────────────
// Renders the document (zoom/pan group), routes pointer events per-tool, and
// drives pixel painting onto offscreen layer canvases.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Konva from 'konva';
import {
  Stage as KonvaStage,
  Layer as KonvaLayer,
  Group as KonvaGroup,
  Rect as KonvaRect,
  Ellipse as KonvaEllipse,
  Line as KonvaLine,
  Text as KonvaText,
  Image as KonvaImage,
} from 'react-konva';
import type { LayerMeta, SelectionMask, Viewport } from '../types';
import { getLayerCanvas, flattenToCanvas, newTextLayer, newShapeLayer } from '../editor/model';
import { paintStroke, buildMaskCanvas, floodFill, pickColor } from '../editor/paintEngine';
import { rectSelection, ellipseSelection, lassoSelection } from '../editor/selection';
import { useImageEditorStore } from '../../../stores/imageEditorStore';

// Fix a Konva quirk: dragging inside a scaled container needs hit-on-drag.
Konva.hitOnDragEnabled = true;

interface ImageStageProps {
  workspaceId: string;
  onStageSize: (size: { w: number; h: number }) => void;
}

type DragSession =
  | { type: 'pan'; startScreenX: number; startScreenY: number; startPan: Viewport }
  | {
      type: 'paint';
      ctx: CanvasRenderingContext2D;
      layerX: number;
      layerY: number;
      lastX: number;
      lastY: number;
      maskCanvas: HTMLCanvasElement | null;
    }
  | {
      type: 'marquee' | 'ellipse-marquee' | 'crop' | 'shape-rect' | 'shape-ellipse' | 'shape-line';
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    }
  | { type: 'lasso'; points: number[] };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const normalizeRect = (x0: number, y0: number, x1: number, y1: number) => ({
  x: Math.min(x0, x1),
  y: Math.min(y0, y1),
  w: Math.abs(x1 - x0),
  h: Math.abs(y1 - y0),
});

const SelectionOverlay: React.FC<{ selection: SelectionMask }> = ({ selection }) => {
  const shapeRef = useRef<Konva.Shape | null>(null);

  useEffect(() => {
    const node = shapeRef.current;
    if (!node) return;
    let raf = 0;
    let offset = 0;
    const step = () => {
      offset = (offset + 0.2) % 8;
      node.dashOffset(offset);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const outline = selection.outline;
  if (!outline) return null;
  const dash = [4, 4];
  if (outline.kind === 'rect') {
    return (
      <>
        {/* Dim the area outside the selection for a pro feel. */}
        <KonvaRect x={0} y={0} width={selection.w} height={outline.y} fill="rgba(0,0,0,0.4)" listening={false} />
        <KonvaRect x={0} y={outline.y} width={outline.x} height={outline.h} fill="rgba(0,0,0,0.4)" listening={false} />
        <KonvaRect x={outline.x + outline.w} y={outline.y} width={selection.w - outline.x - outline.w} height={outline.h} fill="rgba(0,0,0,0.4)" listening={false} />
        <KonvaRect x={0} y={outline.y + outline.h} width={selection.w} height={selection.h - outline.y - outline.h} fill="rgba(0,0,0,0.4)" listening={false} />
        <KonvaRect
          ref={(node) => {
            shapeRef.current = node;
          }}
          x={outline.x}
          y={outline.y}
          width={outline.w}
          height={outline.h}
          stroke="#d87757"
          strokeWidth={1}
          dash={dash}
          strokeScaleEnabled={false}
          listening={false}
        />
      </>
    );
  }
  if (outline.kind === 'ellipse') {
    return (
      <KonvaEllipse
        ref={(node) => {
          shapeRef.current = node;
        }}
        x={outline.x + outline.w / 2}
        y={outline.y + outline.h / 2}
        radiusX={outline.w / 2}
        radiusY={outline.h / 2}
        stroke="#d87757"
        strokeWidth={1}
        dash={dash}
        strokeScaleEnabled={false}
        listening={false}
      />
    );
  }
  return (
    <KonvaLine
      ref={(node) => {
        shapeRef.current = node;
      }}
      points={outline.points}
      closed
      stroke="#d87757"
      strokeWidth={1}
      dash={dash}
      strokeScaleEnabled={false}
      listening={false}
    />
  );
};

export const ImageStage: React.FC<ImageStageProps> = ({ workspaceId, onStageSize }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const viewRef = useRef<Konva.Group>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const dragRef = useRef<DragSession | null>(null);
  const lastDimsRef = useRef<{ w: number; h: number } | null>(null);
  const fitDoneRef = useRef(false);

  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [rubber, setRubber] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [shapePreview, setShapePreview] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [lassoPoints, setLassoPoints] = useState<number[] | null>(null);

  const doc = useImageEditorStore((s) => s.docs[workspaceId]);
  const activeLayerId = useImageEditorStore((s) => s.activeLayerId[workspaceId]);
  const zoom = useImageEditorStore((s) => s.zoom[workspaceId] ?? 1);
  const pan = useImageEditorStore((s) => s.pan[workspaceId] ?? { x: 0, y: 0 });
  const tool = useImageEditorStore((s) => s.tool);
  const selection = useImageEditorStore((s) => s.selection);
  const fgColor = useImageEditorStore((s) => s.fgColor);
  const brushSize = useImageEditorStore((s) => s.brushSize);
  const brushOpacity = useImageEditorStore((s) => s.brushOpacity);
  const brushHardness = useImageEditorStore((s) => s.brushHardness);
  const redrawTick = useImageEditorStore((s) => s.redrawTick);

  // Redraw when DOM-driven pixel mutations (delete, flip, crop, undo/redo) occur.
  useEffect(() => {
    layerRef.current?.batchDraw();
  }, [redrawTick]);

  // ── Stage sizing ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setStageSize({ w: rect.width, h: rect.height });
      onStageSize({ w: rect.width, h: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onStageSize]);

  // ── Fit-to-view on document load / size change ───────────────────────────
  const fitView = useCallback(() => {
    const d = useImageEditorStore.getState().docs[workspaceId];
    if (!d || stageSize.w <= 0 || stageSize.h <= 0) return;
    const z = clamp(Math.min(stageSize.w / d.width, stageSize.h / d.height, 1) * 0.94, 0.02, 32);
    useImageEditorStore.getState().setZoom(workspaceId, z);
    useImageEditorStore.getState().setPan(workspaceId, {
      x: (stageSize.w - d.width * z) / 2,
      y: (stageSize.h - d.height * z) / 2,
    });
  }, [workspaceId, stageSize]);

  useEffect(() => {
    if (!doc) {
      lastDimsRef.current = null;
      fitDoneRef.current = false;
      return;
    }
    if (stageSize.w <= 0 || stageSize.h <= 0) return; // wait for the stage to measure
    if (fitDoneRef.current && lastDimsRef.current && lastDimsRef.current.w === doc.width && lastDimsRef.current.h === doc.height) return;
    lastDimsRef.current = { w: doc.width, h: doc.height };
    fitDoneRef.current = true;
    const t = requestAnimationFrame(fitView);
    return () => cancelAnimationFrame(t);
  }, [doc, stageSize, fitView]);

  // ── Coordinate helpers ──────────────────────────────────────────────────
  const getDocPoint = useCallback((): { x: number; y: number } | null => {
    const v = viewRef.current;
    if (!v) return null;
    const p = v.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : null;
  }, []);

  const zoomAt = useCallback(
    (screenPos: { x: number; y: number }, factor: number) => {
      const st = useImageEditorStore.getState();
      const z = st.zoom[workspaceId] ?? 1;
      const p = st.pan[workspaceId] ?? { x: 0, y: 0 };
      const newZoom = clamp(z * factor, 0.02, 32);
      const docX = (screenPos.x - p.x) / z;
      const docY = (screenPos.y - p.y) / z;
      st.setZoom(workspaceId, newZoom);
      st.setPan(workspaceId, { x: screenPos.x - docX * newZoom, y: screenPos.y - docY * newZoom });
    },
    [workspaceId],
  );

  // ── Pointer handlers ────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const st = useImageEditorStore.getState();
      const d = st.docs[workspaceId];
      if (!d) return;
      const p = getDocPoint();
      if (!p) return;

      if (tool === 'hand' || tool === 'zoom') {
        if (tool === 'hand') {
          dragRef.current = {
            type: 'pan',
            startScreenX: e.evt.clientX,
            startScreenY: e.evt.clientY,
            startPan: st.pan[workspaceId] ?? { x: 0, y: 0 },
          };
        } else {
          const pos = stageRef.current?.getPointerPosition();
          if (pos) zoomAt(pos, e.evt.shiftKey || e.evt.button === 2 ? 1 / 1.25 : 1.25);
        }
        return;
      }

      if (tool === 'brush' || tool === 'eraser') {
        const layer = st.ensureActiveRaster(workspaceId);
        if (!layer) return;
        st.commit(workspaceId);
        const ctx = getLayerCanvas(layer).getContext('2d')!;
        const maskCanvas = buildMaskCanvas(st.selection, d.width, d.height);
        dragRef.current = { type: 'paint', ctx, layerX: layer.x, layerY: layer.y, lastX: p.x, lastY: p.y, maskCanvas };
        st.markDirty(workspaceId, true);
        paintStroke(ctx, layer.x, layer.y, d.width, d.height, maskCanvas, p.x, p.y, p.x, p.y, {
          size: brushSize,
          opacity: brushOpacity,
          color: fgColor,
          hardness: brushHardness,
          erase: tool === 'eraser',
        });
        layerRef.current?.batchDraw();
        return;
      }

      if (tool === 'fill') {
        const layer = st.ensureActiveRaster(workspaceId);
        if (!layer) return;
        st.commit(workspaceId);
        const ctx = getLayerCanvas(layer).getContext('2d')!;
        const maskAt =
          st.selection && st.selection.bounds
            ? (lx: number, ly: number) => {
                const dx = lx + layer.x;
                const dy = ly + layer.y;
                if (dx < 0 || dy < 0 || dx >= d.width || dy >= d.height) return false;
                return st.selection!.data[dy * d.width + dx] > 0;
              }
            : null;
        floodFill(ctx, layer.width, layer.height, p.x - layer.x, p.y - layer.y, fgColor, 32, maskAt);
        layerRef.current?.batchDraw();
        return;
      }

      if (tool === 'eyedropper') {
        const color = pickColor(flattenToCanvas(d), p.x, p.y);
        if (color) st.setFgColor(color);
        return;
      }

      if (tool === 'text') {
        st.commit(workspaceId);
        const layer = newTextLayer('Text', 36, 'JetBrains Mono', fgColor);
        layer.x = p.x;
        layer.y = p.y;
        st.addLayer(workspaceId, layer);
        st.setActiveLayer(workspaceId, layer.id);
        // Stay on the text tool so users can drop multiple text layers.
        return;
      }

      if (tool === 'lasso') {
        dragRef.current = { type: 'lasso', points: [p.x, p.y] };
        setLassoPoints([p.x, p.y]);
        return;
      }

      if (tool === 'marquee' || tool === 'ellipse-marquee' || tool === 'crop') {
        dragRef.current = { type: tool, startX: p.x, startY: p.y, currentX: p.x, currentY: p.y };
        setRubber({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        return;
      }

      if (tool === 'shape-rect' || tool === 'shape-ellipse' || tool === 'shape-line') {
        dragRef.current = { type: tool, startX: p.x, startY: p.y, currentX: p.x, currentY: p.y };
        setShapePreview({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        return;
      }
    },
    [workspaceId, tool, brushSize, brushOpacity, brushHardness, fgColor, getDocPoint, zoomAt],
  );

  const handleMouseMove = useCallback(
    () => {
      const drag = dragRef.current;
      const st = useImageEditorStore.getState();
      if (!drag) return;
      const p = getDocPoint();
      if (!p) return;

      if (drag.type === 'pan') {
        return;
      }

      if (drag.type === 'paint') {
        const d = st.docs[workspaceId];
        if (!d) return;
        paintStroke(drag.ctx, drag.layerX, drag.layerY, d.width, d.height, drag.maskCanvas, drag.lastX, drag.lastY, p.x, p.y, {
          size: brushSize,
          opacity: brushOpacity,
          color: fgColor,
          hardness: brushHardness,
          erase: tool === 'eraser',
        });
        drag.lastX = p.x;
        drag.lastY = p.y;
        layerRef.current?.batchDraw();
        return;
      }

      if (drag.type === 'lasso') {
        drag.points.push(p.x, p.y);
        setLassoPoints([...drag.points]);
        return;
      }

      drag.currentX = p.x;
      drag.currentY = p.y;
      setRubber({ x0: drag.startX, y0: drag.startY, x1: p.x, y1: p.y });
      setShapePreview({ x0: drag.startX, y0: drag.startY, x1: p.x, y1: p.y });
    },
    [workspaceId, tool, brushSize, brushOpacity, brushHardness, fgColor, getDocPoint],
  );

  const handlePanMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const drag = dragRef.current;
      if (!drag || drag.type !== 'pan') return;
      const st = useImageEditorStore.getState();
      st.setPan(workspaceId, {
        x: drag.startPan.x + (e.evt.clientX - drag.startScreenX),
        y: drag.startPan.y + (e.evt.clientY - drag.startScreenY),
      });
    },
    [workspaceId],
  );

  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;
    const st = useImageEditorStore.getState();
    if (!drag) return;
    dragRef.current = null;

    const d = st.docs[workspaceId];
    if (!d) {
      setRubber(null);
      setShapePreview(null);
      setLassoPoints(null);
      return;
    }

    if (drag.type === 'marquee' || drag.type === 'ellipse-marquee' || drag.type === 'crop') {
      const r = normalizeRect(drag.startX, drag.startY, drag.currentX, drag.currentY);
      if (drag.type === 'crop') {
        if (r.w > 1 && r.h > 1) st.cropDocument(workspaceId, r);
      } else if (r.w > 1 && r.h > 1) {
        st.setSelection(
          drag.type === 'marquee' ? rectSelection(r.x, r.y, r.w, r.h, d.width, d.height) : ellipseSelection(r.x, r.y, r.w, r.h, d.width, d.height),
        );
      }
      setRubber(null);
      return;
    }

    if (drag.type === 'lasso') {
      if (drag.points.length >= 6) st.setSelection(lassoSelection(drag.points, d.width, d.height));
      setLassoPoints(null);
      return;
    }

    if (drag.type === 'shape-rect' || drag.type === 'shape-ellipse' || drag.type === 'shape-line') {
      const r = normalizeRect(drag.startX, drag.startY, drag.currentX, drag.currentY);
      const shapeKind = drag.type === 'shape-rect' ? 'rect' : drag.type === 'shape-ellipse' ? 'ellipse' : 'line';
      st.commit(workspaceId);
      const layer = newShapeLayer(shapeKind, Math.max(1, r.w), Math.max(1, r.h), fgColor, 'transparent', 0);
      layer.x = r.x;
      layer.y = r.y;
      st.addLayer(workspaceId, layer);
      st.setActiveLayer(workspaceId, layer.id);
      // Stay on the shape tool so users can draw multiple shapes.
      setShapePreview(null);
      return;
    }

    setRubber(null);
    setShapePreview(null);
    setLassoPoints(null);
  }, [workspaceId, fgColor]);

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const pos = stageRef.current?.getPointerPosition();
      if (!pos) return;
      zoomAt(pos, e.evt.deltaY < 0 ? 1.12 : 1 / 1.12);
    },
    [zoomAt],
  );

  const handleLayerDragEnd = useCallback(
    (layer: LayerMeta, e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Node;
      const newX = node.x() - layer.width / 2;
      const newY = node.y() - layer.height / 2;
      useImageEditorStore.getState().updateLayer(workspaceId, layer.id, { x: Math.round(newX), y: Math.round(newY) });
    },
    [workspaceId],
  );

  if (!doc) return null;

  const cursor = tool === 'hand' || tool === 'move' ? 'grab' : tool === 'brush' || tool === 'eraser' || tool === 'fill' ? 'crosshair' : tool === 'eyedropper' ? 'copy' : 'default';

  const renderLayerNode = (layer: LayerMeta) => {
    const common = {
      key: layer.id,
      x: layer.x + layer.width / 2,
      y: layer.y + layer.height / 2,
      offsetX: layer.width / 2,
      offsetY: layer.height / 2,
      rotation: layer.rotation,
      opacity: layer.opacity,
      globalCompositeOperation: (layer.blendMode === 'normal' ? 'source-over' : layer.blendMode) as CanvasRenderingContext2D['globalCompositeOperation'],
      visible: layer.visible,
      draggable: tool === 'move' && activeLayerId === layer.id && !layer.locked,
      onMouseDown: () => {
        if (tool === 'move' && activeLayerId !== layer.id) {
          useImageEditorStore.getState().setActiveLayer(workspaceId, layer.id);
        }
      },
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleLayerDragEnd(layer, e),
    };

    if (layer.kind === 'raster' || layer.kind === 'image') {
      return <KonvaImage {...common} image={getLayerCanvas(layer)} width={layer.width} height={layer.height} />;
    }
    if (layer.kind === 'text') {
      return (
        <KonvaText
          {...common}
          text={layer.text ?? ''}
          fontFamily={layer.fontFamily ?? 'JetBrains Mono'}
          fontSize={layer.fontSize ?? 36}
          fontStyle={(layer.fontStyle ?? 'normal') as 'normal' | 'italic' | 'bold'}
          fill={layer.fill ?? '#ffffff'}
        />
      );
    }
    if (layer.shape === 'ellipse') {
      return (
        <KonvaEllipse
          {...common}
          radiusX={layer.width / 2}
          radiusY={layer.height / 2}
          fill={layer.fill ?? '#ffffff'}
          stroke={layer.stroke ?? 'transparent'}
          strokeWidth={layer.strokeWidth ?? 0}
        />
      );
    }
    if (layer.shape === 'line') {
      return <KonvaLine {...common} points={[0, 0, layer.width, layer.height]} stroke={layer.fill ?? '#ffffff'} strokeWidth={Math.max(1, layer.strokeWidth ?? 2)} lineCap="round" />;
    }
    return (
      <KonvaRect
        {...common}
        width={layer.width}
        height={layer.height}
        fill={layer.fill ?? '#ffffff'}
        stroke={layer.stroke ?? 'transparent'}
        strokeWidth={layer.strokeWidth ?? 0}
      />
    );
  };

  const rubberRect = rubber ? normalizeRect(rubber.x0, rubber.y0, rubber.x1, rubber.y1) : null;
  const shapeRect = shapePreview ? normalizeRect(shapePreview.x0, shapePreview.y0, shapePreview.x1, shapePreview.y1) : null;

  return (
    <div ref={containerRef} className="image-stage__container">
      <KonvaStage
        ref={stageRef}
        width={stageSize.w}
        height={stageSize.h}
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => {
          handleMouseMove();
          handlePanMove(e);
        }}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.evt.preventDefault()}
        style={{ cursor }}
      >
        <KonvaLayer ref={layerRef}>
          <KonvaGroup ref={viewRef} x={pan.x} y={pan.y} scaleX={zoom} scaleY={zoom}>
            {doc.background !== 'transparent' && (
              <KonvaRect x={0} y={0} width={doc.width} height={doc.height} fill={doc.background} listening={false} />
            )}
            {doc.layers.map(renderLayerNode)}

            {selection && <SelectionOverlay selection={selection} />}

            {rubberRect && (tool === 'marquee' || tool === 'crop') && (
              <KonvaRect
                x={rubberRect.x}
                y={rubberRect.y}
                width={rubberRect.w}
                height={rubberRect.h}
                stroke={tool === 'crop' ? '#f1c40f' : '#ffffff'}
                strokeWidth={1}
                dash={[4, 4]}
                strokeScaleEnabled={false}
                listening={false}
              />
            )}
            {rubberRect && tool === 'crop' && rubberRect.w > 8 && rubberRect.h > 8 && (
              <>
                {/* Rule-of-thirds grid */}
                <KonvaLine points={[rubberRect.x + rubberRect.w / 3, rubberRect.y, rubberRect.x + rubberRect.w / 3, rubberRect.y + rubberRect.h]} stroke="rgba(241,196,15,0.55)" strokeWidth={1} listening={false} />
                <KonvaLine points={[rubberRect.x + (2 * rubberRect.w) / 3, rubberRect.y, rubberRect.x + (2 * rubberRect.w) / 3, rubberRect.y + rubberRect.h]} stroke="rgba(241,196,15,0.55)" strokeWidth={1} listening={false} />
                <KonvaLine points={[rubberRect.x, rubberRect.y + rubberRect.h / 3, rubberRect.x + rubberRect.w, rubberRect.y + rubberRect.h / 3]} stroke="rgba(241,196,15,0.55)" strokeWidth={1} listening={false} />
                <KonvaLine points={[rubberRect.x, rubberRect.y + (2 * rubberRect.h) / 3, rubberRect.x + rubberRect.w, rubberRect.y + (2 * rubberRect.h) / 3]} stroke="rgba(241,196,15,0.55)" strokeWidth={1} listening={false} />
                {/* Dim outside the crop area */}
                <KonvaRect x={0} y={0} width={rubberRect.x} height={doc.height} fill="rgba(0,0,0,0.45)" listening={false} />
                <KonvaRect x={rubberRect.x + rubberRect.w} y={0} width={doc.width - rubberRect.x - rubberRect.w} height={doc.height} fill="rgba(0,0,0,0.45)" listening={false} />
                <KonvaRect x={rubberRect.x} y={0} width={rubberRect.w} height={rubberRect.y} fill="rgba(0,0,0,0.45)" listening={false} />
                <KonvaRect x={rubberRect.x} y={rubberRect.y + rubberRect.h} width={rubberRect.w} height={doc.height - rubberRect.y - rubberRect.h} fill="rgba(0,0,0,0.45)" listening={false} />
              </>
            )}
            {rubberRect && tool === 'ellipse-marquee' && (
              <KonvaEllipse
                x={rubberRect.x + rubberRect.w / 2}
                y={rubberRect.y + rubberRect.h / 2}
                radiusX={rubberRect.w / 2}
                radiusY={rubberRect.h / 2}
                stroke="#ffffff"
                strokeWidth={1}
                dash={[4, 4]}
                strokeScaleEnabled={false}
                listening={false}
              />
            )}
            {lassoPoints && lassoPoints.length >= 2 && (
              <KonvaLine points={lassoPoints} stroke="#ffffff" strokeWidth={1} dash={[4, 4]} strokeScaleEnabled={false} listening={false} />
            )}
            {shapeRect && tool === 'shape-ellipse' && (
              <KonvaEllipse x={shapeRect.x + shapeRect.w / 2} y={shapeRect.y + shapeRect.h / 2} radiusX={shapeRect.w / 2} radiusY={shapeRect.h / 2} fill={fgColor} opacity={0.6} listening={false} />
            )}
            {shapeRect && tool === 'shape-line' && (
              <KonvaLine points={[shapeRect.x, shapeRect.y, shapeRect.x + shapeRect.w, shapeRect.y + shapeRect.h]} stroke={fgColor} strokeWidth={Math.max(1, brushSize)} lineCap="round" opacity={0.7} listening={false} />
            )}
            {shapeRect && tool === 'shape-rect' && (
              <KonvaRect x={shapeRect.x} y={shapeRect.y} width={shapeRect.w} height={shapeRect.h} fill={fgColor} opacity={0.6} listening={false} />
            )}
          </KonvaGroup>
        </KonvaLayer>
      </KonvaStage>
    </div>
  );
};
