import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createBaseScope } from '../engine/mathEngine';
import { recalculateAll } from '../engine/dependencies';
import type { MathBlockData } from '../engine/dependencies';
import { samplePlot3d } from '../engine/plot3dSample';
import type { Plot3dMode, Plot3dSample } from '../engine/plot3dSample';
import { useCanvasStore } from '../store/canvasStore';
import { plotPalettes } from '../theme';
import { t } from '../i18n';
import { useRegionDrag, useRegionResize } from './useRegionDrag';
import { IResize, IX } from './Icon';

const W = 560;
const HEADER = 170;
const N_MIN = 8;
const N_MAX = 100;

const fmt = (v: number) => {
  if (!isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1000 || a < 0.01) return v.toExponential(1);
  return String(Number(v.toPrecision(4)));
};

/** Цвет по высоте: синий → голубой → жёлтый → красный */
function colorFor(t: number, out: THREE.Color): THREE.Color {
  const c = Math.min(1, Math.max(0, t));
  out.setHSL(0.66 * (1 - c), 0.85, 0.5);
  return out;
}

function Plot3dBlockView({ block, scale }: { block: MathBlockData; scale: number }) {
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const updatePlot = useCanvasStore((s) => s.updatePlot);
  const select = useCanvasStore((s) => s.select);
  const toggleSelect = useCanvasStore((s) => s.toggleSelect);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const blocks = useCanvasStore((s) => s.blocks);
  const theme = useCanvasStore((s) => s.theme);
  const pal = plotPalettes[theme];
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);

  const boxRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const { onGripDown, onGripMove, onGripUp } = useRegionDrag(block.id, scale, false);
  const { onResizeDown, onResizeMove, onResizeUp } = useRegionResize(block.id, scale, boxRef, {
    height: true,
    minW: 360,
    maxW: 1200,
    minH: 340,
    maxH: 1400,
  });

  const fnText = block.plotFn ?? 'sin(sqrt(x^2+y^2))';
  const xmin = block.plotXmin ?? -5;
  const xmax = block.plotXmax ?? 5;
  const ymin = block.plotYmin ?? -5;
  const ymax = block.plotYmax ?? 5;
  const mode: Plot3dMode = block.plotMode ?? 'auto';
  const res = Math.min(N_MAX, Math.max(N_MIN, Math.round(block.plotResolution ?? 48)));
  const wire = block.plotWireframe ?? false;
  const pw = block.w ?? W;
  const ph = Math.max(240, (block.h ?? W) - HEADER);

  const { sample, err } = useMemo<{ sample: Plot3dSample | null; err: string | null }>(() => {
    try {
      if (!(xmin < xmax) || !(ymin < ymax)) return { sample: null, err: t('p3.needRange') };
      const mathBlocks = Object.values(blocks).filter((b) => b.kind === 'math');
      const { scope } = recalculateAll(mathBlocks);
      const base = { ...createBaseScope(), ...scope };
      const s = samplePlot3d(fnText, base, { xmin, xmax, ymin, ymax, res, mode });
      if (!s) {
        return {
          sample: null,
          err: t('p3.noDataHint'),
        };
      }
      return { sample: s, err: null };
    } catch (e) {
      return { sample: null, err: e instanceof Error ? e.message : String(e) };
    }
  }, [fnText, xmin, xmax, ymin, ymax, res, mode, blocks]);

  // ---- three.js сцена: пересоздаётся при смене данных/темы/каркаса ----
  useEffect(() => {
    const host = viewRef.current;
    if (!host || !sample) return;
    const w = host.clientWidth || pw;
    const h = host.clientHeight || ph;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(4.4, -5.6, 4.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(3, 4, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-4, -2, 3);
    scene.add(fill);

    // Нормализация данных в бокс SX×SY×SZ (тултип показывает реальные значения)
    const SX = 4;
    const SY = 4;
    const SZ = 2.6;
    const X0 = sample.xmin;
    const X1 = sample.xmax;
    const Y0 = sample.ymin;
    const Y1 = sample.ymax;
    const Z0 = sample.zmin;
    const Z1 = sample.zmax;
    const nx = (x: number) => ((x - X0) / (X1 - X0 || 1) - 0.5) * SX;
    const ny = (y: number) => ((y - Y0) / (Y1 - Y0 || 1) - 0.5) * SY;
    const nz = (z: number) => ((z - Z0) / (Z1 - Z0 || 1) - 0.5) * SZ;
    const unx = (v: number) => (v / SX + 0.5) * (X1 - X0) + X0;
    const uny = (v: number) => (v / SY + 0.5) * (Y1 - Y0) + Y0;
    const unz = (v: number) => (v / SZ + 0.5) * (Z1 - Z0) + Z0;

    const disposables: THREE.BufferGeometry[] = [];
    const tmpC = new THREE.Color();

    // Рамка бокса + сетка пола (цвета из палитры темы)
    const axisHex = new THREE.Color(pal.axis).getHex();
    const frameHex = new THREE.Color(pal.frame).getHex();
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(SX, SY, SZ)),
      new THREE.LineBasicMaterial({ color: axisHex, transparent: true, opacity: 0.9 }),
    );
    scene.add(box);
    disposables.push(box.geometry);
    const grid = new THREE.GridHelper(SX, 8, axisHex, frameHex);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -SZ / 2;
    const gm = grid.material as THREE.Material;
    gm.transparent = true;
    gm.opacity = 0.35;
    scene.add(grid);
    disposables.push(grid.geometry);

    let rayTargets: THREE.Object3D[] = [];
    let pointData: { x: number; y: number; z: number }[] | null = null;

    if (sample.mode === 'surface') {
      const { gx, gy, zs, cols, rows } = sample;
      const pos = new Float32Array(cols * rows * 3);
      const col = new Float32Array(cols * rows * 3);
      const valid = new Array<boolean>(cols * rows).fill(false);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const z = zs[r]?.[c] ?? null;
          if (z === null || !isFinite(z)) {
            pos[i * 3] = 0;
            pos[i * 3 + 1] = 0;
            pos[i * 3 + 2] = 0;
            continue;
          }
          valid[i] = true;
          pos[i * 3] = nx(gx[c] ?? 0);
          pos[i * 3 + 1] = ny(gy[r] ?? 0);
          pos[i * 3 + 2] = nz(z);
          colorFor((z - Z0) / (Z1 - Z0 || 1), tmpC);
          col[i * 3] = tmpC.r;
          col[i * 3 + 1] = tmpC.g;
          col[i * 3 + 2] = tmpC.b;
        }
      }
      const idx: number[] = [];
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = r * cols + c;
          const b = a + 1;
          const d = a + cols;
          const e = d + 1;
          if (valid[a] && valid[b] && valid[d]) idx.push(a, d, b);
          if (valid[b] && valid[d] && valid[e]) idx.push(b, d, e);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      disposables.push(g);
      const mesh = new THREE.Mesh(
        g,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.08, side: THREE.DoubleSide }),
      );
      scene.add(mesh);
      rayTargets = [mesh];
      if (wire) {
        const wmesh = new THREE.Mesh(
          g,
          new THREE.MeshBasicMaterial({ wireframe: true, color: new THREE.Color(pal.legend).getHex(), transparent: true, opacity: 0.22 }),
        );
        wmesh.position.z = 0.001;
        scene.add(wmesh);
      }
    } else {
      const pts = sample.pts;
      pointData = pts;
      const pos = new Float32Array(pts.length * 3);
      const col = new Float32Array(pts.length * 3);
      pts.forEach((p, i) => {
        pos[i * 3] = nx(p.x);
        pos[i * 3 + 1] = ny(p.y);
        pos[i * 3 + 2] = nz(p.z);
        colorFor((p.z - Z0) / (Z1 - Z0 || 1), tmpC);
        col[i * 3] = tmpC.r;
        col[i * 3 + 1] = tmpC.g;
        col[i * 3 + 2] = tmpC.b;
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      disposables.push(g);
      const cloud = new THREE.Points(
        g,
        new THREE.PointsMaterial({ size: 0.09, vertexColors: true, sizeAttenuation: true }),
      );
      scene.add(cloud);
      rayTargets = [cloud];
    }

    // ---- hover: рейкаст + HTML-тултип с реальными координатами ----
    const ray = new THREE.Raycaster();
    if (ray.params.Points) ray.params.Points.threshold = 0.14;
    const tip = tipRef.current;
    const showTip = (clientX: number, clientY: number, x: number, y: number, z: number, extra?: string) => {
      if (!tip || !host) return;
      const r = host.getBoundingClientRect();
      tip.style.display = 'block';
      tip.style.left = `${Math.min(r.width - 170, Math.max(4, clientX - r.left + 14))}px`;
      tip.style.top = `${Math.max(4, clientY - r.top - 10)}px`;
      tip.innerHTML =
        `<div>x = ${fmt(x)}</div><div>y = ${fmt(y)}</div><div>z = ${fmt(z)}</div>` +
        (extra ? `<div style="opacity:.7">${extra}</div>` : '');
    };
    const hideTip = () => {
      if (tip) tip.style.display = 'none';
    };
    const onMove = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * 2 - 1;
      const py = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(new THREE.Vector2(px, py), camera);
      const hits = ray.intersectObjects(rayTargets, false);
      const hit = hits[0];
      if (!hit) {
        hideTip();
        return;
      }
      if (pointData && hit.index !== undefined) {
        const p = pointData[hit.index];
        if (p) {
          showTip(e.clientX, e.clientY, p.x, p.y, p.z, `#${hit.index}`);
          return;
        }
      }
      const v = hit.point;
      showTip(e.clientX, e.clientY, unx(v.x), uny(v.y), unz(v.z), sample.mode === 'surface' ? sample.expr : undefined);
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', hideTip);

    // Колесо над 3D — только зум модели: глушим всплытие к панораме листа.
    // (слушатель листа висит на предке; наш — на обёртке, срабатывает раньше по всплытию)
    const stopWheel = (e: WheelEvent) => e.stopPropagation();
    host.addEventListener('wheel', stopWheel);

    const ro = new ResizeObserver(() => {
      const nw = host.clientWidth || w;
      const nh = host.clientHeight || h;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    ro.observe(host);

    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener('wheel', stopWheel);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', hideTip);
      controls.dispose();
      for (const g of disposables) g.dispose();
      (box.material as THREE.Material).dispose();
      (grid.material as THREE.Material).dispose();
      scene.clear();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample, theme, wire, pw, ph]);

  const selected = selectedIds.includes(block.id);
  const sub =
    sample?.mode === 'points'
      ? t('p3.points', { n: sample.pts.length, lo: fmt(sample.zmin), hi: fmt(sample.zmax) })
      : sample
        ? t('p3.grid', { c: sample.cols, r: sample.rows, lo: fmt(sample.zmin), hi: fmt(sample.zmax) })
        : '';

  return (
    <div ref={boxRef} className="absolute z-10" style={{ left: block.x, top: block.y, width: pw, height: ph + HEADER }}>
      <div
        data-block-id={block.id}
        className={`weng-block relative w-full h-full rounded-xl border px-3 py-2 flex flex-col bg-[var(--sheet)] shadow-[0_8px_30px_rgba(0,0,0,0.35)] group ${
          selected ? 'border-[var(--accent-line)]' : 'border-[var(--line)]'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey) toggleSelect(block.id);
          else select(block.id);
        }}
      >
        <div
          className="flex items-center gap-2 mb-1 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <span className="text-[var(--faint)] text-[12px]" aria-hidden="true">⠿</span>
          <span className="text-[11px] uppercase tracking-wider text-[var(--accent-ink)]">plot3d</span>
          <label htmlFor={`plot3dfn-${block.id}`} className="sr-only">{t('p3.fnLabel')}</label>
          <input
            id={`plot3dfn-${block.id}`}
            className="math-input flex-1 min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 py-0.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent-line)] select-text"
            value={fnText}
            onChange={(e) => updatePlot(block.id, { plotFn: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            spellCheck={false}
            title={t('p3.fnTitle')}
          />
          <button
            type="button"
            className="p-1.5 text-[var(--faint)] hover:text-[var(--danger)] cursor-pointer"
            onClick={() => removeBlock(block.id)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={t('p3.delete')}
          >
            <IX />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-[12px] text-[var(--ink-soft)] mb-1">
          <label>xmin <input type="number" aria-label={t('p3.xmin')} className="w-[64px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text" value={xmin} onChange={(e) => updatePlot(block.id, { plotXmin: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
          <label>xmax <input type="number" aria-label={t('p3.xmax')} className="w-[64px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text" value={xmax} onChange={(e) => updatePlot(block.id, { plotXmax: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
          <label>ymin <input type="number" aria-label={t('p3.ymin')} className="w-[64px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text" value={ymin} onChange={(e) => updatePlot(block.id, { plotYmin: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
          <label>ymax <input type="number" aria-label={t('p3.ymax')} className="w-[64px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text" value={ymax} onChange={(e) => updatePlot(block.id, { plotYmax: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
          <label>{t('p3.modeLabel')}
            <select aria-label={t('p3.mode')} className="ml-1 min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)]" value={mode} onChange={(e) => updatePlot(block.id, { plotMode: e.target.value as Plot3dMode })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <option value="auto">auto</option>
              <option value="surface">surface</option>
              <option value="points">points</option>
              <option value="matrix">matrix</option>
            </select>
          </label>
          <label>{t('p3.resLabel')} <input type="number" aria-label={t('p3.res')} min={N_MIN} max={N_MAX} step={1} className="w-[60px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text" value={res} onChange={(e) => updatePlot(block.id, { plotResolution: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input type="checkbox" aria-label={t('p3.wire')} className="w-4 h-4 accent-[var(--accent-line)]" checked={wire} onChange={(e) => updatePlot(block.id, { plotWireframe: e.target.checked })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} />
            {t('p3.wireLabel')}
          </label>
        </div>

        {err || !sample ? (
          <div className="text-[var(--danger)] text-[12px]" role="alert">⚠ {err ?? t('p3.noData')}</div>
        ) : (
          <div
            ref={viewRef}
            className="relative rounded-lg border border-[var(--line)] overflow-hidden"
            style={{ width: pw - 24, height: ph, background: pal.svgBg, touchAction: 'none' }}
            role="img"
            aria-label={t('p3.aria', { fn: fnText, mode: sample.mode, sub })}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <div
              ref={tipRef}
              className="math-input absolute z-10 hidden pointer-events-none text-[11px] leading-4 px-2 py-1 rounded-md border border-[var(--line)]"
              style={{ display: 'none', background: 'var(--chrome)', color: 'var(--chrome-ink)' }}
            />
            <div className="absolute left-2 top-1.5 math-input text-[10px] px-1.5 py-0.5 rounded pointer-events-none" style={{ background: 'color-mix(in srgb, var(--chrome) 78%, transparent)', color: 'var(--chrome-ink)' }}>
              {sample.mode} • {sub}
            </div>
          </div>
        )}
        <div className="text-[11px] text-[var(--faint)] mt-1 truncate">
          {t('p3.footer')}
        </div>
        <span
          className="absolute -right-2 -bottom-2 p-1.5 cursor-nwse-resize opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--accent-line)] select-none"
          style={{ opacity: selected ? 1 : undefined }}
          title={t('p3.resize')}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <IResize />
        </span>
      </div>
    </div>
  );
}

export default memo(Plot3dBlockView);
