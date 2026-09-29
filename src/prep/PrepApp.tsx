import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Connection, Photo } from '../types';
import { brightnessOf, extractPalette, saturationOf } from '../analysis/color';
import { buildZip, serializeConnections, serializePhotos } from '../analysis/exportZip';
import { nextId } from '../analysis/ids';
import { computeLayout, overlapCount } from '../analysis/layout';
import { computeShapedLayout, type ShapedLayoutResult } from '../analysis/shapedLayout';
import { shapeMask, type Mask } from '../analysis/shapes';
import { generatePlaceholders } from '../analysis/placeholders';
import { canEncodeWebp, resizePhoto, WEBP_MSG } from '../analysis/resize';
import { buildConnections, degrees, validateDataset, type PhotoBase } from '../analysis/similarity';
import { DropZone } from './DropZone';
import { LayoutPreview } from './LayoutPreview';
import { PhotoList } from './PhotoList';
import { maskFromFile, ShapePicker, SHAPE_NAMES } from './ShapePicker';
import { DEFAULT_K, loadK, loadOutline, loadShape, saveK, saveOutline, saveShape, type ShapeChoice } from './shapeStorage';

function invertMask(m: Mask): Mask {
  return { width: m.width, height: m.height, data: m.data.map((v) => 1 - v) };
}

interface Entry {
  base: PhotoBase;
  existing: boolean;
  fileName?: string;
  sm?: Blob;
  lg?: Blob;
  thumb: string;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function PrepApp() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef<Entry[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const kSaved = useRef(loadK());
  const [k, setK] = useState(kSaved.current ?? DEFAULT_K);
  const [inferredK, setInferredK] = useState<number | null>(null);
  const [connsMissing, setConnsMissing] = useState(false);
  const changeK = (v: number) => {
    kSaved.current = v;
    saveK(v);
    setInferredK(null);
    setK(v);
  };
  const [outline, setOutline] = useState(loadOutline);
  useEffect(() => saveOutline(outline), [outline]);
  const [webpOk, setWebpOk] = useState<boolean | null>(null);
  useEffect(() => {
    void canEncodeWebp().then(setWebpOk);
  }, []);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orphans, setOrphans] = useState<string[]>([]);
  const [saved] = useState(loadShape);
  const [shape, setShape] = useState<ShapeChoice>(saved.shape);
  const [invert, setInvert] = useState(saved.invert);
  const [customRaw, setCustomRaw] = useState<Mask | null>(saved.custom);
  const [shapeError, setShapeError] = useState<string | null>(null);
  useEffect(() => saveShape({ shape, invert, custom: customRaw }), [shape, invert, customRaw]);
  // Same object for the same (image, invert), so the analysis caches keep hitting.
  const customMask = useMemo(() => (customRaw ? (invert ? invertMask(customRaw) : customRaw) : null), [customRaw, invert]);
  const mask = shape === 'custom' ? customMask : shape === 'organic' ? null : shapeMask(shape);

  const pickCustom = useCallback(async (f: File) => {
    try {
      setCustomRaw(await maskFromFile(f));
      setShape('custom');
      setShapeError(null);
    } catch {
      setShapeError(`${f.name}: could not be read as an image`);
    }
  }, []);

