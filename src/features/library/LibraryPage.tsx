import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Download, FilePlus2, FlaskConical, FolderOpen, PenTool, Scale, Search, Trash2, Upload, Archive } from 'lucide-react';
import { EXAMPLES } from '../../data/examples';
import { deleteDiagram, duplicateDiagram, exportBackup, importBackup, listDiagrams, type Backup, type StoredDiagram } from '../../storage/db';
import { createBlankDiagram, importBpmn, openExample, openExamplePair } from '../../services/diagrams';
import { useToast } from '../../app/toast';
import { EmptyState, downloadText, safeFileName } from '../../components/ui';
import { buildBpmnXml } from '../../domain/bpmn/builder';
import { BpmnViewer } from '../../components/BpmnViewer';
import { Modal } from '../../components/ui';
import { getConcept } from '../../data/lessons';

function svgDataUrl(svg?: string) {
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : undefined;
}

export default function LibraryPage() {
  const [diagrams, setDiagrams] = useState<StoredDiagram[] | null>(null);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const navigate = useNavigate();
  const notify = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  const reload = () => listDiagrams().then(setDiagrams);
  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(
    () => (diagrams ?? []).filter((d) => !query || d.name.toLowerCase().includes(query.toLowerCase()) || d.description?.toLowerCase().includes(query.toLowerCase())),
    [diagrams, query]
  );
  const previewExample = EXAMPLES.find((e) => e.id === preview);

  const open = async (exampleId: string) => {
    const d = await openExample(exampleId);
    notify(`“${d.name}” added to your library`, { kind: 'success' });
    navigate(`/modeler/${d.id}`);
  };

  return (
    <div className="page">
      <div className="page-narrow">
        <div className="page-header">
          <div>
            <div className="eyebrow">Library</div>
            <h1>Your diagrams</h1>
            <p>All models are stored locally in this browser (IndexedDB) — no account or server is needed. Export a backup to move them to another device.</p>
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={async () => navigate(`/modeler/${(await createBlankDiagram()).id}`)}>
              <FilePlus2 size={16} /> New diagram
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Import BPMN
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".bpmn,.xml"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const { diagram } = await importBpmn(await f.text(), f.name);
                  notify(`Imported “${diagram.name}”`, { kind: 'success' });
                  reload();
                } catch (err) {
                  notify('Import failed', { kind: 'error', message: err instanceof Error ? err.message : String(err) });
                }
              }}
            />
          </div>
        </div>

        <div className="row" style={{ marginBottom: 14 }}>
          <div className="row" style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--text-subtle)' }} aria-hidden />
            <input className="input" style={{ paddingLeft: 32, width: '100%' }} placeholder="Search your diagrams" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search diagrams" />
          </div>
          <span className="spacer" />
          <button
            className="btn btn-sm"
            onClick={async () => downloadText(`bpmn-studio-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportBackup(), null, 2), 'application/json')}
          >
            <Archive size={14} /> Export backup
          </button>
          <button className="btn btn-sm" onClick={() => backupRef.current?.click()}>
            <Upload size={14} /> Restore backup
          </button>
          <input
            ref={backupRef}
            type="file"
            accept=".json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const n = await importBackup(JSON.parse(await f.text()) as Backup);
                notify(`Restored ${n} diagram(s)`, { kind: 'success' });
                reload();
              } catch (err) {
                notify('Restore failed', { kind: 'error', message: err instanceof Error ? err.message : String(err) });
              }
            }}
          />
        </div>

        {diagrams === null ? (
          <p className="muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="card">
            <EmptyState icon={<FolderOpen size={32} />} title={query ? 'No matching diagrams' : 'No diagrams yet'}>
              <p>Create a new diagram or start from one of the examples below.</p>
            </EmptyState>
          </div>
        ) : (
          <div className="card-grid">
            {filtered.map((d) => (
              <article key={d.id} className="card diagram-card">
                <button className="diagram-thumb" style={{ border: 'none', cursor: 'pointer', width: '100%' }} onClick={() => navigate(`/modeler/${d.id}`)} aria-label={`Open ${d.name}`}>
                  {d.svg ? <img src={svgDataUrl(d.svg)} alt="" /> : <PenTool size={28} color="var(--text-subtle)" />}
                </button>
                <div className="diagram-card-body">
                  <div className="row">
                    <h3>{d.name}</h3>
                    {d.role && <span className={`badge ${d.role === 'as-is' ? 'badge-primary' : 'badge-accent'}`}>{d.role.toUpperCase()}</span>}
                  </div>
                  <div className="subtle">
                    v{d.version} · updated {new Date(d.updatedAt).toLocaleString()}
                  </div>
                  <span className="spacer" />
                  <div className="row">
                    <button className="btn btn-sm btn-primary" onClick={() => navigate(`/modeler/${d.id}`)}>
                      <PenTool size={14} /> Open
                    </button>
                    <button className="btn btn-sm" onClick={() => navigate(`/simulate/${d.id}`)} title="Performance simulation">
                      <FlaskConical size={14} />
                    </button>
                    <button
                      className="btn btn-sm"
                      title="Duplicate"
                      onClick={async () => {
                        await duplicateDiagram(d.id);
                        reload();
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    <button className="btn btn-sm" title="Download BPMN" onClick={() => downloadText(`${safeFileName(d.name)}.bpmn`, d.xml, 'application/xml')}>
                      <Download size={14} />
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      title="Delete"
                      onClick={async () => {
                        if (!window.confirm(`Delete “${d.name}”? This cannot be undone.`)) return;
                        await deleteDiagram(d.id);
                        reload();
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="page-header" style={{ marginTop: 36 }}>
          <div>
            <div className="eyebrow">Example library</div>
            <h2>Start from an example</h2>
            <p>Each example opens as your own copy. Examples marked “simulation-ready” come with simulation parameters, so you can run a performance experiment right away.</p>
          </div>
        </div>
        <div className="card-grid">
          {EXAMPLES.map((ex) => (
            <article key={ex.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row">
                <span className="badge badge-primary">Level {ex.level}</span>
                {ex.sim && (
                  <span className="badge badge-accent" title="Includes simulation parameters">
                    <FlaskConical size={11} /> simulation-ready
                  </span>
                )}
                {ex.toBeOf && <span className="badge">TO-BE</span>}
              </div>
              <h3 style={{ margin: 0 }}>{ex.name}</h3>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {ex.description}
              </p>
              <div className="chip-row">
                {ex.concepts.map((c) => (
                  <span key={c} className="chip" style={{ cursor: 'default' }}>
                    {getConcept(c)?.title ?? c}
                  </span>
                ))}
              </div>
              <span className="spacer" />
              <div className="row">
                <button className="btn btn-sm btn-primary" onClick={() => open(ex.id)}>
                  <PenTool size={14} /> Open copy
                </button>
                <button className="btn btn-sm" onClick={() => setPreview(ex.id)}>
                  Preview
                </button>
                {EXAMPLES.some((e) => e.toBeOf === ex.id) && (
                  <button
                    className="btn btn-sm"
                    title="Open AS-IS and suggested TO-BE as a linked pair"
                    onClick={async () => {
                      const { asIs } = await openExamplePair(ex.id);
                      notify('AS-IS / TO-BE pair created', { kind: 'success' });
                      navigate(`/compare?asIs=${asIs.id}`);
                    }}
                  >
                    <Scale size={14} /> Open pair
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
      {previewExample && (
        <Modal
          title={previewExample.name}
          onClose={() => setPreview(null)}
          width={1100}
          footer={
            <button className="btn btn-primary" onClick={() => open(previewExample.id)}>
              Open copy in the modeler
            </button>
          }
        >
          <p className="muted">{previewExample.description}</p>
          <BpmnViewer xml={buildBpmnXml(previewExample.spec)} animate height={440} />
        </Modal>
      )}
    </div>
  );
}
