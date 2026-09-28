import { useCallback, useMemo, useRef, useState } from 'react';
import type { Connection, Photo } from '../types';
import { brightnessOf, extractPalette, saturationOf } from '../analysis/color';
import { buildZip, serializeConnections, serializePhotos } from '../analysis/exportZip';
import { nextId } from '../analysis/ids';
import { computeLayout } from '../analysis/layout';
import { generatePlaceholders } from '../analysis/placeholders';
import { resizePhoto } from '../analysis/resize';
import { buildConnections, degrees, validateDataset, type PhotoBase } from '../analysis/similarity';
import { DropZone } from './DropZone';
import { LayoutPreview } from './LayoutPreview';
import { PhotoList } from './PhotoList';

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
  const [k, setK] = useState(3);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orphans, setOrphans] = useState<string[]>([]);

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
          // connections.json needs no reading: connections are recomputed from the palettes.
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

  const { photos, connections, errors } = useMemo(() => {
    const bases = entries.map((e) => e.base);
    const conns: Connection[] = buildConnections(bases, k);
    const pos = computeLayout(bases, conns);
    const ps: Photo[] = bases.map((b) => ({ ...b, ...pos.get(b.id)! }));
    return { photos: ps, connections: conns, errors: entries.length ? validateDataset(ps, conns) : [] };
  }, [entries, k]);

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
          <input type="range" min={2} max={5} step={1} value={k} onChange={(e) => setK(Number(e.target.value))} />
        </label>
      </div>
      <p className="hint">Pick photos.json and connections.json together, or just photos.json.</p>

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
            <span className="count">
              {photos.length} photos, {connections.length} connections{newCount ? `, ${newCount} new` : ''}
            </span>
          </div>
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
            <LayoutPreview photos={photos} connections={connections} selected={selected} neighbors={neighbors} onSelect={setSelected} />
          </div>
        </>
      )}
    </div>
  );
}