  const commit = useCallback((next: Entry[]) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const images = files.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
      const unsupported = files
        .filter((f) => !images.includes(f))
        .map((f) => `${f.name}: not supported — export as JPG or PNG`);
      if (unsupported.length) setProblems(unsupported);
      if (images.length === 0) return;
      queue.current = queue.current.then(async () => {
        setBusy(true);
        const failed: string[] = [...unsupported];
        for (let i = 0; i < images.length; i++) {
          setProgress({ done: i, total: images.length });
          await new Promise((r) => setTimeout(r, 0));
          const file = images[i];
          try {
            const res = await resizePhoto(file);
            const id = nextId(entriesRef.current.map((e) => e.base.id), file.name);
            const base: PhotoBase = {
              id,
              src: { sm: `photos/${id}-sm.webp`, lg: `photos/${id}-lg.webp` },
              width: res.width,
              height: res.height,
              aspect: Math.round((res.width / res.height) * 1000) / 1000,
              colors: extractPalette(res.small),
              brightness: brightnessOf(res.small),
              saturation: saturationOf(res.small),
            };
            commit([...entriesRef.current, { base, existing: false, fileName: file.name, sm: res.sm, lg: res.lg, thumb: URL.createObjectURL(res.sm) }]);
          } catch (e) {
            failed.push(`${file.name}: ${e instanceof Error ? e.message : 'could not be read'}`);
          }
        }
        setProgress(null);
        setProblems(failed);
        setBusy(false);
      });
    },
    [commit],
  );

  const placeholders = useCallback(async () => {
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    let files: File[] = [];
    try {
      files = await generatePlaceholders(40);
    } catch (e) {
      setProblems([`placeholders: ${e instanceof Error ? e.message : 'could not be generated'}`]);
    } finally {
      setProgress(null);
      setBusy(false);
    }
    if (files.length) addFiles(files);
  }, [addFiles]);

  const loadExisting = useCallback(
    async (files: File[]) => {
      const failed: string[] = [];
      let loaded: Entry[] = [];
      let connCount: number | null = null;
      for (const f of files) {
        try {
          const data = JSON.parse(await f.text());
          if (!Array.isArray(data)) throw new Error('expected a list');
          if (data.length && data[0].colors) {
            for (const p of data as Photo[]) {
              if (entriesRef.current.some((e) => e.existing && e.base.id === p.id) || loaded.some((e) => e.base.id === p.id)) continue;
              const { x: _x, y: _y, ...base } = p;
              loaded.push({ base, existing: true, thumb: import.meta.env.BASE_URL + p.src.sm });
            }
          }
          // connections.json is only used to match the connection count; connections are recomputed from the palettes.
          if (data.length && data[0].source && data[0].target) connCount = data.length;
        } catch (e) {
          failed.push(`${f.name}: ${e instanceof Error ? e.message : 'not valid JSON'}`);
        }
      }
      // Re-id new entries (added before loading) against the union of all ids; existing ids never change.
      const used: string[] = loaded.map((e) => e.base.id);
      const reided = entriesRef.current.map((e) => {
        if (e.existing) {
          used.push(e.base.id);
          return e;
        }
        if (!used.includes(e.base.id) && !loaded.some((l) => l.base.id === e.base.id)) {
          used.push(e.base.id);
          return e;
        }
        const id = nextId(used, e.fileName ?? e.base.id.replace(/^\d+-/, ''));
        used.push(id);
        return { ...e, base: { ...e.base, id, src: { sm: `photos/${id}-sm.webp`, lg: `photos/${id}-lg.webp` } } };
      });
      commit([...reided, ...loaded]);
      // Loading photos.json and connections.json together always sets the slider to match the file, even if a value is saved.
      if (connCount !== null && loaded.length > 0) {
        const bases = loaded.map((e) => e.base);
        let best = DEFAULT_K, bestDiff = Infinity;
        for (let c = 2; c <= 5; c++) {
          const diff = Math.abs(buildConnections(bases, c).length - connCount);
          if (diff < bestDiff) { best = c; bestDiff = diff; }
        }
        kSaved.current = best;
        saveK(best);
        setK(best);
        setInferredK(best);
        setConnsMissing(false);
      } else if (loaded.length > 0) {
        setInferredK(null);
        setConnsMissing(true);
      }
      setSelected(null);
      setProblems(failed);
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      const gone = entriesRef.current.find((e) => e.base.id === id);
      if (gone && !gone.existing) URL.revokeObjectURL(gone.thumb);
      if (gone?.existing) setOrphans((o) => [...o, id]);
      commit(entriesRef.current.filter((e) => e.base.id !== id));
      setSelected((s) => (s === id ? null : s));
    },
    [commit],
  );

  const organic = useMemo(() => {
    const bases = entries.map((e) => e.base);
    const conns: Connection[] = buildConnections(bases, k);
    const pos = computeLayout(bases, conns);
    return { bases, conns, pos, overlaps: overlapCount(bases, pos) };
  }, [entries, k]);

  // Shaped layouts are never computed while photos are still being added (that would run once per photo).
  // While busy the Organic result is shown; the shaped one is computed when busy ends, once per (entries, k, shape).
  const shapedCache = useRef<{ organic: typeof organic; mask: Mask; result: ShapedLayoutResult } | null>(null);
  const shaped = useMemo<ShapedLayoutResult | null>(() => {
    if (!mask || busy || organic.bases.length === 0) return null;
    const c = shapedCache.current;
    if (c && c.organic === organic && c.mask === mask) return c.result;
    const result = computeShapedLayout(organic.bases, organic.conns, mask);
    shapedCache.current = { organic, mask, result };
    return result;
  }, [organic, mask, busy]);

  const { photos, connections, errors } = useMemo(() => {
    const pos = shaped?.positions ?? organic.pos;
    const ps: Photo[] = organic.bases.map((b) => ({ ...b, ...pos.get(b.id)! }));
    return { photos: ps, connections: organic.conns, errors: entries.length ? validateDataset(ps, organic.conns) : [] };
  }, [entries, organic, shaped]);
  const usable = shaped && !shaped.fallback ? shaped : null;
  const layoutName = shaped?.fallback
    ? `Organic (${SHAPE_NAMES[shape].toLowerCase()} unusable)`
    : SHAPE_NAMES[shape];
  const pending = shape !== 'organic' && !shaped && photos.length > 0;

  const deg = useMemo(() => degrees(photos, connections), [photos, connections]);
  const neighbors = useMemo(() => {
    const m = new Map<string, number>();
    if (selected)
      for (const c of connections) {
        if (c.source === selected) m.set(c.target, c.strength);
        else if (c.target === selected) m.set(c.source, c.strength);
      }
    return m;
  }, [selected, connections]);

  const newCount = entries.filter((e) => !e.existing).length;
  const hasExisting = entries.some((e) => e.existing);
  const canDownload = photos.length > 0 && errors.length === 0 && !busy;

  const downloadZip = async () => {
    const images = entries.filter((e) => !e.existing).map((e) => ({ id: e.base.id, sm: e.sm!, lg: e.lg! }));
    download(await buildZip(photos, connections, images), 'visual-threads-photos.zip');
  };

  return (
    <div className="prep">
      <h1>Photo Prep</h1>
      <p className="lede">Drop your photos here. Colors are analyzed on this computer. Nothing is uploaded.</p>

      {webpOk === false && <p className="errors" role="alert">{WEBP_MSG}</p>}

      <DropZone onFiles={addFiles} disabled={busy} />

      <div className="row">
        <button onClick={placeholders} disabled={busy}>Generate placeholders</button>
        <label className="button">
          Load existing photos.json
          <input
            type="file"
            accept=".json,application/json"
            multiple
            hidden
            onChange={(e) => {
              loadExisting([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </label>
        <label className="slider">
          Connections per photo: <b>{k}</b>
          <input type="range" min={2} max={5} step={1} value={k} onChange={(e) => changeK(Number(e.target.value))} />
        </label>
      </div>
      <p className="hint">Pick src/data/photos.json and src/data/connections.json together (hold Cmd to select both) so the connection count matches your existing data.</p>
      {connsMissing && <p className="note" role="status">Connections weren't loaded, so the connections per photo is {k}. If your existing data used a different number, load connections.json too.</p>}
      {inferredK !== null && <p className="note" role="status">Connections per photo set to {inferredK} to match your existing data.</p>}

      <ShapePicker
        shape={shape}
        invert={invert}
        customMask={customMask}
        onShape={(s) => { setShape(s); setShapeError(null); }}
        onCustomFile={pickCustom}
        onInvert={setInvert}
        error={shapeError}
      />

      {progress && (
        <p className="progress" role="status">
          {progress.total ? `Analyzing ${Math.min(progress.done + 1, progress.total)} / ${progress.total}…` : 'Drawing placeholders…'}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="errors">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      {photos.length > 0 && (
        <>
          <div className="row downloads">
            <button className="primary" onClick={downloadZip} disabled={!canDownload}>Download all (.zip)</button>
            <button
              className="link"
              onClick={() => download(new Blob([serializePhotos(photos)], { type: 'application/json' }), 'photos.json')}
              disabled={!canDownload}
            >
              photos.json
            </button>
            <button
              className="link"
              onClick={() => download(new Blob([serializeConnections(connections)], { type: 'application/json' }), 'connections.json')}
              disabled={!canDownload}
            >
              connections.json
            </button>
            <span className="layout-name">Layout: {layoutName}</span>
            <span className="count">
              {photos.length} photos, {connections.length} connections{newCount ? `, ${newCount} new` : ''}
            </span>
          </div>
          {shaped?.fallback && (
            <p className="errors" role="alert">This image doesn't give a usable shape. Try a bold, filled silhouette.</p>
          )}
          {hasExisting && (
            <p className="note">Existing images stay in public/photos. The zip only contains new images.</p>
          )}
          {orphans.map((id) => (
            <p className="note" key={id}>Also delete public/photos/{id}-sm.webp and -lg.webp from the project.</p>
          ))}
          {errors.length > 0 && (
            <div className="errors">
              <p>Downloads are off until these are fixed:</p>
              <ul>{errors.slice(0, 12).map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}

          <div className="cols">
            <PhotoList
              photos={photos}
              thumbs={new Map(entries.map((e) => [e.base.id, e.thumb]))}
              degrees={deg}
              selected={selected}
              neighbors={neighbors}
              onSelect={(id) => setSelected((s) => (s === id ? null : id))}
              onRemove={remove}
            />
            <div className="preview-col">
              <LayoutPreview
                photos={photos}
                connections={connections}
                selected={selected}
                neighbors={neighbors}
                onSelect={setSelected}
                underlay={outline && usable?.frame ? { mask: usable.mask, frame: usable.frame } : null}
              />
              {shape !== 'organic' && (
                <label className="outline-toggle">
                  <input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} /> Show outline
                </label>
              )}
              <p className="stats" role="status">
                {pending
                  ? 'Shaping the layout…'
                  : usable
                    ? `Avg connection: ${usable.ratio.toFixed(2)}× Organic · Overlaps: ${usable.stats.overlaps}`
                    : `Overlaps: ${organic.overlaps}`}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
